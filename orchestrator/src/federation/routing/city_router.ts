import { CityRegistry } from "@federation/registry/city_registry";

export function selectBestCity(
  registry: CityRegistry,
  intent: "build" | "ml" | "exec"
) {
  let best: any = null;

  for (const [, nodes] of registry["cities"]) {
    for (const node of nodes) {
      if (!best || node.health - node.latency > best.score) {
        best = { node, score: node.health - node.latency };
      }
    }
  }

  return best?.node;
}
