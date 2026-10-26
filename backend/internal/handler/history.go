package handler

import (
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"engstack/backend/internal/dto"
	"engstack/backend/internal/middleware"
	"engstack/backend/internal/store"
)

// HistoryHandler owns resume position, client session events and the merged
// activity timeline (B10). All routes require auth.
type HistoryHandler struct {
	Q *store.Queries
}

var validEventTypes = map[string]bool{
	"learn":         true,
	"unlearn":       true,
	"session_start": true,
	"session_end":   true,
}

func (h *HistoryHandler) GetPosition(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	row, err := h.Q.GetUserPosition(r.Context(), userID)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "no saved position")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	resp := dto.PositionResponse{
		TopicID:   row.TopicID,
		Mode:      row.Mode,
		UpdatedAt: row.UpdatedAt.Time,
	}
	if row.ItemID != nil {
		resp.ItemID = *row.ItemID
	}
	writeJSON(w, http.StatusOK, resp)
}

func (h *HistoryHandler) PutPosition(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	var req dto.UpdatePositionRequest
	if err := decodeJSON(r, &req); err != nil || req.TopicID == "" || req.Mode == "" {
		writeError(w, http.StatusBadRequest, "topicId and mode are required")
		return
	}
	params := store.UpsertUserPositionParams{
		UserID:  userID,
		TopicID: req.TopicID,
		Mode:    req.Mode,
	}
	if req.ItemID != "" {
		resolved, err := h.Q.ResolveVocabItemID(r.Context(), req.ItemID)
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "item not found")
			return
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		params.ItemID = &resolved.ItemID
	}
	if err := h.Q.UpsertUserPosition(r.Context(), params); err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, dto.PositionResponse{
		TopicID:   req.TopicID,
		Mode:      req.Mode,
		ItemID:    req.ItemID,
		UpdatedAt: time.Now().UTC(),
	})
}

// PostEvent ingests a client-side session boundary (mode opened/finished).
// Idempotent via client_event_id unique index.
func (h *HistoryHandler) PostEvent(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	var req dto.LearningEventRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	if !validEventTypes[req.Type] {
		writeError(w, http.StatusBadRequest, "unknown event type")
		return
	}
	params := store.InsertLearningEventParams{
		UserID:  userID,
		Type:    req.Type,
		TopicID: optText(req.TopicID),
		ItemID:  optText(req.ItemID),
		Mode:    optText(req.Mode),
	}
	if req.ClientEventID != "" {
		id, err := uuid.Parse(req.ClientEventID)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid clientEventId")
			return
		}
		params.ClientEventID = &id
	}
	if err := h.Q.InsertLearningEvent(r.Context(), params); err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *HistoryHandler) List(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit <= 0 {
		limit = 30
	}
	if limit > 100 {
		limit = 100
	}
	rows, err := h.Q.ListLearningHistory(r.Context(), store.ListLearningHistoryParams{
		UserID: userID,
		Limit:  int32(limit),
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	items := make([]dto.HistoryItem, 0, len(rows))
	for _, row := range rows {
		it := dto.HistoryItem{
			Kind:    row.Kind,
			ItemID:  row.ItemID,
			TopicID: row.TopicID,
			At:      row.HappenedAt.Time,
		}
		if row.Term != nil {
			it.Term = *row.Term
		}
		if row.Mode != nil {
			it.Mode = *row.Mode
		}
		if row.Kind == "review" {
			it.Rating = int(row.Rating)
		}
		items = append(items, it)
	}
	writeJSON(w, http.StatusOK, dto.HistoryResponse{Items: items})
}

func optText(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

// logProgressEvent is called by Toggle to record learn/unlearn in history.
func logProgressEvent(r *http.Request, q *store.Queries, userID uuid.UUID, learned bool, resolved store.ResolveVocabItemIDRow, clientEventID string) {
	kind := "unlearn"
	if learned {
		kind = "learn"
	}
	params := store.InsertLearningEventParams{
		UserID:  userID,
		Type:    kind,
		TopicID: &resolved.TopicID,
		ItemID:  &resolved.ItemID,
	}
	if clientEventID != "" {
		if id, err := uuid.Parse(clientEventID); err == nil {
			params.ClientEventID = &id
		}
	}
	// Best-effort: history must not fail the toggle itself.
	_ = q.InsertLearningEvent(r.Context(), params)
}
