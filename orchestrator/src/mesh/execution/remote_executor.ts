import { routeTask } from "@routing/task_router";

export async function executeRemote(
  nodeId: string,
  command: string,
  args: string[]
) {
  return routeTask(nodeId, {
    command,
    args,
    timestamp: Date.now()
  });
}
