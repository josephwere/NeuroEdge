//kernel/api/main.go
package handlers

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

func main() {
	fmt.Println("🚀 Starting NeuroEdge Kernel API v1.0")

	router := NewRouter()

	server := &http.Server{
		Addr:         ":8080", // Can be parameterized
		Handler:      router,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Graceful shutdown
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		fmt.Println("🌐 Kernel API listening on port 8080")
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("❌ Kernel API ListenAndServe: %v", err)
		}
	}()

	<-stop
	fmt.Println("\n🛑 Shutdown signal received. Stopping Kernel API...")
	shutdownServer(server)
}

func shutdownServer(server *http.Server) {
	timeout := 5 * time.Second
	shutdownChan := make(chan struct{})
	go func() {
		if err := server.Close(); err != nil {
			log.Printf("⚠️ Error shutting down server: %v", err)
		}
		close(shutdownChan)
	}()

	select {
	case <-shutdownChan:
		fmt.Println("✅ Kernel API stopped gracefully")
	case <-time.After(timeout):
		fmt.Println("⚠️ Kernel API shutdown timed out")
	}
}
