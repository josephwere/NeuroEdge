package engines

import (
	"fmt"

	"neuroedge/kernel/types"
)

type NeuroSearchEngine struct {
	EventBus *types.EventBus
}

func NewNeuroSearchEngine(bus *types.EventBus) *NeuroSearchEngine {
	return &NeuroSearchEngine{
		EventBus: bus,
	}
}

func (n *NeuroSearchEngine) Start() {
	fmt.Println("🚀 NeuroSearchEngine started")

	n.EventBus.Subscribe("search:request", func(evt types.Event) {
		fmt.Println("[NeuroSearchEngine] Search Event:", evt.Data)
		n.ExecuteSearch(evt.Data)
	})
}

func (n *NeuroSearchEngine) Stop() {
	fmt.Println("🛑 NeuroSearchEngine stopped")
}

func (n *NeuroSearchEngine) Name() string {
	return "NeuroSearchEngine"
}

func (n *NeuroSearchEngine) ExecuteSearch(data interface{}) {
	fmt.Println("[NeuroSearchEngine] Search executed:", data)
}
