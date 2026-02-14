export const reasoningClient = {
  async ask(prompt: string): Promise<string> {
    const res = await fetch("/ml/reason", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });

    const data = await res.json();
    return data.answer;
  },
};
