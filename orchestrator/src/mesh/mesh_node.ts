import { exec } from "child_process";

export class MeshNode {
  id: string;
  address: string; // IP or hostname
  online: boolean;

  constructor(id: string, address: string) {
    this.id = id;
    this.address = address;
    this.online = true;
  }

  isActive(): boolean {
    return this.online;
  }

  // Execute command locally or via remote connection (SSH, API)
  execute(command: string, args: string[] = []): Promise<{ success: boolean, stdout?: string, stderr?: string }> {
    return new Promise((resolve) => {
      // Placeholder: For remote node, implement SSH / API call
      const fullCommand = `${command} ${args.join(" ")}`;
      exec(fullCommand, (error, stdout, stderr) => {
        if (error) {
          resolve({ success: false, stderr });
        } else {
          resolve({ success: true, stdout });
        }
      });
    });
  }
}
