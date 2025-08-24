// netlify/edge-functions/stream.ts

export default async (req: Request) => {
  const url = new URL(req.url);

  // 🔑 Project API key (sk-proj-...) from the SAME project as your assistant
  const key = Deno.env.get("OPENAI_API_KEY") || "";
  const assistantId =
    Deno.env.get("ASSISTANT_ID") ||
    url.searchParams.get("assistant_id") ||
    "";
  const prompt = url.searchParams.get("prompt") ?? "Say hello!";

  // Optional: if you are in an org/team
  const org = Deno.env.get("OPENAI_ORG_ID") || "";

  // ---- SSE helpers ----
  const sse = (obj: unknown) =>
    `data: ${typeof obj === "string" ? obj : JSON.stringify(obj)}\n\n`;
  const sseError = (msg: string, status = 200) =>
    new Response(sse({ error: msg }) + sse("[DONE]"), {
      headers: { "Content-Type": "text/event-stream" },
      status,
    });

  // ---- Guards ----
  if (!key) {
    return sseError("Missing OPENAI_API_KEY (use a project key: sk-proj-...)");
  }
  if (!assistantId) {
    return sseError("Missing ASSISTANT_ID (set env var or pass ?assistant_id=asst_...)");
  }

  // ---- Correct headers for Assistants v2 ----
  const headers: Record<string, string> = {
    "Authorization": `Bearer ${key}`,
    "Content-Type": "application/json",
    "OpenAI-Beta": "assistants=v2",  // 👈 this tells API to accept assistant_id
  };
  if (org) headers["OpenAI-Organization"] = org;

  // ---- Call Responses API with assistant_id ----
  let upstream: Response;
  try {
    upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers,
      body: JSON.stringify({
        assistant_id: assistantId,
        input: [{ role: "user", content: prompt }],
        stream: true,
      }),
    });
  } catch (e) {
    return sseError(`Network error calling /v1/responses: ${String(e)}`);
  }

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "");
    return new Response(
      sse({ upstream_status: upstream.status, error: text || "Upstream error" }) + sse("[DONE]"),
      { headers: { "Content-Type": "text/event-stream" } }
    );
  }

  // ---- Pass through the stream ----
  const body = new ReadableStream({
    async start(controller) {
      const reader = upstream.body!.getReader();
      const encoder = new TextEncoder();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }
        controller.enqueue(encoder.encode(sse("[DONE]")));
      } catch (e) {
        controller.enqueue(encoder.encode(sse({ error: `Stream read error: ${String(e)}` })));
        controller.enqueue(encoder.encode(sse("[DONE]")));
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
