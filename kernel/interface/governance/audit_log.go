package governance

import "time"

type AuditLog struct {
	Time   time.Time
	Action string
	User   string
}

var Logs []AuditLog

func Record(action, user string) {
	Logs = append(Logs, AuditLog{time.Now(), action, user})
}
