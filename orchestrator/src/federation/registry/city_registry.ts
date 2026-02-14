export interface CityNode {
  city: string;
  nodeId: string;
  health: number;
  latency: number;
  capacity: number;
}

export class CityRegistry {
  private cities: Map<string, CityNode[]> = new Map();

  register(node: CityNode) {
    if (!this.cities.has(node.city)) {
      this.cities.set(node.city, []);
    }
    this.cities.get(node.city)!.push(node);
  }

  getCity(city: string): CityNode[] {
    return this.cities.get(city) || [];
  }
}
