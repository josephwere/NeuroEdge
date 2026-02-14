import crypto from "crypto";

export function generateExecutionProof(
  nodeId: string,
  command: string,
  output: string
) {
  return crypto
    .createHash("sha256")
    .update(nodeId + command + output)
    .digest("hex");
}
