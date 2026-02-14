package agents

import (
"fmt"
"neuroedge/kernel/types"
)

type city_infrastructure_agent struct {
EventBus *types.EventBus
}

func Newcity_infrastructure_agent(bus *types.EventBus) *city_infrastructure_agent {
return &city_infrastructure_agent{
EventBus: bus,
}
}

func (a *city_infrastructure_agent) Start() {
fmt.Println("?? city_infrastructure_agent started")

// Inline subscription using type assertion
a.EventBus.Subscribe("city_infrastructure_agent:update", func(event types.Event) {
fmt.Println("[city_infrastructure_agent] Event received:", event.Data)
a.HandleEvent(event.Data.(map[string]interface{}))
})
}

func (a *city_infrastructure_agent) Stop() {
fmt.Println("?? city_infrastructure_agent stopped")
}

func (a *city_infrastructure_agent) Name() string {
return "city_infrastructure_agent"
}

// Implement a default HandleEvent method, can be customized
func (a *city_infrastructure_agent) HandleEvent(data map[string]interface{}) {
fmt.Println("[city_infrastructure_agent] Handling event data:", data)
}
