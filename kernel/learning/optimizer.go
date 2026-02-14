package learning

type Optimizer struct {
	Weight float64
}

func NewOptimizer() *Optimizer {
	return &Optimizer{Weight: 1.0}
}

func (o *Optimizer) Adjust(score float64) {
	o.Weight = (o.Weight + score) / 2
}
