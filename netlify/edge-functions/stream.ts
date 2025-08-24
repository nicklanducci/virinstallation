export default async (req: Request) => {
  const url = new URL(req.url);

  const key = Deno.env.get("OPENAI_API_KEY");
  const assistantId =
    Deno.env.get("ASSISTANT_ID") || url.searchParams.get("assistant_id") || "";
  const project = Deno.env.get("OPENAI_PROJECT") || "";   // proj_... (optional)
  const org = Deno.env.get("OPENAI_ORG_ID") || "";        // org_... (optional)
  const prompt = url.searchParams.get("prompt") ?? "Say hello!";

  if (!key) return new Response('data: {"error":"Missing OPENAI_API_KEY"}\n\ndata: [DONE]\n\n', { headers: { "Content-Type": "text/event-stream" }});
  if (!assistantId) return new Response('data: {"error":"Missing ASSISTANT_ID"}\n\ndata: [DONE]\n\n', { headers: { "Content-Type": "text/event-stream" }});

  const headers: Record<string,string> = {
    "Authorization": `Bearer ${key}`,
    "Content-Type": "application/json",
    "OpenAI-Beta": "assistants=v2"              // 👈 important
  };
  if (project) headers["OpenAI-Project"] = project;       // 👈 if your asst is in that project
  if (org) headers["OpenAI-Organization"] = org;          // optional if you use orgs/teams

  const upstream = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers,
    body: JSON.stringify({
      assistant_id: assistantId,
      input: [{ role: "user", content: prompt }],
      stream: true
    })
  });

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "");
    const err = `data: ${JSON.stringify({ upstream_status: upstream.status, error: text || "upstream error" })}\n\n`;
    return new Response(err + "data: [DONE]\n\n", { headers: { "Content-Type": "text/event-stream" }});
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*"
    }
  });
};

export const config = { path: "/stream" };
