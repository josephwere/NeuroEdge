package mesh

import (
	"fmt"
	"sync"
	"time"
)

type MessageRecord struct {
	Direction string
	NodeID    string
	Message   string
	Timestamp time.Time
}

// Messaging handles sending and receiving messages
type Messaging struct {
	mu      sync.Mutex
	inbox   map[string][]string
	outbox  map[string][]string
	history []MessageRecord
}

// NewMessaging creates a messaging instance
func NewMessaging() *Messaging {
	return &Messaging{
		inbox:   make(map[string][]string),
		outbox:  make(map[string][]string),
		history: make([]MessageRecord, 0, 512),
	}
}

func (m *Messaging) pushHistory(direction, nodeID, message string) {
	m.history = append(m.history, MessageRecord{
		Direction: direction,
		NodeID:    nodeID,
		Message:   message,
		Timestamp: time.Now(),
	})
	if len(m.history) > 10000 {
		m.history = m.history[len(m.history)-10000:]
	}
}

// SendMessage sends a message to a node
func (m *Messaging) SendMessage(node *Node, message string) {
	if node == nil {
		fmt.Printf("⚠️ SendMessage skipped: node is nil\n")
		return
	}
	m.mu.Lock()
	m.outbox[node.ID] = append(m.outbox[node.ID], message)
	m.pushHistory("outbound", node.ID, message)
	m.mu.Unlock()
	fmt.Printf("📨 Sent message to Node[%s]: %s\n", node.ID, message)
}

// ReceiveMessage registers a received message from a node.
func (m *Messaging) ReceiveMessage(node *Node, message string) {
	if node == nil {
		fmt.Printf("⚠️ ReceiveMessage skipped: node is nil\n")
		return
	}
	m.mu.Lock()
	m.inbox[node.ID] = append(m.inbox[node.ID], message)
	m.pushHistory("inbound", node.ID, message)
	m.mu.Unlock()
	fmt.Printf("📥 Received message from Node[%s]: %s\n", node.ID, message)
}

func (m *Messaging) ReadInbox(nodeID string) []string {
	m.mu.Lock()
	defer m.mu.Unlock()
	items := m.inbox[nodeID]
	out := make([]string, len(items))
	copy(out, items)
	return out
}

func (m *Messaging) ReadOutbox(nodeID string) []string {
	m.mu.Lock()
	defer m.mu.Unlock()
	items := m.outbox[nodeID]
	out := make([]string, len(items))
	copy(out, items)
	return out
}

func (m *Messaging) History(limit int) []MessageRecord {
	m.mu.Lock()
	defer m.mu.Unlock()
	if limit <= 0 || limit >= len(m.history) {
		out := make([]MessageRecord, len(m.history))
		copy(out, m.history)
		return out
	}
	start := len(m.history) - limit
	out := make([]MessageRecord, len(m.history[start:]))
	copy(out, m.history[start:])
	return out
}
