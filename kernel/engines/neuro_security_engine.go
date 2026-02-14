package engines

import (
	"fmt"

	"neuroedge/kernel/types"
)

type NeuroSecurityEngine struct {
	EventBus *types.EventBus
}

func NewNeuroSecurityEngine(bus *types.EventBus) *NeuroSecurityEngine {
	return &NeuroSecurityEngine{
		EventBus: bus,
	}
}

func (n *NeuroSecurityEngine) Start() {
	fmt.Println("🚀 NeuroSecurityEngine started")

	n.EventBus.Subscribe("security:request", func(evt types.Event) {
		fmt.Println("[NeuroSecurityEngine] Security Event:", evt.Data)
		n.HandleSecurity(evt.Data)
	})
}

func (n *NeuroSecurityEngine) Stop() {
	fmt.Println("🛑 NeuroSecurityEngine stopped")
}

func (n *NeuroSecurityEngine) Name() string {
	return "NeuroSecurityEngine"
}

func (n *NeuroSecurityEngine) HandleSecurity(data interface{}) {
	fmt.Println("[NeuroSecurityEngine] Security processed:", data)
}
