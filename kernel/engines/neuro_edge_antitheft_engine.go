package engines

import (
	"fmt"

	"neuroedge/kernel/types"
)

type NeuroEdgeAntiTheftEngine struct {
	EventBus *types.EventBus
}

func NewNeuroEdgeAntiTheftEngine(bus *types.EventBus) *NeuroEdgeAntiTheftEngine {
	return &NeuroEdgeAntiTheftEngine{
		EventBus: bus,
	}
}

func (n *NeuroEdgeAntiTheftEngine) Start() {
	fmt.Println("🚀 NeuroEdgeAntiTheftEngine started")

	n.EventBus.Subscribe("device:theft-alert", func(evt types.Event) {
		fmt.Println("[NeuroEdgeAntiTheftEngine] Theft Alert:", evt.Data)
		n.ProtectDevice(evt.Data)
	})
}

func (n *NeuroEdgeAntiTheftEngine) Stop() {
	fmt.Println("🛑 NeuroEdgeAntiTheftEngine stopped")
}

func (n *NeuroEdgeAntiTheftEngine) Name() string {
	return "NeuroEdgeAntiTheftEngine"
}

func (n *NeuroEdgeAntiTheftEngine) ProtectDevice(data interface{}) {
	fmt.Println("[NeuroEdgeAntiTheftEngine] Device protection executed:", data)
}
