package middleware_test

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/google/uuid"

	"engstack/backend/internal/auth"
	"engstack/backend/internal/middleware"
)

func TestRequireAuth(t *testing.T) {
	m := auth.NewJWTManager("secret", time.Minute)
	h := middleware.RequireAuth(m)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id, ok := middleware.UserIDFromContext(r.Context())
		if !ok {
			t.Error("missing user id in context")
		}
		_, _ = w.Write([]byte(id.String()))
	}))

	userID := uuid.New()
	token, err := m.GenerateAccessToken(userID, "a@example.com", "A")
	if err != nil {
		t.Fatal(err)
	}

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	res := httptest.NewRecorder()
	h.ServeHTTP(res, req)
	if res.Code != http.StatusOK || res.Body.String() != userID.String() {
		t.Fatalf("status = %d body = %q", res.Code, res.Body.String())
	}

	for _, header := range []string{"", "Bearer nope", "Basic token"} {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		if header != "" {
			req.Header.Set("Authorization", header)
		}
		res := httptest.NewRecorder()
		h.ServeHTTP(res, req)
		if res.Code != http.StatusUnauthorized {
			t.Fatalf("header %q status = %d", header, res.Code)
		}
	}
}
