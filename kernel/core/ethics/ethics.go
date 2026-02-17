package ethics

import (
	"fmt"
	"os"
	"strings"
)

type Ethics struct {
	denyPatterns []string
}

func NewEthics() *Ethics {
	raw := os.Getenv("NEUROEDGE_ETHICS_DENY_PATTERNS")
	patterns := []string{
		"rm -rf",
		"format disk",
		"drop database",
		"disable auth",
		"bypass safety",
	}
	if strings.TrimSpace(raw) != "" {
		custom := []string{}
		for _, p := range strings.Split(raw, ",") {
			trimmed := strings.ToLower(strings.TrimSpace(p))
			if trimmed != "" {
				custom = append(custom, trimmed)
			}
		}
		if len(custom) > 0 {
			patterns = custom
		}
	}
	return &Ethics{denyPatterns: patterns}
}

func (e *Ethics) Evaluate(action string) bool {
	fmt.Printf("⚖️ Evaluating ethics for action: %s\n", action)
	candidate := strings.ToLower(strings.TrimSpace(action))
	if candidate == "" {
		return false
	}
	for _, p := range e.denyPatterns {
		if strings.Contains(candidate, p) {
			return false
		}
	}
	return true
}
