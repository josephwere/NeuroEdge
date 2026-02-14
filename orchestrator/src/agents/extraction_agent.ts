export class ExtractionAgent {
  extractQuestions(): string[] {
    return Array.from(document.querySelectorAll("label, p"))
      .map(el => el.textContent || "")
      .filter(t => t.includes("?"));
  }
}
