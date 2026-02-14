package ethics

func Allowed(action string) bool {
	for _, banned := range []string{
		"mass_surveillance",
		"weaponization",
		"identity_forgery",
	} {
		if action == banned {
			return false
		}
	}
	return true
}
