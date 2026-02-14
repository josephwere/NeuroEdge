package agents

import (
"fmt"
"neuroedge/kernel/types"
)

type medical_doctor_agent struct {
EventBus *types.EventBus
}

func Newmedical_doctor_agent(bus *types.EventBus) *medical_doctor_agent {
return &medical_doctor_agent{
EventBus: bus,
}
}

func (a *medical_doctor_agent) Start() {
fmt.Println("?? medical_doctor_agent started")

// Inline subscription using type assertion
a.EventBus.Subscribe("medical_doctor_agent:update", func(event types.Event) {
fmt.Println("[medical_doctor_agent] Event received:", event.Data)
a.HandleEvent(event.Data.(map[string]interface{}))
})
}

func (a *medical_doctor_agent) Stop() {
fmt.Println("?? medical_doctor_agent stopped")
}

func (a *medical_doctor_agent) Name() string {
return "medical_doctor_agent"
}

// Implement a default HandleEvent method, can be customized
func (a *medical_doctor_agent) HandleEvent(data map[string]interface{}) {
fmt.Println("[medical_doctor_agent] Handling event data:", data)
}
