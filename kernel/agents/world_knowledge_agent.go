package agents

import (
"fmt"
"neuroedge/kernel/types"
)

type world_knowledge_agent struct {
EventBus *types.EventBus
}

func Newworld_knowledge_agent(bus *types.EventBus) *world_knowledge_agent {
return &world_knowledge_agent{
EventBus: bus,
}
}

func (a *world_knowledge_agent) Start() {
fmt.Println("?? world_knowledge_agent started")

// Inline subscription using type assertion
a.EventBus.Subscribe("world_knowledge_agent:update", func(event types.Event) {
fmt.Println("[world_knowledge_agent] Event received:", event.Data)
a.HandleEvent(event.Data.(map[string]interface{}))
})
}

func (a *world_knowledge_agent) Stop() {
fmt.Println("?? world_knowledge_agent stopped")
}

func (a *world_knowledge_agent) Name() string {
return "world_knowledge_agent"
}

// Implement a default HandleEvent method, can be customized
func (a *world_knowledge_agent) HandleEvent(data map[string]interface{}) {
fmt.Println("[world_knowledge_agent] Handling event data:", data)
}
