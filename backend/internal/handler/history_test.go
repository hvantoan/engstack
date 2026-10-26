package handler_test

import (
	"net/http"
	"testing"

	"github.com/google/uuid"

	"engstack/backend/internal/dto"
	"engstack/backend/internal/testutil"
)

func TestSearchItemsMatchesTermAndMeaning(t *testing.T) {
	srv, _ := testutil.ServerWithDB(t)

	var res dto.SearchResponse
	testutil.Decode(t, testutil.Do(t, srv, http.MethodGet,
		"/api/v1/search/items?q=abandon", nil, ""), &res)
	if res.Total == 0 || len(res.Items) == 0 {
		t.Fatal("expected hits for 'abandon'")
	}
	for _, it := range res.Items {
		if it.TopicTitle == "" || it.TopicID == "" {
			t.Fatalf("item missing topic context: %+v", it)
		}
	}

	// Meaning search (Vietnamese) also matches.
	testutil.Decode(t, testutil.Do(t, srv, http.MethodGet,
		"/api/v1/search/items?q=b%E1%BB%8F%20r%C6%A1i", nil, ""), &res)
	if res.Total == 0 {
		t.Fatal("expected hits for Vietnamese meaning 'bỏ rơi'")
	}
}

func TestSearchItemsFiltersAndPagination(t *testing.T) {
	srv, _ := testutil.ServerWithDB(t)

	var all dto.SearchResponse
	testutil.Decode(t, testutil.Do(t, srv, http.MethodGet,
		"/api/v1/search/items?q=&track=ielts&perPage=5", nil, ""), &all)
	if all.PerPage != 5 || len(all.Items) != 5 || all.Total < 5 {
		t.Fatalf("pagination = %+v", all)
	}
	var page2 dto.SearchResponse
	testutil.Decode(t, testutil.Do(t, srv, http.MethodGet,
		"/api/v1/search/items?q=&track=ielts&perPage=5&page=2", nil, ""), &page2)
	if page2.Items[0].ID == all.Items[0].ID {
		t.Fatal("page 2 returned the same first row")
	}
	for _, it := range all.Items {
		if it.Track != "ielts" {
			t.Fatalf("track filter leaked %s", it.Track)
		}
	}
	// Wildcard chars must not expand into '%' wildcards.
	var wild dto.SearchResponse
	testutil.Decode(t, testutil.Do(t, srv, http.MethodGet,
		"/api/v1/search/items?q=%25", nil, ""), &wild)
	if wild.Total != 0 {
		t.Fatalf("literal %% query returned %d rows", wild.Total)
	}
}

func TestPositionRoundTrip(t *testing.T) {
	srv, _ := testutil.ServerWithDB(t)
	token := testutil.Login(t, srv)
	item := "education:lifelong-learning"

	res := testutil.Do(t, srv, http.MethodGet, "/api/v1/state/position", nil, token)
	if res.Code != http.StatusNotFound {
		t.Fatalf("fresh position status = %d", res.Code)
	}

	put := testutil.Do(t, srv, http.MethodPut, "/api/v1/state/position",
		dto.UpdatePositionRequest{TopicID: "education", Mode: "learn", ItemID: item}, token)
	if put.Code != http.StatusOK {
		t.Fatalf("put status = %d (%s)", put.Code, put.Body.String())
	}

	var pos dto.PositionResponse
	testutil.Decode(t, testutil.Do(t, srv, http.MethodGet, "/api/v1/state/position", nil, token), &pos)
	if pos.TopicID != "education" || pos.Mode != "learn" || pos.ItemID != item {
		t.Fatalf("position = %+v", pos)
	}
}

func TestEventsIdempotentAndHistoryMerge(t *testing.T) {
	srv, pool := testutil.ServerWithDB(t)
	token := testutil.Login(t, srv)
	item := "education:lifelong-learning"
	eventID := uuid.NewString()

	learnItem(t, srv, token, item)

	// Client session events: posting the same clientEventId twice logs once.
	for i := 0; i < 2; i++ {
		res := testutil.Do(t, srv, http.MethodPost, "/api/v1/events",
			dto.LearningEventRequest{Type: "session_start", TopicID: "education",
				Mode: "learn", ClientEventID: eventID}, token)
		if res.Code != http.StatusNoContent {
			t.Fatalf("event %d status = %d", i, res.Code)
		}
	}
	var n int
	if err := pool.QueryRow(t.Context(),
		"SELECT COUNT(*) FROM learning_events WHERE type='session_start'").Scan(&n); err != nil {
		t.Fatalf("count: %v", err)
	}
	if n != 1 {
		t.Fatalf("clientEventId replays logged %d rows", n)
	}

	var res dto.HistoryResponse
	testutil.Decode(t, testutil.Do(t, srv, http.MethodGet, "/api/v1/history?limit=50", nil, token), &res)
	var sawLearn, sawSession bool
	for _, it := range res.Items {
		if it.Kind == "learn" && it.ItemID == item {
			sawLearn = true
		}
		if it.Kind == "session_start" && it.Mode == "learn" {
			sawSession = true
		}
	}
	if !sawLearn || !sawSession {
		t.Fatalf("history missing learn=%v session=%v in %+v", sawLearn, sawSession, res.Items)
	}
}

func TestHistoryRequiresAuth(t *testing.T) {
	srv, _ := testutil.ServerWithDB(t)
	for _, path := range []string{"/api/v1/state/position", "/api/v1/history"} {
		res := testutil.Do(t, srv, http.MethodGet, path, nil, "")
		if res.Code != http.StatusUnauthorized {
			t.Fatalf("%s status = %d", path, res.Code)
		}
	}
	res := testutil.Do(t, srv, http.MethodPost, "/api/v1/events",
		dto.LearningEventRequest{Type: "session_start", TopicID: "education"}, "")
	if res.Code != http.StatusUnauthorized {
		t.Fatalf("/events status = %d", res.Code)
	}
}
