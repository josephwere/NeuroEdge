//kernel/mesh/discovery.go
package mesh

import (
	"fmt"
	"sync"
	"time"
)

type DiscoveryService struct {
	nodes map[string]*Node
	mu    sync.Mutex
}

// NewDiscoveryService creates the discovery service
func NewDiscoveryService() *DiscoveryService {
	return &DiscoveryService{
		nodes: make(map[string]*Node),
	}
}

// RegisterNode adds a node to the discovery table
func (d *DiscoveryService) RegisterNode(node *Node) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.nodes[node.ID] = node
	fmt.Printf("[Discovery] Node %s registered\n", node.ID)
}

// GetNode retrieves a node by ID
func (d *DiscoveryService) GetNode(id string) (*Node, bool) {
	d.mu.Lock()
	defer d.mu.Unlock()
	node, ok := d.nodes[id]
	return node, ok
}

// ListNodes returns all registered nodes
func (d *DiscoveryService) ListNodes() []*Node {
	d.mu.Lock()
	defer d.mu.Unlock()
	list := []*Node{}
	for _, node := range d.nodes {
		list = append(list, node)
	}
	return list
}

// GetActiveNodes returns nodes currently marked active.
func (d *DiscoveryService) GetActiveNodes() []*Node {
	d.mu.Lock()
	defer d.mu.Unlock()

	active := []*Node{}
	for _, node := range d.nodes {
		if node.IsActive {
			active = append(active, node)
		}
	}
	return active
}

// HeartbeatChecker checks node health periodically
func (d *DiscoveryService) HeartbeatChecker(interval time.Duration) {
	go func() {
		for {
			time.Sleep(interval)
			d.mu.Lock()
			for id, node := range d.nodes {
				if time.Since(node.LastSeen) > 30*time.Second {
					node.SetOffline()
					fmt.Printf("[Discovery] Node %s marked offline\n", id)
				}
			}
			d.mu.Unlock()
		}
	}()
}
