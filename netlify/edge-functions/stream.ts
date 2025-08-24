export default async (req: Request) => {
  const url = new URL(req.url);

  const key = Deno.env.get("OPENAI_API_KEY");
  const assistantId = Deno.env.get("asst_xDIXyou1oF7Oq7Fgqs8mVN3r") // or read from query (?assistant_id=...)
    || url.searchParams.get("assistant_id") || "";

  // The text you want the Assistant to respond to (your “user” message)
  const prompt =
    url.searchParams.get("prompt") ?? "who are you?";

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

  // Ask the Responses API to run your Assistant with streaming
  const upstream = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      assistant_id: assistantId,
      // This is the message your user sends to the Assistant:
      input: [{ role: "user", content: prompt }],
      stream: true
    }),
  });

  // Just pipe OpenAI’s SSE through (client now listens to named events already)
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
