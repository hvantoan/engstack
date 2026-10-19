// Package migrations embeds the golang-migrate SQL files so the binary can
// migrate its own database without shipping loose files.
package migrations

import "embed"

//go:embed *.sql
var FS embed.FS
