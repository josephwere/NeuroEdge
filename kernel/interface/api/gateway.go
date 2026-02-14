package api

import (
	"net/http"
)

func StartAPIServer() {
	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("NeuroEdge OK"))
	})

	http.ListenAndServe(":8080", nil)
}
