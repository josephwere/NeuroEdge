package staking

type Stake struct {
	Owner  string
	Amount float64
}

type StakeManager struct {
	Stakes []Stake
}

func NewStakeManager() *StakeManager {
	return &StakeManager{}
}

func (s *StakeManager) Stake(owner string, amount float64) {
	s.Stakes = append(s.Stakes, Stake{owner, amount})
}
