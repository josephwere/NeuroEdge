package agents

import (
"fmt"
"neuroedge/kernel/types"
)

type manager struct {
EventBus *types.EventBus
}

func Newmanager(bus *types.EventBus) *manager {
return &manager{
EventBus: bus,
}
}

func (a *manager) Start() {
fmt.Println("?? manager started")

// Inline subscription using type assertion
a.EventBus.Subscribe("manager:update", func(event types.Event) {
fmt.Println("[manager] Event received:", event.Data)
a.HandleEvent(event.Data.(map[string]interface{}))
})
}

func (a *manager) Stop() {
fmt.Println("?? manager stopped")
}

func (a *manager) Name() string {
return "manager"
}

// Implement a default HandleEvent method, can be customized
func (a *manager) HandleEvent(data map[string]interface{}) {
fmt.Println("[manager] Handling event data:", data)
}
