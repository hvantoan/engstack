// Package auth implements Google ID token verification and the JWT/refresh
// token lifecycle.
package auth

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

var (
	ErrTokenExpired       = errors.New("token expired")
	ErrInvalidSignature   = errors.New("invalid token signature")
	ErrInvalidToken       = errors.New("invalid token")
	ErrTokenNotFound      = errors.New("refresh token not found")
	ErrTokenRevoked       = errors.New("refresh token revoked")
	ErrRefreshTokenExpiry = errors.New("refresh token expired")
)

// AccessTokenTTL is the lifetime of a JWT access token.
const AccessTokenTTL = 15 * time.Minute

// RefreshTokenTTL is the lifetime of a refresh token.
const RefreshTokenTTL = 30 * 24 * time.Hour

type Claims struct {
	UserID uuid.UUID `json:"uid"`
	Email  string    `json:"email"`
	Name   string    `json:"name"`
	jwt.RegisteredClaims
}

type JWTManager struct {
	secret []byte
	ttl    time.Duration
}

func NewJWTManager(secret string, ttl time.Duration) *JWTManager {
	if ttl <= 0 {
		ttl = AccessTokenTTL
	}
	return &JWTManager{secret: []byte(secret), ttl: ttl}
}

func (m *JWTManager) TTL() time.Duration { return m.ttl }

func (m *JWTManager) GenerateAccessToken(userID uuid.UUID, email, name string) (string, error) {
	now := time.Now()
	claims := Claims{
		UserID: userID,
		Email:  email,
		Name:   name,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   userID.String(),
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(m.ttl)),
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(m.secret)
}

func (m *JWTManager) ValidateAccessToken(raw string) (*Claims, error) {
	claims := &Claims{}
	_, err := jwt.ParseWithClaims(raw, claims, func(*jwt.Token) (any, error) {
		return m.secret, nil
	}, jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}), jwt.WithExpirationRequired())
	if err != nil {
		switch {
		case errors.Is(err, jwt.ErrTokenExpired):
			return nil, ErrTokenExpired
		case errors.Is(err, jwt.ErrTokenSignatureInvalid), errors.Is(err, jwt.ErrTokenUnverifiable):
			return nil, ErrInvalidSignature
		default:
			return nil, ErrInvalidToken
		}
	}
	if claims.UserID == uuid.Nil {
		return nil, ErrInvalidToken
	}
	return claims, nil
}
