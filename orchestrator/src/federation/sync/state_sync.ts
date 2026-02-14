export function syncFederationState(local: any, remote: any) {
  return {
    nodes: [...new Set([...local.nodes, ...remote.nodes])],
    health: Math.min(local.health, remote.health)
  };
}
