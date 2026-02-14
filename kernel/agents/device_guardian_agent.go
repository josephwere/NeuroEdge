package agents

import (
"fmt"
"neuroedge/kernel/types"
)

type device_guardian_agent struct {
EventBus *types.EventBus
}

func Newdevice_guardian_agent(bus *types.EventBus) *device_guardian_agent {
return &device_guardian_agent{
EventBus: bus,
}
}

func (a *device_guardian_agent) Start() {
fmt.Println("?? device_guardian_agent started")

// Inline subscription using type assertion
a.EventBus.Subscribe("device_guardian_agent:update", func(event types.Event) {
fmt.Println("[device_guardian_agent] Event received:", event.Data)
a.HandleEvent(event.Data.(map[string]interface{}))
})
}

func (a *device_guardian_agent) Stop() {
fmt.Println("?? device_guardian_agent stopped")
}

func (a *device_guardian_agent) Name() string {
return "device_guardian_agent"
}

// Implement a default HandleEvent method, can be customized
func (a *device_guardian_agent) HandleEvent(data map[string]interface{}) {
fmt.Println("[device_guardian_agent] Handling event data:", data)
}
