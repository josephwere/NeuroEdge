package intelligence

type TaskPlanner struct{}

func NewTaskPlanner() *TaskPlanner {
	return &TaskPlanner{}
}

func (t *TaskPlanner) Plan(goal string) []string {
	return []string{
		"Analyze goal: " + goal,
		"Break into steps",
		"Assign to agents",
		"Monitor execution",
	}
}
