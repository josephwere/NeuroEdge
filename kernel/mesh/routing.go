package mesh

import (
	"fmt"
	"sync"
	"time"
)

type RouteRecord struct {
	NodeID    string
	Message   string
	Timestamp time.Time
}

// Routing handles message delivery across nodes
type Routing struct {
	mu      sync.Mutex
	history []RouteRecord
}

// NewRouting creates a routing instance
func NewRouting() *Routing {
	return &Routing{
		history: make([]RouteRecord, 0, 256),
	}
}

// RouteMessage routes a message to an active target node and records the route history.
func (r *Routing) RouteMessage(node *Node, message string) {
	if node == nil {
		fmt.Printf("⚠️ Routing skipped: node is nil\n")
		return
	}
	if !node.IsActive {
		fmt.Printf("⚠️ Routing skipped: Node[%s] is inactive\n", node.ID)
		return
	}

	record := RouteRecord{
		NodeID:    node.ID,
		Message:   message,
		Timestamp: time.Now(),
	}
	r.mu.Lock()
	r.history = append(r.history, record)
	if len(r.history) > 5000 {
		r.history = r.history[len(r.history)-5000:]
	}
	r.mu.Unlock()

	fmt.Printf("➡️ Routing message to Node[%s]: %s\n", node.ID, message)
}

func (r *Routing) History(limit int) []RouteRecord {
	r.mu.Lock()
	defer r.mu.Unlock()
	if limit <= 0 || limit >= len(r.history) {
		out := make([]RouteRecord, len(r.history))
		copy(out, r.history)
		return out
	}
	start := len(r.history) - limit
	out := make([]RouteRecord, len(r.history[start:]))
	copy(out, r.history[start:])
	return out
}
