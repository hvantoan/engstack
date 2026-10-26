package handler

import (
	"errors"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"engstack/backend/internal/dto"
	"engstack/backend/internal/middleware"
	"engstack/backend/internal/store"
)

type ProgressHandler struct {
	Q *store.Queries
}

// firstReviewDue puts newly learned items on tomorrow's queue.
func firstReviewDue() pgtype.Timestamptz {
	return pgtype.Timestamptz{Time: time.Now().Add(24 * time.Hour), Valid: true}
}

func (h *ProgressHandler) ImportGuest(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req dto.ImportGuestProgressRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.ItemIDs == nil {
		req.ItemIDs = []string{}
	}

	imported, err := h.Q.ImportGuestProgress(r.Context(), store.ImportGuestProgressParams{
		UserID:  userID,
		ItemIds: req.ItemIDs,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	// Imported flags enter the review queue the same as fresh toggles.
	if _, err := h.Q.EnqueueReviewItemsForImport(r.Context(), store.EnqueueReviewItemsForImportParams{
		UserID:  userID,
		DueAt:   firstReviewDue(),
		ItemIds: req.ItemIDs,
	}); err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, dto.ImportGuestProgressResponse{Imported: imported})
}

func (h *ProgressHandler) Get(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	rows, err := h.Q.ListUserProgress(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	out := make(map[string][]string, 24)
	for _, row := range rows {
		out[row.TopicID] = append(out[row.TopicID], row.ItemID)
	}
	writeJSON(w, http.StatusOK, out)
}

func (h *ProgressHandler) Toggle(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req dto.ToggleProgressRequest
	if err := decodeJSON(r, &req); err != nil || req.ItemID == "" {
		writeError(w, http.StatusBadRequest, "itemId is required")
		return
	}

	resolved, err := h.Q.ResolveVocabItemID(r.Context(), req.ItemID)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "item not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	if req.Learned {
		err := h.Q.SetProgressLearned(r.Context(), store.SetProgressLearnedParams{
			UserID: userID,
			ItemID: resolved.ItemID,
		})
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		// Marking learned schedules the first review; un-learning leaves the
		// queue. Review history (review_events) is kept either way.
		if err := h.Q.EnqueueReviewItem(r.Context(), store.EnqueueReviewItemParams{
			UserID: userID,
			DueAt:  firstReviewDue(),
			ID:     resolved.ItemID,
		}); err != nil {
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
	} else {
		if err := h.Q.DeleteProgress(r.Context(), store.DeleteProgressParams{
			UserID: userID,
			ItemID: resolved.ItemID,
		}); err != nil {
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		if err := h.Q.DequeueReviewItem(r.Context(), store.DequeueReviewItemParams{
			UserID: userID,
			ItemID: resolved.ItemID,
		}); err != nil {
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
	}

	logProgressEvent(r, h.Q, userID, req.Learned, resolved, req.ClientEventID)

	writeJSON(w, http.StatusOK, dto.ToggleProgressResponse{
		ItemID:  resolved.ItemID,
		TopicID: resolved.TopicID,
		Learned: req.Learned,
	})
}
