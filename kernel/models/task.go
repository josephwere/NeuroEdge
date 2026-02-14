package models

type Task struct {
    ID      string
    Name    string
    Payload map[string]interface{}
}
