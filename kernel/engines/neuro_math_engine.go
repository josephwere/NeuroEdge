package engines

import (
	"fmt"

	"neuroedge/kernel/types"
)

type NeuroMathEngine struct {
	EventBus *types.EventBus
}

func NewNeuroMathEngine(bus *types.EventBus) *NeuroMathEngine {
	return &NeuroMathEngine{
		EventBus: bus,
	}
}

func (n *NeuroMathEngine) Start() {
	fmt.Println("🚀 NeuroMathEngine started")

	n.EventBus.Subscribe("math:compute", func(evt types.Event) {
		fmt.Println("[NeuroMathEngine] Math Event:", evt.Data)
		n.Compute(evt.Data)
	})
}

func (n *NeuroMathEngine) Stop() {
	fmt.Println("🛑 NeuroMathEngine stopped")
}

func (n *NeuroMathEngine) Name() string {
	return "NeuroMathEngine"
}

func (n *NeuroMathEngine) Compute(data interface{}) {
	fmt.Println("[NeuroMathEngine] Computation result:", data)
}
