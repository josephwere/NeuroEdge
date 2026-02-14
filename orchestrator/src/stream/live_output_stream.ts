import { spawn } from "child_process";

export function streamCommand(
  command: string,
  args: string[],
  onData: (data: string) => void,
  onEnd: () => void
) {
  const proc = spawn(command, args);

  proc.stdout.on("data", d => onData(d.toString()));
  proc.stderr.on("data", d => onData(d.toString()));

  proc.on("close", () => onEnd());
}
