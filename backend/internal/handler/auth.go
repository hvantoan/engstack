package handler

import (
	"errors"
	"net/http"

	"engstack/backend/internal/auth"
	"engstack/backend/internal/dto"
	"engstack/backend/internal/middleware"
	"engstack/backend/internal/store"
)

type AuthHandler struct {
	Q        *store.Queries
	JWT      *auth.JWTManager
	Tokens   *auth.TokenService
	Verifier auth.TokenVerifier
}

func (h *AuthHandler) GoogleLogin(w http.ResponseWriter, r *http.Request) {
	var req dto.GoogleLoginRequest
	if err := decodeJSON(r, &req); err != nil || req.IDToken == "" {
		writeError(w, http.StatusBadRequest, "id_token is required")
		return
	}

	payload, err := h.Verifier.Verify(r.Context(), req.IDToken)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "invalid id token")
		return
	}

	user, err := h.Q.UpsertUserByGoogleID(r.Context(), store.UpsertUserByGoogleIDParams{
		GoogleID:  payload.GoogleID,
		Email:     payload.Email,
		Name:      payload.Name,
		AvatarUrl: optionalString(payload.Avatar),
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	access, err := h.JWT.GenerateAccessToken(user.ID, user.Email, user.Name)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	refresh, err := h.Tokens.CreateRefreshToken(r.Context(), user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	writeJSON(w, http.StatusOK, dto.TokenPair{
		AccessToken:  access,
		RefreshToken: refresh,
		ExpiresIn:    int(h.JWT.TTL().Seconds()),
		User:         profileOf(user),
	})
}

func (h *AuthHandler) Refresh(w http.ResponseWriter, r *http.Request) {
	var req dto.RefreshRequest
	if err := decodeJSON(r, &req); err != nil || req.RefreshToken == "" {
		writeError(w, http.StatusBadRequest, "refresh_token is required")
		return
	}

	refresh, access, err := h.Tokens.RotateRefreshToken(r.Context(), req.RefreshToken)
	if err != nil {
		switch {
		case errors.Is(err, auth.ErrTokenNotFound),
			errors.Is(err, auth.ErrTokenRevoked),
			errors.Is(err, auth.ErrRefreshTokenExpiry):
			writeError(w, http.StatusUnauthorized, "invalid refresh token")
		default:
			writeError(w, http.StatusInternalServerError, "internal error")
		}
		return
	}

	writeJSON(w, http.StatusOK, dto.RefreshResponse{
		AccessToken:  access,
		RefreshToken: refresh,
		ExpiresIn:    int(h.JWT.TTL().Seconds()),
	})
}

func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	var req dto.LogoutRequest
	if err := decodeJSON(r, &req); err != nil || req.RefreshToken == "" {
		writeError(w, http.StatusBadRequest, "refresh_token is required")
		return
	}
	if err := h.Tokens.RevokeRefreshToken(r.Context(), req.RefreshToken); err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	user, err := h.Q.GetUserByID(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	writeJSON(w, http.StatusOK, profileOf(user))
}

func profileOf(user store.User) dto.UserProfile {
	return dto.UserProfile{
		ID:        user.ID.String(),
		Email:     user.Email,
		Name:      user.Name,
		AvatarURL: user.AvatarUrl,
	}
}

func optionalString(v string) *string {
	if v == "" {
		return nil
	}
	return &v
}
