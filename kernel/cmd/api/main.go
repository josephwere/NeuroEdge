//kernel/cmd/api/main.go
package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	handlers "neuroedge/kernel/api"
)

func main() {
	apiKey := strings.TrimSpace(os.Getenv("NEUROEDGE_API_KEY"))
	if apiKey == "" {
		log.Fatal("NEUROEDGE_API_KEY is required")
	}

	port := strings.TrimSpace(os.Getenv("PORT"))
	if port == "" {
		port = "8080"
	}
	addr := ":" + port

	readTimeout := readSecondsEnv("HTTP_READ_TIMEOUT_SEC", 10)
	writeTimeout := readSecondsEnv("HTTP_WRITE_TIMEOUT_SEC", 10)
	idleTimeout := readSecondsEnv("HTTP_IDLE_TIMEOUT_SEC", 60)
	shutdownTimeout := readSecondsEnv("HTTP_SHUTDOWN_TIMEOUT_SEC", 5)

	fmt.Printf("Starting NeuroEdge API on %s\n", addr)

	router := handlers.NewRouter()

	server := &http.Server{
		Addr:         addr,
		Handler:      router,
		ReadTimeout:  readTimeout,
		WriteTimeout: writeTimeout,
		IdleTimeout:  idleTimeout,
	}

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("API server error: %v", err)
		}
	}()

	<-stop
	fmt.Println("Shutting down API...")

	ctx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		log.Printf("shutdown error: %v", err)
	}

	fmt.Println("API stopped")
}

func readSecondsEnv(key string, fallback int) time.Duration {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return time.Duration(fallback) * time.Second
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n <= 0 {
		return time.Duration(fallback) * time.Second
	}
	return time.Duration(n) * time.Second
}
