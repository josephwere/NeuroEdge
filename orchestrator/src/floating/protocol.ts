export type FloatingMessageType =
  | "intent"
  | "diff"
  | "log"
  | "warning"
  | "approval"
  | "result";

export interface FloatingMessage {
  sessionId: string;
  type: FloatingMessageType;
  payload: any;
  stream?: boolean;
}
