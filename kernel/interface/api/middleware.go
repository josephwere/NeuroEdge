package api

import "net/http"

func Logging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		println("API call:", r.URL.Path)
		next.ServeHTTP(w, r)
	})
}
