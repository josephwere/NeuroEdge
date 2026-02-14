package agents

import (
"fmt"
"neuroedge/kernel/types"
)

type device_fingerprint_agent struct {
EventBus *types.EventBus
}

func Newdevice_fingerprint_agent(bus *types.EventBus) *device_fingerprint_agent {
return &device_fingerprint_agent{
EventBus: bus,
}
}

func (a *device_fingerprint_agent) Start() {
fmt.Println("?? device_fingerprint_agent started")

// Inline subscription using type assertion
a.EventBus.Subscribe("device_fingerprint_agent:update", func(event types.Event) {
fmt.Println("[device_fingerprint_agent] Event received:", event.Data)
a.HandleEvent(event.Data.(map[string]interface{}))
})
}

func (a *device_fingerprint_agent) Stop() {
fmt.Println("?? device_fingerprint_agent stopped")
}

func (a *device_fingerprint_agent) Name() string {
return "device_fingerprint_agent"
}

// Implement a default HandleEvent method, can be customized
func (a *device_fingerprint_agent) HandleEvent(data map[string]interface{}) {
fmt.Println("[device_fingerprint_agent] Handling event data:", data)
}
