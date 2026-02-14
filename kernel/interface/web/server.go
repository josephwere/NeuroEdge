package web

import (
	"net/http"
)

func StartWebUI() {
	http.Handle("/", http.FileServer(http.Dir("./web/static")))
	http.ListenAndServe(":3000", nil)
}
