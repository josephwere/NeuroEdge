export interface ExecutionRequest {
  id: string;
  command: string;
  args?: string[];
  cwd?: string;
}

export interface ExecutionResult {
  id: string;
  success: boolean;
  stdout: string;
  stderr: string;
}
