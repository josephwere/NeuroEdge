//kernel/api/logging.go
package handlers

import (
	"log"
	"net/http"
	"time"
)

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(code int) {
	r.status = code
	r.ResponseWriter.WriteHeader(code)
}

func withRequestLogging(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		next(rec, r)
		log.Printf(
			"method=%s path=%s status=%d duration=%s ip=%s request_id=%s",
			r.Method,
			r.URL.Path,
			rec.status,
			time.Since(start),
			clientIP(r),
			rec.Header().Get("X-Request-ID"),
		)
	}
}
