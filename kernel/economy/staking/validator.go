package staking

func IsTrusted(amount float64) bool {
	return amount >= 1000
}
