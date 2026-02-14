package governance

import "fmt"

type Oversight struct {
	Enabled bool
}

func (o *Oversight) Review(action string) bool {
	fmt.Println("Reviewing action:", action)
	return true
}
