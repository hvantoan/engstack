// Package config resolves runtime settings from the environment.
package config

import (
	"os"
	"strconv"
	"strings"
)

type Config struct {
	Port           string
	DatabaseURL    string
	JWTSecret      string
	GoogleClientID string
	// AuthDevMode accepts unsigned mock ID tokens ("dev:<email>") so the API can
	// be exercised locally without Google credentials. Never enable in production.
	AuthDevMode    bool
	AllowedOrigins []string
	MigrateOnBoot  bool
}

func FromEnv() Config {
	port := env("PORT", "5198")
	return Config{
		Port:           port,
		DatabaseURL:    env("DATABASE_URL", "postgres://postgres:postgrespassword@localhost:5433/engstack?sslmode=disable"),
		JWTSecret:      env("JWT_SECRET", "dev-insecure-secret-key-change-in-prod"),
		GoogleClientID: env("GOOGLE_CLIENT_ID", ""),
		AuthDevMode:    envBool("AUTH_DEV_MODE", false),
		AllowedOrigins: splitCSV(env("CORS_ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000")),
		MigrateOnBoot:  envBool("MIGRATE_ON_BOOT", true),
	}
}

func env(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		return v
	}
	return fallback
}

func envBool(key string, fallback bool) bool {
	v, ok := os.LookupEnv(key)
	if !ok || v == "" {
		return fallback
	}
	b, err := strconv.ParseBool(v)
	if err != nil {
		return fallback
	}
	return b
}

func splitCSV(v string) []string {
	var out []string
	for _, part := range strings.Split(v, ",") {
		if p := strings.TrimSpace(part); p != "" {
			out = append(out, p)
		}
	}
	return out
}
