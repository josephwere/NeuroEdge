package agents

import (
"fmt"
"neuroedge/kernel/types"
)

type hospital_workflow_agent struct {
EventBus *types.EventBus
}

func Newhospital_workflow_agent(bus *types.EventBus) *hospital_workflow_agent {
return &hospital_workflow_agent{
EventBus: bus,
}
}

func (a *hospital_workflow_agent) Start() {
fmt.Println("?? hospital_workflow_agent started")

// Inline subscription using type assertion
a.EventBus.Subscribe("hospital_workflow_agent:update", func(event types.Event) {
fmt.Println("[hospital_workflow_agent] Event received:", event.Data)
a.HandleEvent(event.Data.(map[string]interface{}))
})
}

func (a *hospital_workflow_agent) Stop() {
fmt.Println("?? hospital_workflow_agent stopped")
}

func (a *hospital_workflow_agent) Name() string {
return "hospital_workflow_agent"
}

// Implement a default HandleEvent method, can be customized
func (a *hospital_workflow_agent) HandleEvent(data map[string]interface{}) {
fmt.Println("[hospital_workflow_agent] Handling event data:", data)
}
