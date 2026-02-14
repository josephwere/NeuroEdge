package agents

import (
"fmt"
"neuroedge/kernel/types"
)

type telecom_agent struct {
EventBus *types.EventBus
}

func Newtelecom_agent(bus *types.EventBus) *telecom_agent {
return &telecom_agent{
EventBus: bus,
}
}

func (a *telecom_agent) Start() {
fmt.Println("?? telecom_agent started")

// Inline subscription using type assertion
a.EventBus.Subscribe("telecom_agent:update", func(event types.Event) {
fmt.Println("[telecom_agent] Event received:", event.Data)
a.HandleEvent(event.Data.(map[string]interface{}))
})
}

func (a *telecom_agent) Stop() {
fmt.Println("?? telecom_agent stopped")
}

func (a *telecom_agent) Name() string {
return "telecom_agent"
}

// Implement a default HandleEvent method, can be customized
func (a *telecom_agent) HandleEvent(data map[string]interface{}) {
fmt.Println("[telecom_agent] Handling event data:", data)
}
