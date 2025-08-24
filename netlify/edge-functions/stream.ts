export default async (req: Request) => {
  const url = new URL(req.url);
  const key = Deno.env.get("OPENAI_API_KEY");
  const assistantId = Deno.env.get("ASSISTANT_ID") || url.searchParams.get("assistant_id") || "";
  const prompt = url.searchParams.get("prompt") ?? "Say hello!";

  if (!key) {
    return new Response("data: {\"error\":\"Missing OPENAI_API_KEY\"}\n\ndata: [DONE]\n\n", {
      headers: { "Content-Type": "text/event-stream" },
    });
  }
  if (!assistantId) {
    return new Response("data: {\"error\":\"Missing ASSISTANT_ID\"}\n\ndata: [DONE]\n\n", {
      headers: { "Content-Type": "text/event-stream" },
    });
  }

  const upstream = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      assistant_id: assistantId,
      input: [{ role: "user", content: prompt }],
      stream: true
    }),
  });

  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  });
};

export const config = { path: "/stream" };
