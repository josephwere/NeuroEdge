package agents

import (
"fmt"
"neuroedge/kernel/types"
)

type political_stability_agent struct {
EventBus *types.EventBus
}

func Newpolitical_stability_agent(bus *types.EventBus) *political_stability_agent {
return &political_stability_agent{
EventBus: bus,
}
}

func (a *political_stability_agent) Start() {
fmt.Println("?? political_stability_agent started")

// Inline subscription using type assertion
a.EventBus.Subscribe("political_stability_agent:update", func(event types.Event) {
fmt.Println("[political_stability_agent] Event received:", event.Data)
a.HandleEvent(event.Data.(map[string]interface{}))
})
}

func (a *political_stability_agent) Stop() {
fmt.Println("?? political_stability_agent stopped")
}

func (a *political_stability_agent) Name() string {
return "political_stability_agent"
}

// Implement a default HandleEvent method, can be customized
func (a *political_stability_agent) HandleEvent(data map[string]interface{}) {
fmt.Println("[political_stability_agent] Handling event data:", data)
}
