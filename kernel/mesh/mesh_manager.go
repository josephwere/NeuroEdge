//kernel/mesh/mesh_manager.go
package mesh

import (
	"fmt"
)

// MeshManager coordinates all mesh subsystems
type MeshManager struct {
	Discovery     *DiscoveryService
	Routing       *Routing
	Messaging     *Messaging
	Nodes         map[string]*Node
	EncryptionKey []byte
}

// NewMeshManager creates a mesh manager instance
func NewMeshManager(encryptionKey []byte) *MeshManager {
	return &MeshManager{
		Discovery:     NewDiscoveryService(),
		Routing:       NewRouting(),
		Messaging:     NewMessaging(),
		Nodes:         make(map[string]*Node),
		EncryptionKey: encryptionKey,
	}
}

// AddNode registers a node
func (m *MeshManager) AddNode(node *Node) {
	m.Discovery.RegisterNode(node)
	m.Nodes[node.ID] = node
	fmt.Printf("🌐 Node added: %s\n", node.ID)
}

// SendMessage sends encrypted message to a node
func (m *MeshManager) SendMessage(nodeID string, message string) {
	node, ok := m.Nodes[nodeID]
	if !ok {
		fmt.Printf("⚠️ Node not found: %s\n", nodeID)
		return
	}
	cipherText, err := Encrypt([]byte(message), m.EncryptionKey)
	if err != nil {
		fmt.Printf("❌ Encryption failed: %v\n", err)
		return
	}
	m.Messaging.SendMessage(node, string(cipherText))
}

// BroadcastMessage sends a message to all active nodes
func (m *MeshManager) BroadcastMessage(message string) {
	for _, node := range m.Discovery.GetActiveNodes() {
		m.SendMessage(node.ID, message)
	}
}
