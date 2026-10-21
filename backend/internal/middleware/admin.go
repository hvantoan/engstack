package middleware

import (
	"encoding/json"
	"net/http"
	"strings"
)

func writeErr(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

// RequireAdmin chặn request không nằm trong allowlist email admin. Phải đặt
// SAU RequireAuth (cần claims trong context). allowlist rỗng → không ai là
// admin (fail-closed).
func RequireAdmin(adminEmails []string) func(http.Handler) http.Handler {
	allowed := make(map[string]struct{}, len(adminEmails))
	for _, e := range adminEmails {
		allowed[strings.ToLower(strings.TrimSpace(e))] = struct{}{}
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			claims, ok := ClaimsFromContext(r.Context())
			if !ok {
				writeErr(w, http.StatusUnauthorized, "unauthorized")
				return
			}
			if _, ok := allowed[strings.ToLower(claims.Email)]; !ok {
				writeErr(w, http.StatusForbidden, "forbidden")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
