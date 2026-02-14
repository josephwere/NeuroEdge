package agents

import (
"fmt"
"neuroedge/kernel/types"
)

type fraud_detection_agent struct {
EventBus *types.EventBus
}

func Newfraud_detection_agent(bus *types.EventBus) *fraud_detection_agent {
return &fraud_detection_agent{
EventBus: bus,
}
}

func (a *fraud_detection_agent) Start() {
fmt.Println("?? fraud_detection_agent started")

// Inline subscription using type assertion
a.EventBus.Subscribe("fraud_detection_agent:update", func(event types.Event) {
fmt.Println("[fraud_detection_agent] Event received:", event.Data)
a.HandleEvent(event.Data.(map[string]interface{}))
})
}

func (a *fraud_detection_agent) Stop() {
fmt.Println("?? fraud_detection_agent stopped")
}

func (a *fraud_detection_agent) Name() string {
return "fraud_detection_agent"
}

// Implement a default HandleEvent method, can be customized
func (a *fraud_detection_agent) HandleEvent(data map[string]interface{}) {
fmt.Println("[fraud_detection_agent] Handling event data:", data)
}
