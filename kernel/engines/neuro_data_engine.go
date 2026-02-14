package engines

import (
	"fmt"

	"neuroedge/kernel/types"
)

type NeuroDataEngine struct {
	EventBus *types.EventBus
}

func NewNeuroDataEngine(bus *types.EventBus) *NeuroDataEngine {
	return &NeuroDataEngine{
		EventBus: bus,
	}
}

func (n *NeuroDataEngine) Start() {
	fmt.Println("🚀 NeuroDataEngine started")

	n.EventBus.Subscribe("data:request", func(evt types.Event) {
		fmt.Println("[NeuroDataEngine] Data Event:", evt.Data)
		n.ProcessData(evt.Data)
	})
}

func (n *NeuroDataEngine) Stop() {
	fmt.Println("🛑 NeuroDataEngine stopped")
}

func (n *NeuroDataEngine) Name() string {
	return "NeuroDataEngine"
}

func (n *NeuroDataEngine) ProcessData(data interface{}) {
	fmt.Println("[NeuroDataEngine] Data processed:", data)
}
