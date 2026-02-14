export class DevPipelineAgent {
  async buildPipeline(stack: string) {
    return [
      { cmd: "npm", args: ["init", "-y"] },
      { cmd: "npm", args: ["install", stack] },
      { cmd: "npm", args: ["test"] },
      { cmd: "npm", args: ["run", "build"] }
    ];
  }
}
