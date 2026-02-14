// frontend/src/services/syncManager.ts
import { getQueue, clearQueue, enqueueCommand, OfflineCommand } from "./offlineQueue";
import { OrchestratorClient } from "@/services/orchestrator_client";

class SyncManager {
  private orchestrator: OrchestratorClient;
  private online: boolean = navigator.onLine;

  constructor(orchestrator: OrchestratorClient) {
    this.orchestrator = orchestrator;

    window.addEventListener("online", () => this.handleOnline());
    window.addEventListener("offline", () => this.handleOffline());
  }

  isOnline() {
    return this.online;
  }

  private handleOnline() {
    console.log("✅ NeuroEdge is back online. Syncing queued commands...");
    this.online = true;
    this.flushQueue();
  }

  private handleOffline() {
    console.log("⚠️ NeuroEdge is offline.");
    this.online = false;
  }

  /**
   * Replay all queued commands
   */
  flushQueue() {
    const queue = getQueue();
    queue.forEach(cmd => {
      try {
        // Send to orchestrator or chat handler
        this.orchestrator.sendCommand(cmd);
      } catch (err) {
        console.error("Failed to sync command:", cmd, err);
      }
    });
    clearQueue();
  }

  /**
   * Add command to queue if offline, or send immediately
   */
  sendCommand(cmd: OfflineCommand) {
    if (this.online) {
      this.orchestrator.sendCommand(cmd);
    } else {
      enqueueCommand(cmd);
    }
  }
}

export default SyncManager;
