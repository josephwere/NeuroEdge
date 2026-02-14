// frontend/src/extensions/extensionAPI.ts

/**
 * NeuroEdge Extension API
 * Provides safe, sandboxed access to app features for mini-modules
 * All functions are explicit and controlled
 */

import { OrchestratorClient } from "@/services/orchestrator_client";

export interface ExtensionContext {
  orchestrator: OrchestratorClient;
  notify: (message: string, type?: "info" | "error" | "success") => void;
  getUserProfile: () => { name: string; mode: string };
  requestPermission: (feature: string) => Promise<boolean>;
  registerCommand: (cmd: ExtensionCommand) => void;
}

export interface ExtensionCommand {
  id: string;
  label: string;
  action: () => void;
  shortcut?: string;
}

export interface ExtensionModule {
  id: string;
  name: string;
  description?: string;
  version: string;
  permissions?: string[]; // explicit permissions requested
  activate: (ctx: ExtensionContext) => void;
  deactivate?: () => void;
}
