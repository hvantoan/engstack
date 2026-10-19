// Package dto defines the JSON contract served to the frontend.
package dto

// TopicSummary mirrors the topic envelope without its items.
type TopicSummary struct {
	ID          string   `json:"id"`
	Track       string   `json:"track"`
	Title       string   `json:"title"`
	Description string   `json:"description"`
	Eyebrow     string   `json:"eyebrow"`
	Accent      string   `json:"accent"`
	Level       *string  `json:"level,omitempty"`
	OrderIndex  int      `json:"orderIndex"`
	Related     []string `json:"related"`
	ItemCount   int      `json:"itemCount"`
}

// ModuleItem mirrors src/lib/vocab-schema.ts:ModuleItem — a VocabItem carrying
// its module context. The frontend relies on topicId + track to render labels.
type ModuleItem struct {
	ID         string   `json:"id"`
	TopicID    string   `json:"topicId"`
	Track      string   `json:"track"`
	Term       string   `json:"term"`
	IPA        string   `json:"ipa"`
	Label      string   `json:"label"`
	Meaning    string   `json:"meaning"`
	Example    string   `json:"example"`
	ExampleVi  string   `json:"exampleVi"`
	Definition string   `json:"definition,omitempty"`
	Level      *string  `json:"level,omitempty"`
	Pos        []string `json:"pos"`
}

// TopicDetail is the payload of GET /api/v1/topics/{id}.
type TopicDetail struct {
	TopicSummary
	Items []ModuleItem `json:"items"`
}
