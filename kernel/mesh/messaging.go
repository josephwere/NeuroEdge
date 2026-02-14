package mesh

import "fmt"

// Messaging handles sending and receiving messages
type Messaging struct{}

// NewMessaging creates a messaging instance
func NewMessaging() *Messaging {
	return &Messaging{}
}

// SendMessage sends a message to a node
func (m *Messaging) SendMessage(node *Node, message string) {
	fmt.Printf("📨 Sent message to Node[%s]: %s\n", node.ID, message)
}

// ReceiveMessage simulates receiving a message
func (m *Messaging) ReceiveMessage(node *Node, message string) {
	fmt.Printf("📥 Received message from Node[%s]: %s\n", node.ID, message)
}
