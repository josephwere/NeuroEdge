package ethics

import "fmt"

func Enforce(action string) bool {
	if !Allowed(action) {
		fmt.Println("❌ Ethics violation:", action)
		return false
	}
	return true
}
