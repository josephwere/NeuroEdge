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

