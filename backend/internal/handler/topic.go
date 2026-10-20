package handler

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"engstack/backend/internal/dto"
	"engstack/backend/internal/store"
)

type TopicHandler struct {
	Q *store.Queries
}

func (h *TopicHandler) List(w http.ResponseWriter, r *http.Request) {
	rows, err := h.Q.ListTopicsWithCount(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	out := make([]dto.TopicSummary, 0, len(rows))
	for _, row := range rows {
		out = append(out, dto.TopicSummary{
			ID: row.ID, Track: row.Track, Title: row.Title, Description: row.Description,
			Eyebrow: row.Eyebrow, Accent: row.Accent, Level: row.Level,
			OrderIndex: int(row.OrderIndex), Related: row.Related, ItemCount: int(row.ItemCount),
		})
	}
	writeCachedJSON(w, r, out)
}

func (h *TopicHandler) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	topic, err := h.Q.GetTopicByID(r.Context(), id)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "topic not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	rows, err := h.Q.ListVocabByTopicID(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	detail := dto.TopicDetail{
		TopicSummary: dto.TopicSummary{
			ID: topic.ID, Track: topic.Track, Title: topic.Title, Description: topic.Description,
			Eyebrow: topic.Eyebrow, Accent: topic.Accent, Level: topic.Level,
			OrderIndex: int(topic.OrderIndex), Related: topic.Related, ItemCount: len(rows),
		},
		Items: make([]dto.ModuleItem, 0, len(rows)),
	}
	for _, it := range rows {
		detail.Items = append(detail.Items, dto.ModuleItem{
			ID: it.ID, TopicID: it.TopicID, Track: it.Track, Term: it.Term, IPA: it.Ipa,
			Label: it.Label, Meaning: it.Meaning, Example: it.Example, ExampleVi: it.ExampleVi,
			Definition: it.Definition, Level: it.Level, Pos: it.Pos,
		})
	}
	writeCachedJSON(w, r, detail)
}
