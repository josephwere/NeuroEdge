// kernel/engines/neuro_ceo_engine.go
package engines

import (
	"fmt"

	"neuroedge/kernel/types"
)

type NeuroCEOEngine struct {
	EventBus *types.EventBus
}

func NewNeuroCEOEngine(bus *types.EventBus) *NeuroCEOEngine {
	return &NeuroCEOEngine{
		EventBus: bus,
	}
}

func (n *NeuroCEOEngine) Start() {
	fmt.Println("🚀 NeuroCEOEngine started")

	n.EventBus.Subscribe("business:strategy", func(evt types.Event) {
		fmt.Println("[NeuroCEOEngine] Business Event:", evt.Data)
		n.AdviseCEO(evt.Data)
	})
}

func (n *NeuroCEOEngine) Stop() {
	fmt.Println("🛑 NeuroCEOEngine stopped")
}

func (n *NeuroCEOEngine) Name() string {
	return "NeuroCEOEngine"
}

func (n *NeuroCEOEngine) AdviseCEO(data interface{}) {
	fmt.Println("[NeuroCEOEngine] Business strategy processed:", data)
}
