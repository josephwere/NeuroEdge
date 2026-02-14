//kernel/mesh/node.go
package mesh

import (
	"fmt"
	"sync"
	"time"
)

// Node represents a single device/node in the mesh
type Node struct {
	ID       string
	Address  string
	LastSeen time.Time
	IsActive bool
	Metadata map[string]string
	mu       sync.Mutex
}

// NewNode creates a new mesh node
func NewNode(id, addr string) *Node {
	return &Node{
		ID:       id,
		Address:  addr,
		LastSeen: time.Now(),
		IsActive: true,
		Metadata: make(map[string]string),
	}
}

// UpdateHeartbeat refreshes the last seen timestamp
func (n *Node) UpdateHeartbeat() {
	n.mu.Lock()
	defer n.mu.Unlock()
	n.LastSeen = time.Now()
	n.IsActive = true
}

// MarkInactive sets node as inactive
func (n *Node) MarkInactive() {
	n.mu.Lock()
	defer n.mu.Unlock()
	n.IsActive = false
}

// SetOffline marks the node as inactive for compatibility with discovery logic.
func (n *Node) SetOffline() {
	n.MarkInactive()
}

// String returns a formatted node description
func (n *Node) String() string {
	return fmt.Sprintf("Node[%s] Addr=%s Active=%t LastSeen=%s", n.ID, n.Address, n.IsActive, n.LastSeen.Format(time.RFC3339))
}
