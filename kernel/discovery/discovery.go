package discovery

import (
	"sync"

	"neuroedge/kernel/core"
	"neuroedge/kernel/types"
)

var (
	engineSnapshot = map[string]bool{}
	mu             sync.RWMutex
)

// Called once from main.go after engines are registered
func RegisterEngineSnapshot(registry *core.EngineRegistry) {
	mu.Lock()
	defer mu.Unlock()
	for name := range registry.Engines {
		engineSnapshot[name] = true
	}
}

func EngineRegistrySnapshot() map[string]bool {
	mu.RLock()
	defer mu.RUnlock()

	out := make(map[string]bool)
	for k, v := range engineSnapshot {
		out[k] = v
	}
	return out
}

func GetNodes() []types.KernelNode {
	nodes := []types.KernelNode{
		{ID: "kernel-1", Role: "kernel", Name: "NeuroEdge Kernel"},
	}

	for _, a := range core.GetAllAgents() {
		nodes = append(nodes, types.KernelNode{
			ID:   "agent-" + a.Name(),
			Role: "agent",
			Name: a.Name(),
		})
	}

	for name := range EngineRegistrySnapshot() {
		nodes = append(nodes, types.KernelNode{
			ID:   "engine-" + name,
			Role: "engine",
			Name: name,
		})
	}

	return nodes
}
