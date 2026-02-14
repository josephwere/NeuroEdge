import { EventBus } from "@core/event_bus";
import { Logger } from "@utils/logger";
import axios from "axios";
import { RemoteExecutor } from "@mesh/remote_executor";

export class MLMeshFloatingChatAgent {
  private eventBus: EventBus;
  private logger: Logger;
  private remoteExecutor: RemoteExecutor;
  private mlServerUrl: string;

  constructor(eventBus: EventBus, logger: Logger, remoteExecutor: RemoteExecutor, mlServerUrl: string) {
    this.eventBus = eventBus;
    this.logger = logger;
    this.remoteExecutor = remoteExecutor;
    this.mlServerUrl = mlServerUrl;

    this.start();
  }

  start() {
    this.eventBus.subscribe("floating_chat:analyze", async (input: string) => {
      try {
        // ML predicts the best command/fix
        const response = await axios.post(`${this.mlServerUrl}/predict`, { text: input });
        const recommendedCommand = response.data.action;
        this.logger.info("MLMeshFloatingChatAgent", `ML recommends: ${recommendedCommand}`);

        // Emit recommendation for Floating Chat UI
        this.eventBus.emit("floating_chat:recommendation", recommendedCommand);

        // Execute across mesh nodes
        const nodes = ["local", "node2"]; // Example, could dynamically come from NodeRegistry
        for (const nodeId of nodes) {
          await this.remoteExecutor["eventBus"].emit("mesh:remote_execute", { nodeId, command: recommendedCommand });
        }
      } catch (err) {
        this.logger.error("MLMeshFloatingChatAgent", `ML prediction failed: ${err}`);
      }
    });
  }
    }
