// netlify/edge-functions/stream.ts
// Streams text from an Assistant using Assistants v2 threads API

export default async (req: Request) => {
  const url = new URL(req.url);

  const key = Deno.env.get("OPENAI_API_KEY") || "";     // sk-proj-...
  const org = Deno.env.get("OPENAI_ORG_ID") || "";      // optional
  const assistantId =
    Deno.env.get("ASSISTANT_ID") ||
    url.searchParams.get("assistant_id") ||
    "";
  const prompt = url.searchParams.get("prompt") ?? "Say hello!";

  const sse = (o: any) => `data: ${typeof o === "string" ? o : JSON.stringify(o)}\n\n`;
  const sseError = (msg: string) =>
    new Response(sse({ error: msg }) + sse("[DONE]"), {
      headers: { "Content-Type": "text/event-stream" },
    });

  if (!key) return sseError("Missing OPENAI_API_KEY");
  if (!assistantId) return sseError("Missing ASSISTANT_ID");

  // ✅ Correct headers
  const headers: Record<string, string> = {
    "Authorization": `Bearer ${key}`,
    "Content-Type": "application/json",
    "OpenAI-Beta": "assistants=v2",   // absolutely required
  };
  if (org) headers["OpenAI-Organization"] = org;

  // 🔗 Call Assistants v2 thread run stream
  let upstream: Response;
  try {
    upstream = await fetch("https://api.openai.com/v1/threads/runs/stream", {
      method: "POST",
      headers,
      body: JSON.stringify({
        assistant_id: assistantId,
        input: [{ role: "user", content: prompt }],
      }),
    });
  } catch (e) {
    return sseError(`Network error: ${String(e)}`);
  }

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "");
    return sseError(`Upstream error ${upstream.status}: ${text}`);
  }

  // 🔄 Pipe SSE straight through
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
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  });
};

export const config = { path: "/stream" };
