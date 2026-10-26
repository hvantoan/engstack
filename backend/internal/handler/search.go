package handler

import (
	"net/http"
	"strconv"
	"strings"

	"engstack/backend/internal/dto"
	"engstack/backend/internal/store"
)

type SearchHandler struct {
	Q *store.Queries
}

const (
	defaultSearchPerPage = 20
	maxSearchPerPage     = 50
)

// escapeLike neutralises LIKE wildcards so a user query matches literally.
func escapeLike(q string) string {
	r := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)
	return r.Replace(q)
}

// Search serves GET /api/v1/search/items?q=&track=&level=&page=&perPage=.
// Public: content search needs no account. $1='' disables the text filter
// so track/level browsing still works with an empty query.
func (h *SearchHandler) Items(w http.ResponseWriter, r *http.Request) {
	query := strings.TrimSpace(r.URL.Query().Get("q"))
	track := strings.TrimSpace(r.URL.Query().Get("track"))
	level := strings.TrimSpace(r.URL.Query().Get("level"))
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	if page < 1 {
		page = 1
	}
	perPage, _ := strconv.Atoi(r.URL.Query().Get("perPage"))
	if perPage <= 0 {
		perPage = defaultSearchPerPage
	}
	if perPage > maxSearchPerPage {
		perPage = maxSearchPerPage
	}
	if len(query) > 200 {
		writeError(w, http.StatusBadRequest, "query too long")
		return
	}
	if len(track) > 40 || len(level) > 10 {
		writeError(w, http.StatusBadRequest, "invalid filters")
		return
	}

	like := escapeLike(query)
	params := store.SearchVocabItemsParams{
		Column1: like,
		Column2: track,
		Column3: level,
		Limit:   int32(perPage),
		Offset:  int32((page - 1) * perPage),
	}
	countParams := store.CountSearchVocabItemsParams{
		Column1: like,
		Column2: track,
		Column3: level,
	}

	rows, err := h.Q.SearchVocabItems(r.Context(), params)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	total, err := h.Q.CountSearchVocabItems(r.Context(), countParams)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	items := make([]dto.SearchResultItem, 0, len(rows))
	for _, row := range rows {
		items = append(items, dto.SearchResultItem{
			ModuleItem: dto.ModuleItem{
				ID: row.ID, TopicID: row.TopicID, Track: row.Track,
				Term: row.Term, IPA: row.Ipa, Label: row.Label,
				Meaning: row.Meaning, Example: row.Example,
				ExampleVi: row.ExampleVi, Definition: row.Definition,
				Level: row.Level, Pos: row.Pos,
			},
			TopicTitle: row.TopicTitle,
		})
	}

	writeJSON(w, http.StatusOK, dto.SearchResponse{
		Query:   query,
		Total:   total,
		Page:    page,
		PerPage: perPage,
		Items:   items,
	})
}
