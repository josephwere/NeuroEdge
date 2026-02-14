export interface CapabilityToken {
  token: string;       // random or signed string
  issuedBy: string;    // kernel
  validUntil: Date;    // expiry
  permissions: string[]; // allowed commands
}

// Simple capability validator
export class CapabilityManager {
  private tokens = new Map<string, CapabilityToken>();

  issue(token: CapabilityToken) {
    this.tokens.set(token.token, token);
  }

  validate(token: string, command: string): boolean {
    const cap = this.tokens.get(token);
    if (!cap) return false;
    if (cap.validUntil < new Date()) return false;
    return cap.permissions.includes(command);
  }
}
