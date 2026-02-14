package engines

import (
	"fmt"

	"neuroedge/kernel/types"
)

type NeuroVisionEngine struct {
	EventBus *types.EventBus
}

func NewNeuroVisionEngine(bus *types.EventBus) *NeuroVisionEngine {
	return &NeuroVisionEngine{
		EventBus: bus,
	}
}

func (n *NeuroVisionEngine) Start() {
	fmt.Println("🚀 NeuroVisionEngine started")

	// Subscribe with callback instead of channels
	n.EventBus.Subscribe("vision:request", func(evt types.Event) {
		fmt.Println("[NeuroVisionEngine] Vision Event:", evt.Data)
		n.ProcessImage(evt.Data)
	})
}

func (n *NeuroVisionEngine) Stop() {
	fmt.Println("🛑 NeuroVisionEngine stopped")
}

func (n *NeuroVisionEngine) Name() string {
	return "NeuroVisionEngine"
}

// ProcessImage now accepts interface{} to simplify data handling
func (n *NeuroVisionEngine) ProcessImage(data interface{}) {
	fmt.Println("[NeuroVisionEngine] Image processed:", data)
}
