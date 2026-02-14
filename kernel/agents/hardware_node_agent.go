package agents

import (
"fmt"
"neuroedge/kernel/types"
)

type hardware_node_agent struct {
EventBus *types.EventBus
}

func Newhardware_node_agent(bus *types.EventBus) *hardware_node_agent {
return &hardware_node_agent{
EventBus: bus,
}
}

func (a *hardware_node_agent) Start() {
fmt.Println("?? hardware_node_agent started")

// Inline subscription using type assertion
a.EventBus.Subscribe("hardware_node_agent:update", func(event types.Event) {
fmt.Println("[hardware_node_agent] Event received:", event.Data)
a.HandleEvent(event.Data.(map[string]interface{}))
})
}

func (a *hardware_node_agent) Stop() {
fmt.Println("?? hardware_node_agent stopped")
}

func (a *hardware_node_agent) Name() string {
return "hardware_node_agent"
}

// Implement a default HandleEvent method, can be customized
func (a *hardware_node_agent) HandleEvent(data map[string]interface{}) {
fmt.Println("[hardware_node_agent] Handling event data:", data)
}
