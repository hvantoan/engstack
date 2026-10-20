package auth_test

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"engstack/backend/internal/auth"
	"engstack/backend/internal/store"
	"engstack/backend/internal/testutil"
)

func setup(t *testing.T) (*pgxpool.Pool, *store.Queries, *auth.TokenService, store.User) {
	t.Helper()
	pool := testutil.DB(t)
	q := store.New(pool)
	user, err := q.UpsertUserByGoogleID(context.Background(), store.UpsertUserByGoogleIDParams{
		GoogleID: "g-token-service", Email: "t@example.com", Name: "T",
	})
	if err != nil {
		t.Fatal(err)
	}
	return pool, q, auth.NewTokenService(q, auth.NewJWTManager("test-secret", time.Minute)), user
}

func TestRefreshTokenLifecycle(t *testing.T) {
	_, q, svc, user := setup(t)
	ctx := context.Background()

	raw, err := svc.CreateRefreshToken(ctx, user.ID)
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if raw == "" {
		t.Fatal("empty raw token")
	}

	rec, err := q.GetRefreshTokenByHash(ctx, auth.HashToken(raw))
	if err != nil {
		t.Fatalf("stored token lookup: %v", err)
	}
	// ~30 days out.
	if d := time.Until(rec.ExpiresAt.Time); d < 29*24*time.Hour || d > 31*24*time.Hour {
		t.Fatalf("expiry = %v", d)
	}
	if rec.RevokedAt.Valid {
		t.Fatal("fresh token is revoked")
	}

	// Rotation.
	newRaw, newAccess, err := svc.RotateRefreshToken(ctx, raw)
	if err != nil {
		t.Fatalf("rotate: %v", err)
	}
	if newRaw == raw || newAccess == "" {
		t.Fatal("rotation did not issue new credentials")
	}
	old, err := q.GetRefreshTokenByHash(ctx, auth.HashToken(raw))
	if err != nil {
		t.Fatal(err)
	}
	if !old.RevokedAt.Valid {
		t.Fatal("old token not revoked")
	}

	// Replay of the rotated token fails and revokes the whole family.
	if _, _, err := svc.RotateRefreshToken(ctx, raw); err != auth.ErrTokenRevoked {
		t.Fatalf("replay error = %v", err)
	}
	if _, _, err := svc.RotateRefreshToken(ctx, newRaw); err != auth.ErrTokenRevoked {
		t.Fatalf("family revocation error = %v", err)
	}

	// Unknown token.
	if _, _, err := svc.RotateRefreshToken(ctx, "unknown"); err != auth.ErrTokenNotFound {
		t.Fatalf("unknown token error = %v", err)
	}
}

func TestLogoutRevokesToken(t *testing.T) {
	_, _, svc, user := setup(t)
	ctx := context.Background()

	raw, err := svc.CreateRefreshToken(ctx, user.ID)
	if err != nil {
		t.Fatal(err)
	}
	if err := svc.RevokeRefreshToken(ctx, raw); err != nil {
		t.Fatal(err)
	}
	if _, _, err := svc.RotateRefreshToken(ctx, raw); err != auth.ErrTokenRevoked {
		t.Fatalf("error = %v", err)
	}
	// Logout is idempotent.
	if err := svc.RevokeRefreshToken(ctx, raw); err != nil {
		t.Fatalf("second revoke: %v", err)
	}
}

func TestConcurrentRefreshOnlyOneWins(t *testing.T) {
	_, _, svc, user := setup(t)
	ctx := context.Background()

	raw, err := svc.CreateRefreshToken(ctx, user.ID)
	if err != nil {
		t.Fatal(err)
	}

	var wg sync.WaitGroup
	errs := make(chan error, 2)
	for range 2 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, _, err := svc.RotateRefreshToken(ctx, raw)
			errs <- err
		}()
	}
	wg.Wait()
	close(errs)

	successes := 0
	var failures []error
	for err := range errs {
		if err == nil {
			successes++
		} else {
			failures = append(failures, err)
		}
	}
	if successes != 1 {
		t.Fatalf("successes = %d, want exactly 1 (%v)", successes, failures)
	}
}

func TestExpiredRefreshTokenRejected(t *testing.T) {
	pool, _, svc, user := setup(t)
	ctx := context.Background()

	raw, err := svc.CreateRefreshToken(ctx, user.ID)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `UPDATE refresh_tokens SET expires_at = NOW() - INTERVAL '1 hour' WHERE token_hash = $1`, auth.HashToken(raw)); err != nil {
		t.Fatal(err)
	}
	if _, _, err := svc.RotateRefreshToken(ctx, raw); err != auth.ErrRefreshTokenExpiry {
		t.Fatalf("error = %v", err)
	}
}

func TestHashTokenIsSHA256Hex(t *testing.T) {
	got := auth.HashToken("abc")
	want := "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
	if got != want {
		t.Fatalf("hash = %s", got)
	}
	if len(auth.HashToken(uuid.NewString())) != 64 {
		t.Fatal("hash must be 64 hex chars")
	}
}
