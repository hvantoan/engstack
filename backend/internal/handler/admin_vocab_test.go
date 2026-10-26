package handler_test

import (
	"net/http"
	"testing"

	"engstack/backend/internal/auth"
	"engstack/backend/internal/config"
	"engstack/backend/internal/server"
	"engstack/backend/internal/testutil"
)

// adminServer giống testutil.Server nhưng seed dataset nhẹ và bật allowlist
// admin chứa learner@example.com (email mà mock verifier trả về).
func adminServer(t *testing.T) http.Handler {
	t.Helper()
	pool := testutil.DB(t)
	cfg := config.Config{
		JWTSecret:      "test-secret",
		AuthDevMode:    true,
		AllowedOrigins: []string{"http://localhost:5173"},
		AdminEmails:    []string{"learner@example.com"},
	}
	h := server.New(cfg, pool, &auth.MockVerifier{Tokens: map[string]*auth.GoogleTokenPayload{
		"valid-token": {GoogleID: "google-1", Email: "learner@example.com", Name: "Learner"},
	}})
	if _, err := pool.Exec(t.Context(),
		`INSERT INTO topics (id, track, title, description, eyebrow, accent, order_index)
		 VALUES ('education', 'ielts', 'Education', 'd', 'e', 'mint', 1)`); err != nil {
		t.Fatalf("seed topic: %v", err)
	}
	return h
}

var validItem = map[string]any{
	"topicId":   "education",
	"track":     "ielts",
	"term":      "adaptive learning",
	"ipa":       "əˈdæptɪv ˈlɜːnɪŋ",
	"label":     "collocation",
	"meaning":   "học thích ứng",
	"example":   "Adaptive learning adjusts to each student.",
	"exampleVi": "Học thích ứng điều chỉnh theo từng học sinh.",
}

func TestCreateVocabItem_AdminCreatesAndAudioDisabled(t *testing.T) {
	srv := adminServer(t)
	token := testutil.Login(t, srv)

	res := testutil.Do(t, srv, http.MethodPost, "/api/v1/admin/vocab-items", validItem, token)
	if res.Code != http.StatusCreated {
		t.Fatalf("status = %d (%s)", res.Code, res.Body.String())
	}
	var body struct {
		Item struct {
			ID   string `json:"id"`
			Term string `json:"term"`
		} `json:"item"`
		AudioReady bool `json:"audioReady"`
	}
	testutil.Decode(t, res, &body)
	if body.Item.ID != "education:adaptive-learning" {
		t.Fatalf("id = %q", body.Item.ID)
	}
	if body.AudioReady {
		t.Fatal("audioReady = true khi R2 chưa cấu hình")
	}

	// Item phải đọc lại được qua topic endpoint.
	got := testutil.Get(t, srv, "/api/v1/topics/education")
	var detail struct {
		Items []struct {
			ID string `json:"id"`
		} `json:"items"`
	}
	testutil.Decode(t, got, &detail)
	found := false
	for _, it := range detail.Items {
		if it.ID == "education:adaptive-learning" {
			found = true
		}
	}
	if !found {
		t.Fatal("item không có trong GET /topics/education")
	}
}

func TestCreateVocabItem_RejectsNonAdminAndAnonymous(t *testing.T) {
	// Server mặc định của testutil không có AdminEmails → mọi user đều non-admin.
	srv := testutil.Server(t)
	token := testutil.Login(t, srv)

	if res := testutil.Do(t, srv, http.MethodPost, "/api/v1/admin/vocab-items", validItem, token); res.Code != http.StatusForbidden {
		t.Fatalf("non-admin status = %d, want 403", res.Code)
	}
	if res := testutil.Do(t, srv, http.MethodPost, "/api/v1/admin/vocab-items", validItem, ""); res.Code != http.StatusUnauthorized {
		t.Fatalf("anonymous status = %d, want 401", res.Code)
	}
}

func TestCreateVocabItem_Validation(t *testing.T) {
	srv := adminServer(t)
	token := testutil.Login(t, srv)

	bad := map[string]any{"topicId": "education", "term": "x"}
	if res := testutil.Do(t, srv, http.MethodPost, "/api/v1/admin/vocab-items", bad, token); res.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", res.Code)
	}
}
