// kernel/engines/neuro_api_engine.go
package engines

import (
	"fmt"

	"neuroedge/kernel/types"
)

type NeuroAPIEngine struct {
	EventBus *types.EventBus
}

func NewNeuroAPIEngine(bus *types.EventBus) *NeuroAPIEngine {
	return &NeuroAPIEngine{
		EventBus: bus,
	}
}

func (n *NeuroAPIEngine) Start() {
	fmt.Println("🚀 NeuroAPIEngine started")

	n.EventBus.Subscribe("api:request", func(evt types.Event) {
		fmt.Println("[NeuroAPIEngine] API Event:", evt.Data)
		n.ProcessAPI(evt.Data)
	})
}

func (n *NeuroAPIEngine) Stop() {
	fmt.Println("🛑 NeuroAPIEngine stopped")
}

func (n *NeuroAPIEngine) Name() string {
	return "NeuroAPIEngine"
}

func (n *NeuroAPIEngine) ProcessAPI(data interface{}) {
	fmt.Println("[NeuroAPIEngine] API processed:", data)
}
