package engines

import (
	"fmt"

	"neuroedge/kernel/types"
)

type NeuroEmotionsEngine struct {
	EventBus *types.EventBus
}

func NewNeuroEmotionsEngine(bus *types.EventBus) *NeuroEmotionsEngine {
	return &NeuroEmotionsEngine{
		EventBus: bus,
	}
}

func (n *NeuroEmotionsEngine) Start() {
	fmt.Println("🚀 NeuroEmotionsEngine started")

	n.EventBus.Subscribe("emotion:analyze", func(evt types.Event) {
		fmt.Println("[NeuroEmotionsEngine] Emotion Event:", evt.Data)
		n.AnalyzeEmotion(evt.Data)
	})
}

func (n *NeuroEmotionsEngine) Stop() {
	fmt.Println("🛑 NeuroEmotionsEngine stopped")
}

func (n *NeuroEmotionsEngine) Name() string {
	return "NeuroEmotionsEngine"
}

func (n *NeuroEmotionsEngine) AnalyzeEmotion(data interface{}) {
	fmt.Println("[NeuroEmotionsEngine] Emotion analysis completed:", data)
}
