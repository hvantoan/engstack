package handler_test

import (
	"compress/gzip"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"engstack/backend/internal/dto"
	"engstack/backend/internal/testutil"
)

func TestHealthEndpoint(t *testing.T) {
	srv := testutil.Server(t)
	res := testutil.Get(t, srv, "/api/v1/health")
	if res.Code != http.StatusOK {
		t.Fatalf("status = %d", res.Code)
	}
	var body map[string]string
	testutil.Decode(t, res, &body)
	if body["status"] != "ok" || body["version"] != "1.0.0" {
		t.Fatalf("body = %v", body)
	}
}

func TestListTopicsEndpoint(t *testing.T) {
	srv := testutil.Server(t)
	res := testutil.Get(t, srv, "/api/v1/topics")
	if res.Code != http.StatusOK {
		t.Fatalf("status = %d", res.Code)
	}
	if cc := res.Header().Get("Cache-Control"); cc != "public, max-age=86400, stale-while-revalidate=3600" {
		t.Fatalf("cache-control = %q", cc)
	}

	var topics []dto.TopicSummary
	testutil.Decode(t, res, &topics)
	if len(topics) != 24 {
		t.Fatalf("topics = %d, want 24", len(topics))
	}
	for _, tp := range topics {
		if tp.ID == "" || tp.Track == "" || tp.Title == "" || tp.Description == "" ||
			tp.Eyebrow == "" || tp.Accent == "" || tp.ItemCount == 0 {
			t.Fatalf("incomplete topic: %+v", tp)
		}
	}
}

func TestGetTopicByID_Found(t *testing.T) {
	srv := testutil.Server(t)

	var ielts dto.TopicDetail
	testutil.Decode(t, testutil.Get(t, srv, "/api/v1/topics/education"), &ielts)
	if ielts.ID != "education" || len(ielts.Items) != 200 {
		t.Fatalf("education = %s, %d items", ielts.ID, len(ielts.Items))
	}
	for _, it := range ielts.Items {
		if it.TopicID != "education" || it.Track != "ielts" || it.Meaning == "" ||
			it.Example == "" || it.ExampleVi == "" {
			t.Fatalf("bad ielts item: %+v", it)
		}
	}

	var oxford dto.TopicDetail
	testutil.Decode(t, testutil.Get(t, srv, "/api/v1/topics/oxford-b1"), &oxford)
	if len(oxford.Items) != 808 {
		t.Fatalf("oxford-b1 items = %d, want 808", len(oxford.Items))
	}
	for _, it := range oxford.Items {
		if it.TopicID != "oxford-b1" || it.Track != "oxford" || len(it.Pos) == 0 {
			t.Fatalf("bad oxford item: %+v", it)
		}
	}
}

func TestGetTopicByID_NotFound(t *testing.T) {
	srv := testutil.Server(t)
	res := testutil.Get(t, srv, "/api/v1/topics/non-existent-topic")
	if res.Code != http.StatusNotFound {
		t.Fatalf("status = %d", res.Code)
	}
	var body map[string]string
	testutil.Decode(t, res, &body)
	if body["error"] != "topic not found" {
		t.Fatalf("body = %v", body)
	}
}

func TestETagSupport(t *testing.T) {
	srv := testutil.Server(t)

	first := testutil.Get(t, srv, "/api/v1/topics/education")
	etag := first.Header().Get("ETag")
	if etag == "" {
		t.Fatal("missing ETag")
	}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/topics/education", nil)
	req.Header.Set("If-None-Match", etag)
	res := httptest.NewRecorder()
	srv.ServeHTTP(res, req)

	if res.Code != http.StatusNotModified {
		t.Fatalf("status = %d, want 304", res.Code)
	}
	if res.Body.Len() != 0 {
		t.Fatalf("body = %q, want empty", res.Body.String())
	}
}

func TestGzipCompression(t *testing.T) {
	srv := testutil.Server(t)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/topics/education", nil)
	req.Header.Set("Accept-Encoding", "gzip")
	res := httptest.NewRecorder()
	srv.ServeHTTP(res, req)

	if enc := res.Header().Get("Content-Encoding"); enc != "gzip" {
		t.Fatalf("content-encoding = %q", enc)
	}
	// 200 IELTS items: ~81KB raw -> ~20KB at gzip level 5.
	if res.Body.Len() >= 25*1024 {
		t.Fatalf("compressed size = %d, want < 25KB", res.Body.Len())
	}
	zr, err := gzip.NewReader(res.Body)
	if err != nil {
		t.Fatalf("gzip reader: %v", err)
	}
	defer zr.Close()
	var payload struct {
		Items []dto.ModuleItem `json:"items"`
	}
	if err := json.NewDecoder(zr).Decode(&payload); err != nil {
		t.Fatalf("decode gzip response: %v", err)
	}
	if len(payload.Items) != 200 {
		t.Fatalf("items = %d, want 200", len(payload.Items))
	}
}

func BenchmarkGetTopicDetail(b *testing.B) {
	srv := testutil.Server(b)
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		res := testutil.Get(b, srv, "/api/v1/topics/education")
		if res.Code != http.StatusOK {
			b.Fatalf("status = %d", res.Code)
		}
	}
}
