import { spawn } from "child_process";

export function streamCommand(
  cmd: string,
  args: string[],
  onData: (chunk: string) => void
) {
  const proc = spawn(cmd, args);

  proc.stdout.on("data", d => onData(d.toString()));
  proc.stderr.on("data", d => onData(d.toString()));

  return proc;
}
