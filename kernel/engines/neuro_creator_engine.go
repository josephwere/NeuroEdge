package engines

import (
	"fmt"

	"neuroedge/kernel/types"
)

type NeuroCreatorEngine struct {
	EventBus *types.EventBus
}

func NewNeuroCreatorEngine(bus *types.EventBus) *NeuroCreatorEngine {
	return &NeuroCreatorEngine{
		EventBus: bus,
	}
}

func (n *NeuroCreatorEngine) Start() {
	fmt.Println("🚀 NeuroCreatorEngine started")

	n.EventBus.Subscribe("create:content", func(evt types.Event) {
		fmt.Println("[NeuroCreatorEngine] Content Creation Event:", evt.Data)
		n.GenerateContent(evt.Data)
	})
}

func (n *NeuroCreatorEngine) Stop() {
	fmt.Println("🛑 NeuroCreatorEngine stopped")
}

func (n *NeuroCreatorEngine) Name() string {
	return "NeuroCreatorEngine"
}

func (n *NeuroCreatorEngine) GenerateContent(data interface{}) {
	fmt.Println("[NeuroCreatorEngine] Content generated:", data)
}
