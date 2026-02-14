package events

import "sync"

type EventBus struct {
    subscribers map[string][]chan map[string]interface{}
    mu          sync.RWMutex
}

func NewEventBus() *EventBus {
    return &EventBus{
        subscribers: make(map[string][]chan map[string]interface{}),
    }
}

func (eb *EventBus) Subscribe(event string, ch chan map[string]interface{}) {
    eb.mu.Lock()
    defer eb.mu.Unlock()
    eb.subscribers[event] = append(eb.subscribers[event], ch)
}

func (eb *EventBus) Publish(event string, data map[string]interface{}) {
    eb.mu.RLock()
    defer eb.mu.RUnlock()
    for _, ch := range eb.subscribers[event] {
        select {
        case ch <- data:
        default:
        }
    }
}
