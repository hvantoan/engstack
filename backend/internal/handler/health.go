package handler

import "net/http"

// Version is reported by the health endpoint.
const Version = "1.0.0"

func Health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "version": Version})
}
