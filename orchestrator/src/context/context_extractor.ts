export interface PageContext {
  url?: string;
  text?: string;
  selection?: string;
  forms?: Record<string, string>;
  codeBlocks?: string[];
}

export class ContextExtractor {
  extractFromDOM(): PageContext {
    const selection = window.getSelection()?.toString() || "";

    const inputs = document.querySelectorAll("input, textarea");
    const forms: Record<string, string> = {};
    inputs.forEach((el: any) => {
      if (el.name) forms[el.name] = el.value;
    });

    const codeBlocks = Array.from(document.querySelectorAll("pre, code"))
      .map(el => el.textContent || "");

    return {
      url: window.location.href,
      text: document.body.innerText.slice(0, 8000),
      selection,
      forms,
      codeBlocks
    };
  }
}
