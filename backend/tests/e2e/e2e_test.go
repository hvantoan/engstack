package e2e_test

import (
	"fmt"
	"net/http"
	"testing"

	"engstack/backend/internal/testutil"
)

// TestE2E_FullUserFlow walks the entire journey against a real database:
// health -> public content -> login -> guest import -> toggle -> rotation -> logout.
func TestE2E_FullUserFlow(t *testing.T) {
	srv := testutil.Server(t)

	// Step 1: health.
	if res := testutil.Get(t, srv, "/api/v1/health"); res.Code != http.StatusOK {
		t.Fatalf("health status = %d", res.Code)
	}

	// Step 2: 24 topics.
	var topics []map[string]any
	testutil.Decode(t, testutil.Get(t, srv, "/api/v1/topics"), &topics)
	if len(topics) != 24 {
		t.Fatalf("topics = %d, want 24", len(topics))
	}

	// Step 3: topic detail with module context.
	var detail struct {
		Items []map[string]any `json:"items"`
	}
	testutil.Decode(t, testutil.Get(t, srv, "/api/v1/topics/education"), &detail)
	if len(detail.Items) != 200 {
		t.Fatalf("education items = %d, want 200", len(detail.Items))
	}
	if detail.Items[0]["topicId"] != "education" || detail.Items[0]["track"] != "ielts" {
		t.Fatalf("item context = %v", detail.Items[0])
	}

	// Step 4: login.
	var pair struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
	}
	res := testutil.Do(t, srv, http.MethodPost, "/api/v1/auth/google",
		map[string]string{"id_token": "valid-token"}, "")
	if res.Code != http.StatusOK {
		t.Fatalf("login status = %d", res.Code)
	}
	testutil.Decode(t, res, &pair)
	if pair.AccessToken == "" || pair.RefreshToken == "" {
		t.Fatal("login returned incomplete token pair")
	}

	// Step 5: guest import with 10 real ids plus 2 stale ones.
	ids := []string{
		"education:early-childhood-education",
		"education:lifelong-learning",
		"education:primary-education",
		"education:secondary-education",
		"education:higher-education",
		"oxford-b1:about:preposition",
		"oxford-b1:access:verb",
		"oxford-b1:account:noun",
		"oxford-b1:achieve:verb",
		"oxford-b1:act:verb",
		"legacy-topic:stale-item-1",
		"education:invalid-id",
	}
	var imported struct {
		Imported int64 `json:"imported"`
	}
	res = testutil.Do(t, srv, http.MethodPost, "/api/v1/progress/import-guest",
		map[string][]string{"itemIds": ids}, pair.AccessToken)
	if res.Code != http.StatusOK {
		t.Fatalf("import status = %d (%s)", res.Code, res.Body.String())
	}
	testutil.Decode(t, res, &imported)
	if imported.Imported == 0 || imported.Imported > int64(len(ids)) {
		t.Fatalf("imported = %d", imported.Imported)
	}

	// Step 6: progress map.
	var progress map[string][]string
	res = testutil.Do(t, srv, http.MethodGet, "/api/v1/progress", nil, pair.AccessToken)
	if res.Code != http.StatusOK {
		t.Fatalf("progress status = %d", res.Code)
	}
	testutil.Decode(t, res, &progress)
	if len(progress["education"]) == 0 {
		t.Fatalf("progress = %v", progress)
	}

	// Step 7: unlearn one item and confirm it is gone.
	item := "education:early-childhood-education"
	res = testutil.Do(t, srv, http.MethodPut, "/api/v1/progress/toggle",
		map[string]any{"itemId": item, "learned": false}, pair.AccessToken)
	if res.Code != http.StatusOK {
		t.Fatalf("unlearn status = %d", res.Code)
	}
	testutil.Decode(t, testutil.Do(t, srv, http.MethodGet, "/api/v1/progress", nil, pair.AccessToken), &progress)
	for _, id := range progress["education"] {
		if id == item {
			t.Fatalf("item %q still learned", item)
		}
	}

	// Step 8: rotate tokens; the old refresh token must be rejected.
	var rotated struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
	}
	res = testutil.Do(t, srv, http.MethodPost, "/api/v1/auth/refresh",
		map[string]string{"refresh_token": pair.RefreshToken}, pair.AccessToken)
	if res.Code != http.StatusOK {
		t.Fatalf("refresh status = %d", res.Code)
	}
	testutil.Decode(t, res, &rotated)
	if rotated.RefreshToken == pair.RefreshToken {
		t.Fatal("refresh token was not rotated")
	}
	res = testutil.Do(t, srv, http.MethodPost, "/api/v1/auth/refresh",
		map[string]string{"refresh_token": pair.RefreshToken}, "")
	if res.Code != http.StatusUnauthorized {
		t.Fatalf("replayed refresh status = %d", res.Code)
	}

	// Step 9: logout revokes the new token.
	res = testutil.Do(t, srv, http.MethodPost, "/api/v1/auth/logout",
		map[string]string{"refresh_token": rotated.RefreshToken}, rotated.AccessToken)
	if res.Code != http.StatusNoContent {
		t.Fatalf("logout status = %d", res.Code)
	}
	res = testutil.Do(t, srv, http.MethodPost, "/api/v1/auth/refresh",
		map[string]string{"refresh_token": rotated.RefreshToken}, "")
	if res.Code != http.StatusUnauthorized {
		t.Fatalf("refresh after logout status = %d (%s)", res.Code, fmt.Sprint(res.Body.String()))
	}
}
