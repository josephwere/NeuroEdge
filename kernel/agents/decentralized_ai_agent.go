package agents

import (
"fmt"
"neuroedge/kernel/types"
)

type decentralized_ai_agent struct {
EventBus *types.EventBus
}

func Newdecentralized_ai_agent(bus *types.EventBus) *decentralized_ai_agent {
return &decentralized_ai_agent{
EventBus: bus,
}
}

func (a *decentralized_ai_agent) Start() {
fmt.Println("?? decentralized_ai_agent started")

// Inline subscription using type assertion
a.EventBus.Subscribe("decentralized_ai_agent:update", func(event types.Event) {
fmt.Println("[decentralized_ai_agent] Event received:", event.Data)
a.HandleEvent(event.Data.(map[string]interface{}))
})
}

func (a *decentralized_ai_agent) Stop() {
fmt.Println("?? decentralized_ai_agent stopped")
}

func (a *decentralized_ai_agent) Name() string {
return "decentralized_ai_agent"
}

// Implement a default HandleEvent method, can be customized
func (a *decentralized_ai_agent) HandleEvent(data map[string]interface{}) {
fmt.Println("[decentralized_ai_agent] Handling event data:", data)
}
