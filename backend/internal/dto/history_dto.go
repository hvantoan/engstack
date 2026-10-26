package dto

import "time"

// SearchResultItem is one hit of GET /api/v1/search/items.
type SearchResultItem struct {
	ModuleItem
	TopicTitle string `json:"topicTitle"`
}

// SearchResponse is the paginated payload of GET /api/v1/search/items.
type SearchResponse struct {
	Query   string             `json:"query"`
	Total   int64              `json:"total"`
	Page    int                `json:"page"`
	PerPage int                `json:"perPage"`
	Items   []SearchResultItem `json:"items"`
}

// PositionResponse is the saved resume point of GET /api/v1/state/position.
type PositionResponse struct {
	TopicID   string    `json:"topicId"`
	Mode      string    `json:"mode"`
	ItemID    string    `json:"itemId,omitempty"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// UpdatePositionRequest saves where the learner left off (topic + mode + item).
type UpdatePositionRequest struct {
	TopicID string `json:"topicId"`
	Mode    string `json:"mode"`
	ItemID  string `json:"itemId,omitempty"`
}

// LearningEventRequest logs a client-side learning session boundary.
// clientEventId dedupes retries/multi-tab replays.
type LearningEventRequest struct {
	Type          string `json:"type"`
	TopicID       string `json:"topicId"`
	ItemID        string `json:"itemId,omitempty"`
	Mode          string `json:"mode,omitempty"`
	ClientEventID string `json:"clientEventId,omitempty"`
}

// HistoryItem is one row of the merged activity timeline.
// kind: review | learn | unlearn | session_start | session_end.
// rating is only set for kind=review (0 means none).
type HistoryItem struct {
	Kind    string    `json:"kind"`
	ItemID  string    `json:"itemId,omitempty"`
	Term    string    `json:"term,omitempty"`
	TopicID string    `json:"topicId"`
	Mode    string    `json:"mode,omitempty"`
	Rating  int       `json:"rating,omitempty"`
	At      time.Time `json:"at"`
}

type HistoryResponse struct {
	Items []HistoryItem `json:"items"`
}
