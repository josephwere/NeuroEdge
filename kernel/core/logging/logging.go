package core

import (
	"fmt"
	"log"
	"os"
	"time"
)

// LogLevel represents the severity of a log message
type LogLevel int

const (
	DEBUG LogLevel = iota
	INFO
	WARN
	ERROR
	FATAL
)

// Logger defines the main logging system
type Logger struct {
	level      LogLevel
	fileHandle *os.File
}

// NewLogger creates a new Logger instance
func NewLogger(level LogLevel, logFilePath string) *Logger {
	var file *os.File
	var err error

	if logFilePath != "" {
		file, err = os.OpenFile(logFilePath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
		if err != nil {
			log.Fatalf("❌ Failed to open log file: %v", err)
		}
	}

	return &Logger{
		level:      level,
		fileHandle: file,
	}
}

// logMessage outputs a structured log
func (l *Logger) logMessage(level LogLevel, component, msg string) {
	if level < l.level {
		return
	}

	levelStr := map[LogLevel]string{
		DEBUG: "DEBUG",
		INFO:  "INFO",
		WARN:  "WARN",
		ERROR: "ERROR",
		FATAL: "FATAL",
	}[level]

	timestamp := time.Now().Format(time.RFC3339)
	logLine := fmt.Sprintf("[%s] [%s] [%s] %s\n", timestamp, levelStr, component, msg)

	// Print to console
	fmt.Print(logLine)

	// Print to file if enabled
	if l.fileHandle != nil {
		_, err := l.fileHandle.WriteString(logLine)
		if err != nil {
			fmt.Printf("⚠️ Failed to write log to file: %v\n", err)
		}
	}

	// Optional: push to remote telemetry here (future hook)
}

// Debug logs a debug message
func (l *Logger) Debug(component, msg string) {
	l.logMessage(DEBUG, component, msg)
}

// Info logs an info message
func (l *Logger) Info(component, msg string) {
	l.logMessage(INFO, component, msg)
}

// Warn logs a warning
func (l *Logger) Warn(component, msg string) {
	l.logMessage(WARN, component, msg)
}

// Error logs an error
func (l *Logger) Error(component, msg string) {
	l.logMessage(ERROR, component, msg)
}

// Fatal logs a fatal error and exits
func (l *Logger) Fatal(component, msg string) {
	l.logMessage(FATAL, component, msg)
	os.Exit(1)
}

// Close closes any resources used by the logger
func (l *Logger) Close() {
	if l.fileHandle != nil {
		l.fileHandle.Close()
	}
}
