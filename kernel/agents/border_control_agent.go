package agents

import (
"fmt"
"neuroedge/kernel/types"
)

type border_control_agent struct {
EventBus *types.EventBus
}

func Newborder_control_agent(bus *types.EventBus) *border_control_agent {
return &border_control_agent{
EventBus: bus,
}
}

func (a *border_control_agent) Start() {
fmt.Println("?? border_control_agent started")

// Inline subscription using type assertion
a.EventBus.Subscribe("border_control_agent:update", func(event types.Event) {
fmt.Println("[border_control_agent] Event received:", event.Data)
a.HandleEvent(event.Data.(map[string]interface{}))
})
}

func (a *border_control_agent) Stop() {
fmt.Println("?? border_control_agent stopped")
}

func (a *border_control_agent) Name() string {
return "border_control_agent"
}

// Implement a default HandleEvent method, can be customized
func (a *border_control_agent) HandleEvent(data map[string]interface{}) {
fmt.Println("[border_control_agent] Handling event data:", data)
}
