package core

import (
	"fmt"
	"time"
)

type Logger struct {
	module string
}

func NewLogger(module string) *Logger {
	return &Logger{module: module}
}

func (l *Logger) Log(msg string) {
	fmt.Printf("[%s] %s: %s\n", time.Now().Format("2006-01-02 15:04:05"), l.module, msg)
}

func (l *Logger) Error(msg string) {
	fmt.Printf("[%s] %s [ERROR]: %s\n", time.Now().Format("2006-01-02 15:04:05"), l.module, msg)
}
