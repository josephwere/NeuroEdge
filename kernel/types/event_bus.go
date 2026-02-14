// kernel/types/event_bus.go
package types

import (
	"fmt"
	"sync"
)

// Event represents a single message or event in the system
type Event struct {
	Name   string
	Data   interface{}
	Source string
}

// Subscriber function type
type Subscriber func(Event)

// EventBus handles message passing between agents & core
type EventBus struct {
	subscribers map[string][]Subscriber
	mu          sync.RWMutex
}

// NewEventBus creates a new event bus
func NewEventBus() *EventBus {
	return &EventBus{
		subscribers: make(map[string][]Subscriber),
	}
}

// Subscribe adds a new subscriber to an event
func (eb *EventBus) Subscribe(eventName string, subscriber Subscriber) {
	eb.mu.Lock()
	defer eb.mu.Unlock()

	eb.subscribers[eventName] = append(eb.subscribers[eventName], subscriber)
	fmt.Println("[EventBus] Subscriber added to:", eventName)
}

// Publish sends an event to all subscribers
func (eb *EventBus) Publish(event Event) {
	eb.mu.RLock()
	defer eb.mu.RUnlock()

	if subs, ok := eb.subscribers[event.Name]; ok {
		for _, sub := range subs {
			go sub(event) // async delivery
		}
	}

	fmt.Printf("[EventBus] Event published: %s from %s\n", event.Name, event.Source)
}
