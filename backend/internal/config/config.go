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

	// Cloudflare R2 (S3-compatible) chứa audio phát âm + manifest.json.
	R2AccountID       string
	R2AccessKeyID     string
	R2SecretAccessKey string
	R2Bucket          string
	// AdminEmails là allowlist email admin (CSV) cho các endpoint /admin/*.
	AdminEmails []string
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

		R2AccountID:       env("R2_ACCOUNT_ID", ""),
		R2AccessKeyID:     env("R2_ACCESS_KEY_ID", ""),
		R2SecretAccessKey: env("R2_SECRET_ACCESS_KEY", ""),
		R2Bucket:          env("R2_BUCKET", ""),
		AdminEmails:       splitCSV(env("ADMIN_EMAILS", "")),
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
