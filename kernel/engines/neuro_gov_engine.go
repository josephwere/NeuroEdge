package engines

import (
	"fmt"

	"neuroedge/kernel/types"
)

type NeuroGovEngine struct {
	EventBus *types.EventBus
}

func NewNeuroGovEngine(bus *types.EventBus) *NeuroGovEngine {
	return &NeuroGovEngine{
		EventBus: bus,
	}
}

func (n *NeuroGovEngine) Start() {
	fmt.Println("🚀 NeuroGovEngine started")

	n.EventBus.Subscribe("gov:request", func(evt types.Event) {
		fmt.Println("[NeuroGovEngine] Governance Event:", evt.Data)
		n.ProcessGov(evt.Data)
	})
}

func (n *NeuroGovEngine) Stop() {
	fmt.Println("🛑 NeuroGovEngine stopped")
}

func (n *NeuroGovEngine) Name() string {
	return "NeuroGovEngine"
}

func (n *NeuroGovEngine) ProcessGov(data interface{}) {
	fmt.Println("[NeuroGovEngine] Governance processed:", data)
}
