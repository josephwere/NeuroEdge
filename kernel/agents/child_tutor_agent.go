package agents

import (
"fmt"
"neuroedge/kernel/types"
)

type child_tutor_agent struct {
EventBus *types.EventBus
}

func Newchild_tutor_agent(bus *types.EventBus) *child_tutor_agent {
return &child_tutor_agent{
EventBus: bus,
}
}

func (a *child_tutor_agent) Start() {
fmt.Println("?? child_tutor_agent started")

// Inline subscription using type assertion
a.EventBus.Subscribe("child_tutor_agent:update", func(event types.Event) {
fmt.Println("[child_tutor_agent] Event received:", event.Data)
a.HandleEvent(event.Data.(map[string]interface{}))
})
}

func (a *child_tutor_agent) Stop() {
fmt.Println("?? child_tutor_agent stopped")
}

func (a *child_tutor_agent) Name() string {
return "child_tutor_agent"
}

// Implement a default HandleEvent method, can be customized
func (a *child_tutor_agent) HandleEvent(data map[string]interface{}) {
fmt.Println("[child_tutor_agent] Handling event data:", data)
}
