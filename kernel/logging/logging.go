package logging

import "log"

func InitLogger() {
	log.SetFlags(log.LstdFlags | log.Lshortfile)
}

func Info(msg string) {
	log.Println("[INFO]", msg)
}

func Warn(msg string) {
	log.Println("[WARN]", msg)
}

func Error(msg string) {
	log.Println("[ERROR]", msg)
}
