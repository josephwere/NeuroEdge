package security

type AuthGuard struct {
	Trust *TrustEngine
	MinTrust int
}

func NewAuthGuard(trust *TrustEngine, minTrust int) *AuthGuard {
	return &AuthGuard{
		Trust: trust,
		MinTrust: minTrust,
	}
}

func (a *AuthGuard) CanExecute(actorID string) bool {
	return a.Trust.GetTrust(actorID) >= a.MinTrust
}
