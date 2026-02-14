package engines

import (
	"fmt"

	"neuroedge/kernel/types"
)

type NeuroMedicalEngine struct {
	EventBus *types.EventBus
}

func NewNeuroMedicalEngine(bus *types.EventBus) *NeuroMedicalEngine {
	return &NeuroMedicalEngine{
		EventBus: bus,
	}
}

func (n *NeuroMedicalEngine) Start() {
	fmt.Println("🚀 NeuroMedicalEngine started")

	// Subscribe to medical requests
	n.EventBus.Subscribe("medical:request", func(evt types.Event) {
		fmt.Println("[NeuroMedicalEngine] Medical Event:", evt.Data)
		n.AnalyzeMedical(evt.Data)
	})
}

func (n *NeuroMedicalEngine) Stop() {
	fmt.Println("🛑 NeuroMedicalEngine stopped")
}

func (n *NeuroMedicalEngine) Name() string {
	return "NeuroMedicalEngine"
}

func (n *NeuroMedicalEngine) AnalyzeMedical(data interface{}) {
	fmt.Println("[NeuroMedicalEngine] Medical analysis completed:", data)
}
