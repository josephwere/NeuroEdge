package agents

import (
"fmt"
"neuroedge/kernel/types"
)

type vehicle_controller_agent struct {
EventBus *types.EventBus
}

func Newvehicle_controller_agent(bus *types.EventBus) *vehicle_controller_agent {
return &vehicle_controller_agent{
EventBus: bus,
}
}

func (a *vehicle_controller_agent) Start() {
fmt.Println("?? vehicle_controller_agent started")

// Inline subscription using type assertion
a.EventBus.Subscribe("vehicle_controller_agent:update", func(event types.Event) {
fmt.Println("[vehicle_controller_agent] Event received:", event.Data)
a.HandleEvent(event.Data.(map[string]interface{}))
})
}

func (a *vehicle_controller_agent) Stop() {
fmt.Println("?? vehicle_controller_agent stopped")
}

func (a *vehicle_controller_agent) Name() string {
return "vehicle_controller_agent"
}

// Implement a default HandleEvent method, can be customized
func (a *vehicle_controller_agent) HandleEvent(data map[string]interface{}) {
fmt.Println("[vehicle_controller_agent] Handling event data:", data)
}
