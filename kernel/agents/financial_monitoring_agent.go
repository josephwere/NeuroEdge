package agents

import (
"fmt"
"neuroedge/kernel/types"
)

type financial_monitoring_agent struct {
EventBus *types.EventBus
}

func Newfinancial_monitoring_agent(bus *types.EventBus) *financial_monitoring_agent {
return &financial_monitoring_agent{
EventBus: bus,
}
}

func (a *financial_monitoring_agent) Start() {
fmt.Println("?? financial_monitoring_agent started")

// Inline subscription using type assertion
a.EventBus.Subscribe("financial_monitoring_agent:update", func(event types.Event) {
fmt.Println("[financial_monitoring_agent] Event received:", event.Data)
a.HandleEvent(event.Data.(map[string]interface{}))
})
}

func (a *financial_monitoring_agent) Stop() {
fmt.Println("?? financial_monitoring_agent stopped")
}

func (a *financial_monitoring_agent) Name() string {
return "financial_monitoring_agent"
}

// Implement a default HandleEvent method, can be customized
func (a *financial_monitoring_agent) HandleEvent(data map[string]interface{}) {
fmt.Println("[financial_monitoring_agent] Handling event data:", data)
}
