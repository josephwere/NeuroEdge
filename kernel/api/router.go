// kernel/api/router.go
package handlers

import (
	"encoding/json"
	"net/http"
	"os"
	"runtime"
	"strings"
	"time"

	"github.com/gorilla/mux"
)

func chain(next http.HandlerFunc, mws ...func(http.HandlerFunc) http.HandlerFunc) http.HandlerFunc {
	h := next
	for i := len(mws) - 1; i >= 0; i-- {
		h = mws[i](h)
	}
	return h
}

func secureHandler(next http.HandlerFunc) http.HandlerFunc {
	return chain(
		next,
		withCORS,
		withPanicRecovery,
		withRequestID,
		withSecurityHeaders,
		withRequestLogging,
		withConcurrencyLimit,
		withRateLimit,
		withAPIKeyAuth,
	)
}

func publicHandler(next http.HandlerFunc) http.HandlerFunc {
	return chain(next, withCORS, withPanicRecovery, withRequestID, withSecurityHeaders, withRequestLogging, withConcurrencyLimit)
}

func NewRouter() *mux.Router {
	r := mux.NewRouter()

	// Public health/liveness
	r.HandleFunc("/healthz", publicHandler(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})).Methods("GET")

	// /health alias (keep /healthz)
	r.HandleFunc("/health", publicHandler(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})).Methods("GET")

	// Rich health details for dashboards and SRE probes.
	r.HandleFunc("/health/details", publicHandler(func(w http.ResponseWriter, _ *http.Request) {
		mem := runtime.MemStats{}
		runtime.ReadMemStats(&mem)
		snapshot := getConcurrencySnapshot()
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"status":      "ok",
			"service":     "kernel",
			"time":        time.Now().UTC().Format(time.RFC3339),
			"goroutines":  runtime.NumGoroutine(),
			"allocBytes":  mem.Alloc,
			"sysBytes":    mem.Sys,
			"inflight":    snapshot.Current,
			"inflightMax": snapshot.Limit,
		})
	})).Methods("GET")

	// Ready means process is up and required auth config is present.
	r.HandleFunc("/readyz", publicHandler(func(w http.ResponseWriter, _ *http.Request) {
		if strings.TrimSpace(os.Getenv("NEUROEDGE_API_KEY")) == "" {
			http.Error(w, "not ready", http.StatusServiceUnavailable)
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ready"))
	})).Methods("GET")

	// Protected kernel routes
	r.HandleFunc("/kernel/health", secureHandler(HealthHandler)).Methods("GET")
	r.HandleFunc("/kernel/nodes", secureHandler(NodesHandler)).Methods("GET")
	r.HandleFunc("/kernel/capabilities", secureHandler(CapabilitiesHandler)).Methods("GET")
	r.HandleFunc("/chat", secureHandler(ChatCommandHandler)).Methods("POST")
	r.HandleFunc("/execute", secureHandler(ExecuteHandler)).Methods("POST")
	r.HandleFunc("/events", secureHandler(EventIngestHandler)).Methods("POST")

	return r
}
