package ledger

type Block struct {
	Index        int
	Transactions []string
	Hash         string
	PrevHash     string
}
