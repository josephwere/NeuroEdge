// frontend/src/extensions/examples/codeLinter.ts
import { ExtensionModule } from "@/extensions/extensionAPI";

const codeLinter: ExtensionModule = {
  id: "code-linter",
  name: "Code Linter",
  version: "1.0.0",
  description: "Lints code snippets and highlights errors.",
  permissions: ["orchestratorAccess"],

  activate: async (ctx) => {
    const hasPermission = await ctx.requestPermission("orchestratorAccess");
    if (!hasPermission) return;

    ctx.registerCommand({
      id: "lint-current-code",
      label: "Lint Current Code",
      action: () => {
        console.log("[CodeLinter] Linting code in current session...");
        ctx.notify("Lint completed!", "success");
      },
    });
  },
};

export default codeLinter;
