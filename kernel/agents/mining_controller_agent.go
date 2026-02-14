package agents

import (
"fmt"
"neuroedge/kernel/types"
)

type mining_controller_agent struct {
EventBus *types.EventBus
}

func Newmining_controller_agent(bus *types.EventBus) *mining_controller_agent {
return &mining_controller_agent{
EventBus: bus,
}
}

func (a *mining_controller_agent) Start() {
fmt.Println("?? mining_controller_agent started")

// Inline subscription using type assertion
a.EventBus.Subscribe("mining_controller_agent:update", func(event types.Event) {
fmt.Println("[mining_controller_agent] Event received:", event.Data)
a.HandleEvent(event.Data.(map[string]interface{}))
})
}

func (a *mining_controller_agent) Stop() {
fmt.Println("?? mining_controller_agent stopped")
}

func (a *mining_controller_agent) Name() string {
return "mining_controller_agent"
}

// Implement a default HandleEvent method, can be customized
func (a *mining_controller_agent) HandleEvent(data map[string]interface{}) {
fmt.Println("[mining_controller_agent] Handling event data:", data)
}
