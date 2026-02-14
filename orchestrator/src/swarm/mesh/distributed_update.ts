export function distributeUpdate(proposal: any, nodes: any[]) {
  nodes.forEach(node => {
    console.log(`🚀 Deploying proposal ${proposal.id} to node ${node.nodeId}`);
    // Placeholder: send over secure mesh channel
  });
}
