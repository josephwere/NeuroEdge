package engines

import (
	"fmt"

	"neuroedge/kernel/types"
)

type NeuroEdgeMeshEngine struct {
	EventBus *types.EventBus
}

func NewNeuroEdgeMeshEngine(bus *types.EventBus) *NeuroEdgeMeshEngine {
	return &NeuroEdgeMeshEngine{
		EventBus: bus,
	}
}

func (n *NeuroEdgeMeshEngine) Start() {
	fmt.Println("🚀 NeuroEdgeMeshEngine started")

	n.EventBus.Subscribe("mesh:request", func(evt types.Event) {
		fmt.Println("[NeuroEdgeMeshEngine] Mesh Event:", evt.Data)
		n.ManageMesh(evt.Data)
	})
}

func (n *NeuroEdgeMeshEngine) Stop() {
	fmt.Println("🛑 NeuroEdgeMeshEngine stopped")
}

func (n *NeuroEdgeMeshEngine) Name() string {
	return "NeuroEdgeMeshEngine"
}

func (n *NeuroEdgeMeshEngine) ManageMesh(data interface{}) {
	fmt.Println("[NeuroEdgeMeshEngine] Mesh managed:", data)
}
