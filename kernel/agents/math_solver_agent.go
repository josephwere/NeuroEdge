package agents

import (
"fmt"
"neuroedge/kernel/types"
)

type math_solver_agent struct {
EventBus *types.EventBus
}

func Newmath_solver_agent(bus *types.EventBus) *math_solver_agent {
return &math_solver_agent{
EventBus: bus,
}
}

func (a *math_solver_agent) Start() {
fmt.Println("?? math_solver_agent started")

// Inline subscription using type assertion
a.EventBus.Subscribe("math_solver_agent:update", func(event types.Event) {
fmt.Println("[math_solver_agent] Event received:", event.Data)
a.HandleEvent(event.Data.(map[string]interface{}))
})
}

func (a *math_solver_agent) Stop() {
fmt.Println("?? math_solver_agent stopped")
}

func (a *math_solver_agent) Name() string {
return "math_solver_agent"
}

// Implement a default HandleEvent method, can be customized
func (a *math_solver_agent) HandleEvent(data map[string]interface{}) {
fmt.Println("[math_solver_agent] Handling event data:", data)
}
