package dto_test

import (
	"encoding/json"
	"testing"

	"engstack/backend/internal/dto"
)

// The frontend (src/lib/vocab-schema.ts) reads these exact keys. This test fails
// loudly when a JSON tag is renamed or an omitempty is added/removed, which
// would otherwise surface as blank fields in the UI.
func jsonKeys(t *testing.T, v any) map[string]bool {
	t.Helper()
	raw, err := json.Marshal(v)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var m map[string]any
	if err := json.Unmarshal(raw, &m); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	keys := make(map[string]bool, len(m))
	for k := range m {
		keys[k] = true
	}
	return keys
}

func assertKeys(t *testing.T, got map[string]bool, want ...string) {
	t.Helper()
	if len(got) != len(want) {
		t.Fatalf("keys = %v, want exactly %v", got, want)
	}
	for _, k := range want {
		if !got[k] {
			t.Fatalf("missing key %q in %v", k, got)
		}
	}
}

func TestModuleItemJSONContract(t *testing.T) {
	level := "B1"
	full := dto.ModuleItem{
		ID: "edu-1", TopicID: "education", Track: "oxford", Term: "abandon",
		IPA: "/əˈbændən/", Label: "word", Meaning: "từ bỏ", Example: "They abandoned the plan.",
		ExampleVi: "Họ đã từ bỏ kế hoạch.", Definition: "to leave behind", Level: &level,
		Pos: []string{"verb"},
	}
	assertKeys(t, jsonKeys(t, full),
		"id", "topicId", "track", "term", "ipa", "label", "meaning",
		"example", "exampleVi", "definition", "level", "pos")

	// IELTS items carry no definition/level; those two keys must disappear from
	// the payload while `pos` stays present (the FE type treats it as optional).
	minimal := dto.ModuleItem{
		ID: "edu-2", TopicID: "education", Track: "ielts", Term: "academic",
		IPA: "/ˌækəˈdemɪk/", Label: "word", Meaning: "học thuật",
		Example: "Academic writing demands precision.", ExampleVi: "Viết học thuật đòi hỏi sự chính xác.",
	}
	assertKeys(t, jsonKeys(t, minimal),
		"id", "topicId", "track", "term", "ipa", "label", "meaning",
		"example", "exampleVi", "pos")
}

func TestTopicSummaryJSONContract(t *testing.T) {
	level := "B2"
	summary := dto.TopicSummary{
		ID: "education", Track: "ielts", Title: "Education", Description: "Học đường",
		Eyebrow: "IELTS · Topic 3", Accent: "mint", Level: &level,
		OrderIndex: 3, Related: []string{"work"}, ItemCount: 200,
	}
	assertKeys(t, jsonKeys(t, summary),
		"id", "track", "title", "description", "eyebrow", "accent",
		"level", "orderIndex", "related", "itemCount")
}

// Field names are part of the wire contract too: the client sends snake_case on
// auth and camelCase on progress, and a rename here breaks login silently.
func TestRequestJSONContract(t *testing.T) {
	assertKeys(t, jsonKeys(t, dto.GoogleLoginRequest{IDToken: "x"}), "id_token")
	assertKeys(t, jsonKeys(t, dto.RefreshRequest{RefreshToken: "x"}), "refresh_token")
	assertKeys(t, jsonKeys(t, dto.LogoutRequest{RefreshToken: "x"}), "refresh_token")
	assertKeys(t, jsonKeys(t, dto.ImportGuestProgressRequest{ItemIDs: []string{}}), "itemIds")
	assertKeys(t, jsonKeys(t, dto.ToggleProgressRequest{ItemID: "a", Learned: true}), "itemId", "learned")
	assertKeys(t, jsonKeys(t, dto.ToggleProgressResponse{ItemID: "a", TopicID: "topic", Learned: true}),
		"itemId", "topicId", "learned")

	var got dto.ToggleProgressRequest
	if err := json.Unmarshal([]byte(`{"itemId":"a","learned":true}`), &got); err != nil {
		t.Fatal(err)
	}
	if got.ItemID != "a" || !got.Learned {
		t.Fatalf("decoded %+v", got)
	}
}
