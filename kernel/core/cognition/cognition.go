package cognition

import (
	"fmt"
	"strings"
)

type Cognition struct {
	denyPatterns []string
}

func NewCognition() *Cognition {
	return &Cognition{
		denyPatterns: []string{
			"disable auth",
			"bypass safety",
			"drop database",
			"wipe",
		},
	}
}

func (c *Cognition) Decide(task string, context map[string]interface{}) string {
	fmt.Printf("🤖 Cognition deciding for task: %s\n", task)
	normalized := strings.ToLower(strings.TrimSpace(task))
	if normalized == "" {
		return "review_required"
	}
	for _, p := range c.denyPatterns {
		if strings.Contains(normalized, p) {
			return "rejected"
		}
	}
	if context != nil {
		if critical, ok := context["requires_human_approval"].(bool); ok && critical {
			return "review_required"
		}
		if risk, ok := context["risk_level"].(string); ok && strings.EqualFold(risk, "high") {
			return "review_required"
		}
	}
	return "approved"
}
