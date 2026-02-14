// mesh/message_protocol.ts
export interface MeshMessage {
  type: "command" | "result" | "status";
  nodeId: string;
  payload: any;
  timestamp: number;
}
