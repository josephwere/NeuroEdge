//kernel/api/auth.go
package handlers

import (
	"net/http"
	"os"
	"strings"
)

func withAPIKeyAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		expected := strings.TrimSpace(os.Getenv("NEUROEDGE_API_KEY"))
		if expected == "" {
			http.Error(w, "server auth not configured", http.StatusServiceUnavailable)
			return
		}

		got := strings.TrimSpace(r.Header.Get("X-API-Key"))
		if got == "" {
			auth := strings.TrimSpace(r.Header.Get("Authorization"))
			if strings.HasPrefix(auth, "Bearer ") {
				got = strings.TrimSpace(strings.TrimPrefix(auth, "Bearer "))
			}
		}

		if got == "" || got != expected {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		next(w, r)
	}
}
