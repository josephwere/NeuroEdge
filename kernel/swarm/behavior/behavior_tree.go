package behavior

type BehaviorNode struct {
	Name     string
	Children []*BehaviorNode
	Action   func() bool
}

func (b *BehaviorNode) Execute() bool {
	for _, child := range b.Children {
		if !child.Execute() {
			return false
		}
	}
	return true
}
