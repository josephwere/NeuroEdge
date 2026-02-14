package intelligence

type LearningEngine struct {
	memory map[string]string
}

func NewLearningEngine() *LearningEngine {
	return &LearningEngine{
		memory: make(map[string]string),
	}
}

func (l *LearningEngine) Learn(key, value string) {
	l.memory[key] = value
}

func (l *LearningEngine) Recall(key string) string {
	return l.memory[key]
}
