package agents

import (
"fmt"
"neuroedge/kernel/types"
)

type emergency_response_agent struct {
EventBus *types.EventBus
}

func Newemergency_response_agent(bus *types.EventBus) *emergency_response_agent {
return &emergency_response_agent{
EventBus: bus,
}
}

func (a *emergency_response_agent) Start() {
fmt.Println("?? emergency_response_agent started")

// Inline subscription using type assertion
a.EventBus.Subscribe("emergency_response_agent:update", func(event types.Event) {
fmt.Println("[emergency_response_agent] Event received:", event.Data)
a.HandleEvent(event.Data.(map[string]interface{}))
})
}

func (a *emergency_response_agent) Stop() {
fmt.Println("?? emergency_response_agent stopped")
}

func (a *emergency_response_agent) Name() string {
return "emergency_response_agent"
}

// Implement a default HandleEvent method, can be customized
func (a *emergency_response_agent) HandleEvent(data map[string]interface{}) {
fmt.Println("[emergency_response_agent] Handling event data:", data)
}
