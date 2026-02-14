//kernel/economy/economy_manager.go
package economy

import (
	"neuroedge/kernel/economy/ledger"
	"neuroedge/kernel/economy/rewards"
	"neuroedge/kernel/economy/staking"
)

type EconomyManager struct {
	Ledger  *ledger.Ledger
	Rewards *rewards.RewardEngine
	Staking *staking.StakeManager
}

func NewEconomyManager() *EconomyManager {
	return &EconomyManager{
		Ledger:  ledger.NewLedger(),
		Rewards: rewards.NewRewardEngine(),
		Staking: staking.NewStakeManager(),
	}
}
