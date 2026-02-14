//kernel/economy/ledger/ledger.go
package ledger

import "neuroedge/kernel/economy/wallet"

type Ledger struct {
	Transactions []wallet.Transaction
}

func NewLedger() *Ledger {
	return &Ledger{Transactions: []wallet.Transaction{}}
}

func (l *Ledger) Record(tx wallet.Transaction) {
	l.Transactions = append(l.Transactions, tx)
}
