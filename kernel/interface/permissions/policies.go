package permissions

func CanExecute(role Role, action string) bool {
	if role == Admin {
		return true
	}
	return false
}
