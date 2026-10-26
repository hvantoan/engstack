package dto

import "time"

// ReviewItem is a queued card with its schedule metadata.
type ReviewItem struct {
	ModuleItem
	DueAt       time.Time `json:"dueAt"`
	ReviewCount int       `json:"reviewCount"`
}

// DueReviewResponse is the payload of GET /api/v1/review/due: the cards due
// now (capped by limit), the totals behind them and the next scheduled slot.
type DueReviewResponse struct {
	GeneratedAt  time.Time    `json:"generatedAt"`
	DueCount     int          `json:"dueCount"`
	PendingCount int          `json:"pendingCount"`
	NextDueAt    *time.Time   `json:"nextDueAt,omitempty"`
	Items        []ReviewItem `json:"items"`
}

type SubmitReviewRequest struct {
	ItemID        string `json:"itemId"`
	Rating        int    `json:"rating"`
	ClientEventID string `json:"clientEventId,omitempty"`
}

// SubmitReviewResponse returns the resulting schedule so the client can
// confirm; a replayed clientEventId comes back with Duplicate=true.
type SubmitReviewResponse struct {
	ItemID       string    `json:"itemId"`
	Rating       int       `json:"rating"`
	IntervalDays int       `json:"intervalDays"`
	ReviewCount  int       `json:"reviewCount"`
	DueAt        time.Time `json:"dueAt"`
	Duplicate    bool      `json:"duplicate"`
}
