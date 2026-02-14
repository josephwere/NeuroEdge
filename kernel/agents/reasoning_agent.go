package agents

import (
"fmt"
"neuroedge/kernel/types"
)

type reasoning_agent struct {
EventBus *types.EventBus
}

func Newreasoning_agent(bus *types.EventBus) *reasoning_agent {
return &reasoning_agent{
EventBus: bus,
}
}

func (a *reasoning_agent) Start() {
fmt.Println("?? reasoning_agent started")

// Inline subscription using type assertion
a.EventBus.Subscribe("reasoning_agent:update", func(event types.Event) {
fmt.Println("[reasoning_agent] Event received:", event.Data)
a.HandleEvent(event.Data.(map[string]interface{}))
})
}

func (a *reasoning_agent) Stop() {
fmt.Println("?? reasoning_agent stopped")
}

func (a *reasoning_agent) Name() string {
return "reasoning_agent"
}

// Implement a default HandleEvent method, can be customized
func (a *reasoning_agent) HandleEvent(data map[string]interface{}) {
fmt.Println("[reasoning_agent] Handling event data:", data)
}
