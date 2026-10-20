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
}

type ToggleProgressResponse struct {
	ItemID  string `json:"itemId"`
	Learned bool   `json:"learned"`
}
