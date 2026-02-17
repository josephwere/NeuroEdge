import { Request, Response } from "express";

interface BrainstormItem {
  title: string;
  what: string;
  impact: "low" | "medium" | "high";
  effort: "low" | "medium" | "high";
  firstStep: string;
}

function normalizeTopic(input: string): string {
  return String(input || "").trim() || "new product idea";
}

function inferContextTags(topic: string): string[] {
  const lower = topic.toLowerCase();
  const tags: string[] = [];
  if (/\b(ai|agent|ml|model|inference)\b/.test(lower)) tags.push("ai");
  if (/\b(dev|developer|coding|code|bug|repo)\b/.test(lower)) tags.push("dev");
  if (/\b(growth|marketing|user|retention)\b/.test(lower)) tags.push("growth");
  if (/\b(billing|pricing|revenue|enterprise)\b/.test(lower)) tags.push("business");
  if (/\b(security|compliance|risk)\b/.test(lower)) tags.push("security");
  return tags;
}

function buildIdeas(topic: string): BrainstormItem[] {
  const tags = inferContextTags(topic);
  const isAi = tags.includes("ai");
  const isDev = tags.includes("dev");
  const isGrowth = tags.includes("growth");

  const ideas: BrainstormItem[] = [
    {
      title: "Define Outcome + Constraints",
      what: `Write one clear target outcome for "${topic}" with success metrics and non-negotiable constraints.`,
      impact: "high",
      effort: "low",
      firstStep: "Create a 1-page brief with KPI, deadline, and guardrails.",
    },
    {
      title: "Fast Prototype Sprint",
      what: "Build the smallest working prototype that proves value in 48 hours.",
      impact: "high",
      effort: "medium",
      firstStep: "Pick one user flow and ship a clickable or executable vertical slice.",
    },
    {
      title: "Risk Kill List",
      what: "List top 5 failure modes early and attach concrete mitigation steps.",
      impact: "high",
      effort: "medium",
      firstStep: "Create a risk board with owner + due date for each risk.",
    },
  ];

  if (isAi) {
    ideas.push({
      title: "Model + Tool Routing Matrix",
      what: "Route requests by intent (chat, code, research, math) to specialized model/tool paths.",
      impact: "high",
      effort: "medium",
      firstStep: "Define routing rules and test on 20 real prompts.",
    });
  }

  if (isDev) {
    ideas.push({
      title: "Developer Autopilot Commands",
      what: "Package recurring engineering tasks (install, test, lint, build, git status) into safe one-click actions.",
      impact: "high",
      effort: "medium",
      firstStep: "Track top 10 repeated commands from team workflow.",
    });
  }

  if (isGrowth) {
    ideas.push({
      title: "Acquisition Feedback Loop",
      what: "Connect onboarding analytics to weekly product iteration decisions.",
      impact: "high",
      effort: "medium",
      firstStep: "Set dashboard for signup->activation dropoff and weekly experiments.",
    });
  }

  return ideas.slice(0, 6);
}

export function handleBrainstorm(req: Request, res: Response) {
  const topic = normalizeTopic(req.body?.topic || req.body?.input || req.body?.query || "");
  const perspective = String(req.body?.perspective || "founder");
  const ideas = buildIdeas(topic);

  const response = {
    success: true,
    topic,
    perspective,
    summary: `Generated ${ideas.length} strategic ideas for "${topic}". Prioritize high-impact, low/medium effort items first.`,
    ideas,
    nextActions: [
      "Choose top 2 ideas by impact/effort ratio",
      "Assign owners and 48h deadlines",
      "Review execution evidence and iterate",
    ],
    timestamp: new Date().toISOString(),
  };

  return res.json(response);
}

