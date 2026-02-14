package engines

import (
	"fmt"

	"neuroedge/kernel/types" // ✅ use types, not core
)

type Neuro3DEngine struct {
	EventBus *types.EventBus
}

func NewNeuro3DEngine(bus *types.EventBus) *Neuro3DEngine {
	return &Neuro3DEngine{
		EventBus: bus,
	}
}

func (n *Neuro3DEngine) Start() {
	fmt.Println("🚀 Neuro3DEngine started")

	// Removed unused variable 'ch'

	n.EventBus.Subscribe("3d:render", func(evt types.Event) {
		fmt.Println("[Neuro3DEngine] 3D Rendering Event:", evt.Data)
		n.Render3D(evt.Data)
	})
}

func (n *Neuro3DEngine) Stop() {
	fmt.Println("🛑 Neuro3DEngine stopped")
}

func (n *Neuro3DEngine) Name() string {
	return "Neuro3DEngine"
}

func (n *Neuro3DEngine) Render3D(data interface{}) {
	fmt.Println("[Neuro3DEngine] 3D Model rendered:", data)
}
