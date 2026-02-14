package engines

import (
	"fmt"

	"neuroedge/kernel/types"
)

type NeuroOpsEngine struct {
	EventBus *types.EventBus
}

func NewNeuroOpsEngine(bus *types.EventBus) *NeuroOpsEngine {
	return &NeuroOpsEngine{
		EventBus: bus,
	}
}

func (n *NeuroOpsEngine) Start() {
	fmt.Println("🚀 NeuroOpsEngine started")

	n.EventBus.Subscribe("ops:request", func(evt types.Event) {
		fmt.Println("[NeuroOpsEngine] Ops Event:", evt.Data)
		n.ManageOps(evt.Data)
	})
}

func (n *NeuroOpsEngine) Stop() {
	fmt.Println("🛑 NeuroOpsEngine stopped")
}

func (n *NeuroOpsEngine) Name() string {
	return "NeuroOpsEngine"
}

func (n *NeuroOpsEngine) ManageOps(data interface{}) {
	fmt.Println("[NeuroOpsEngine] Operations managed:", data)
}
