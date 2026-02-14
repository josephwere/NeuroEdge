package negotiation

type Proposal struct {
	From   string
	To     string
	Offer  string
	Result string
}

func Negotiate(p Proposal) string {
	return "accepted"
}
