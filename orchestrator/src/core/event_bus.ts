type EventCallback = (payload: any) => void;

export class EventBus {
  private listeners: Map<string, EventCallback[]> = new Map();

  subscribe(event: string, callback: EventCallback) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event)!.push(callback);
  }

  emit(event: string, payload?: any) {
    const callbacks = this.listeners.get(event) || [];
    callbacks.forEach((cb) => cb(payload));
  }

  unsubscribe(event: string, callback: EventCallback) {
    if (!this.listeners.has(event)) return;
    const filtered = this.listeners.get(event)!.filter((cb) => cb !== callback);
    this.listeners.set(event, filtered);
  }
}
