package engines

import (
	"fmt"

	"neuroedge/kernel/types"
)

type NeuroIdentityEngine struct {
	EventBus *types.EventBus
}

func NewNeuroIdentityEngine(bus *types.EventBus) *NeuroIdentityEngine {
	return &NeuroIdentityEngine{
		EventBus: bus,
	}
}

func (n *NeuroIdentityEngine) Start() {
	fmt.Println("🚀 NeuroIdentityEngine started")

	n.EventBus.Subscribe("identity:request", func(evt types.Event) {
		fmt.Println("[NeuroIdentityEngine] Identity Event:", evt.Data)
		n.VerifyIdentity(evt.Data)
	})
}

func (n *NeuroIdentityEngine) Stop() {
	fmt.Println("🛑 NeuroIdentityEngine stopped")
}

func (n *NeuroIdentityEngine) Name() string {
	return "NeuroIdentityEngine"
}

func (n *NeuroIdentityEngine) VerifyIdentity(data interface{}) {
	fmt.Println("[NeuroIdentityEngine] Identity verified:", data)
}
