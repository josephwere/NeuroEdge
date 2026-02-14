package engines

import (
	"fmt"

	"neuroedge/kernel/types"
)

type NeuroGPTEngine struct {
	EventBus *types.EventBus
}

func NewNeuroGPTEngine(bus *types.EventBus) *NeuroGPTEngine {
	return &NeuroGPTEngine{
		EventBus: bus,
	}
}

func (n *NeuroGPTEngine) Start() {
	fmt.Println("🚀 NeuroGPTEngine started")

	n.EventBus.Subscribe("gpt:request", func(evt types.Event) {
		fmt.Println("[NeuroGPTEngine] GPT Event:", evt.Data)
		n.GenerateResponse(evt.Data)
	})
}

func (n *NeuroGPTEngine) Stop() {
	fmt.Println("🛑 NeuroGPTEngine stopped")
}

func (n *NeuroGPTEngine) Name() string {
	return "NeuroGPTEngine"
}

func (n *NeuroGPTEngine) GenerateResponse(data interface{}) {
	fmt.Println("[NeuroGPTEngine] Generated response:", data)
}
