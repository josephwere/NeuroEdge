import { executeRemote } from "@mesh/execution/remote_executor";
import { selectBestCity } from "@routing/city_router";

export async function executeFederated(
  registry: any,
  command: string,
  args: string[]
) {
  const target = selectBestCity(registry, "exec");

  if (!target) {
    throw new Error("No suitable city found");
  }

  return executeRemote(target.nodeId, command, args);
}
