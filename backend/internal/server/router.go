// Package server wires configuration, storage and HTTP handlers together.
package server

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/jackc/pgx/v5/pgxpool"

	"engstack/backend/internal/auth"
	"engstack/backend/internal/config"
	"engstack/backend/internal/handler"
	"engstack/backend/internal/middleware"
	"engstack/backend/internal/store"
)

// New builds the full HTTP handler tree.
func New(cfg config.Config, pool *pgxpool.Pool, verifier auth.TokenVerifier) http.Handler {
	q := store.New(pool)
	jwtManager := auth.NewJWTManager(cfg.JWTSecret, auth.AccessTokenTTL)
	tokens := auth.NewTokenService(q, jwtManager)

	topics := &handler.TopicHandler{Q: q}
	authHandler := &handler.AuthHandler{Q: q, JWT: jwtManager, Tokens: tokens, Verifier: verifier}
	progress := &handler.ProgressHandler{Q: q}
	review := &handler.ReviewHandler{Q: q, Pool: pool}
	search := &handler.SearchHandler{Q: q}
	history := &handler.HistoryHandler{Q: q}
	requireAuth := middleware.RequireAuth(jwtManager)

	r := chi.NewRouter()
	r.Use(chimw.RequestID)
	r.Use(chimw.RealIP)
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)
	r.Use(chimw.Compress(5))
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   cfg.AllowedOrigins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Content-Type", "Authorization", "If-None-Match"},
		ExposedHeaders:   []string{"ETag"},
		AllowCredentials: false,
		MaxAge:           300,
	}))

	r.Route("/api/v1", func(r chi.Router) {
		r.Get("/health", handler.Health)

		r.Get("/topics", topics.List)
		r.Get("/topics/{id}", topics.Get)
		r.Get("/search/items", search.Items)

		r.Post("/auth/google", authHandler.GoogleLogin)
		r.Post("/auth/refresh", authHandler.Refresh)
		r.Post("/auth/logout", authHandler.Logout)

		r.Group(func(r chi.Router) {
			r.Use(requireAuth)
			r.Get("/auth/me", authHandler.Me)
			r.Get("/progress", progress.Get)
			r.Put("/progress/toggle", progress.Toggle)
			r.Post("/progress/import-guest", progress.ImportGuest)
			r.Get("/review/due", review.Due)
			r.Post("/review/submit", review.Submit)
			r.Get("/state/position", history.GetPosition)
			r.Put("/state/position", history.PutPosition)
			r.Post("/events", history.PostEvent)
			r.Get("/history", history.List)
		})
	})

	return r
}

// NewHTTPServer wraps the router with production timeouts.
func NewHTTPServer(addr string, h http.Handler) *http.Server {
	return &http.Server{
		Addr:              addr,
		Handler:           h,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
}

// Verifier picks the Google verifier, or the dev verifier when enabled.
func Verifier(cfg config.Config) auth.TokenVerifier {
	if cfg.AuthDevMode {
		return auth.DevVerifier{}
	}
	return auth.GoogleVerifier{ClientID: cfg.GoogleClientID}
}
