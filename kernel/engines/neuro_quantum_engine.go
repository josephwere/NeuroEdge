package engines

import (
	"fmt"

	"neuroedge/kernel/types"
)

type NeuroQuantumEngine struct {
	EventBus *types.EventBus
}

func NewNeuroQuantumEngine(bus *types.EventBus) *NeuroQuantumEngine {
	return &NeuroQuantumEngine{
		EventBus: bus,
	}
}

func (n *NeuroQuantumEngine) Start() {
	fmt.Println("🚀 NeuroQuantumEngine started")

	n.EventBus.Subscribe("quantum:compute", func(evt types.Event) {
		fmt.Println("[NeuroQuantumEngine] Quantum Event:", evt.Data)
		n.ProcessQuantum(evt.Data)
	})
}

func (n *NeuroQuantumEngine) Stop() {
	fmt.Println("🛑 NeuroQuantumEngine stopped")
}

func (n *NeuroQuantumEngine) Name() string {
	return "NeuroQuantumEngine"
}

func (n *NeuroQuantumEngine) ProcessQuantum(data interface{}) {
	fmt.Println("[NeuroQuantumEngine] Quantum processing completed:", data)
}
