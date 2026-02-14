package agents

import (
"fmt"
"neuroedge/kernel/types"
)

type fraud_sentinel_agent struct {
EventBus *types.EventBus
}

func Newfraud_sentinel_agent(bus *types.EventBus) *fraud_sentinel_agent {
return &fraud_sentinel_agent{
EventBus: bus,
}
}

func (a *fraud_sentinel_agent) Start() {
fmt.Println("?? fraud_sentinel_agent started")

// Inline subscription using type assertion
a.EventBus.Subscribe("fraud_sentinel_agent:update", func(event types.Event) {
fmt.Println("[fraud_sentinel_agent] Event received:", event.Data)
a.HandleEvent(event.Data.(map[string]interface{}))
})
}

func (a *fraud_sentinel_agent) Stop() {
fmt.Println("?? fraud_sentinel_agent stopped")
}

func (a *fraud_sentinel_agent) Name() string {
return "fraud_sentinel_agent"
}

// Implement a default HandleEvent method, can be customized
func (a *fraud_sentinel_agent) HandleEvent(data map[string]interface{}) {
fmt.Println("[fraud_sentinel_agent] Handling event data:", data)
}
