// kernel/api/middleware.go
package handlers

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"runtime/debug"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

var reqCounter uint64
var (
	concurrencyOnce   sync.Once
	concurrencyTokens chan struct{}
	concurrencyLimit  int64
	currentInflight   int64
)

type ConcurrencySnapshot struct {
	Current int64 `json:"current"`
	Limit   int64 `json:"limit"`
}

func withSecurityHeaders(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("Permissions-Policy", "geolocation=(), microphone=(), camera=()")
		next(w, r)
	}
}

func withCORS(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key, X-Request-ID")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
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

func withConcurrencyLimit(next http.HandlerFunc) http.HandlerFunc {
	concurrencyOnce.Do(func() {
		limit := 200
		if raw := strings.TrimSpace(os.Getenv("NEUROEDGE_MAX_INFLIGHT")); raw != "" {
			if n, err := strconv.Atoi(raw); err == nil && n > 0 {
				limit = n
			}
		}
		concurrencyTokens = make(chan struct{}, limit)
		atomic.StoreInt64(&concurrencyLimit, int64(limit))
	})
	return func(w http.ResponseWriter, r *http.Request) {
		select {
		case concurrencyTokens <- struct{}{}:
			atomic.AddInt64(&currentInflight, 1)
			defer func() {
				<-concurrencyTokens
				atomic.AddInt64(&currentInflight, -1)
			}()
			next(w, r)
		default:
			w.Header().Set("Retry-After", "1")
			http.Error(w, "service overloaded", http.StatusServiceUnavailable)
		}
	}
}

func getConcurrencySnapshot() ConcurrencySnapshot {
	return ConcurrencySnapshot{
		Current: atomic.LoadInt64(&currentInflight),
		Limit:   atomic.LoadInt64(&concurrencyLimit),
	}
}
