package engines

import (
	"fmt"

	"neuroedge/kernel/types"
)

type NeuroOfflineEngine struct {
	EventBus *types.EventBus
}

func NewNeuroOfflineEngine(bus *types.EventBus) *NeuroOfflineEngine {
	return &NeuroOfflineEngine{
		EventBus: bus,
	}
}

func (n *NeuroOfflineEngine) Start() {
	fmt.Println("🚀 NeuroOfflineEngine started")

	n.EventBus.Subscribe("offline:sync", func(evt types.Event) {
		fmt.Println("[NeuroOfflineEngine] Offline Sync Event:", evt.Data)
		n.HandleOffline(evt.Data)
	})
}

func (n *NeuroOfflineEngine) Stop() {
	fmt.Println("🛑 NeuroOfflineEngine stopped")
}

func (n *NeuroOfflineEngine) Name() string {
	return "NeuroOfflineEngine"
}

func (n *NeuroOfflineEngine) HandleOffline(data interface{}) {
	fmt.Println("[NeuroOfflineEngine] Offline processing executed:", data)
}
