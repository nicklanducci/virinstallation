// netlify/edge-functions/stream.ts

export default async (req: Request) => {
  const url = new URL(req.url);

  // 🔑 Required: project-scoped API key from the same Project as your Assistant (sk-proj-...)
  const key = Deno.env.get("OPENAI_API_KEY");

  // 👇 Assistant ID: set in Netlify env (ASSISTANT_ID) or pass via ?assistant_id=...
  const assistantId =
    Deno.env.get("ASSISTANT_ID") ||
    url.searchParams.get("assistant_id") ||
    "";

  // User message to the Assistant
  const prompt = url.searchParams.get("prompt") ?? "Say hello!";

  // (Optional) If you use orgs/teams or project headers explicitly:
  const org = Deno.env.get("OPENAI_ORG_ID") || "";     // e.g., org_...
  const project = Deno.env.get("OPENAI_PROJECT") || ""; // e.g., proj_...

  // ---- Basic guards that also emit helpful SSE errors to the browser ----
  const sse = (obj: unknown) =>
    `data: ${typeof obj === "string" ? obj : JSON.stringify(obj)}\n\n`;

  const sseError = (msg: string) =>
    new Response(sse({ error: msg }) + sse("[DONE]"), {
      headers: { "Content-Type": "text/event-stream" },
    });

  if (!key) return sseError("Missing OPENAI_API_KEY (use a sk-proj-... key from the Assistant's Project)");
  if (!assistantId) return sseError("Missing ASSISTANT_ID (set env var or pass ?assistant_id=...)");

  // ---- Build headers (Assistants v2 is required when using assistant_id) ----
  const headers: Record<string, string> = {
    "Authorization": `Bearer ${key}`,
    "Content-Type": "application/json",
    "OpenAI-Beta": "assistants=v2",  // 👈 REQUIRED for assistant_id with /v1/responses
  };
  if (org) headers["OpenAI-Organization"] = org; // optional
  if (project) headers["OpenAI-Project"] = project; // optional (usually not needed if key is sk-proj)

  // ---- Call the Responses API with your Assistant, with streaming enabled ----
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
    return sseError(`Network error calling OpenAI: ${String(e)}`);
  }

  // If upstream failed, surface the body so you can see the exact error
  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "");
    return new Response(
      sse({ upstream_status: upstream.status, error: text || "Upstream error" }) + sse("[DONE]"),
      { headers: { "Content-Type": "text/event-stream" } }
    );
  }

  // ---- Pass OpenAI's SSE stream straight through + append [DONE] at the end ----
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
