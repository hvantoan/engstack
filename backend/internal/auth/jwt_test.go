package auth_test

import (
	"testing"
	"time"

	"github.com/google/uuid"

	"engstack/backend/internal/auth"
)

func TestJWTGenerationAndValidation(t *testing.T) {
	m := auth.NewJWTManager("secret-a", 15*time.Minute)
	userID := uuid.New()

	token, err := m.GenerateAccessToken(userID, "a@example.com", "A")
	if err != nil {
		t.Fatalf("generate: %v", err)
	}
	claims, err := m.ValidateAccessToken(token)
	if err != nil {
		t.Fatalf("validate: %v", err)
	}
	if claims.UserID != userID || claims.Email != "a@example.com" || claims.Name != "A" {
		t.Fatalf("claims = %+v", claims)
	}

	expiring := auth.NewJWTManager("secret-a", time.Millisecond)
	expiredToken, err := expiring.GenerateAccessToken(userID, "a@example.com", "A")
	if err != nil {
		t.Fatal(err)
	}
	time.Sleep(10 * time.Millisecond)
	if _, err := m.ValidateAccessToken(expiredToken); err != auth.ErrTokenExpired {
		t.Fatalf("expired token error = %v", err)
	}

	other := auth.NewJWTManager("secret-b", time.Hour)
	wrongSecret, err := other.GenerateAccessToken(userID, "a@example.com", "A")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := m.ValidateAccessToken(wrongSecret); err != auth.ErrInvalidSignature {
		t.Fatalf("wrong secret error = %v", err)
	}

	if _, err := m.ValidateAccessToken("not-a-token"); err != auth.ErrInvalidToken {
		t.Fatalf("garbage token error = %v", err)
	}
}
