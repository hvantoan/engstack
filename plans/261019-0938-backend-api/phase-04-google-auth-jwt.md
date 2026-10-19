---
phase: 4
title: "Google OAuth 2.0 & Refresh Token Rotation"
status: completed
priority: P1
effort: "5h"
dependencies: ["phase-01-database-infrastructure"]
---

# Phase 4: Google OAuth 2.0 & Refresh Token Rotation

## Goal
Implement secure user authentication using Google OAuth 2.0 ID Token verification, user profile upserting in PostgreSQL, short-lived JWT Access Tokens (15 minutes), revocable Refresh Tokens (30 days) with token rotation, logout revocation, and an HTTP authentication middleware for protecting downstream routes.

## Context & Architectural Invariants
- Google ID Token verification uses official Google library `google.golang.org/api/idtoken` with configurable `GOOGLE_CLIENT_ID`.
- For testing and local mock environments, the token verifier interface `GoogleTokenVerifier` is abstracted to allow test mock injection without requiring live Google API calls.
- `users` table: primary key is `UUID`, `google_id` is unique. Upsert on login: update `name`, `avatar_url`, `updated_at`.
- Refresh Token security:
  - Client receives raw cryptographically secure random token (32 bytes base64-encoded).
  - Server hashes token with SHA-256 (`token_hash`) before saving into `refresh_tokens`.
  - When `POST /api/v1/auth/refresh` is called:
    - Hash the incoming token, find record where `token_hash = $1`.
    - If not found, expired, or `revoked_at IS NOT NULL`, return HTTP 401 Unauthorized.
    - If valid: mark existing token as revoked (`revoked_at = NOW()`), generate a brand-new refresh token and access token (Token Rotation).
  - When `POST /api/v1/auth/logout` is called: mark the refresh token as revoked (`revoked_at = NOW()`).
- JWT Access Token:
  - Claims: `sub` (User UUID), `email`, `name`, `iat`, `exp` (15m). Signed with HMAC-SHA256 (`JWT_SECRET`).

## Files to Create / Modify
- Create: `backend/internal/auth/verifier.go`
- Create: `backend/internal/auth/verifier_mock.go`
- Create: `backend/internal/auth/jwt.go`
- Create: `backend/internal/auth/jwt_test.go`
- Create: `backend/internal/auth/token_service.go`
- Create: `backend/internal/auth/token_service_test.go`
- Create: `backend/internal/middleware/auth.go`
- Create: `backend/internal/middleware/auth_test.go`
- Create: `backend/internal/handler/auth.go`
- Create: `backend/internal/handler/auth_test.go`
- Create: `backend/internal/dto/auth_dto.go`
- Modify: `backend/internal/server/router.go` (mount auth routes)

## Tests Before (TDD Contract)
Write tests in `jwt_test.go`, `token_service_test.go`, and `auth_test.go` *before* implementing service logic:
1. `TestJWTGenerationAndValidation`:
   - Generate access token for user ID. Validate signature, assert extracted claims match user ID and email.
   - Assert expired token fails validation with `ErrTokenExpired`.
   - Assert token signed with wrong secret fails validation with `ErrInvalidSignature`.
2. `TestRefreshTokenLifecycle`:
   - Issue refresh token: verify raw token returned, hash stored in DB with 30-day expiration.
   - Rotate token: call rotate with raw token, assert old token has `revoked_at != nil`, assert new token exists and is valid.
   - Replay attack check: attempt to reuse the revoked old refresh token, assert failure with `ErrTokenRevoked`.
   - Logout: call revoke, assert token cannot be used to refresh again.
3. `TestAuthEndpointsIntegration`:
   - `POST /api/v1/auth/google` with valid mock ID Token: returns HTTP 200 with `access_token`, `refresh_token`, and user profile. Assert user record created in DB.
   - `POST /api/v1/auth/google` with invalid ID Token: returns HTTP 401 Unauthorized.
   - `GET /api/v1/auth/me` with valid Bearer token: returns HTTP 200 with user profile.
   - `GET /api/v1/auth/me` with missing/invalid Bearer token: returns HTTP 401 Unauthorized.

## Tasks & Implementation Steps
1. **Define Token Verifier & Mock (`internal/auth/verifier.go`)**:
   ```go
   type GoogleTokenPayload struct {
       GoogleID string
       Email    string
       Name     string
       Avatar   string
   }
   type TokenVerifier interface {
       Verify(ctx context.Context, idToken string) (*GoogleTokenPayload, error)
   }
   ```
2. **Implement JWT Manager (`internal/auth/jwt.go`)**:
   - `GenerateAccessToken(userID uuid.UUID, email, name string) (string, error)` (15m expiry).
   - `ValidateAccessToken(tokenStr string) (*Claims, error)`.
3. **Implement Refresh Token Manager (`internal/auth/token_service.go`)**:
   - `CreateRefreshToken(ctx context.Context, userID uuid.UUID) (rawToken string, err error)`.
   - `RotateRefreshToken(ctx context.Context, rawToken string) (newRawToken string, newAccessToken string, err error)`.
   - `RevokeRefreshToken(ctx context.Context, rawToken string) error`.
4. **Implement Auth Middleware (`internal/middleware/auth.go`)**:
   - Extract `Authorization: Bearer <token>` from header.
   - Validate JWT; attach `UserContext` (`userID`, `email`) into `r.Context()`.
   - On error: respond with JSON `{"error": "unauthorized"}`.
5. **Implement Auth Handlers (`internal/handler/auth.go`)**:
   - `HandleGoogleLogin`: parses `{ "id_token": "..." }`, verifies via `TokenVerifier`, upserts user via `sqlc`, generates tokens, returns response.
   - `HandleRefreshToken`: parses `{ "refresh_token": "..." }`, executes rotation, returns new tokens.
   - `HandleLogout`: parses `{ "refresh_token": "..." }`, revokes token, returns HTTP 204 No Content.
   - `HandleGetMe`: reads user from context, queries `GetUserByID`, returns user profile.

## Refactor (Protected Changes)
- Secure token hashing: ensure constant-time comparison or clean SHA-256 hash lookup in database to protect against timing attacks.
- Ensure revoked tokens cannot be un-revoked.

## Tests After (New Behavior)
- Concurrent Refresh Test: simulate two simultaneous refresh requests with the same refresh token; assert exactly one succeeds and the second is rejected without race condition.
- Cascade Deletion Test: delete user from `users` table; assert associated refresh tokens are purged via `ON DELETE CASCADE`.

## Verification & Regression Gate
```bash
# Run all auth unit and integration tests
cd backend && go test -v -race ./internal/auth/... ./internal/middleware/... ./internal/handler/...
```
Pass condition: 100% of auth tests pass; token generation, validation, rotation, and revocation work as specified; 0 race conditions reported by `-race`.

## Todo List
- [x] Implement `internal/auth/jwt_test.go` and `internal/auth/jwt.go`
- [x] Implement `internal/auth/verifier.go` and mock implementation for testing
- [x] Implement `internal/auth/token_service.go` and `token_service_test.go` with rotation logic
- [x] Implement `internal/middleware/auth.go` and `internal/middleware/auth_test.go`
- [x] Implement `internal/handler/auth.go` and `internal/handler/auth_test.go`
- [x] Mount routes on Chi router in `internal/server/router.go`

## Risk Assessment & Security
- **Risk**: Stolen Refresh Token used repeatedly.
  - **Mitigation**: Token Rotation ensures a refresh token is strictly single-use. If an already revoked token is submitted, flag suspicious activity and revoke all active tokens for that user.
- **Security**: Access tokens expire in 15 minutes; refresh tokens stored only as SHA-256 hashes in database.
