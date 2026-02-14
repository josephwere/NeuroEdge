package metrics

type Performance struct {
	AgentID string
	Score   float64
}

type Tracker struct {
	Data []Performance
}

func (t *Tracker) Record(agent string, score float64) {
	t.Data = append(t.Data, Performance{agent, score})
}
