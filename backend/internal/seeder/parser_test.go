package seeder

import (
	"encoding/json"
	"os"
	"regexp"
	"testing"
)

const testDataDir = "../../../src/data"

var idPattern = regexp.MustCompile(`^[a-z0-9-]+:[a-z0-9-]+(:[a-z0-9-]+)?$`)

func TestParseTopicsFiles(t *testing.T) {
	topics, err := ParseDir(testDataDir)
	if err != nil {
		t.Fatalf("ParseDir: %v", err)
	}
	if got, want := len(topics), 24; got != want {
		t.Fatalf("modules = %d, want %d", got, want)
	}

	total := 0
	for _, topic := range topics {
		total += len(topic.Items)
		for _, it := range topic.Items {
			if !idPattern.MatchString(it.ID) {
				t.Errorf("invalid item id %q", it.ID)
			}
			if it.Term == "" || it.Meaning == "" || it.Example == "" || it.ExampleVi == "" {
				t.Errorf("item %q missing required fields", it.ID)
			}
			switch it.Label {
			case "word", "collocation", "idiom":
			default:
				t.Errorf("item %q invalid label %q", it.ID, it.Label)
			}
		}
	}
	if total != 7303 {
		t.Fatalf("total items = %d, want 7303", total)
	}
}

func TestCheckDuplicateIDs(t *testing.T) {
	topics, err := ParseDir(testDataDir)
	if err != nil {
		t.Fatalf("ParseDir: %v", err)
	}
	seen := make(map[string]string)
	dupes := 0
	for _, topic := range topics {
		for _, it := range topic.Items {
			if prev, ok := seen[it.ID]; ok {
				t.Errorf("duplicate id %q (%s and %s)", it.ID, prev, topic.ID)
				dupes++
			}
			seen[it.ID] = topic.ID
		}
	}
	if dupes != 0 {
		t.Fatalf("%d duplicate ids", dupes)
	}
}

func TestParseRejectsBrokenData(t *testing.T) {
	dir := t.TempDir()
	writeTopic(t, dir, "bad", `{"id":"bad","track":"ielts","title":"x","items":[{"id":"other:item","term":"t","label":"word","meaning":"m","example":"e","exampleVi":"v"}]}`)

	if _, err := ParseDir(dir); err == nil {
		t.Fatal("expected error for item outside topic")
	}
}

func writeTopic(t *testing.T, dir, name, body string) {
	t.Helper()
	for _, sub := range dataDirs {
		if err := os.MkdirAll(dir+"/"+sub, 0o755); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.WriteFile(dir+"/topics/"+name+".json", []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
}

// Sanity: the sample Oxford item keeps its pos array and track context.
func TestParseSampleOxfordItem(t *testing.T) {
	topics, err := ParseDir(testDataDir)
	if err != nil {
		t.Fatal(err)
	}
	for _, topic := range topics {
		if topic.ID != "oxford-b1" {
			continue
		}
		for _, it := range topic.Items {
			if it.ID != "oxford-b1:about:preposition" {
				continue
			}
			b, _ := json.Marshal(it)
			t.Logf("%s", b)
			if len(it.Pos) != 1 || it.Pos[0] != "preposition" {
				t.Fatalf("pos = %v", it.Pos)
			}
			return
		}
	}
	t.Fatal("sample item not found")
}
