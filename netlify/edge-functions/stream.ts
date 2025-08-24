// netlify/edge-functions/stream.ts
export default async (req: Request) => {
  const url = new URL(req.url);

  // ---- Read inputs / env ----
  const key = Deno.env.get("OPENAI_API_KEY") || "";
  const project = Deno.env.get("OPENAI_PROJECT") || "";   // proj_...
  const org = Deno.env.get("OPENAI_ORG_ID") || "";        // org_... (optional)
  const assistantId =
    Deno.env.get("ASSISTANT_ID") ||
    url.searchParams.get("assistant_id") ||
    "";
  const prompt = url.searchParams.get("prompt") ?? "Say hello!";

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
    return sseError("Missing ASSISTANT_ID (env or ?assistant_id=asst_...)");
  }
  if (!project) {
    return sseError("Missing OPENAI_PROJECT (proj_...) — set this to the Project ID that owns the assistant.");
  }

  // ---- Common headers (Assistants v2 is required) ----
  const headers: Record<string, string> = {
    "Authorization": `Bearer ${key}`,
    "Content-Type": "application/json",
    "OpenAI-Beta": "assistants=v2",
    "OpenAI-Project": project, // ensure the request runs in the right Project
  };
  if (org) headers["OpenAI-Organization"] = org;

  // ---- 1) Verify the assistant is visible in this Project ----
  try {
    const check = await fetch(`https://api.openai.com/v1/assistants/${assistantId}`, {
      method: "GET",
      headers,
    });

    if (!check.ok) {
      const body = await check.text().catch(() => "");
      return sseError(
        `Assistant check failed. status=${check.status}. Hint: The assistant may not belong to Project ${project}. Body=${body || "no body"}`
      );
    }
  } catch (e) {
    return sseError(`Network error checking assistant: ${String(e)}`);
  }

  // ---- 2) Stream a response from that Assistant ----
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
    const body = await upstream.text().catch(() => "");
    // Surface the upstream error cleanly so you can see it in the browser
    return new Response(
      sse({ upstream_status: upstream.status, error: body || "Upstream error" }) + sse("[DONE]"),
      { headers: { "Content-Type": "text/event-stream" } }
    );
  }

  // ---- 3) Pass through OpenAI's SSE + emit [DONE] ----
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
