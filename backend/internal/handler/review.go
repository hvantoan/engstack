package handler

import (
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/google/uuid"

	"engstack/backend/internal/dto"
	"engstack/backend/internal/middleware"
	"engstack/backend/internal/review"
	"engstack/backend/internal/store"
)

const (
	defaultDueLimit = 20
	maxDueLimit     = 100
	// Learned items enter the review queue one day out: marking "đã thuộc"
	// is a flag, not a recall result — the first rating measures retention.
	initialReviewDelay = 24 * time.Hour
)

type ReviewHandler struct {
	Q    *store.Queries
	Pool *pgxpool.Pool
}

func (h *ReviewHandler) Due(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	limit := int32(defaultDueLimit)
	if raw := r.URL.Query().Get("limit"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed < 1 {
			writeError(w, http.StatusBadRequest, "invalid limit")
			return
		}
		if parsed > maxDueLimit {
			parsed = maxDueLimit
		}
		limit = int32(parsed)
	}

	now := time.Now()
	nowTz := pgtype.Timestamptz{Time: now, Valid: true}

	rows, err := h.Q.ListDueReviewItems(r.Context(), store.ListDueReviewItemsParams{
		UserID: userID,
		DueAt:  nowTz,
		Limit:  limit,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	dueCount, err := h.Q.CountDueReviewItems(r.Context(), store.CountDueReviewItemsParams{
		UserID: userID,
		DueAt:  nowTz,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	pending, err := h.Q.CountPendingReviewItems(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	next, err := h.Q.NextReviewDueAt(r.Context(), userID)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	items := make([]dto.ReviewItem, 0, len(rows))
	for _, row := range rows {
		items = append(items, dto.ReviewItem{
			ModuleItem: dto.ModuleItem{
				ID: row.ItemID, TopicID: row.TopicID, Track: row.Track,
				Term: row.Term, IPA: row.Ipa, Label: row.Label,
				Meaning: row.Meaning, Example: row.Example,
				ExampleVi: row.ExampleVi, Definition: row.Definition,
				Level: row.Level, Pos: row.Pos,
			},
			DueAt:       row.DueAt.Time,
			ReviewCount: int(row.ReviewCount),
			LapseCount:  int(row.LapseCount),
		})
	}

	resp := dto.DueReviewResponse{
		GeneratedAt:  now,
		DueCount:     int(dueCount),
		PendingCount: int(pending),
		Items:        items,
	}
	if err == nil && next.Valid {
		t := next.Time
		resp.NextDueAt = &t
	}
	writeJSON(w, http.StatusOK, resp)
}

// Submit records one rating inside a transaction: the schedule row is locked,
// recomputed by the deterministic scheduler, and the event appended to the
// immutable log. Replayed clientEventIds return the stored result.
func (h *ReviewHandler) Submit(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req dto.SubmitReviewRequest
	if err := decodeJSON(r, &req); err != nil || req.ItemID == "" {
		writeError(w, http.StatusBadRequest, "itemId is required")
		return
	}
	if req.Rating < review.RatingAgain || req.Rating > review.RatingEasy {
		writeError(w, http.StatusBadRequest, "rating must be 1-4")
		return
	}
	var clientEventID *uuid.UUID
	if req.ClientEventID != "" {
		parsed, err := uuid.Parse(req.ClientEventID)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid clientEventId")
			return
		}
		clientEventID = &parsed
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

	tx, err := h.Pool.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer func() { _ = tx.Rollback(r.Context()) }()
	qtx := h.Q.WithTx(tx)

	// Idempotent replay: same clientEventId → stored result, no second event.
	if clientEventID != nil {
		dup, err := qtx.GetReviewEventByClientID(r.Context(), store.GetReviewEventByClientIDParams{
			UserID:        userID,
			ClientEventID: clientEventID,
		})
		if err == nil {
			_ = tx.Commit(r.Context())
			writeJSON(w, http.StatusOK, dto.SubmitReviewResponse{
				ItemID:       dup.ItemID,
				Rating:       int(dup.Rating),
				IntervalDays: int(dup.IntervalDays),
				ReviewCount:  int(dup.ReviewCount),
				DueAt:        dup.DueAt.Time,
				Duplicate:    true,
			})
			return
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
	}

	// Only learned items may be rated: a stale submit from another device must
	// not resurrect a card the user already unlearned (dequeued).
	learned, err := qtx.CheckProgressLearned(r.Context(), store.CheckProgressLearnedParams{
		UserID: userID,
		ItemID: resolved.ItemID,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	if !learned {
		writeError(w, http.StatusNotFound, "item not in review queue")
		return
	}

	// Insert-if-missing first so there is always a row to lock: two first-time
	// submits then serialize on FOR UPDATE instead of overwriting each other.
	if err := qtx.EnqueueReviewItem(r.Context(), store.EnqueueReviewItemParams{
		UserID: userID,
		DueAt:  pgtype.Timestamptz{Time: time.Now().Add(initialReviewDelay), Valid: true},
		ID:     resolved.ItemID,
	}); err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	state := review.NewState()
	row, err := qtx.GetReviewItemForUpdate(r.Context(), store.GetReviewItemForUpdateParams{
		UserID: userID,
		ItemID: resolved.ItemID,
	})
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		// Unlearned between the check above and the conditional insert.
		writeError(w, http.StatusNotFound, "item not in review queue")
		return
	case err != nil:
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	default:
		state = review.State{
			IntervalDays: int(row.IntervalDays),
			Ease:         float64(row.Ease),
			ReviewCount:  int(row.ReviewCount),
		}
	}

	now := time.Now()
	next := review.Next(state, req.Rating)
	dueAt := review.DueAt(next, now)
	dueTz := pgtype.Timestamptz{Time: dueAt, Valid: true}
	nowTz := pgtype.Timestamptz{Time: now, Valid: true}
	lastRating := int16(req.Rating)

	if err := qtx.UpsertReviewItem(r.Context(), store.UpsertReviewItemParams{
		UserID:         userID,
		ItemID:         resolved.ItemID,
		TopicID:        resolved.TopicID,
		DueAt:          dueTz,
		IntervalDays:   int32(next.IntervalDays),
		Ease:           float32(next.Ease),
		ReviewCount:    int32(next.ReviewCount),
		LastRating:     &lastRating,
		LastReviewedAt: nowTz,
	}); err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	if err := qtx.InsertReviewEvent(r.Context(), store.InsertReviewEventParams{
		UserID:        userID,
		ItemID:        resolved.ItemID,
		TopicID:       resolved.TopicID,
		Rating:        lastRating,
		IntervalDays:  int32(next.IntervalDays),
		ReviewCount:   int32(next.ReviewCount),
		DueAt:         dueTz,
		ReviewedAt:    nowTz,
		ClientEventID: clientEventID,
	}); err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	writeJSON(w, http.StatusOK, dto.SubmitReviewResponse{
		ItemID:       resolved.ItemID,
		Rating:       req.Rating,
		IntervalDays: next.IntervalDays,
		ReviewCount:  next.ReviewCount,
		DueAt:        dueAt,
	})
}
