package agents

import (
"fmt"
"neuroedge/kernel/types"
)

type robot_assistant_agent struct {
EventBus *types.EventBus
}

func Newrobot_assistant_agent(bus *types.EventBus) *robot_assistant_agent {
return &robot_assistant_agent{
EventBus: bus,
}
}

func (a *robot_assistant_agent) Start() {
fmt.Println("?? robot_assistant_agent started")

// Inline subscription using type assertion
a.EventBus.Subscribe("robot_assistant_agent:update", func(event types.Event) {
fmt.Println("[robot_assistant_agent] Event received:", event.Data)
a.HandleEvent(event.Data.(map[string]interface{}))
})
}

func (a *robot_assistant_agent) Stop() {
fmt.Println("?? robot_assistant_agent stopped")
}

func (a *robot_assistant_agent) Name() string {
return "robot_assistant_agent"
}

// Implement a default HandleEvent method, can be customized
func (a *robot_assistant_agent) HandleEvent(data map[string]interface{}) {
fmt.Println("[robot_assistant_agent] Handling event data:", data)
}
