package engines

import (
	"fmt"

	"neuroedge/kernel/types"
)

type NeuroChainValidatorEngine struct {
	EventBus *types.EventBus
}

func NewNeuroChainValidatorEngine(bus *types.EventBus) *NeuroChainValidatorEngine {
	return &NeuroChainValidatorEngine{
		EventBus: bus,
	}
}

func (n *NeuroChainValidatorEngine) Start() {
	fmt.Println("🚀 NeuroChainValidatorEngine started")

	n.EventBus.Subscribe("chain:validate", func(evt types.Event) {
		fmt.Println("[NeuroChainValidatorEngine] Validator Event:", evt.Data)
		n.ValidateBlock(evt.Data)
	})
}

func (n *NeuroChainValidatorEngine) Stop() {
	fmt.Println("🛑 NeuroChainValidatorEngine stopped")
}

func (n *NeuroChainValidatorEngine) Name() string {
	return "NeuroChainValidatorEngine"
}

func (n *NeuroChainValidatorEngine) ValidateBlock(data interface{}) {
	fmt.Println("[NeuroChainValidatorEngine] Block validated:", data)
}
