package auth

import (
	"context"
	"errors"
	"fmt"

	"google.golang.org/api/idtoken"
)

type GoogleTokenPayload struct {
	GoogleID string
	Email    string
	Name     string
	Avatar   string
}

type TokenVerifier interface {
	Verify(ctx context.Context, idToken string) (*GoogleTokenPayload, error)
}

var ErrInvalidGoogleToken = errors.New("invalid google id token")

type GoogleVerifier struct {
	ClientID string
}

func (v GoogleVerifier) Verify(ctx context.Context, idToken string) (*GoogleTokenPayload, error) {
	payload, err := idtoken.Validate(ctx, idToken, v.ClientID)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrInvalidGoogleToken, err)
	}
	claims := payload.Claims
	str := func(key string) string {
		if s, ok := claims[key].(string); ok {
			return s
		}
		return ""
	}
	out := &GoogleTokenPayload{
		GoogleID: payload.Subject,
		Email:    str("email"),
		Name:     str("name"),
		Avatar:   str("picture"),
	}
	if out.GoogleID == "" || out.Email == "" {
		return nil, ErrInvalidGoogleToken
	}
	if out.Name == "" {
		out.Name = out.Email
	}
	return out, nil
}
