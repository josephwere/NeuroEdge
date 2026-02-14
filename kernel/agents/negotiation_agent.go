package agents

import (
"fmt"
"neuroedge/kernel/types"
)

type negotiation_agent struct {
EventBus *types.EventBus
}

func Newnegotiation_agent(bus *types.EventBus) *negotiation_agent {
return &negotiation_agent{
EventBus: bus,
}
}

func (a *negotiation_agent) Start() {
fmt.Println("?? negotiation_agent started")

// Inline subscription using type assertion
a.EventBus.Subscribe("negotiation_agent:update", func(event types.Event) {
fmt.Println("[negotiation_agent] Event received:", event.Data)
a.HandleEvent(event.Data.(map[string]interface{}))
})
}

func (a *negotiation_agent) Stop() {
fmt.Println("?? negotiation_agent stopped")
}

func (a *negotiation_agent) Name() string {
return "negotiation_agent"
}

// Implement a default HandleEvent method, can be customized
func (a *negotiation_agent) HandleEvent(data map[string]interface{}) {
fmt.Println("[negotiation_agent] Handling event data:", data)
}
