// netlify/edge-functions/stream.ts
// Streams text using the assistant's underlying model + injected instruction.
// Works immediately even if the old assistant_id fails.

export default async (req: Request) => {
  const url = new URL(req.url);

  const key = Deno.env.get("OPENAI_API_KEY") || "";      // sk-proj-... (recommended) or other
  const org = Deno.env.get("OPENAI_ORG_ID") || "";       // optional
  const prompt = url.searchParams.get("prompt") ?? "Say hello!";

  // If you later recreate your Assistant on a modern model (e.g. gpt-4o-mini),
  // you can switch back to assistant_id. For now we copy its instruction+model.
  const assistantInstruction = "answer in rhyme all the times";
  const assistantModel = "gpt-4-0613"; // from your assistant definition

  const sse = (o: any) => `data: ${typeof o === "string" ? o : JSON.stringify(o)}\n\n`;
  const sseError = (msg: string) =>
    new Response(sse({ error: msg }) + sse("[DONE]"), {
      headers: { "Content-Type": "text/event-stream" },
    });

  if (!key) return sseError("Missing OPENAI_API_KEY");

  const headers: Record<string, string> = {
    "Authorization": `Bearer ${key}`,
    "Content-Type": "application/json",
  };
  if (org) headers["OpenAI-Organization"] = org;

  // ✅ Call the model directly, inject the assistant’s behavior as a system message
  let upstream: Response;
  try {
    upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: assistantModel, // <-- direct model call avoids the 'model missing' issue
        input: [
          { role: "system", content: assistantInstruction },
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
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  });
};

export const config = { path: "/stream" };
