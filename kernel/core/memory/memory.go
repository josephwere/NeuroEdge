package memory

import "sync"

type Memory struct {
    ShortTerm map[string]interface{}
    LongTerm  map[string]interface{}
    mu        sync.RWMutex
}

func NewMemory() *Memory {
    return &Memory{
        ShortTerm: make(map[string]interface{}),
        LongTerm:  make(map[string]interface{}),
    }
}

// Store short-term memory
func (m *Memory) SetShort(key string, value interface{}) {
    m.mu.Lock()
    defer m.mu.Unlock()
    m.ShortTerm[key] = value
}

// Retrieve short-term memory
func (m *Memory) GetShort(key string) interface{} {
    m.mu.RLock()
    defer m.mu.RUnlock()
    return m.ShortTerm[key]
}

// Store long-term memory
func (m *Memory) SetLong(key string, value interface{}) {
    m.mu.Lock()
    defer m.mu.Unlock()
    m.LongTerm[key] = value
}

// Retrieve long-term memory
func (m *Memory) GetLong(key string) interface{} {
    m.mu.RLock()
    defer m.mu.RUnlock()
    return m.LongTerm[key]
}
