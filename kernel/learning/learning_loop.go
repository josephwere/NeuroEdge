package learning

import "fmt"

type LearningLoop struct {
	Evaluator *Evaluator
	Optimizer *Optimizer
}

func NewLearningLoop() *LearningLoop {
	return &LearningLoop{
		Evaluator: NewEvaluator(),
		Optimizer: NewOptimizer(),
	}
}

func (l *LearningLoop) Process(event string, outcome string) {
	score := l.Evaluator.Evaluate(event, outcome)
	l.Optimizer.Adjust(score)
	fmt.Println("Learning loop updated with score:", score)
}
