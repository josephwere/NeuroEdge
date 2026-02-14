package agents

import (
"fmt"
"neuroedge/kernel/types"
)

type satellite_link_agent struct {
EventBus *types.EventBus
}

func Newsatellite_link_agent(bus *types.EventBus) *satellite_link_agent {
return &satellite_link_agent{
EventBus: bus,
}
}

func (a *satellite_link_agent) Start() {
fmt.Println("?? satellite_link_agent started")

// Inline subscription using type assertion
a.EventBus.Subscribe("satellite_link_agent:update", func(event types.Event) {
fmt.Println("[satellite_link_agent] Event received:", event.Data)
a.HandleEvent(event.Data.(map[string]interface{}))
})
}

func (a *satellite_link_agent) Stop() {
fmt.Println("?? satellite_link_agent stopped")
}

func (a *satellite_link_agent) Name() string {
return "satellite_link_agent"
}

// Implement a default HandleEvent method, can be customized
func (a *satellite_link_agent) HandleEvent(data map[string]interface{}) {
fmt.Println("[satellite_link_agent] Handling event data:", data)
}
