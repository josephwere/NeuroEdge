import { EventBus } from "@core/event_bus";

export class FormFillAgent {
  constructor(private bus: EventBus) {}

  start() {
    this.bus.subscribe("ui:form:fill", (payload: any) => {
      Object.entries(payload.fields).forEach(([name, value]) => {
        const el = document.querySelector(`[name="${name}"]`) as any;
        if (el) el.value = value;
      });
    });

    this.bus.subscribe("ui:form:submit", () => {
      const form = document.querySelector("form") as any;
      form?.submit();
    });
  }
}
