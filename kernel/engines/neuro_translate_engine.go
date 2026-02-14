package engines

import (
	"fmt"

	"neuroedge/kernel/types"
)

type NeuroTranslateEngine struct {
	EventBus *types.EventBus
}

func NewNeuroTranslateEngine(bus *types.EventBus) *NeuroTranslateEngine {
	return &NeuroTranslateEngine{
		EventBus: bus,
	}
}

func (n *NeuroTranslateEngine) Start() {
	fmt.Println("🚀 NeuroTranslateEngine started")

	n.EventBus.Subscribe("translate:request", func(evt types.Event) {
		fmt.Println("[NeuroTranslateEngine] Translate Event:", evt.Data)
		n.Translate(evt.Data)
	})
}

func (n *NeuroTranslateEngine) Stop() {
	fmt.Println("🛑 NeuroTranslateEngine stopped")
}

func (n *NeuroTranslateEngine) Name() string {
	return "NeuroTranslateEngine"
}

func (n *NeuroTranslateEngine) Translate(data interface{}) {
	fmt.Println("[NeuroTranslateEngine] Translation completed:", data)
}
