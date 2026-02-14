package agents

import (
"fmt"
"neuroedge/kernel/types"
)

type task_agent struct {
EventBus *types.EventBus
}

func Newtask_agent(bus *types.EventBus) *task_agent {
return &task_agent{
EventBus: bus,
}
}

func (a *task_agent) Start() {
fmt.Println("?? task_agent started")

// Inline subscription using type assertion
a.EventBus.Subscribe("task_agent:update", func(event types.Event) {
fmt.Println("[task_agent] Event received:", event.Data)
a.HandleEvent(event.Data.(map[string]interface{}))
})
}

func (a *task_agent) Stop() {
fmt.Println("?? task_agent stopped")
}

func (a *task_agent) Name() string {
return "task_agent"
}

// Implement a default HandleEvent method, can be customized
func (a *task_agent) HandleEvent(data map[string]interface{}) {
fmt.Println("[task_agent] Handling event data:", data)
}
