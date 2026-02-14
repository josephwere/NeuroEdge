import crypto from "crypto";
import { CapabilityToken } from "@security/capability";

export class KernelVerifier {
  constructor(private publicKey: string) {}

  verify(token: CapabilityToken): boolean {
    if (Date.now() > token.expiresAt) return false;

    const payload = JSON.stringify({
      tokenId: token.tokenId,
      issuedAt: token.issuedAt,
      expiresAt: token.expiresAt,
      scope: token.scope
    });

    const verifier = crypto.createVerify("SHA256");
    verifier.update(payload);

    return verifier.verify(this.publicKey, token.signature, "base64");
  }
}
