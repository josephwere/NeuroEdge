package engines

import (
	"fmt"

	"neuroedge/kernel/types"
)

type NeuroLogicEngine struct {
	EventBus *types.EventBus
}

func NewNeuroLogicEngine(bus *types.EventBus) *NeuroLogicEngine {
	return &NeuroLogicEngine{
		EventBus: bus,
	}
}

func (n *NeuroLogicEngine) Start() {
	fmt.Println("🚀 NeuroLogicEngine started")

	n.EventBus.Subscribe("logic:request", func(evt types.Event) {
		fmt.Println("[NeuroLogicEngine] Logic Event:", evt.Data)
		n.ProcessLogic(evt.Data)
	})
}

func (n *NeuroLogicEngine) Stop() {
	fmt.Println("🛑 NeuroLogicEngine stopped")
}

func (n *NeuroLogicEngine) Name() string {
	return "NeuroLogicEngine"
}

func (n *NeuroLogicEngine) ProcessLogic(data interface{}) {
	fmt.Println("[NeuroLogicEngine] Logic processed:", data)
}
