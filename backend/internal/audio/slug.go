// Package audio sinh và phân phối file phát âm từ vựng: Edge TTS → R2 →
// manifest.json. Slug ở đây phải khớp bit-với-bit `slug()` trong
// frontend/src/lib/vocab-schema.ts (manifest là contract giữa hai phía).
package audio

import (
	"strings"
	"unicode"

	"golang.org/x/text/runes"
	"golang.org/x/text/transform"
	"golang.org/x/text/unicode/norm"
)

// Slug fold dấu (NFD + bỏ combining marks), chuẩn hoá apostrophe, bỏ ký tự
// thương hiệu, lowercase, gom ký tự lạ thành "-".
func Slug(term string) string {
	t := transform.Chain(norm.NFD, runes.Remove(runes.In(unicode.Mn)), norm.NFC)
	out, _, err := transform.String(t, strings.ToLower(term))
	if err != nil {
		out = strings.ToLower(term)
	}
	var b strings.Builder
	b.Grow(len(out))
	lastDash := false
	for _, r := range out {
		switch r {
		case '\u2018', '\u2019', '\u02bc':
			r = '\''
		case '\u2122', '\u00ae', '\u00a9':
			continue
		}
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
			lastDash = false
		} else if !lastDash && b.Len() > 0 {
			b.WriteByte('-')
			lastDash = true
		}
	}
	return strings.TrimSuffix(b.String(), "-")
}

// AudioKey là object key của MP3 trên R2 cho một term.
func AudioKey(term string) string {
	return Slug(term) + ".mp3"
}
