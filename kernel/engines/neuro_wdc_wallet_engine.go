package engines

import (
	"fmt"

	"neuroedge/kernel/types"
)

type NeuroWDCWalletEngine struct {
	EventBus *types.EventBus
}

func NewNeuroWDCWalletEngine(bus *types.EventBus) *NeuroWDCWalletEngine {
	return &NeuroWDCWalletEngine{
		EventBus: bus,
	}
}

func (n *NeuroWDCWalletEngine) Start() {
	fmt.Println("🚀 NeuroWDCWalletEngine started")

	// Subscribe using callback instead of channels
	n.EventBus.Subscribe("wallet:request", func(evt types.Event) {
		fmt.Println("[NeuroWDCWalletEngine] Wallet Event:", evt.Data)
		n.ManageWallet(evt.Data)
	})
}

func (n *NeuroWDCWalletEngine) Stop() {
	fmt.Println("🛑 NeuroWDCWalletEngine stopped")
}

func (n *NeuroWDCWalletEngine) Name() string {
	return "NeuroWDCWalletEngine"
}

// ManageWallet now accepts interface{} for flexible data handling
func (n *NeuroWDCWalletEngine) ManageWallet(data interface{}) {
	fmt.Println("[NeuroWDCWalletEngine] Wallet processed:", data)
}
