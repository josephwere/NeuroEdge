package engines

import (
	"fmt"

	"neuroedge/kernel/types"
)

type NeuroHREngine struct {
	EventBus *types.EventBus
}

func NewNeuroHREngine(bus *types.EventBus) *NeuroHREngine {
	return &NeuroHREngine{
		EventBus: bus,
	}
}

func (n *NeuroHREngine) Start() {
	fmt.Println("🚀 NeuroHREngine started")

	n.EventBus.Subscribe("hr:process", func(evt types.Event) {
		fmt.Println("[NeuroHREngine] HR Event:", evt.Data)
		n.ManageHR(evt.Data)
	})
}

func (n *NeuroHREngine) Stop() {
	fmt.Println("🛑 NeuroHREngine stopped")
}

func (n *NeuroHREngine) Name() string {
	return "NeuroHREngine"
}

func (n *NeuroHREngine) ManageHR(data interface{}) {
	fmt.Println("[NeuroHREngine] HR process completed:", data)
}
