package engines

import (
	"fmt"

	"neuroedge/kernel/types"
)

type NeuroTradeEngine struct {
	EventBus *types.EventBus
}

func NewNeuroTradeEngine(bus *types.EventBus) *NeuroTradeEngine {
	return &NeuroTradeEngine{
		EventBus: bus,
	}
}

func (n *NeuroTradeEngine) Start() {
	fmt.Println("🚀 NeuroTradeEngine started")

	n.EventBus.Subscribe("trade:execute", func(evt types.Event) {
		fmt.Println("[NeuroTradeEngine] Trade Event:", evt.Data)
		n.ManageTrade(evt.Data)
	})
}

func (n *NeuroTradeEngine) Stop() {
	fmt.Println("🛑 NeuroTradeEngine stopped")
}

func (n *NeuroTradeEngine) Name() string {
	return "NeuroTradeEngine"
}

func (n *NeuroTradeEngine) ManageTrade(data interface{}) {
	fmt.Println("[NeuroTradeEngine] Trade executed:", data)
}
