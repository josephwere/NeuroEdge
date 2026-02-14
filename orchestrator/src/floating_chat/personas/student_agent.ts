// floating_chat/personas/student_agent.ts
import { EventBus } from "@core/event_bus";
import { Logger } from "@utils/logger";

export class StudentAgent {
  constructor(private eventBus: EventBus, private logger: Logger) {}

  name(): string {
    return "StudentAgent";
  }

  start() {
    this.logger.info(this.name(), "Started");

    this.eventBus.subscribe("student:question", async (payload: { question: string }) => {
      await this.handleQuestion(payload.question);
    });
  }

  private async handleQuestion(question: string) {
    this.logger.info(this.name(), `Received question: ${question}`);

    // Placeholder for ML reasoning solution
    const solution = `Step-by-step solution for: ${question}`;

    this.eventBus.emit("student:answer", {
      question,
      solution
    });

    this.logger.info(this.name(), `Answered question: ${question}`);
  }
}
