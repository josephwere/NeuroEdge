import { verifyMessage } from "@protocol/auth";
import { streamCommand } from "@floating/stream";

export class MeshNodeAgent {
  nodeId: string;

  constructor(nodeId: string) {
    this.nodeId = nodeId;
  }

  async handleMessage(msg: any) {
    if (!verifyMessage(msg)) return;

    if (msg.type === "exec.request") {
      await this.execute(msg.payload);
    }
  }

  private async execute(payload: any) {
    const proc = streamCommand(
      payload.command,
      payload.args || [],
      (chunk) => {
        // stream logs back
        payload.stream(chunk);
      }
    );

    return proc;
  }
          }
