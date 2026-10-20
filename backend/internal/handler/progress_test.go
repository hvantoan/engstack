package handler_test

import (
	"net/http"
	"testing"

	"engstack/backend/internal/dto"
	"engstack/backend/internal/testutil"
)

func validIDs(count int) []string {
	ids := []string{
		"education:early-childhood-education",
		"education:lifelong-learning",
		"education:primary-education",
		"education:secondary-education",
		"education:higher-education",
	}
	if count > len(ids) {
		count = len(ids)
	}
	return ids[:count]
}

func TestImportGuestProgress_ValidAndStaleIDs(t *testing.T) {
	srv := testutil.Server(t)
	token := testutil.Login(t, srv)

	payload := dto.ImportGuestProgressRequest{ItemIDs: append(validIDs(5),
		"legacy-topic:stale-item-1", "education:invalid-id")}
	res := testutil.Do(t, srv, http.MethodPost, "/api/v1/progress/import-guest", payload, token)
	if res.Code != http.StatusOK {
		t.Fatalf("status = %d (%s)", res.Code, res.Body.String())
	}

	var body dto.ImportGuestProgressResponse
	testutil.Decode(t, res, &body)
	if body.Imported != 5 {
		t.Fatalf("imported = %d, want 5", body.Imported)
	}

	var progress map[string][]string
	testutil.Decode(t, testutil.Do(t, srv, http.MethodGet, "/api/v1/progress", nil, token), &progress)
	if len(progress["education"]) != 5 {
		t.Fatalf("education progress = %v", progress["education"])
	}
}

func TestGetProgress_GroupedByTopic(t *testing.T) {
	srv := testutil.Server(t)
	token := testutil.Login(t, srv)

	var oxford []string
	for _, id := range []string{"oxford-b1:about:preposition", "oxford-b1:access:verb"} {
		oxford = append(oxford, id)
	}
	payload := dto.ImportGuestProgressRequest{ItemIDs: append(validIDs(3), oxford...)}
	if res := testutil.Do(t, srv, http.MethodPost, "/api/v1/progress/import-guest", payload, token); res.Code != http.StatusOK {
		t.Fatalf("import status = %d", res.Code)
	}

	// GET must carry the JWT.
	res := testutil.Do(t, srv, http.MethodGet, "/api/v1/progress", nil, token)
	if res.Code != http.StatusOK {
		t.Fatalf("status = %d", res.Code)
	}
	var progress map[string][]string
	testutil.Decode(t, res, &progress)

	if len(progress["education"]) != 3 {
		t.Fatalf("education = %v", progress["education"])
	}
	if len(progress["oxford-b1"]) != 2 {
		t.Fatalf("oxford-b1 = %v", progress["oxford-b1"])
	}
}

func TestToggleProgress_LearnAndUnlearn(t *testing.T) {
	srv := testutil.Server(t)
	token := testutil.Login(t, srv)
	item := "education:early-childhood-education"

	res := testutil.Do(t, srv, http.MethodPut, "/api/v1/progress/toggle",
		dto.ToggleProgressRequest{ItemID: item, Learned: true}, token)
	if res.Code != http.StatusOK {
		t.Fatalf("learn status = %d", res.Code)
	}

	var afterLearn map[string][]string
	testutil.Decode(t, testutil.Do(t, srv, http.MethodGet, "/api/v1/progress", nil, token), &afterLearn)
	if len(afterLearn["education"]) != 1 || afterLearn["education"][0] != item {
		t.Fatalf("after learn = %v", afterLearn)
	}

	res = testutil.Do(t, srv, http.MethodPut, "/api/v1/progress/toggle",
		dto.ToggleProgressRequest{ItemID: item, Learned: false}, token)
	if res.Code != http.StatusOK {
		t.Fatalf("unlearn status = %d", res.Code)
	}

	var afterUnlearn map[string][]string
	testutil.Decode(t, testutil.Do(t, srv, http.MethodGet, "/api/v1/progress", nil, token), &afterUnlearn)
	if _, present := afterUnlearn["education"]; present {
		t.Fatalf("item resurrected: %v", afterUnlearn)
	}
}

func TestProgress_MultiDeviceUnlearnScenario(t *testing.T) {
	srv := testutil.Server(t)
	token := testutil.Login(t, srv)
	word := "education:lifelong-learning"

	if res := testutil.Do(t, srv, http.MethodPut, "/api/v1/progress/toggle",
		dto.ToggleProgressRequest{ItemID: word, Learned: true}, token); res.Code != http.StatusOK {
		t.Fatalf("learn status = %d", res.Code)
	}

	// Device A unlearns.
	if res := testutil.Do(t, srv, http.MethodPut, "/api/v1/progress/toggle",
		dto.ToggleProgressRequest{ItemID: word, Learned: false}, token); res.Code != http.StatusOK {
		t.Fatalf("unlearn status = %d", res.Code)
	}

	// Device B (fresh session) must not see it, ever.
	for range 3 {
		var progress map[string][]string
		testutil.Decode(t, testutil.Do(t, srv, http.MethodGet, "/api/v1/progress", nil, token), &progress)
		for _, id := range progress["education"] {
			if id == word {
				t.Fatalf("word %q resurrected on device B", word)
			}
		}
	}
}

func TestProgressRequiresAuth(t *testing.T) {
	srv := testutil.Server(t)
	for _, tc := range []struct {
		method, path string
		body         any
	}{
		{http.MethodGet, "/api/v1/progress", nil},
		{http.MethodPut, "/api/v1/progress/toggle", dto.ToggleProgressRequest{ItemID: "education:vocational-training", Learned: true}},
		{http.MethodPost, "/api/v1/progress/import-guest", dto.ImportGuestProgressRequest{ItemIDs: validIDs(1)}},
	} {
		res := testutil.Do(t, srv, tc.method, tc.path, tc.body, "")
		if res.Code != http.StatusUnauthorized {
			t.Fatalf("%s %s status = %d", tc.method, tc.path, res.Code)
		}
	}
}
