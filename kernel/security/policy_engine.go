package security

type PolicyEngine struct {
	rules map[string]func(actor string) bool
}

func NewPolicyEngine() *PolicyEngine {
	return &PolicyEngine{
		rules: make(map[string]func(string) bool),
	}
}

func (p *PolicyEngine) RegisterRule(name string, rule func(string) bool) {
	p.rules[name] = rule
}

func (p *PolicyEngine) Evaluate(name string, actor string) bool {
	if rule, ok := p.rules[name]; ok {
		return rule(actor)
	}
	return false
}
