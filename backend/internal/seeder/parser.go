// Package seeder parses the frontend JSON datasets and imports them into Postgres.
package seeder

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// Item mirrors src/lib/vocab-schema.ts:VocabItem.
type Item struct {
	ID         string   `json:"id"`
	Term       string   `json:"term"`
	IPA        string   `json:"ipa"`
	Label      string   `json:"label"`
	Meaning    string   `json:"meaning"`
	Example    string   `json:"example"`
	ExampleVi  string   `json:"exampleVi"`
	Definition string   `json:"definition"`
	Level      string   `json:"level"`
	Pos        []string `json:"pos"`
}

// Topic mirrors src/lib/vocab-schema.ts:TopicSource.
type Topic struct {
	ID          string   `json:"id"`
	Track       string   `json:"track"`
	Title       string   `json:"title"`
	Description string   `json:"description"`
	Eyebrow     string   `json:"eyebrow"`
	Accent      string   `json:"accent"`
	Level       string   `json:"level"`
	Order       int      `json:"order"`
	Related     []string `json:"related"`
	Items       []Item   `json:"items"`
}

var dataDirs = []string{"topics", "oxford"}

// ParseDir reads and validates every module under dataDir/{topics,oxford}.
func ParseDir(dataDir string) ([]Topic, error) {
	var topics []Topic
	seen := make(map[string]string)
	for _, sub := range dataDirs {
		dir := filepath.Join(dataDir, sub)
		entries, err := os.ReadDir(dir)
		if err != nil {
			return nil, fmt.Errorf("read %s: %w", dir, err)
		}
		names := make([]string, 0, len(entries))
		for _, e := range entries {
			if !e.IsDir() && strings.HasSuffix(e.Name(), ".json") {
				names = append(names, e.Name())
			}
		}
		sort.Strings(names)
		for _, name := range names {
			t, err := parseFile(filepath.Join(dir, name))
			if err != nil {
				return nil, err
			}
			for _, it := range t.Items {
				validated := it
				_ = validated
				if prev, dup := seen[it.ID]; dup {
					return nil, fmt.Errorf("duplicate item id %q in %s and %s", it.ID, prev, name)
				}
				seen[it.ID] = name
			}
			topics = append(topics, t)
		}
	}
	return topics, nil
}

func parseFile(path string) (Topic, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return Topic{}, fmt.Errorf("read %s: %w", path, err)
	}
	// Validate the envelope, then re-check every item so bad data fails loudly
	// instead of landing in the database.
	var t Topic
	if err := json.Unmarshal(raw, &t); err != nil {
		return Topic{}, fmt.Errorf("parse %s: %w", path, err)
	}
	if t.ID == "" || t.Track == "" || t.Title == "" {
		return Topic{}, fmt.Errorf("%s: topic is missing id/track/title", path)
	}
	if t.Related == nil {
		t.Related = []string{}
	}
	for i := range t.Items {
		it := &t.Items[i]
		if it.Pos == nil {
			it.Pos = []string{}
		}
		if it.ID == "" || it.Term == "" || it.Meaning == "" || it.Example == "" || it.ExampleVi == "" {
			return Topic{}, fmt.Errorf("%s: item %d (%q) is missing required fields", path, i, it.ID)
		}
		switch it.Label {
		case "word", "collocation", "idiom":
		default:
			return Topic{}, fmt.Errorf("%s: item %q has invalid label %q", path, it.ID, it.Label)
		}
		if !strings.HasPrefix(it.ID, t.ID+":") {
			return Topic{}, fmt.Errorf("%s: item %q does not belong to topic %q", path, it.ID, t.ID)
		}
	}
	return t, nil
}
