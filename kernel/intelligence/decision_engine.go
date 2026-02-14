package intelligence

type DecisionEngine struct{}

func NewDecisionEngine() *DecisionEngine {
	return &DecisionEngine{}
}

func (d *DecisionEngine) Decide(options []string) string {
	if len(options) == 0 {
		return "No decision"
	}
	return options[0] // deterministic for now
}
