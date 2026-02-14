//kernel/core/self_learning.go
package core

import (
	"fmt"
	"log"
	"sync"
	"time"

	"neuroedge/kernel/agents"
)

// ---- Interfaces (decoupled, testable) ----

// AgentProvider exposes agents for evaluation
type AgentProvider interface {
	GetAllAgents() []agents.Agent
}

// EngineProvider exposes engines for evaluation
type EngineProvider interface {
	GetAllEngines() []EngineInterface
}

// SelfLearningLoop manages continuous improvement for NeuroEdge
type SelfLearningLoop struct {
	interval time.Duration
	stopChan chan bool
	mu       sync.Mutex
	active   bool

	agents  AgentProvider
	engines EngineProvider
}

// NewSelfLearningLoop creates a new self-learning loop
func NewSelfLearningLoop(
	agentProvider AgentProvider,
	engineProvider EngineProvider,
	interval time.Duration,
) *SelfLearningLoop {
	return &SelfLearningLoop{
		interval: interval,
		stopChan: make(chan bool),
		active:   false,
		agents:   agentProvider,
		engines:  engineProvider,
	}
}

// Start begins the continuous self-learning loop
func (s *SelfLearningLoop) Start() {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.active {
		return
	}
	s.active = true

	fmt.Println("🤖 Self-Learning Loop Started")

	go func() {
		ticker := time.NewTicker(s.interval)
		defer ticker.Stop()

		for {
			select {
			case <-ticker.C:
				s.runIteration()
			case <-s.stopChan:
				fmt.Println("🛑 Self-Learning Loop Stopped")
				return
			}
		}
	}()
}

// Stop stops the self-learning loop
func (s *SelfLearningLoop) Stop() {
	s.mu.Lock()
	defer s.mu.Unlock()

	if !s.active {
		return
	}
	s.stopChan <- true
	s.active = false
}

// runIteration executes one learning cycle
func (s *SelfLearningLoop) runIteration() {
	fmt.Println("🔄 Self-Learning Iteration started")

	// 1️⃣ Evaluate agents
	for _, ag := range s.agents.GetAllAgents() {
		ok := ag.EvaluatePerformance()
		if !ok {
			log.Printf("⚠️ Agent %s requires improvement\n", ag.Name())
			ag.Learn()
		}
	}

	// 2️⃣ Iterate engines (no optimization contract enforced on current engine types)
	for _, eng := range s.engines.GetAllEngines() {
		log.Printf("ℹ️ Engine %s active\n", eng.Name())
	}

	// 3️⃣ Aggregate feedback
	s.aggregateFeedback()

	fmt.Println("✅ Self-Learning Iteration completed")
}

// aggregateFeedback collects metrics from mesh, users, and tasks
func (s *SelfLearningLoop) aggregateFeedback() {
	fmt.Println("📊 Aggregating feedback from agents, engines, and mesh nodes...")
}
