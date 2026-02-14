import { CapabilityToken } from "@security/capability";

/**
 * SecureExecutionRequest
 * ----------------------
 * Kernel-authorized execution request.
 * MUST include a valid capability token.
 */
export type SecureExecutionRequest = {
  id: string;
  command: string;
  args?: string[];
  cwd?: string;
  capability: CapabilityToken;
};
