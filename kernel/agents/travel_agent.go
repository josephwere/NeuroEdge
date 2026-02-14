package agents

import (
"fmt"
"neuroedge/kernel/types"
)

type travel_agent struct {
EventBus *types.EventBus
}

func Newtravel_agent(bus *types.EventBus) *travel_agent {
return &travel_agent{
EventBus: bus,
}
}

func (a *travel_agent) Start() {
fmt.Println("?? travel_agent started")

// Inline subscription using type assertion
a.EventBus.Subscribe("travel_agent:update", func(event types.Event) {
fmt.Println("[travel_agent] Event received:", event.Data)
a.HandleEvent(event.Data.(map[string]interface{}))
})
}

func (a *travel_agent) Stop() {
fmt.Println("?? travel_agent stopped")
}

func (a *travel_agent) Name() string {
return "travel_agent"
}

// Implement a default HandleEvent method, can be customized
func (a *travel_agent) HandleEvent(data map[string]interface{}) {
fmt.Println("[travel_agent] Handling event data:", data)
}
