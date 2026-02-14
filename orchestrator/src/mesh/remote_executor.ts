import { EventBus } from "@core/event_bus";
import { Logger } from "@utils/logger";
import { DevExecutionAgent } from "@agents/dev_execution_agent";
import { NodeRegistry } from "@mesh/node_registry";

export class RemoteExecutor {
  private eventBus: EventBus;
  private logger: Logger;
  private executor: DevExecutionAgent;
  private nodes: NodeRegistry

  constructor(eventBus: EventBus, logger: Logger, executor: DevExecutionAgent, nodes: NodeRegistry) {
    this.eventBus = eventBus;
    this.logger = logger;
    this.executor = executor;
    this.nodes = nodes;

    this.start();
  }

  start() {
    this.eventBus.subscribe("mesh:remote_execute", async ({ nodeId, command, args }) => {
      if (this.nodes.isLocal(nodeId)) {
        this.logger.info("RemoteExecutor", `Executing locally: ${command}`);
        await this.executor.handleExecution({ id: Date.now().toString(), command, args });
      } else {
        const remoteNode = this.nodes.getNode(nodeId);
        this.logger.info("RemoteExecutor", `Forwarding command to node ${nodeId}`);
        await remoteNode.sendCommand({ command, args, origin: "floating_chat" });
      }
    });
  }
}
