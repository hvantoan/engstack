package audio

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sync"
)

// Synthesizer sinh MP3 bytes cho một term — đổi provider bằng cách thay impl.
type Synthesizer interface {
	Synthesize(ctx context.Context, text string) ([]byte, error)
}

// Pipeline điều phối: synthesize → PUT mp3 → rebuild manifest. Mọi lỗi của
// pipeline được ghi log, không làm fail request thêm từ.
type Pipeline struct {
	Synth Synthesizer
	Store *R2
	// AllTerms trả danh sách term hiện có trong DB để build manifest.
	AllTerms func(ctx context.Context) ([]string, error)

	mu sync.Mutex // serialize manifest rebuild giữa các request admin
}

var ErrAudioDisabled = fmt.Errorf("audio pipeline chưa cấu hình (thiếu R2_* env)")

// Enabled báo pipeline có thể chạy (R2 configured); Synth có thể nil khi test.
func (p *Pipeline) Enabled() bool {
	return p != nil && p.Store != nil && p.Store.Configured() && p.Synth != nil
}

// EnsureAudio bảo đảm `{slug}.mp3` có trên R2, rồi rebuild manifest.
// Trả audioReady=false + nil khi pipeline chưa cấu hình hoặc synth fail —
// caller vẫn coi thêm từ là thành công.
func (p *Pipeline) EnsureAudio(ctx context.Context, term string) (audioReady bool) {
	if !p.Enabled() {
		return false
	}
	p.mu.Lock()
	defer p.mu.Unlock()

	key := AudioKey(term)
	exists, err := p.Store.Exists(ctx, key)
	if err != nil {
		log.Printf("audio: head %s: %v", key, err)
		return false
	}
	if !exists {
		mp3, err := p.Synth.Synthesize(ctx, term)
		if err != nil {
			log.Printf("audio: synthesize %q: %v", term, err)
			return false
		}
		if err := p.Store.Put(ctx, key, mp3, "audio/mpeg",
			"public, max-age=31536000, immutable"); err != nil {
			log.Printf("audio: put %s: %v", key, err)
			return false
		}
	}
	if err := p.RebuildManifest(ctx); err != nil {
		log.Printf("audio: rebuild manifest: %v", err)
		return false
	}
	return true
}

// RebuildManifest regenerate manifest.json từ toàn bộ term trong DB và ghi
// đè lên R2 — single source of truth là DB, không read-modify-write.
func (p *Pipeline) RebuildManifest(ctx context.Context) error {
	if !p.Enabled() || p.AllTerms == nil {
		return ErrAudioDisabled
	}
	terms, err := p.AllTerms(ctx)
	if err != nil {
		return err
	}
	manifest := make(map[string]string, len(terms))
	for _, t := range terms {
		key := AudioKey(t)
		manifest[key[:len(key)-4]] = key
	}
	body, err := json.Marshal(manifest)
	if err != nil {
		return err
	}
	return p.Store.Put(ctx, "manifest.json", body,
		"application/json", "public, max-age=300")
}
