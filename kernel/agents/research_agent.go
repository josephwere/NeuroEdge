package agents

import (
"fmt"
"neuroedge/kernel/types"
)

type research_agent struct {
EventBus *types.EventBus
}

func Newresearch_agent(bus *types.EventBus) *research_agent {
return &research_agent{
EventBus: bus,
}
}

func (a *research_agent) Start() {
fmt.Println("?? research_agent started")

// Inline subscription using type assertion
a.EventBus.Subscribe("research_agent:update", func(event types.Event) {
fmt.Println("[research_agent] Event received:", event.Data)
a.HandleEvent(event.Data.(map[string]interface{}))
})
}

func (a *research_agent) Stop() {
fmt.Println("?? research_agent stopped")
}

func (a *research_agent) Name() string {
return "research_agent"
}

// Implement a default HandleEvent method, can be customized
func (a *research_agent) HandleEvent(data map[string]interface{}) {
fmt.Println("[research_agent] Handling event data:", data)
}
