package engines

import (
	"fmt"

	"neuroedge/kernel/types"
)

type NeuroCodeEngine struct {
	EventBus *types.EventBus
}

func NewNeuroCodeEngine(bus *types.EventBus) *NeuroCodeEngine {
	return &NeuroCodeEngine{
		EventBus: bus,
	}
}

func (n *NeuroCodeEngine) Start() {
	fmt.Println("🚀 NeuroCodeEngine started")

	n.EventBus.Subscribe("code:request", func(evt types.Event) {
		fmt.Println("[NeuroCodeEngine] Code Event:", evt.Data)
		n.ProcessCode(evt.Data)
	})
}

func (n *NeuroCodeEngine) Stop() {
	fmt.Println("🛑 NeuroCodeEngine stopped")
}

func (n *NeuroCodeEngine) Name() string {
	return "NeuroCodeEngine"
}

func (n *NeuroCodeEngine) ProcessCode(data interface{}) {
	fmt.Println("[NeuroCodeEngine] Code generated:", data)
}
