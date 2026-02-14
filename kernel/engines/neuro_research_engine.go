package engines

import (
	"fmt"

	"neuroedge/kernel/types"
)

type NeuroResearchEngine struct {
	EventBus *types.EventBus
}

func NewNeuroResearchEngine(bus *types.EventBus) *NeuroResearchEngine {
	return &NeuroResearchEngine{
		EventBus: bus,
	}
}

func (n *NeuroResearchEngine) Start() {
	fmt.Println("🚀 NeuroResearchEngine started")

	n.EventBus.Subscribe("research:analyze", func(evt types.Event) {
		fmt.Println("[NeuroResearchEngine] Research Event:", evt.Data)
		n.PerformResearch(evt.Data)
	})
}

func (n *NeuroResearchEngine) Stop() {
	fmt.Println("🛑 NeuroResearchEngine stopped")
}

func (n *NeuroResearchEngine) Name() string {
	return "NeuroResearchEngine"
}

func (n *NeuroResearchEngine) PerformResearch(data interface{}) {
	fmt.Println("[NeuroResearchEngine] Research completed:", data)
}
