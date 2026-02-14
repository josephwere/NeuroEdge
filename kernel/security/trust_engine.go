package security

import "sync"

type TrustEngine struct {
	scores map[string]int
	mu     sync.RWMutex
}

func NewTrustEngine() *TrustEngine {
	return &TrustEngine{
		scores: make(map[string]int),
	}
}

func (t *TrustEngine) SetTrust(id string, score int) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.scores[id] = score
}

func (t *TrustEngine) GetTrust(id string) int {
	t.mu.RLock()
	defer t.mu.RUnlock()
	return t.scores[id]
}
