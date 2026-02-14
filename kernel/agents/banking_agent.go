package agents

import (
"fmt"
"neuroedge/kernel/types"
)

type banking_agent struct {
EventBus *types.EventBus
}

func Newbanking_agent(bus *types.EventBus) *banking_agent {
return &banking_agent{
EventBus: bus,
}
}

func (a *banking_agent) Start() {
fmt.Println("?? banking_agent started")

// Inline subscription using type assertion
a.EventBus.Subscribe("banking_agent:update", func(event types.Event) {
fmt.Println("[banking_agent] Event received:", event.Data)
a.HandleEvent(event.Data.(map[string]interface{}))
})
}

func (a *banking_agent) Stop() {
fmt.Println("?? banking_agent stopped")
}

func (a *banking_agent) Name() string {
return "banking_agent"
}

// Implement a default HandleEvent method, can be customized
func (a *banking_agent) HandleEvent(data map[string]interface{}) {
fmt.Println("[banking_agent] Handling event data:", data)
}
