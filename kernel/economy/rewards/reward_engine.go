//kernel/economy/rewards/reward_engine.go
package rewards

import "neuroedge/kernel/economy/wallet"

type RewardEngine struct{}

func NewRewardEngine() *RewardEngine {
	return &RewardEngine{}
}

func (r *RewardEngine) Reward(w *wallet.Wallet, amount float64) {
	w.Credit(amount)
}
