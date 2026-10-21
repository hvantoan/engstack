package middleware

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"engstack/backend/internal/auth"
)

func withClaims(email string) *http.Request {
	r := httptest.NewRequest(http.MethodPost, "/x", nil)
	claims := &auth.Claims{Email: email}
	return r.WithContext(context.WithValue(r.Context(), claimsKey, claims))
}

func TestRequireAdmin(t *testing.T) {
	next := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})
	mw := RequireAdmin([]string{"Admin@Example.com", "second@example.com"})

	t.Run("admin email pass — case-insensitive", func(t *testing.T) {
		res := httptest.NewRecorder()
		mw(next).ServeHTTP(res, withClaims("admin@example.com"))
		if res.Code != http.StatusNoContent {
			t.Fatalf("status = %d", res.Code)
		}
	})

	t.Run("non-admin → 403", func(t *testing.T) {
		res := httptest.NewRecorder()
		mw(next).ServeHTTP(res, withClaims("learner@example.com"))
		if res.Code != http.StatusForbidden {
			t.Fatalf("status = %d", res.Code)
		}
	})

	t.Run("no claims → 401", func(t *testing.T) {
		res := httptest.NewRecorder()
		mw(next).ServeHTTP(res, httptest.NewRequest(http.MethodPost, "/x", nil))
		if res.Code != http.StatusUnauthorized {
			t.Fatalf("status = %d", res.Code)
		}
	})

	t.Run("empty allowlist fail-closed", func(t *testing.T) {
		res := httptest.NewRecorder()
		RequireAdmin(nil)(next).ServeHTTP(res, withClaims("admin@example.com"))
		if res.Code != http.StatusForbidden {
			t.Fatalf("status = %d", res.Code)
		}
	})
}
