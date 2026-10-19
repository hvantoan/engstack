package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"engstack/backend/internal/store"
)

type TokenService struct {
	Q          *store.Queries
	JWT        *JWTManager
	RefreshTTL time.Duration
}

func NewTokenService(q *store.Queries, jwtManager *JWTManager) *TokenService {
	return &TokenService{Q: q, JWT: jwtManager, RefreshTTL: RefreshTokenTTL}
}

func HashToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

func (s *TokenService) CreateRefreshToken(ctx context.Context, userID uuid.UUID) (string, error) {
	raw, err := newRawToken()
	if err != nil {
		return "", err
	}
	if err := s.Q.CreateRefreshToken(ctx, store.CreateRefreshTokenParams{
		UserID:    userID,
		TokenHash: HashToken(raw),
		ExpiresAt: pgtype.Timestamptz{Time: time.Now().Add(s.RefreshTTL), Valid: true},
	}); err != nil {
		return "", err
	}
	return raw, nil
}

// RotateRefreshToken consumes a refresh token and issues a fresh pair. Tokens
// are single-use: a replayed token revokes every session for that user.
func (s *TokenService) RotateRefreshToken(ctx context.Context, raw string) (string, string, error) {
	hash := HashToken(raw)

	tok, err := s.Q.GetRefreshTokenByHash(ctx, hash)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", "", ErrTokenNotFound
	}
	if err != nil {
		return "", "", err
	}
	if tok.RevokedAt.Valid {
		// Replay of an already-rotated token: assume theft and drop all sessions.
		_ = s.Q.RevokeAllUserTokens(ctx, tok.UserID)
		return "", "", ErrTokenRevoked
	}
	if !tok.ExpiresAt.Valid || tok.ExpiresAt.Time.Before(time.Now()) {
		_, _ = s.Q.RevokeRefreshToken(ctx, hash)
		return "", "", ErrRefreshTokenExpiry
	}

	// The UPDATE is the race arbiter: only one concurrent rotation can flip
	// revoked_at from NULL.
	revoked, err := s.Q.RevokeRefreshToken(ctx, hash)
	if err != nil {
		return "", "", err
	}
	if revoked == 0 {
		_ = s.Q.RevokeAllUserTokens(ctx, tok.UserID)
		return "", "", ErrTokenRevoked
	}

	user, err := s.Q.GetUserByID(ctx, tok.UserID)
	if err != nil {
		return "", "", err
	}
	newAccess, err := s.JWT.GenerateAccessToken(user.ID, user.Email, user.Name)
	if err != nil {
		return "", "", err
	}
	newRefresh, err := s.CreateRefreshToken(ctx, user.ID)
	if err != nil {
		return "", "", err
	}
	return newRefresh, newAccess, nil
}

// RevokeRefreshToken is idempotent: unknown or already revoked tokens are fine.
func (s *TokenService) RevokeRefreshToken(ctx context.Context, raw string) error {
	_, err := s.Q.RevokeRefreshToken(ctx, HashToken(raw))
	return err
}

func newRawToken() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}
