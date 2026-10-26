package dto

type ImportGuestProgressRequest struct {
	ItemIDs []string `json:"itemIds"`
}

type ImportGuestProgressResponse struct {
	Imported int64 `json:"imported"`
}

type ToggleProgressRequest struct {
	ItemID  string `json:"itemId"`
	Learned bool   `json:"learned"`
	// Optional dedupe key so retried toggles don't double-log history.
	ClientEventID string `json:"clientEventId,omitempty"`
}

type ToggleProgressResponse struct {
	ItemID  string `json:"itemId"`
	TopicID string `json:"topicId"`
	Learned bool   `json:"learned"`
}
