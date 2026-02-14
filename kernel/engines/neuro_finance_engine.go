package engines

import (
	"fmt"

	"neuroedge/kernel/types"
)

type NeuroFinanceEngine struct {
	EventBus *types.EventBus
}

func NewNeuroFinanceEngine(bus *types.EventBus) *NeuroFinanceEngine {
	return &NeuroFinanceEngine{
		EventBus: bus,
	}
}

func (n *NeuroFinanceEngine) Start() {
	fmt.Println("🚀 NeuroFinanceEngine started")

	n.EventBus.Subscribe("finance:request", func(evt types.Event) {
		fmt.Println("[NeuroFinanceEngine] Finance Event:", evt.Data)
		n.ProcessFinance(evt.Data)
	})
}

func (n *NeuroFinanceEngine) Stop() {
	fmt.Println("🛑 NeuroFinanceEngine stopped")
}

func (n *NeuroFinanceEngine) Name() string {
	return "NeuroFinanceEngine"
}

func (n *NeuroFinanceEngine) ProcessFinance(data interface{}) {
	fmt.Println("[NeuroFinanceEngine] Finance processed:", data)
}
