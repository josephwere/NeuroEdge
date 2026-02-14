package engines

import (
	"fmt"

	"neuroedge/kernel/types"
)

type NeuroCloudEngine struct {
	EventBus *types.EventBus
}

func NewNeuroCloudEngine(bus *types.EventBus) *NeuroCloudEngine {
	return &NeuroCloudEngine{
		EventBus: bus,
	}
}

func (n *NeuroCloudEngine) Start() {
	fmt.Println("🚀 NeuroCloudEngine started")

	n.EventBus.Subscribe("cloud:task", func(evt types.Event) {
		fmt.Println("[NeuroCloudEngine] Cloud Task Event:", evt.Data)
		n.HandleCloudTask(evt.Data)
	})
}

func (n *NeuroCloudEngine) Stop() {
	fmt.Println("🛑 NeuroCloudEngine stopped")
}

func (n *NeuroCloudEngine) Name() string {
	return "NeuroCloudEngine"
}

func (n *NeuroCloudEngine) HandleCloudTask(data interface{}) {
	fmt.Println("[NeuroCloudEngine] Cloud task executed:", data)
}
