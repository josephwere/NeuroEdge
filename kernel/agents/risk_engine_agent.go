package agents

import (
"fmt"
"neuroedge/kernel/types"
)

type risk_engine_agent struct {
EventBus *types.EventBus
}

func Newrisk_engine_agent(bus *types.EventBus) *risk_engine_agent {
return &risk_engine_agent{
EventBus: bus,
}
}

func (a *risk_engine_agent) Start() {
fmt.Println("?? risk_engine_agent started")

// Inline subscription using type assertion
a.EventBus.Subscribe("risk_engine_agent:update", func(event types.Event) {
fmt.Println("[risk_engine_agent] Event received:", event.Data)
a.HandleEvent(event.Data.(map[string]interface{}))
})
}

func (a *risk_engine_agent) Stop() {
fmt.Println("?? risk_engine_agent stopped")
}

func (a *risk_engine_agent) Name() string {
return "risk_engine_agent"
}

// Implement a default HandleEvent method, can be customized
func (a *risk_engine_agent) HandleEvent(data map[string]interface{}) {
fmt.Println("[risk_engine_agent] Handling event data:", data)
}
