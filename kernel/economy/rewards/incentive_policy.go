package rewards

type IncentivePolicy struct {
	Name        string
	Description string
	Multiplier  float64
}

func (p *IncentivePolicy) Apply(base float64) float64 {
	return base * p.Multiplier
}
