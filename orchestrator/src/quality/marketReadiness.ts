import { readState, writeState } from "@storage/hybrid_db";

export type HybridRoutingMode = "mesh_first" | "local_first" | "balanced";

export interface MarketReadinessConfig {
  verifiedAnswerMode: boolean;
  trustUxByDefault: boolean;
  hybridRoutingMode: HybridRoutingMode;
  hitlRiskyActions: boolean;
  reliabilityGuardrails: boolean;
  benchmarkReleaseGates: boolean;
  domainPackStrictness: "standard" | "strict";
  deepResearchEnabled: boolean;
  connectorsEnabled: boolean;
  artifactsWorkspaceEnabled: boolean;
  updatedAt: number;
}

const DEFAULT_CONFIG: MarketReadinessConfig = {
  verifiedAnswerMode: true,
  trustUxByDefault: true,
  hybridRoutingMode: "balanced",
  hitlRiskyActions: true,
  reliabilityGuardrails: true,
  benchmarkReleaseGates: true,
  domainPackStrictness: "strict",
  deepResearchEnabled: true,
  connectorsEnabled: true,
  artifactsWorkspaceEnabled: true,
  updatedAt: Date.now(),
};

function normalize(raw: Partial<MarketReadinessConfig> | null | undefined): MarketReadinessConfig {
  const next = raw || {};
  const mode =
    next.hybridRoutingMode === "mesh_first" ||
    next.hybridRoutingMode === "local_first" ||
    next.hybridRoutingMode === "balanced"
      ? next.hybridRoutingMode
      : DEFAULT_CONFIG.hybridRoutingMode;
  const strictness =
    next.domainPackStrictness === "strict" || next.domainPackStrictness === "standard"
      ? next.domainPackStrictness
      : DEFAULT_CONFIG.domainPackStrictness;
  return {
    verifiedAnswerMode:
      typeof next.verifiedAnswerMode === "boolean"
        ? next.verifiedAnswerMode
        : DEFAULT_CONFIG.verifiedAnswerMode,
    trustUxByDefault:
      typeof next.trustUxByDefault === "boolean" ? next.trustUxByDefault : DEFAULT_CONFIG.trustUxByDefault,
    hybridRoutingMode: mode,
    hitlRiskyActions:
      typeof next.hitlRiskyActions === "boolean" ? next.hitlRiskyActions : DEFAULT_CONFIG.hitlRiskyActions,
    reliabilityGuardrails:
      typeof next.reliabilityGuardrails === "boolean"
        ? next.reliabilityGuardrails
        : DEFAULT_CONFIG.reliabilityGuardrails,
    benchmarkReleaseGates:
      typeof next.benchmarkReleaseGates === "boolean"
        ? next.benchmarkReleaseGates
        : DEFAULT_CONFIG.benchmarkReleaseGates,
    domainPackStrictness: strictness,
    deepResearchEnabled:
      typeof next.deepResearchEnabled === "boolean" ? next.deepResearchEnabled : DEFAULT_CONFIG.deepResearchEnabled,
    connectorsEnabled:
      typeof next.connectorsEnabled === "boolean" ? next.connectorsEnabled : DEFAULT_CONFIG.connectorsEnabled,
    artifactsWorkspaceEnabled:
      typeof next.artifactsWorkspaceEnabled === "boolean"
        ? next.artifactsWorkspaceEnabled
        : DEFAULT_CONFIG.artifactsWorkspaceEnabled,
    updatedAt: Number(next.updatedAt || Date.now()),
  };
}

export function getMarketReadinessConfig(): MarketReadinessConfig {
  const state = readState();
  const existing = state.summary?.marketReadiness as Partial<MarketReadinessConfig> | undefined;
  if (!existing || typeof existing !== "object") {
    const seeded = normalize(undefined);
    writeState({
      ...state,
      summary: {
        ...(state.summary || {}),
        marketReadiness: seeded,
      },
    });
    return seeded;
  }
  return normalize(existing);
}

export function updateMarketReadinessConfig(
  patch: Partial<MarketReadinessConfig>
): MarketReadinessConfig {
  const current = getMarketReadinessConfig();
  const merged = normalize({
    ...current,
    ...patch,
    updatedAt: Date.now(),
  });
  const state = readState();
  writeState({
    ...state,
    summary: {
      ...(state.summary || {}),
      marketReadiness: merged,
    },
  });
  return merged;
}
