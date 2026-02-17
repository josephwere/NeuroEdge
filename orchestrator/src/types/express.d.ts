import "express";

declare global {
  namespace Express {
    interface Request {
      auth?: {
        sub: string;
        orgId?: string;
        workspaceId?: string;
        deviceId?: string;
        scopes: string[];
        raw?: Record<string, any>;
      };
    }
  }
}

export {};
