package handler

import (
	"net/http"

	"engstack/backend/internal/dto"
	"engstack/backend/internal/middleware"
	"engstack/backend/internal/store"
)

type ProgressHandler struct {
	Q *store.Queries
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

	if req.Learned {
		err := h.Q.SetProgressLearned(r.Context(), store.SetProgressLearnedParams{
			UserID: userID,
			ItemID: req.ItemID,
		})
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
	} else {
		if err := h.Q.DeleteProgress(r.Context(), store.DeleteProgressParams{
			UserID: userID,
			ItemID: req.ItemID,
		}); err != nil {
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
	}

	writeJSON(w, http.StatusOK, dto.ToggleProgressResponse{ItemID: req.ItemID, Learned: req.Learned})
}
