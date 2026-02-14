package engines

import (
	"fmt"

	"neuroedge/kernel/types"
)

type NeuroHumanEngine struct {
	EventBus *types.EventBus
}

func NewNeuroHumanEngine(bus *types.EventBus) *NeuroHumanEngine {
	return &NeuroHumanEngine{
		EventBus: bus,
	}
}

func (n *NeuroHumanEngine) Start() {
	fmt.Println("🚀 NeuroHumanEngine started")

	n.EventBus.Subscribe("human:analyze", func(evt types.Event) {
		fmt.Println("[NeuroHumanEngine] Human Event:", evt.Data)
		n.Analyze(evt.Data)
	})
}

func (n *NeuroHumanEngine) Stop() {
	fmt.Println("🛑 NeuroHumanEngine stopped")
}

func (n *NeuroHumanEngine) Name() string {
	return "NeuroHumanEngine"
}

func (n *NeuroHumanEngine) Analyze(data interface{}) {
	fmt.Println("[NeuroHumanEngine] Human analysis completed:", data)
}
