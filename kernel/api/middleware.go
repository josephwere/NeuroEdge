//kernel/api/middleware.go
package handlers

import (
	"fmt"
	"log"
	"net/http"
	"runtime/debug"
	"strings"
	"sync/atomic"
	"time"
)

var reqCounter uint64

func withSecurityHeaders(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("Permissions-Policy", "geolocation=(), microphone=(), camera=()")
		next(w, r)
	}
}

func withRequestID(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		requestID := strings.TrimSpace(r.Header.Get("X-Request-ID"))
		if requestID == "" {
			n := atomic.AddUint64(&reqCounter, 1)
			requestID = fmt.Sprintf("req-%d-%d", time.Now().UnixNano(), n)
		}
		w.Header().Set("X-Request-ID", requestID)
		next(w, r)
	}
}

func withPanicRecovery(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				log.Printf("panic path=%s err=%v\n%s", r.URL.Path, rec, string(debug.Stack()))
				http.Error(w, "internal server error", http.StatusInternalServerError)
			}
		}()
		next(w, r)
	}
}
