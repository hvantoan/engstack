package audio

import "testing"

// Phải khớp slug() trong frontend/src/lib/vocab-schema.ts — manifest.json là
// contract giữa hai phía.
func TestSlug(t *testing.T) {
	cases := map[string]string{
		"affordable housing":  "affordable-housing",
		"Affordable Housing!": "affordable-housing",
		"café":                "cafe",
		"naïve":               "naive",
		"rock'n'roll":         "rock-n-roll",
		"rock’n’roll":         "rock-n-roll",
		"co-operation":        "co-operation",
		"  spaces  ":          "spaces",
		"test™brand©":         "testbrand",
		"deja vu":             "deja-vu",
		"C1 level":            "c1-level",
		"multi --- dash":      "multi-dash",
	}
	for in, want := range cases {
		if got := Slug(in); got != want {
			t.Errorf("Slug(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestAudioKey(t *testing.T) {
	if got := AudioKey("affordable housing"); got != "affordable-housing.mp3" {
		t.Fatalf("AudioKey = %q", got)
	}
}
