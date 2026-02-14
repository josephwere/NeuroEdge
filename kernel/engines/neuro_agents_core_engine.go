// kernel/engines/neuro_agents_core_engine.go
package engines

import (
	"fmt"

	"neuroedge/kernel/types" // ✅ no core import
)

type NeuroAgentsCoreEngine struct {
	EventBus *types.EventBus
}

func NewNeuroAgentsCoreEngine(bus *types.EventBus) *NeuroAgentsCoreEngine {
	return &NeuroAgentsCoreEngine{
		EventBus: bus,
	}
}

func (n *NeuroAgentsCoreEngine) Start() {
	fmt.Println("🚀 NeuroAgentsCoreEngine started")

	n.EventBus.Subscribe("agent:command", func(evt types.Event) {
		fmt.Println("[NeuroAgentsCoreEngine] Agent Command Event:", evt.Data)
		n.ManageAgents(evt.Data)
	})
}

func (n *NeuroAgentsCoreEngine) Stop() {
	fmt.Println("🛑 NeuroAgentsCoreEngine stopped")
}

func (n *NeuroAgentsCoreEngine) Name() string {
	return "NeuroAgentsCoreEngine"
}

func (n *NeuroAgentsCoreEngine) ManageAgents(data interface{}) {
	fmt.Println("[NeuroAgentsCoreEngine] Agent command executed:", data)
}
