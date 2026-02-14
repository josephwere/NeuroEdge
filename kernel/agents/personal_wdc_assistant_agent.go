package agents

import (
"fmt"
"neuroedge/kernel/types"
)

type personal_wdc_assistant_agent struct {
EventBus *types.EventBus
}

func Newpersonal_wdc_assistant_agent(bus *types.EventBus) *personal_wdc_assistant_agent {
return &personal_wdc_assistant_agent{
EventBus: bus,
}
}

func (a *personal_wdc_assistant_agent) Start() {
fmt.Println("?? personal_wdc_assistant_agent started")

// Inline subscription using type assertion
a.EventBus.Subscribe("personal_wdc_assistant_agent:update", func(event types.Event) {
fmt.Println("[personal_wdc_assistant_agent] Event received:", event.Data)
a.HandleEvent(event.Data.(map[string]interface{}))
})
}

func (a *personal_wdc_assistant_agent) Stop() {
fmt.Println("?? personal_wdc_assistant_agent stopped")
}

func (a *personal_wdc_assistant_agent) Name() string {
return "personal_wdc_assistant_agent"
}

// Implement a default HandleEvent method, can be customized
func (a *personal_wdc_assistant_agent) HandleEvent(data map[string]interface{}) {
fmt.Println("[personal_wdc_assistant_agent] Handling event data:", data)
}
