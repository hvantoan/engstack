package handler_test

import (
	"net/http"
	"testing"

	"engstack/backend/internal/dto"
	"engstack/backend/internal/testutil"
)

func TestAuthEndpointsIntegration(t *testing.T) {
	srv := testutil.Server(t)

	var pair dto.TokenPair
	res := testutil.Do(t, srv, http.MethodPost, "/api/v1/auth/google",
		dto.GoogleLoginRequest{IDToken: "valid-token"}, "")
	if res.Code != http.StatusOK {
		t.Fatalf("login status = %d (%s)", res.Code, res.Body.String())
	}
	testutil.Decode(t, res, &pair)
	if pair.AccessToken == "" || pair.RefreshToken == "" {
		t.Fatal("missing tokens")
	}
	if pair.User.Email != "learner@example.com" || pair.User.ID == "" {
		t.Fatalf("user = %+v", pair.User)
	}
	if pair.ExpiresIn != 900 {
		t.Fatalf("expires_in = %d", pair.ExpiresIn)
	}

	res = testutil.Do(t, srv, http.MethodPost, "/api/v1/auth/google",
		dto.GoogleLoginRequest{IDToken: "bogus"}, "")
	if res.Code != http.StatusUnauthorized {
		t.Fatalf("invalid token status = %d", res.Code)
	}

	var me dto.UserProfile
	res = testutil.Do(t, srv, http.MethodGet, "/api/v1/auth/me", nil, pair.AccessToken)
	if res.Code != http.StatusOK {
		t.Fatalf("me status = %d", res.Code)
	}
	testutil.Decode(t, res, &me)
	if me.Email != "learner@example.com" {
		t.Fatalf("me = %+v", me)
	}

	for _, bearer := range []string{"", "garbage"} {
		res = testutil.Do(t, srv, http.MethodGet, "/api/v1/auth/me", nil, bearer)
		if res.Code != http.StatusUnauthorized {
			t.Fatalf("me with bearer %q status = %d", bearer, res.Code)
		}
	}
}

func TestRefreshAndLogoutFlow(t *testing.T) {
	srv := testutil.Server(t)

	var pair dto.TokenPair
	testutil.Decode(t, testutil.Do(t, srv, http.MethodPost, "/api/v1/auth/google",
		dto.GoogleLoginRequest{IDToken: "valid-token"}, ""), &pair)

	var rotated dto.RefreshResponse
	res := testutil.Do(t, srv, http.MethodPost, "/api/v1/auth/refresh",
		dto.RefreshRequest{RefreshToken: pair.RefreshToken}, "")
	if res.Code != http.StatusOK {
		t.Fatalf("refresh status = %d (%s)", res.Code, res.Body.String())
	}
	testutil.Decode(t, res, &rotated)
	if rotated.RefreshToken == pair.RefreshToken || rotated.AccessToken == "" {
		t.Fatal("refresh did not rotate tokens")
	}

	// Rotation is single-use, so the old token must not work.
	res = testutil.Do(t, srv, http.MethodPost, "/api/v1/auth/refresh",
		dto.RefreshRequest{RefreshToken: pair.RefreshToken}, "")
	if res.Code != http.StatusUnauthorized {
		t.Fatalf("replay status = %d", res.Code)
	}

	// Login again, then logout.
	testutil.Decode(t, testutil.Do(t, srv, http.MethodPost, "/api/v1/auth/google",
		dto.GoogleLoginRequest{IDToken: "valid-token"}, ""), &pair)

	res = testutil.Do(t, srv, http.MethodPost, "/api/v1/auth/logout",
		dto.LogoutRequest{RefreshToken: pair.RefreshToken}, "")
	if res.Code != http.StatusNoContent {
		t.Fatalf("logout status = %d", res.Code)
	}

	res = testutil.Do(t, srv, http.MethodPost, "/api/v1/auth/refresh",
		dto.RefreshRequest{RefreshToken: pair.RefreshToken}, "")
	if res.Code != http.StatusUnauthorized {
		t.Fatalf("refresh after logout status = %d", res.Code)
	}
}
