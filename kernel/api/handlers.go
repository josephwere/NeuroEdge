package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"neuroedge/kernel/core"
	"neuroedge/kernel/discovery"
	"neuroedge/kernel/types"
)

// HealthHandler returns JSON of all component health
func HealthHandler(w http.ResponseWriter, r *http.Request) {
	hm := core.GlobalHealthManager
	statuses := hm.StatusesSnapshot() // Thread-safe snapshot

	health := []types.KernelHealth{}
	for _, s := range statuses {
		errStr := ""
		if s.LastError != nil {
			errStr = s.LastError.Error()
		}
		health = append(health, types.KernelHealth{
			Component: s.Name,
			Healthy:   s.Healthy,
			LastCheck: s.LastCheck,
			Error:     errStr,
		})
	}

	writeJSON(w, health)
}

// NodesHandler returns all nodes (kernel, agents, engines)
func NodesHandler(w http.ResponseWriter, r *http.Request) {
	nodes := discovery.GetNodes()
	writeJSON(w, nodes)
}

// CapabilitiesHandler returns all registered agents & engines
func CapabilitiesHandler(w http.ResponseWriter, r *http.Request) {
	capabilities := discovery.GetCapabilities()
	writeJSON(w, capabilities)
}

type kernelCommand struct {
	ID       string                 `json:"id"`
	Type     string                 `json:"type"`
	Payload  map[string]interface{} `json:"payload"`
	Metadata map[string]interface{} `json:"metadata"`
}

type kernelResponse struct {
	ID        string      `json:"id"`
	Success   bool        `json:"success"`
	Stdout    string      `json:"stdout,omitempty"`
	Stderr    string      `json:"stderr,omitempty"`
	Timestamp string      `json:"timestamp"`
	Data      interface{} `json:"data,omitempty"`
}

// ExecuteHandler accepts orchestrator commands and returns a normalized response.
func ExecuteHandler(w http.ResponseWriter, r *http.Request) {
	var cmd kernelCommand
	if err := json.NewDecoder(r.Body).Decode(&cmd); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}

	if strings.TrimSpace(cmd.ID) == "" {
		cmd.ID = fmt.Sprintf("kernel-%d", time.Now().UnixNano())
	}
	if cmd.Payload == nil {
		cmd.Payload = map[string]interface{}{}
	}

	action := extractFirstString(cmd.Payload, "code", "command", "message")
	if strings.TrimSpace(action) == "" {
		writeJSON(w, kernelResponse{
			ID:        cmd.ID,
			Success:   false,
			Stderr:    "empty payload action",
			Timestamp: time.Now().UTC().Format(time.RFC3339),
		})
		return
	}

	writeJSON(w, kernelResponse{
		ID:        cmd.ID,
		Success:   true,
		Stdout:    fmt.Sprintf("kernel accepted %s: %s", normalizeType(cmd.Type), action),
		Timestamp: time.Now().UTC().Format(time.RFC3339),
		Data: map[string]interface{}{
			"type":      normalizeType(cmd.Type),
			"received":  action,
			"component": "kernel-api",
		},
	})
}

// ChatCommandHandler is a compatibility alias for chat-style requests.
func ChatCommandHandler(w http.ResponseWriter, r *http.Request) {
	ExecuteHandler(w, r)
}

// EventIngestHandler accepts orchestrator bridge events.
func EventIngestHandler(w http.ResponseWriter, r *http.Request) {
	var payload map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}

	writeJSON(w, map[string]interface{}{
		"status":    "accepted",
		"component": "kernel-api",
		"time":      time.Now().UTC().Format(time.RFC3339),
	})
}

func extractFirstString(payload map[string]interface{}, keys ...string) string {
	for _, key := range keys {
		raw, ok := payload[key]
		if !ok {
			continue
		}
		if s, isString := raw.(string); isString && strings.TrimSpace(s) != "" {
			return s
		}
	}
	return ""
}

func normalizeType(commandType string) string {
	switch strings.TrimSpace(commandType) {
	case "chat", "execute", "ai_inference":
		return commandType
	default:
		return "execute"
	}
}

// Helper to write JSON responses
func writeJSON(w http.ResponseWriter, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(data)
}
