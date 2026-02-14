export type CapabilityToken = {
  tokenId: string;
  issuedBy: "kernel";
  issuedAt: number;
  expiresAt: number;
  scope: {
    execution: boolean;
    filesystem?: boolean;
    network?: boolean;
  };
  signature: string;
};
