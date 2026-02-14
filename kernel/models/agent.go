package models

type Agent interface {
    Start()
    Stop()
    Name() string
}
