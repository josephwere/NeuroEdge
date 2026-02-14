package agents

import (
"fmt"
"neuroedge/kernel/types"
)

type wdc_trader_agent struct {
EventBus *types.EventBus
}

func Newwdc_trader_agent(bus *types.EventBus) *wdc_trader_agent {
return &wdc_trader_agent{
EventBus: bus,
}
}

func (a *wdc_trader_agent) Start() {
fmt.Println("?? wdc_trader_agent started")

// Inline subscription using type assertion
a.EventBus.Subscribe("wdc_trader_agent:update", func(event types.Event) {
fmt.Println("[wdc_trader_agent] Event received:", event.Data)
a.HandleEvent(event.Data.(map[string]interface{}))
})
}

func (a *wdc_trader_agent) Stop() {
fmt.Println("?? wdc_trader_agent stopped")
}

func (a *wdc_trader_agent) Name() string {
return "wdc_trader_agent"
}

// Implement a default HandleEvent method, can be customized
func (a *wdc_trader_agent) HandleEvent(data map[string]interface{}) {
fmt.Println("[wdc_trader_agent] Handling event data:", data)
}
