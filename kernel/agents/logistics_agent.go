package agents

import (
"fmt"
"neuroedge/kernel/types"
)

type logistics_agent struct {
EventBus *types.EventBus
}

func Newlogistics_agent(bus *types.EventBus) *logistics_agent {
return &logistics_agent{
EventBus: bus,
}
}

func (a *logistics_agent) Start() {
fmt.Println("?? logistics_agent started")

// Inline subscription using type assertion
a.EventBus.Subscribe("logistics_agent:update", func(event types.Event) {
fmt.Println("[logistics_agent] Event received:", event.Data)
a.HandleEvent(event.Data.(map[string]interface{}))
})
}

func (a *logistics_agent) Stop() {
fmt.Println("?? logistics_agent stopped")
}

func (a *logistics_agent) Name() string {
return "logistics_agent"
}

// Implement a default HandleEvent method, can be customized
func (a *logistics_agent) HandleEvent(data map[string]interface{}) {
fmt.Println("[logistics_agent] Handling event data:", data)
}
