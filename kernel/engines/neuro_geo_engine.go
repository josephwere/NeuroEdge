package engines

import (
	"fmt"

	"neuroedge/kernel/types"
)

type NeuroGeoEngine struct {
	EventBus *types.EventBus
}

func NewNeuroGeoEngine(bus *types.EventBus) *NeuroGeoEngine {
	return &NeuroGeoEngine{
		EventBus: bus,
	}
}

func (n *NeuroGeoEngine) Start() {
	fmt.Println("🚀 NeuroGeoEngine started")

	n.EventBus.Subscribe("geo:analyze", func(evt types.Event) {
		fmt.Println("[NeuroGeoEngine] Geo Event:", evt.Data)
		n.AnalyzeGeo(evt.Data)
	})
}

func (n *NeuroGeoEngine) Stop() {
	fmt.Println("🛑 NeuroGeoEngine stopped")
}

func (n *NeuroGeoEngine) Name() string {
	return "NeuroGeoEngine"
}

func (n *NeuroGeoEngine) AnalyzeGeo(data interface{}) {
	fmt.Println("[NeuroGeoEngine] Geo data analyzed:", data)
}
