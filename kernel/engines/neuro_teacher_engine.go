package engines

import (
	"fmt"

	"neuroedge/kernel/types"
)

type NeuroTeacherEngine struct {
	EventBus *types.EventBus
}

func NewNeuroTeacherEngine(bus *types.EventBus) *NeuroTeacherEngine {
	return &NeuroTeacherEngine{
		EventBus: bus,
	}
}

func (n *NeuroTeacherEngine) Start() {
	fmt.Println("🚀 NeuroTeacherEngine started")

	n.EventBus.Subscribe("teach:lesson", func(evt types.Event) {
		fmt.Println("[NeuroTeacherEngine] Teaching Event:", evt.Data)
		n.LearnAndTeach(evt.Data)
	})
}

func (n *NeuroTeacherEngine) Stop() {
	fmt.Println("🛑 NeuroTeacherEngine stopped")
}

func (n *NeuroTeacherEngine) Name() string {
	return "NeuroTeacherEngine"
}

func (n *NeuroTeacherEngine) LearnAndTeach(data interface{}) {
	fmt.Println("[NeuroTeacherEngine] Lesson processed:", data)
}
