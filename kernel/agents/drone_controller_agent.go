package agents

import (
"fmt"
"neuroedge/kernel/types"
)

type drone_controller_agent struct {
EventBus *types.EventBus
}

func Newdrone_controller_agent(bus *types.EventBus) *drone_controller_agent {
return &drone_controller_agent{
EventBus: bus,
}
}

func (a *drone_controller_agent) Start() {
fmt.Println("?? drone_controller_agent started")

// Inline subscription using type assertion
a.EventBus.Subscribe("drone_controller_agent:update", func(event types.Event) {
fmt.Println("[drone_controller_agent] Event received:", event.Data)
a.HandleEvent(event.Data.(map[string]interface{}))
})
}

func (a *drone_controller_agent) Stop() {
fmt.Println("?? drone_controller_agent stopped")
}

func (a *drone_controller_agent) Name() string {
return "drone_controller_agent"
}

// Implement a default HandleEvent method, can be customized
func (a *drone_controller_agent) HandleEvent(data map[string]interface{}) {
fmt.Println("[drone_controller_agent] Handling event data:", data)
}
