package agents

import (
"fmt"
"neuroedge/kernel/types"
)

type police_command_agent struct {
EventBus *types.EventBus
}

func Newpolice_command_agent(bus *types.EventBus) *police_command_agent {
return &police_command_agent{
EventBus: bus,
}
}

func (a *police_command_agent) Start() {
fmt.Println("?? police_command_agent started")

// Inline subscription using type assertion
a.EventBus.Subscribe("police_command_agent:update", func(event types.Event) {
fmt.Println("[police_command_agent] Event received:", event.Data)
a.HandleEvent(event.Data.(map[string]interface{}))
})
}

func (a *police_command_agent) Stop() {
fmt.Println("?? police_command_agent stopped")
}

func (a *police_command_agent) Name() string {
return "police_command_agent"
}

// Implement a default HandleEvent method, can be customized
func (a *police_command_agent) HandleEvent(data map[string]interface{}) {
fmt.Println("[police_command_agent] Handling event data:", data)
}
