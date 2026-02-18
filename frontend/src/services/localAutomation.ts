export function extractVisibleText(maxChars = 8000): string {
  const bodyText = String(document?.body?.innerText || "").trim();
  if (!bodyText) return "";
  return bodyText.slice(0, Math.max(1, maxChars));
}

function decodeValue(raw: string): string {
  return raw.replace(/\\n/g, "\n").replace(/^["']|["']$/g, "");
}

export function fillFormFieldsFromSpec(spec: string): { filled: number; missing: string[] } {
  const source = String(spec || "").trim();
  const pairs = source
    .split(/[;,]\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const idx = entry.indexOf("=");
      if (idx < 1) return null;
      const key = entry.slice(0, idx).trim();
      const value = decodeValue(entry.slice(idx + 1).trim());
      return key ? { key, value } : null;
    })
    .filter((v): v is { key: string; value: string } => Boolean(v));

  let filled = 0;
  const missing: string[] = [];
  pairs.forEach(({ key, value }) => {
    const el =
      (document.querySelector(`[name="${CSS.escape(key)}"]`) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null) ||
      (document.getElementById(key) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null);
    if (!el) {
      missing.push(key);
      return;
    }
    (el as any).value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    filled += 1;
  });

  return { filled, missing };
}

export interface FormFieldDescriptor {
  key: string;
  label: string;
  type: string;
  placeholder: string;
  required: boolean;
}

export function listVisibleFormFields(limit = 80): FormFieldDescriptor[] {
  const controls = Array.from(
    document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      "input[name], textarea[name], select[name], input[id], textarea[id], select[id]"
    )
  );
  const out: FormFieldDescriptor[] = [];
  const seen = new Set<string>();
  for (const el of controls) {
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") continue;
    const key = String(el.getAttribute("name") || el.getAttribute("id") || "").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const labelByFor = key ? (document.querySelector(`label[for="${CSS.escape(key)}"]`) as HTMLLabelElement | null) : null;
    const parentLabel = el.closest("label");
    const placeholder = String((el as any).placeholder || "").trim();
    const aria = String(el.getAttribute("aria-label") || "").trim();
    const label = String(labelByFor?.innerText || parentLabel?.innerText || aria || key).trim();
    out.push({
      key,
      label,
      type: String((el as any).type || el.tagName.toLowerCase()),
      placeholder,
      required: Boolean((el as any).required),
    });
    if (out.length >= limit) break;
  }
  return out;
}

export function submitLikelyForm(): { submitted: boolean; method?: string; action?: string } {
  const candidateButtons = Array.from(
    document.querySelectorAll<HTMLButtonElement | HTMLInputElement>(
      'button[type="submit"], input[type="submit"], button:not([type])'
    )
  );
  const submitCandidate = candidateButtons.find((b) => {
    const txt = String((b as any).innerText || (b as any).value || "").toLowerCase();
    return /(submit|send|continue|apply|save|next|confirm|register|login)/.test(txt);
  }) || candidateButtons[0];

  if (submitCandidate) {
    const form =
      (submitCandidate.closest("form") as HTMLFormElement | null) ||
      (document.querySelector("form") as HTMLFormElement | null);
    if (form) {
      form.requestSubmit?.();
      if (!form.requestSubmit) form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      return {
        submitted: true,
        method: String(form.method || "get").toLowerCase(),
        action: String(form.action || location.href),
      };
    }
    (submitCandidate as HTMLElement).click();
    return { submitted: true };
  }

  const anyForm = document.querySelector("form") as HTMLFormElement | null;
  if (anyForm) {
    anyForm.requestSubmit?.();
    if (!anyForm.requestSubmit) anyForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    return {
      submitted: true,
      method: String(anyForm.method || "get").toLowerCase(),
      action: String(anyForm.action || location.href),
    };
  }
  return { submitted: false };
}
