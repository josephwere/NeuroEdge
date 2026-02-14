package engines

import (
	"fmt"

	"neuroedge/kernel/types"
)

type NeuroDefenseEngine struct {
	EventBus *types.EventBus
}

func NewNeuroDefenseEngine(bus *types.EventBus) *NeuroDefenseEngine {
	return &NeuroDefenseEngine{
		EventBus: bus,
	}
}

func (n *NeuroDefenseEngine) Start() {
	fmt.Println("🚀 NeuroDefenseEngine started")

	n.EventBus.Subscribe("defense:alert", func(evt types.Event) {
		fmt.Println("[NeuroDefenseEngine] Defense Event:", evt.Data)
		n.ActivateDefense(evt.Data)
	})
}

func (n *NeuroDefenseEngine) Stop() {
	fmt.Println("🛑 NeuroDefenseEngine stopped")
}

func (n *NeuroDefenseEngine) Name() string {
	return "NeuroDefenseEngine"
}

func (n *NeuroDefenseEngine) ActivateDefense(data interface{}) {
	fmt.Println("[NeuroDefenseEngine] Defense action executed:", data)
}
