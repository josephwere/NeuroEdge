// kernel/engines/neuro_audio_engine.go
package engines

import (
	"fmt"

	"neuroedge/kernel/types"
)

type NeuroAudioEngine struct {
	EventBus *types.EventBus
}

func NewNeuroAudioEngine(bus *types.EventBus) *NeuroAudioEngine {
	return &NeuroAudioEngine{
		EventBus: bus,
	}
}

func (n *NeuroAudioEngine) Start() {
	fmt.Println("🚀 NeuroAudioEngine started")

	n.EventBus.Subscribe("audio:request", func(evt types.Event) {
		fmt.Println("[NeuroAudioEngine] Audio Event:", evt.Data)
		n.ProcessAudio(evt.Data)
	})
}

func (n *NeuroAudioEngine) Stop() {
	fmt.Println("🛑 NeuroAudioEngine stopped")
}

func (n *NeuroAudioEngine) Name() string {
	return "NeuroAudioEngine"
}

func (n *NeuroAudioEngine) ProcessAudio(data interface{}) {
	fmt.Println("[NeuroAudioEngine] Audio processed:", data)
}
