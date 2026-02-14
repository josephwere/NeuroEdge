export interface RemoteExecutionRequest {
  id: string;
  command: string;
  args?: string[];
  targetNode: string;
  capabilityToken: string; // issued by kernel
}
