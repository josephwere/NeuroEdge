package permissions

func Enforce(role Role, action string) bool {
	return CanExecute(role, action)
}
