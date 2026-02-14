package agents

import (
"fmt"
"neuroedge/kernel/types"
)

type medical_imaging_agent struct {
EventBus *types.EventBus
}

func Newmedical_imaging_agent(bus *types.EventBus) *medical_imaging_agent {
return &medical_imaging_agent{
EventBus: bus,
}
}

func (a *medical_imaging_agent) Start() {
fmt.Println("?? medical_imaging_agent started")

// Inline subscription using type assertion
a.EventBus.Subscribe("medical_imaging_agent:update", func(event types.Event) {
fmt.Println("[medical_imaging_agent] Event received:", event.Data)
a.HandleEvent(event.Data.(map[string]interface{}))
})
}

func (a *medical_imaging_agent) Stop() {
fmt.Println("?? medical_imaging_agent stopped")
}

func (a *medical_imaging_agent) Name() string {
return "medical_imaging_agent"
}

// Implement a default HandleEvent method, can be customized
func (a *medical_imaging_agent) HandleEvent(data map[string]interface{}) {
fmt.Println("[medical_imaging_agent] Handling event data:", data)
}
