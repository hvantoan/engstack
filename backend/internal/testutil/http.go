package testutil

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"

	"engstack/backend/internal/auth"
	"engstack/backend/internal/config"
	"engstack/backend/internal/seeder"
	"engstack/backend/internal/server"
)

// ServerWithDB returns the test router and its database so tests can stage
// content that is not represented in the JSON fixtures.
func ServerWithDB(tb testing.TB) (http.Handler, *pgxpool.Pool) {
	tb.Helper()

	pool := DB(tb)
	topics, err := seeder.ParseDir("../../../data")
	if err != nil {
		tb.Fatalf("parse seed data: %v", err)
	}
	if err := seeder.Import(tb.Context(), pool, topics); err != nil {
		tb.Fatalf("seed: %v", err)
	}

	cfg := config.Config{
		JWTSecret:      "test-secret",
		AuthDevMode:    true,
		AllowedOrigins: []string{"http://localhost:5173"},
	}
	return server.New(cfg, pool, &auth.MockVerifier{Tokens: map[string]*auth.GoogleTokenPayload{
		"valid-token": {GoogleID: "google-1", Email: "learner@example.com", Name: "Learner"},
	}}), pool
}

// Server returns a router backed by the test database with the full dataset
// seeded and a deterministic mock Google verifier.
func Server(tb testing.TB) http.Handler {
	tb.Helper()
	srv, _ := ServerWithDB(tb)
	return srv
}

func Get(tb testing.TB, h http.Handler, path string) *httptest.ResponseRecorder {
	tb.Helper()
	return Do(tb, h, http.MethodGet, path, nil, "")
}

func Do(tb testing.TB, h http.Handler, method, path string, body any, bearer string) *httptest.ResponseRecorder {
	tb.Helper()

	var reader io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			tb.Fatalf("marshal body: %v", err)
		}
		reader = bytes.NewReader(raw)
	}

	req := httptest.NewRequest(method, path, reader)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if bearer != "" {
		req.Header.Set("Authorization", "Bearer "+bearer)
	}
	res := httptest.NewRecorder()
	h.ServeHTTP(res, req)
	return res
}

func Decode(tb testing.TB, res *httptest.ResponseRecorder, dst any) {
	tb.Helper()
	if err := json.NewDecoder(res.Body).Decode(dst); err != nil {
		tb.Fatalf("decode response (status %d): %v", res.Code, err)
	}
}

// Login authenticates through the mock verifier and returns the access token.
func Login(tb testing.TB, h http.Handler) string {
	tb.Helper()
	res := Do(tb, h, http.MethodPost, "/api/v1/auth/google", map[string]string{"id_token": "valid-token"}, "")
	if res.Code != http.StatusOK {
		tb.Fatalf("login status = %d (%s)", res.Code, res.Body.String())
	}
	var pair struct {
		AccessToken string `json:"access_token"`
	}
	Decode(tb, res, &pair)
	if pair.AccessToken == "" {
		tb.Fatal("login returned no access token")
	}
	return pair.AccessToken
}
