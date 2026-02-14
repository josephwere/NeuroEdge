export interface SovereigntyPolicy {
  city: string;
  allowOutboundExec: boolean;
  allowInboundExec: boolean;
}

export function checkSovereignty(
  policy: SovereigntyPolicy,
  direction: "in" | "out"
): boolean {
  return direction === "in"
    ? policy.allowInboundExec
    : policy.allowOutboundExec;
}
