package mesh

import "fmt"

// Routing handles message delivery across nodes
type Routing struct{}

// NewRouting creates a routing instance
func NewRouting() *Routing {
	return &Routing{}
}

// RouteMessage simulates routing a message to target node
func (r *Routing) RouteMessage(node *Node, message string) {
	fmt.Printf("➡️ Routing message to Node[%s]: %s\n", node.ID, message)
}
