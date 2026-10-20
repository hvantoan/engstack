package auth

import (
	"context"
	"fmt"
	"strings"
)

// MockVerifier maps opaque tokens to fixed payloads for tests.
type MockVerifier struct {
	Tokens map[string]*GoogleTokenPayload
}

func (m *MockVerifier) Verify(_ context.Context, idToken string) (*GoogleTokenPayload, error) {
	if p, ok := m.Tokens[idToken]; ok {
		return p, nil
	}
	return nil, ErrInvalidGoogleToken
}

// DevVerifier accepts tokens of the form "dev:<email>" so local runs work
// without Google credentials. Only wired up when AUTH_DEV_MODE=true.
type DevVerifier struct{}

func (DevVerifier) Verify(_ context.Context, idToken string) (*GoogleTokenPayload, error) {
	email, ok := strings.CutPrefix(idToken, "dev:")
	if !ok || !strings.Contains(email, "@") {
		return nil, ErrInvalidGoogleToken
	}
	return &GoogleTokenPayload{
		GoogleID: "dev-" + email,
		Email:    email,
		Name:     strings.SplitN(email, "@", 2)[0],
	}, nil
}

// TokenForDevEmail builds the dev token a client would send.
func TokenForDevEmail(email string) string { return fmt.Sprintf("dev:%s", email) }
