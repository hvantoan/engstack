// Package middleware provides HTTP middleware for the API.
package middleware

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/google/uuid"

	"engstack/backend/internal/auth"
)

type ctxKey int

const claimsKey ctxKey = iota

// RequireAuth validates the Bearer access token and stores its claims.
func RequireAuth(m *auth.JWTManager) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			raw, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
			if !ok || raw == "" {
				unauthorized(w)
				return
			}
			claims, err := m.ValidateAccessToken(raw)
			if err != nil {
				unauthorized(w)
				return
			}
			next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), claimsKey, claims)))
		})
	}
}

func ClaimsFromContext(ctx context.Context) (*auth.Claims, bool) {
	claims, ok := ctx.Value(claimsKey).(*auth.Claims)
	return claims, ok
}

func UserIDFromContext(ctx context.Context) (uuid.UUID, bool) {
	claims, ok := ClaimsFromContext(ctx)
	if !ok {
		return uuid.Nil, false
	}
	return claims.UserID, true
}

func unauthorized(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(http.StatusUnauthorized)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": "unauthorized"})
}
