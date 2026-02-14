package agents

import (
"fmt"
"neuroedge/kernel/types"
)

type anti_theft_agent struct {
EventBus *types.EventBus
}

func Newanti_theft_agent(bus *types.EventBus) *anti_theft_agent {
return &anti_theft_agent{
EventBus: bus,
}
}

func (a *anti_theft_agent) Start() {
fmt.Println("?? anti_theft_agent started")

// Inline subscription using type assertion
a.EventBus.Subscribe("anti_theft_agent:update", func(event types.Event) {
fmt.Println("[anti_theft_agent] Event received:", event.Data)
a.HandleEvent(event.Data.(map[string]interface{}))
})
}

func (a *anti_theft_agent) Stop() {
fmt.Println("?? anti_theft_agent stopped")
}

func (a *anti_theft_agent) Name() string {
return "anti_theft_agent"
}

// Implement a default HandleEvent method, can be customized
func (a *anti_theft_agent) HandleEvent(data map[string]interface{}) {
fmt.Println("[anti_theft_agent] Handling event data:", data)
}
