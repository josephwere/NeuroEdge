package agents

import (
"fmt"
"neuroedge/kernel/types"
)

type code_quality_agent struct {
EventBus *types.EventBus
}

func Newcode_quality_agent(bus *types.EventBus) *code_quality_agent {
return &code_quality_agent{
EventBus: bus,
}
}

func (a *code_quality_agent) Start() {
fmt.Println("?? code_quality_agent started")

// Inline subscription using type assertion
a.EventBus.Subscribe("code_quality_agent:update", func(event types.Event) {
fmt.Println("[code_quality_agent] Event received:", event.Data)
a.HandleEvent(event.Data.(map[string]interface{}))
})
}

func (a *code_quality_agent) Stop() {
fmt.Println("?? code_quality_agent stopped")
}

func (a *code_quality_agent) Name() string {
return "code_quality_agent"
}

// Implement a default HandleEvent method, can be customized
func (a *code_quality_agent) HandleEvent(data map[string]interface{}) {
fmt.Println("[code_quality_agent] Handling event data:", data)
}
