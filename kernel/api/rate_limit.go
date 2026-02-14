//kernel/api/rate_limit.go
package handlers

import (
	"fmt"
	"net"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

type visitor struct {
	count      int
	windowFrom time.Time
	lastSeen   time.Time
}

var (
	rateLimitMu sync.Mutex
	visitors    = map[string]*visitor{}
)

func withRateLimit(next http.HandlerFunc) http.HandlerFunc {
	maxPerMinute := readIntEnv("NEUROEDGE_RATE_LIMIT_PER_MIN", 60)

	return func(w http.ResponseWriter, r *http.Request) {
		now := time.Now()
		ip := clientIP(r)

		rateLimitMu.Lock()
		v, exists := visitors[ip]
		if !exists {
			v = &visitor{windowFrom: now, lastSeen: now}
			visitors[ip] = v
		}

		if now.Sub(v.windowFrom) >= time.Minute {
			v.count = 0
			v.windowFrom = now
		}

		v.lastSeen = now
		allowed := v.count < maxPerMinute
		if allowed {
			v.count++
		}
		remaining := maxPerMinute - v.count
		if remaining < 0 {
			remaining = 0
		}
		resetIn := int(time.Minute.Seconds() - now.Sub(v.windowFrom).Seconds())
		if resetIn < 0 {
			resetIn = 0
		}
		cleanupVisitors(now)
		rateLimitMu.Unlock()

		w.Header().Set("X-RateLimit-Limit", strconv.Itoa(maxPerMinute))
		w.Header().Set("X-RateLimit-Remaining", strconv.Itoa(remaining))
		w.Header().Set("X-RateLimit-Reset", fmt.Sprintf("%d", resetIn))

		if !allowed {
			w.Header().Set("Retry-After", strconv.Itoa(resetIn))
			http.Error(w, "rate limit exceeded", http.StatusTooManyRequests)
			return
		}

		next(w, r)
	}
}

func cleanupVisitors(now time.Time) {
	for ip, v := range visitors {
		if now.Sub(v.lastSeen) > 10*time.Minute {
			delete(visitors, ip)
		}
	}
}

func clientIP(r *http.Request) string {
	xff := strings.TrimSpace(r.Header.Get("X-Forwarded-For"))
	if xff != "" {
		parts := strings.Split(xff, ",")
		if len(parts) > 0 {
			return strings.TrimSpace(parts[0])
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func readIntEnv(key string, fallback int) int {
	val := strings.TrimSpace(os.Getenv(key))
	if val == "" {
		return fallback
	}
	n, err := strconv.Atoi(val)
	if err != nil || n <= 0 {
		return fallback
	}
	return n
}
