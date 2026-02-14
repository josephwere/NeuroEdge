package evolution

type EvolutionEngine struct {
	Generation int
}

func NewEvolutionEngine() *EvolutionEngine {
	return &EvolutionEngine{Generation: 1}
}

func (e *EvolutionEngine) Evolve() {
	e.Generation++
}
