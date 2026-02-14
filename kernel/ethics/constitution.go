package ethics

type Constitution struct {
	Rules []string
}

func LoadConstitution() *Constitution {
	return &Constitution{
		Rules: []string{
			"Preserve human autonomy",
			"Do not cause harm",
			"Obey lawful authority",
			"Protect user privacy",
			"Remain auditable and transparent",
		},
	}
}
