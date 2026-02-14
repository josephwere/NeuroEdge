package engines

import (
	"fmt"

	"neuroedge/kernel/types"
)

type NeuroComputeEngine struct {
	EventBus *types.EventBus
}

func NewNeuroComputeEngine(bus *types.EventBus) *NeuroComputeEngine {
	return &NeuroComputeEngine{
		EventBus: bus,
	}
}

func (n *NeuroComputeEngine) Start() {
	fmt.Println("🚀 NeuroComputeEngine started")

	n.EventBus.Subscribe("compute:task", func(evt types.Event) {
		fmt.Println("[NeuroComputeEngine] Compute Event:", evt.Data)
		n.Execute(evt.Data)
	})
}

func (n *NeuroComputeEngine) Stop() {
	fmt.Println("🛑 NeuroComputeEngine stopped")
}

func (n *NeuroComputeEngine) Name() string {
	return "NeuroComputeEngine"
}

func (n *NeuroComputeEngine) Execute(data interface{}) {
	fmt.Println("[NeuroComputeEngine] Task executed:", data)
}
