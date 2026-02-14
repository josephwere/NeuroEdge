package engines

import (
	"fmt"

	"neuroedge/kernel/types"
)

type NeuroLegalEngine struct {
	EventBus *types.EventBus
}

func NewNeuroLegalEngine(bus *types.EventBus) *NeuroLegalEngine {
	return &NeuroLegalEngine{
		EventBus: bus,
	}
}

func (n *NeuroLegalEngine) Start() {
	fmt.Println("🚀 NeuroLegalEngine started")

	n.EventBus.Subscribe("legal:request", func(evt types.Event) {
		fmt.Println("[NeuroLegalEngine] Legal Event:", evt.Data)
		n.AnalyzeLegal(evt.Data)
	})
}

func (n *NeuroLegalEngine) Stop() {
	fmt.Println("🛑 NeuroLegalEngine stopped")
}

func (n *NeuroLegalEngine) Name() string {
	return "NeuroLegalEngine"
}

func (n *NeuroLegalEngine) AnalyzeLegal(data interface{}) {
	fmt.Println("[NeuroLegalEngine] Legal analysis completed:", data)
}
