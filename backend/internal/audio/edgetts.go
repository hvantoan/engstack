package audio

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/binary"
	"encoding/hex"
	"encoding/xml"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/coder/websocket"
)

// EdgeTTS synthesize speech qua Microsoft Edge readaloud endpoint (unofficial,
// cùng protocol với msedge-tts/edge-tts). Free, không key; nếu Microsoft đổi
// API chỉ cần thay implementation này — Synthesizer interface giữ nguyên.
type EdgeTTS struct {
	Voice        string // vd "en-GB-SoniaNeural"
	Rate         string // vd "-10%"
	OutputFormat string // vd "audio-24khz-48kbitrate-mono-mp3"
}

func NewEdgeTTS() *EdgeTTS {
	return &EdgeTTS{
		Voice:        "en-GB-SoniaNeural",
		Rate:         "-10%",
		OutputFormat: "audio-24khz-48kbitrate-mono-mp3",
	}
}

const (
	edgeTTSEndpoint = "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edgev1?TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4"
	edgeTTSOrigin   = "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold"
)

// Synthesize trả về MP3 bytes của text. Implement Synthesizer.
func (t *EdgeTTS) Synthesize(ctx context.Context, text string) ([]byte, error) {
	connID := randHex(16)
	dialURL := edgeTTSEndpoint + "&ConnectionId=" + connID
	conn, _, err := websocket.Dial(ctx, dialURL, &websocket.DialOptions{
		HTTPHeader: http.Header{
			"Origin":          {edgeTTSOrigin},
			"User-Agent":      {"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0"},
			"Accept-Encoding": {"gzip, deflate, br"},
			"Accept-Language": {"en-US,en;q=0.9"},
			"Pragma":          {"no-cache"},
			"Cache-Control":   {"no-cache"},
		},
	})
	if err != nil {
		return nil, fmt.Errorf("edge tts dial: %w", err)
	}
	defer conn.CloseNow()

	send := func(headers, body string) error {
		return conn.Write(ctx, websocket.MessageText, []byte(headers+body))
	}
	ts := func() string {
		return time.Now().UTC().Format("Mon Jan 02 2006 15:04:05") + " GMT+0000 (Coordinated Universal Time)"
	}

	config := fmt.Sprintf(`{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"true"},"outputFormat":"%s"}}}}`, t.OutputFormat)
	if err := send(
		fmt.Sprintf("X-Timestamp:%s\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n", ts()),
		config,
	); err != nil {
		return nil, fmt.Errorf("edge tts speech.config: %w", err)
	}

	ssml := fmt.Sprintf(
		"<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'><voice name='%s'><prosody pitch='+0Hz' rate='%s' volume='+0%%'>%s</prosody></voice></speak>",
		t.Voice, t.Rate, xmlEscape(text))
	if err := send(
		fmt.Sprintf("X-RequestId:%s\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:%s\r\nPath:ssml\r\n\r\n", randHex(16), ts()),
		ssml,
	); err != nil {
		return nil, fmt.Errorf("edge tts ssml: %w", err)
	}

	var audio bytes.Buffer
	for {
		typ, msg, err := conn.Read(ctx)
		if err != nil {
			return nil, fmt.Errorf("edge tts read: %w", err)
		}
		if typ == websocket.MessageBinary {
			if len(msg) < 2 {
				continue
			}
			headerLen := int(binary.BigEndian.Uint16(msg[:2]))
			if len(msg) < 2+headerLen {
				continue
			}
			header := string(msg[2 : 2+headerLen])
			if strings.Contains(header, "Path:audio") {
				audio.Write(msg[2+headerLen:])
			}
			continue
		}
		if bytes.Contains(msg, []byte("Path:turn.end")) {
			break
		}
	}
	if err := conn.Close(websocket.StatusNormalClosure, "done"); err != nil {
		return nil, err
	}
	if audio.Len() == 0 {
		return nil, fmt.Errorf("edge tts: empty audio for %q", text)
	}
	return audio.Bytes(), nil
}

func randHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func xmlEscape(s string) string {
	var b strings.Builder
	if err := xml.EscapeText(&b, []byte(s)); err != nil {
		return s
	}
	return b.String()
}
