package intelligence

type ContextManager struct {
	context map[string]interface{}
}

func NewContextManager() *ContextManager {
	return &ContextManager{
		context: make(map[string]interface{}),
	}
}

func (c *ContextManager) Set(key string, value interface{}) {
	c.context[key] = value
}

func (c *ContextManager) Get(key string) interface{} {
	return c.context[key]
}
