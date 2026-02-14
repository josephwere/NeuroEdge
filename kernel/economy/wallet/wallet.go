package wallet

type Wallet struct {
	ID      string
	Balance float64
}

func NewWallet(id string) *Wallet {
	return &Wallet{
		ID:      id,
		Balance: 0,
	}
}

func (w *Wallet) Credit(amount float64) {
	w.Balance += amount
}

func (w *Wallet) Debit(amount float64) bool {
	if w.Balance < amount {
		return false
	}
	w.Balance -= amount
	return true
}
