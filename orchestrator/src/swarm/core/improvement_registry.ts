export class ImprovementRegistry {
  private approved: any[] = [];

  register(proposal: any) {
    this.approved.push({ ...proposal, timestamp: Date.now() });
  }

  list() {
    return this.approved;
  }

  rollback(proposalId: string) {
    this.approved = this.approved.filter(p => p.id !== proposalId);
    console.log(`↩️ Proposal rolled back: ${proposalId}`);
  }
}
