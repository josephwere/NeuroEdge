package learning

type Evaluator struct{}

func NewEvaluator() *Evaluator {
	return &Evaluator{}
}

func (e *Evaluator) Evaluate(event, outcome string) float64 {
	if outcome == "success" {
		return 1.0
	}
	return 0.2
}
