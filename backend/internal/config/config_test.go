package config_test

import (
	"reflect"
	"testing"

	"engstack/backend/internal/config"
)

// clearEnv removes every key FromEnv reads so the default path is testable.
func clearEnv(t *testing.T) {
	t.Helper()
	for _, k := range []string{
		"PORT", "DATABASE_URL", "JWT_SECRET", "GOOGLE_CLIENT_ID",
		"AUTH_DEV_MODE", "CORS_ALLOWED_ORIGINS", "MIGRATE_ON_BOOT",
	} {
		t.Setenv(k, "")
	}
}

func TestFromEnvDefaults(t *testing.T) {
	clearEnv(t)

	got := config.FromEnv()
	if got.Port != "5198" {
		t.Errorf("Port = %q, want 5198", got.Port)
	}
	if got.AuthDevMode {
		t.Error("AuthDevMode must default to false")
	}
	if !got.MigrateOnBoot {
		t.Error("MigrateOnBoot must default to true")
	}
	want := []string{"http://localhost:5173", "http://localhost:3000"}
	if !reflect.DeepEqual(got.AllowedOrigins, want) {
		t.Errorf("AllowedOrigins = %v, want %v", got.AllowedOrigins, want)
	}
}

func TestFromEnvOverrides(t *testing.T) {
	clearEnv(t)
	t.Setenv("PORT", "9090")
	t.Setenv("DATABASE_URL", "postgres://db/test")
	t.Setenv("JWT_SECRET", "s3cret")
	t.Setenv("GOOGLE_CLIENT_ID", "client.apps.googleusercontent.com")
	t.Setenv("AUTH_DEV_MODE", "true")
	t.Setenv("MIGRATE_ON_BOOT", "0")
	t.Setenv("CORS_ALLOWED_ORIGINS", " https://app.example , ,https://admin.example ")

	got := config.FromEnv()
	if got.Port != "9090" || got.DatabaseURL != "postgres://db/test" || got.JWTSecret != "s3cret" {
		t.Fatalf("unexpected config: %+v", got)
	}
	if got.GoogleClientID != "client.apps.googleusercontent.com" {
		t.Errorf("GoogleClientID = %q", got.GoogleClientID)
	}
	if !got.AuthDevMode {
		t.Error("AuthDevMode = false, want true")
	}
	if got.MigrateOnBoot {
		t.Error("MigrateOnBoot = true, want false")
	}
	want := []string{"https://app.example", "https://admin.example"}
	if !reflect.DeepEqual(got.AllowedOrigins, want) {
		t.Errorf("AllowedOrigins = %v, want %v (trimmed, blanks dropped)", got.AllowedOrigins, want)
	}
}

// A typo in a boolean env var must fall back to the documented default instead
// of silently disabling a safety-relevant flag.
func TestFromEnvInvalidBoolFallsBack(t *testing.T) {
	clearEnv(t)
	t.Setenv("AUTH_DEV_MODE", "yes-please")
	t.Setenv("MIGRATE_ON_BOOT", "maybe")

	got := config.FromEnv()
	if got.AuthDevMode {
		t.Error("AuthDevMode = true, want false fallback")
	}
	if !got.MigrateOnBoot {
		t.Error("MigrateOnBoot = false, want true fallback")
	}
}
