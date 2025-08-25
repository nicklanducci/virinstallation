// netlify/edge-functions/stream.ts
// Streams text using a model directly (fallback: no vector dataset).
// Requires: OPENAI_API_KEY in your Netlify env.

export default async (req: Request) => {
  const url = new URL(req.url);

  const key = Deno.env.get("OPENAI_API_KEY") || "";
  const org = Deno.env.get("OPENAI_ORG_ID") || ""; // optional
  const prompt = url.searchParams.get("prompt") ?? "Say something about love!";

  // Persona copied from your assistant:
  const systemInstruction = "act as a poeet and answer in rhyme all the times";
  const model = "gpt-4.1"; // Responses-compatible (you can use "gpt-4o" or "gpt-4o-mini" too)

  const sse = (o: any) => `data: ${typeof o === "string" ? o : JSON.stringify(o)}\n\n`;
  const sseError = (msg: string) =>
    new Response(sse({ error: msg }) + sse("[DONE]"), {
      headers: { "Content-Type": "text/event-stream; charset=utf-8" },
    });

  if (!key) return sseError("Missing OPENAI_API_KEY");

  const headers: Record<string, string> = {
    "Authorization": `Bearer ${key}`,
    "Content-Type": "application/json",
  };
  if (org) headers["OpenAI-Organization"] = org;

  let upstream: Response;
  try {
    upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        input: [
          { role: "system", content: systemInstruction },
          { role: "user", content: prompt }
        ],
        stream: true,
      }),
    });
  } catch (e) {
    return sseError(`Network error: ${String(e)}`);
  }

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "");
    return sseError(`Upstream error ${upstream.status}: ${text}`);
  }

  const body = new ReadableStream({
    async start(controller) {
      const reader = upstream.body!.getReader();
      const enc = new TextEncoder();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }
        controller.enqueue(enc.encode(sse("[DONE]")));
      } catch (e) {
        controller.enqueue(enc.encode(sse({ error: String(e) })));
        controller.enqueue(enc.encode(sse("[DONE]")));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8", // 👈 fixes mojibake
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  });
};

export const config = { path: "/stream" };
