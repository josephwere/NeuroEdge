package engines

import (
	"fmt"

	"neuroedge/kernel/types"
)

type NeuroSensorsEngine struct {
	EventBus *types.EventBus
}

func NewNeuroSensorsEngine(bus *types.EventBus) *NeuroSensorsEngine {
	return &NeuroSensorsEngine{
		EventBus: bus,
	}
}

func (n *NeuroSensorsEngine) Start() {
	fmt.Println("🚀 NeuroSensorsEngine started")

	n.EventBus.Subscribe("sensor:data", func(evt types.Event) {
		fmt.Println("[NeuroSensorsEngine] Sensor Data Event:", evt.Data)
		n.ProcessSensorData(evt.Data)
	})
}

func (n *NeuroSensorsEngine) Stop() {
	fmt.Println("🛑 NeuroSensorsEngine stopped")
}

func (n *NeuroSensorsEngine) Name() string {
	return "NeuroSensorsEngine"
}

func (n *NeuroSensorsEngine) ProcessSensorData(data interface{}) {
	fmt.Println("[NeuroSensorsEngine] Sensor data processed:", data)
}
