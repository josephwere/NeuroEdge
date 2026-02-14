export type MeshMessageType =
  | "exec.request"
  | "exec.stream"
  | "exec.result"
  | "exec.proof"
  | "health"
  | "diagnostic";

export interface MeshMessage {
  id: string;
  fromNode: string;
  toNode: string;
  type: MeshMessageType;
  payload: any;
  signature: string;
  timestamp: number;
}
