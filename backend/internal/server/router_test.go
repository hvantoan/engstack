package server_test

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"engstack/backend/internal/auth"
	"engstack/backend/internal/config"
	"engstack/backend/internal/server"
)

// newRouter builds the router without a database: every assertion below must be
// answered before any query runs, which also proves the auth gate is in front.
func newRouter() http.Handler {
	return server.New(config.Config{
		JWTSecret:      "test-secret",
		AllowedOrigins: []string{"http://localhost:5173"},
	}, nil, auth.DevVerifier{})
}

func TestProtectedRoutesRejectAnonymous(t *testing.T) {
	h := newRouter()
	cases := []struct{ method, path string }{
		{http.MethodGet, "/api/v1/auth/me"},
		{http.MethodGet, "/api/v1/progress"},
		{http.MethodPut, "/api/v1/progress/toggle"},
		{http.MethodPost, "/api/v1/progress/import-guest"},
	}
	for _, c := range cases {
		req := httptest.NewRequest(c.method, c.path, nil)
		res := httptest.NewRecorder()
		h.ServeHTTP(res, req)
		if res.Code != http.StatusUnauthorized {
			t.Errorf("%s %s = %d, want 401 (route must sit behind RequireAuth)", c.method, c.path, res.Code)
		}
	}
}

// Wrong method on a registered path answers 405; a missing path answers 404.
// That distinguishes "route deleted/renamed" from "route moved out of reach".
func TestRouteTableRegistered(t *testing.T) {
	h := newRouter()
	cases := []struct{ path string }{
		{"/api/v1/health"},
		{"/api/v1/topics"},
		{"/api/v1/topics/education"},
		{"/api/v1/auth/google"},
		{"/api/v1/auth/refresh"},
		{"/api/v1/auth/logout"},
	}
	for _, c := range cases {
		req := httptest.NewRequest(http.MethodOptions, c.path, nil)
		res := httptest.NewRecorder()
		h.ServeHTTP(res, req)
		if res.Code == http.StatusNotFound {
			t.Errorf("OPTIONS %s = 404, route is not registered", c.path)
		}
	}
}

func TestHealthServedWithoutDatabase(t *testing.T) {
	res := httptest.NewRecorder()
	newRouter().ServeHTTP(res, httptest.NewRequest(http.MethodGet, "/api/v1/health", nil))
	if res.Code != http.StatusOK {
		t.Fatalf("health = %d", res.Code)
	}
}

func TestCORSPreflight(t *testing.T) {
	h := newRouter()

	req := httptest.NewRequest(http.MethodOptions, "/api/v1/topics", nil)
	req.Header.Set("Origin", "http://localhost:5173")
	req.Header.Set("Access-Control-Request-Method", http.MethodGet)
	res := httptest.NewRecorder()
	h.ServeHTTP(res, req)

	if got := res.Header().Get("Access-Control-Allow-Origin"); got != "http://localhost:5173" {
		t.Errorf("allow-origin = %q, want configured origin", got)
	}

	req = httptest.NewRequest(http.MethodOptions, "/api/v1/topics", nil)
	req.Header.Set("Origin", "https://evil.example")
	req.Header.Set("Access-Control-Request-Method", http.MethodGet)
	res = httptest.NewRecorder()
	h.ServeHTTP(res, req)
	if got := res.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Errorf("allow-origin = %q for unknown origin, want empty", got)
	}
}

// decodeJSON caps the body at 1 MiB; an oversized payload must be rejected as
// a bad request instead of being decoded.
func TestOversizedBodyRejected(t *testing.T) {
	body := `{"id_token":"` + strings.Repeat("a", 2<<20) + `"}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/google", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()
	newRouter().ServeHTTP(res, req)

	if res.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400 for a body over 1 MiB", res.Code)
	}
}

func TestVerifierSelection(t *testing.T) {
	if _, ok := server.Verifier(config.Config{AuthDevMode: true}).(auth.DevVerifier); !ok {
		t.Error("AuthDevMode must select the dev verifier")
	}
	google, ok := server.Verifier(config.Config{GoogleClientID: "cid"}).(auth.GoogleVerifier)
	if !ok {
		t.Fatal("default must select the Google verifier")
	}
	if google.ClientID != "cid" {
		t.Errorf("ClientID = %q, want cid", google.ClientID)
	}
}

func TestNewHTTPServerTimeouts(t *testing.T) {
	s := server.NewHTTPServer(":0", http.NewServeMux())
	if s.ReadHeaderTimeout <= 0 || s.WriteTimeout <= 0 || s.IdleTimeout <= 0 {
		t.Fatalf("timeouts must be set: %+v", s)
	}
}
