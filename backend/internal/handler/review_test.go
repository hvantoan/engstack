package handler_test

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"engstack/backend/internal/dto"
	"engstack/backend/internal/testutil"
)

func learnItem(t *testing.T, srv http.Handler, token, itemID string) {
	t.Helper()
	res := testutil.Do(t, srv, http.MethodPut, "/api/v1/progress/toggle",
		dto.ToggleProgressRequest{ItemID: itemID, Learned: true}, token)
	if res.Code != http.StatusOK {
		t.Fatalf("learn %s status = %d (%s)", itemID, res.Code, res.Body.String())
	}
}

func userID(t *testing.T, pool *pgxpool.Pool) uuid.UUID {
	t.Helper()
	var id uuid.UUID
	if err := pool.QueryRow(t.Context(), "SELECT id FROM users LIMIT 1").Scan(&id); err != nil {
		t.Fatalf("user id: %v", err)
	}
	return id
}

// backdate forces every queued card of the user to be due now.
func backdateQueue(t *testing.T, pool *pgxpool.Pool, uid uuid.UUID) {
	t.Helper()
	if _, err := pool.Exec(t.Context(),
		"UPDATE review_items SET due_at = NOW() - INTERVAL '1 hour' WHERE user_id = $1", uid); err != nil {
		t.Fatalf("backdate queue: %v", err)
	}
}

func getDue(t *testing.T, srv http.Handler, token string) dto.DueReviewResponse {
	t.Helper()
	res := testutil.Do(t, srv, http.MethodGet, "/api/v1/review/due", nil, token)
	if res.Code != http.StatusOK {
		t.Fatalf("due status = %d (%s)", res.Code, res.Body.String())
	}
	var body dto.DueReviewResponse
	testutil.Decode(t, res, &body)
	return body
}

func submitReview(t *testing.T, srv http.Handler, token string, req dto.SubmitReviewRequest) *httptest.ResponseRecorder {
	t.Helper()
	res := testutil.Do(t, srv, http.MethodPost, "/api/v1/review/submit", req, token)
	return res
}

func TestLearnEnqueuesReviewItem(t *testing.T) {
	srv, pool := testutil.ServerWithDB(t)
	token := testutil.Login(t, srv)
	learnItem(t, srv, token, "education:early-childhood-education")

	uid := userID(t, pool)
	var dueAt time.Time
	if err := pool.QueryRow(t.Context(),
		"SELECT due_at FROM review_items WHERE user_id = $1 AND item_id = $2",
		uid, "education:early-childhood-education").Scan(&dueAt); err != nil {
		t.Fatalf("queue row: %v", err)
	}
	if !dueAt.After(time.Now()) {
		t.Fatalf("first review should be scheduled ahead, got %v", dueAt)
	}

	due := getDue(t, srv, token)
	if due.DueCount != 0 || due.PendingCount != 1 || due.NextDueAt == nil {
		t.Fatalf("due = %+v, want 0 due / 1 pending / nextDueAt set", due)
	}
}

func TestUnlearnDequeuesReviewItem(t *testing.T) {
	srv, pool := testutil.ServerWithDB(t)
	token := testutil.Login(t, srv)
	item := "education:lifelong-learning"
	learnItem(t, srv, token, item)

	res := testutil.Do(t, srv, http.MethodPut, "/api/v1/progress/toggle",
		dto.ToggleProgressRequest{ItemID: item, Learned: false}, token)
	if res.Code != http.StatusOK {
		t.Fatalf("unlearn status = %d", res.Code)
	}

	var count int
	if err := pool.QueryRow(t.Context(),
		"SELECT COUNT(*) FROM review_items WHERE user_id = $1 AND item_id = $2",
		userID(t, pool), item).Scan(&count); err != nil {
		t.Fatalf("count: %v", err)
	}
	if count != 0 {
		t.Fatalf("unlearned item still queued")
	}
}

func TestDueListsOverdueWithContent(t *testing.T) {
	srv, pool := testutil.ServerWithDB(t)
	token := testutil.Login(t, srv)
	learnItem(t, srv, token, "education:early-childhood-education")
	learnItem(t, srv, token, "education:higher-education")
	backdateQueue(t, pool, userID(t, pool))

	due := getDue(t, srv, token)
	if due.DueCount != 2 || len(due.Items) != 2 {
		t.Fatalf("due = %+v, want 2 items", due)
	}
	first := due.Items[0]
	if first.Term == "" || first.Meaning == "" || first.TopicID != "education" {
		t.Fatalf("due item missing content: %+v", first)
	}
}

func TestSubmitReviewSchedulesNext(t *testing.T) {
	srv, pool := testutil.ServerWithDB(t)
	token := testutil.Login(t, srv)
	item := "education:primary-education"
	learnItem(t, srv, token, item)
	backdateQueue(t, pool, userID(t, pool))

	res := submitReview(t, srv, token, dto.SubmitReviewRequest{ItemID: item, Rating: 3})
	if res.Code != http.StatusOK {
		t.Fatalf("submit status = %d (%s)", res.Code, res.Body.String())
	}
	var body dto.SubmitReviewResponse
	testutil.Decode(t, res, &body)
	if body.ItemID != item || body.IntervalDays != 1 || body.ReviewCount != 1 || body.Duplicate {
		t.Fatalf("submit resp = %+v", body)
	}
	if !body.DueAt.After(time.Now()) {
		t.Fatalf("dueAt not in the future: %v", body.DueAt)
	}

	// Schedule row and immutable event both written.
	var interval, count, events int
	if err := pool.QueryRow(t.Context(),
		"SELECT interval_days, review_count FROM review_items WHERE user_id = $1 AND item_id = $2",
		userID(t, pool), item).Scan(&interval, &count); err != nil {
		t.Fatalf("schedule row: %v", err)
	}
	if err := pool.QueryRow(t.Context(),
		"SELECT COUNT(*) FROM review_events WHERE user_id = $1 AND item_id = $2",
		userID(t, pool), item).Scan(&events); err != nil {
		t.Fatalf("events: %v", err)
	}
	if interval != 1 || count != 1 || events != 1 {
		t.Fatalf("interval=%d count=%d events=%d", interval, count, events)
	}
	if due := getDue(t, srv, token); due.DueCount != 0 {
		t.Fatalf("card still due after review")
	}
}

func TestSubmitReviewAgainResetsLadder(t *testing.T) {
	srv, pool := testutil.ServerWithDB(t)
	token := testutil.Login(t, srv)
	item := "education:secondary-education"
	learnItem(t, srv, token, item)
	uid := userID(t, pool)
	if _, err := pool.Exec(t.Context(),
		"UPDATE review_items SET interval_days = 30, review_count = 5, due_at = NOW() - INTERVAL '1 hour' WHERE user_id = $1 AND item_id = $2",
		uid, item); err != nil {
		t.Fatalf("seed lapse state: %v", err)
	}

	res := submitReview(t, srv, token, dto.SubmitReviewRequest{ItemID: item, Rating: 1})
	if res.Code != http.StatusOK {
		t.Fatalf("submit status = %d (%s)", res.Code, res.Body.String())
	}
	var body dto.SubmitReviewResponse
	testutil.Decode(t, res, &body)
	if body.IntervalDays != 1 || body.ReviewCount != 0 {
		t.Fatalf("again should reset: %+v", body)
	}
}

func TestSubmitReviewIdempotentReplay(t *testing.T) {
	srv, pool := testutil.ServerWithDB(t)
	token := testutil.Login(t, srv)
	item := "education:higher-education"
	learnItem(t, srv, token, item)
	backdateQueue(t, pool, userID(t, pool))

	eventID := uuid.NewString()
	req := dto.SubmitReviewRequest{ItemID: item, Rating: 3, ClientEventID: eventID}
	first := submitReview(t, srv, token, req)
	if first.Code != http.StatusOK {
		t.Fatalf("first submit status = %d (%s)", first.Code, first.Body.String())
	}
	var firstBody dto.SubmitReviewResponse
	testutil.Decode(t, first, &firstBody)

	// Replay: same clientEventId must not move the schedule or log twice.
	second := submitReview(t, srv, token, req)
	if second.Code != http.StatusOK {
		t.Fatalf("replay status = %d", second.Code)
	}
	var secondBody dto.SubmitReviewResponse
	testutil.Decode(t, second, &secondBody)
	if !secondBody.Duplicate ||
		secondBody.IntervalDays != firstBody.IntervalDays ||
		secondBody.ReviewCount != firstBody.ReviewCount {
		t.Fatalf("replay = %+v", secondBody)
	}

	var events, interval int
	if err := pool.QueryRow(t.Context(),
		"SELECT COUNT(*) FROM review_events WHERE user_id = $1 AND client_event_id = $2",
		userID(t, pool), eventID).Scan(&events); err != nil {
		t.Fatalf("events: %v", err)
	}
	if err := pool.QueryRow(t.Context(),
		"SELECT interval_days FROM review_items WHERE user_id = $1 AND item_id = $2",
		userID(t, pool), item).Scan(&interval); err != nil {
		t.Fatalf("interval: %v", err)
	}
	if events != 1 || interval != firstBody.IntervalDays {
		t.Fatalf("events=%d interval=%d", events, interval)
	}
}

func TestSubmitReviewSequentialDevices(t *testing.T) {
	// Two devices rating the same card: the lock serializes them, so the
	// second submit must observe the first one's state (1d -> 6d ladder).
	srv, pool := testutil.ServerWithDB(t)
	token := testutil.Login(t, srv)
	item := "education:vocational-training"
	learnItem(t, srv, token, item)
	backdateQueue(t, pool, userID(t, pool))

	for i, wantInterval := range []int{1, 6} {
		res := submitReview(t, srv, token, dto.SubmitReviewRequest{
			ItemID: item, Rating: 3, ClientEventID: uuid.NewString()})
		if res.Code != http.StatusOK {
			t.Fatalf("submit %d status = %d", i, res.Code)
		}
		var body dto.SubmitReviewResponse
		testutil.Decode(t, res, &body)
		if body.IntervalDays != wantInterval || body.ReviewCount != i+1 {
			t.Fatalf("submit %d = %+v, want interval %d", i, body, wantInterval)
		}
	}
}

func TestSubmitReviewValidation(t *testing.T) {
	srv := testutil.Server(t)
	token := testutil.Login(t, srv)

	for _, req := range []dto.SubmitReviewRequest{
		{ItemID: "education:primary-education", Rating: 0},
		{ItemID: "education:primary-education", Rating: 5},
		{ItemID: "education:primary-education", Rating: 3, ClientEventID: "not-a-uuid"},
	} {
		if res := submitReview(t, srv, token, req); res.Code != http.StatusBadRequest {
			t.Fatalf("req %+v status = %d, want 400", req, res.Code)
		}
	}

	if res := submitReview(t, srv, token, dto.SubmitReviewRequest{
		ItemID: "education:missing", Rating: 3}); res.Code != http.StatusNotFound {
		t.Fatalf("missing item status = %d, want 404", res.Code)
	}
}


func TestSubmitStaleRatingRejected(t *testing.T) {
	// Device A unlearns; device B's queued submit must not resurrect the card.
	srv, pool := testutil.ServerWithDB(t)
	token := testutil.Login(t, srv)
	item := "education:lifelong-learning"
	learnItem(t, srv, token, item)

	res := testutil.Do(t, srv, http.MethodPut, "/api/v1/progress/toggle",
		dto.ToggleProgressRequest{ItemID: item, Learned: false}, token)
	if res.Code != http.StatusOK {
		t.Fatalf("unlearn status = %d", res.Code)
	}

	res = submitReview(t, srv, token, dto.SubmitReviewRequest{ItemID: item, Rating: 3})
	if res.Code != http.StatusNotFound {
		t.Fatalf("stale submit status = %d, want 404", res.Code)
	}
	var count int
	if err := pool.QueryRow(t.Context(),
		"SELECT COUNT(*) FROM review_items WHERE item_id = $1", item).Scan(&count); err != nil {
		t.Fatalf("count: %v", err)
	}
	if count != 0 {
		t.Fatal("stale submit recreated the queue row")
	}
}

func TestSubmitFirstRatingRace(t *testing.T) {
	// Two sequential first ratings ladder deterministically: the insert-then-
	// lock path means the second submit observes the first's state.
	srv, pool := testutil.ServerWithDB(t)
	token := testutil.Login(t, srv)
	item := "education:vocational-training"
	learnItem(t, srv, token, item)
	// Item is learned but has no schedule row yet (e.g. enqueued elsewhere).
	if _, err := pool.Exec(t.Context(),
		"DELETE FROM review_items WHERE item_id = $1", item); err != nil {
		t.Fatalf("clear queue: %v", err)
	}
	backdateQueue(t, pool, userID(t, pool))

	for i, want := range []int{1, 6} {
		res := submitReview(t, srv, token, dto.SubmitReviewRequest{ItemID: item, Rating: 3})
		if res.Code != http.StatusOK {
			t.Fatalf("submit %d status = %d (%s)", i, res.Code, res.Body.String())
		}
		var body dto.SubmitReviewResponse
		testutil.Decode(t, res, &body)
		if body.IntervalDays != want || body.ReviewCount != i+1 {
			t.Fatalf("submit %d = %+v, want interval %d", i, body, want)
		}
	}
}

func TestImportGuestEnqueuesReviews(t *testing.T) {
	srv, _ := testutil.ServerWithDB(t)
	token := testutil.Login(t, srv)

	res := testutil.Do(t, srv, http.MethodPost, "/api/v1/progress/import-guest",
		dto.ImportGuestProgressRequest{ItemIDs: validIDs(3)}, token)
	if res.Code != http.StatusOK {
		t.Fatalf("import status = %d", res.Code)
	}
	due := getDue(t, srv, token)
	if due.PendingCount != 3 || due.DueCount != 0 {
		t.Fatalf("due = %+v, want 3 pending", due)
	}
}

func TestReviewRequiresAuth(t *testing.T) {
	srv := testutil.Server(t)
	if res := testutil.Do(t, srv, http.MethodGet, "/api/v1/review/due", nil, ""); res.Code != http.StatusUnauthorized {
		t.Fatalf("due status = %d", res.Code)
	}
	if res := testutil.Do(t, srv, http.MethodPost, "/api/v1/review/submit",
		dto.SubmitReviewRequest{ItemID: "x", Rating: 3}, ""); res.Code != http.StatusUnauthorized {
		t.Fatalf("submit status = %d", res.Code)
	}
}
