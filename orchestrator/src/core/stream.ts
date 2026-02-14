export interface StreamChunk {
  executionId: string;
  source: "stdout" | "stderr" | "system";
  data: string;
  timestamp: number;
}

export interface StreamController {
  start(executionId: string): void;
  push(chunk: StreamChunk): void;
  stop(executionId: string): void;
}
