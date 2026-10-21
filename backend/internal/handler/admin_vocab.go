package handler

import (
	"net/http"
	"strings"

	"engstack/backend/internal/audio"
	"engstack/backend/internal/dto"
	"engstack/backend/internal/store"
)

// AdminHandler phục vụ các endpoint quản trị (/admin/*) — cần RequireAuth +
// RequireAdmin ở router.
type AdminHandler struct {
	Q     *store.Queries
	Audio *audio.Pipeline
}

// createVocabItemRequest là body của POST /admin/vocab-items. `id` tự suy từ
// topicId + term + pos giống pipeline seed khi client không truyền.
type createVocabItemRequest struct {
	ID         string   `json:"id"`
	TopicID    string   `json:"topicId"`
	Track      string   `json:"track"`
	Term       string   `json:"term"`
	IPA        string   `json:"ipa"`
	Label      string   `json:"label"`
	Meaning    string   `json:"meaning"`
	Example    string   `json:"example"`
	ExampleVi  string   `json:"exampleVi"`
	Definition string   `json:"definition"`
	Level      *string  `json:"level"`
	Pos        []string `json:"pos"`
	OrderIndex int32    `json:"orderIndex"`
}

// CreateVocabItem upsert một mục từ vựng rồi bảo đảm audio + manifest trên
// R2. Audio fail không fail request — item đã lưu, web fallback speechSynthesis.
func (h *AdminHandler) CreateVocabItem(w http.ResponseWriter, r *http.Request) {
	var req createVocabItemRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	missing := map[string]string{
		"topicId": req.TopicID, "track": req.Track, "term": req.Term,
		"label": req.Label, "meaning": req.Meaning, "example": req.Example,
		"exampleVi": req.ExampleVi,
	}
	for field, v := range missing {
		if strings.TrimSpace(v) == "" {
			writeError(w, http.StatusBadRequest, "missing "+field)
			return
		}
	}
	if req.ID == "" {
		req.ID = req.TopicID + ":" + audio.Slug(req.Term)
	}
	if req.Pos == nil {
		req.Pos = []string{} // cột pos NOT NULL — nil sẽ vi phạm constraint
	}

	if err := h.Q.UpsertVocabItem(r.Context(), store.UpsertVocabItemParams{
		ID: req.ID, TopicID: req.TopicID, Track: req.Track, Term: req.Term,
		Ipa: req.IPA, Label: req.Label, Meaning: req.Meaning,
		Example: req.Example, ExampleVi: req.ExampleVi,
		Definition: req.Definition, Level: req.Level, Pos: req.Pos,
		OrderIndex: req.OrderIndex,
	}); err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	audioReady := false
	if h.Audio != nil {
		audioReady = h.Audio.EnsureAudio(r.Context(), req.Term)
	}

	writeJSON(w, http.StatusCreated, map[string]any{
		"item": dto.ModuleItem{
			ID: req.ID, TopicID: req.TopicID, Track: req.Track, Term: req.Term,
			IPA: req.IPA, Label: req.Label, Meaning: req.Meaning,
			Example: req.Example, ExampleVi: req.ExampleVi,
			Definition: req.Definition, Level: req.Level, Pos: req.Pos,
		},
		"audioReady": audioReady,
	})
}
