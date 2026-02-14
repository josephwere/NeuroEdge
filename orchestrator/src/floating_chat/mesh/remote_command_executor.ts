// floating_chat/mesh/remote_command_executor.ts
import { EventBus } from "@core/event_bus";

export class RemoteCommandExecutor {
  constructor(private eventBus: EventBus) {}

  executeOnNodes(command: string, nodes: string[]) {
    nodes.forEach((node) => {
      console.log(`Executing "${command}" on node ${node}`);
      this.eventBus.emit("mesh:command", { node, command });
    });
  }
}
