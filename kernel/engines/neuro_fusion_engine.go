package engines

import (
	"fmt"

	"neuroedge/kernel/types"
)

type NeuroFusionEngine struct {
	EventBus *types.EventBus
}

func NewNeuroFusionEngine(bus *types.EventBus) *NeuroFusionEngine {
	return &NeuroFusionEngine{
		EventBus: bus,
	}
}

func (n *NeuroFusionEngine) Start() {
	fmt.Println("🚀 NeuroFusionEngine started")

	n.EventBus.Subscribe("fusion:orchestrate", func(evt types.Event) {
		fmt.Println("[NeuroFusionEngine] Orchestration Event:", evt.Data)
		n.FuseEngines(evt.Data)
	})
}

func (n *NeuroFusionEngine) Stop() {
	fmt.Println("🛑 NeuroFusionEngine stopped")
}

func (n *NeuroFusionEngine) Name() string {
	return "NeuroFusionEngine"
}

func (n *NeuroFusionEngine) FuseEngines(data interface{}) {
	fmt.Println("[NeuroFusionEngine] Multi-AI orchestration executed:", data)

	// Example: trigger multiple engines based on fusion logic
	n.EventBus.Publish(types.Event{
		Name:   "neuro:task",
		Data:   map[string]interface{}{"task": "orchestrated", "input": data},
		Source: "NeuroFusionEngine",
	})
}
