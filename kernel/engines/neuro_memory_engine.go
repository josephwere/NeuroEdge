package engines

import (
	"fmt"

	"neuroedge/kernel/types"
)

type NeuroMemoryEngine struct {
	EventBus *types.EventBus
}

func NewNeuroMemoryEngine(bus *types.EventBus) *NeuroMemoryEngine {
	return &NeuroMemoryEngine{
		EventBus: bus,
	}
}

func (n *NeuroMemoryEngine) Start() {
	fmt.Println("🚀 NeuroMemoryEngine started")

	n.EventBus.Subscribe("memory:request", func(evt types.Event) {
		fmt.Println("[NeuroMemoryEngine] Memory Event:", evt.Data)
		n.HandleMemory(evt.Data)
	})
}

func (n *NeuroMemoryEngine) Stop() {
	fmt.Println("🛑 NeuroMemoryEngine stopped")
}

func (n *NeuroMemoryEngine) Name() string {
	return "NeuroMemoryEngine"
}

func (n *NeuroMemoryEngine) HandleMemory(data interface{}) {
	fmt.Println("[NeuroMemoryEngine] Memory stored/retrieved:", data)
}
