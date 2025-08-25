// netlify/edge-functions/stream.ts
// Debug: forwards to OpenAI /responses and returns what OpenAI said
export default async (req: Request) => {
  const url = new URL(req.url);

  const key = Deno.env.get("OPENAI_API_KEY") || "";
  const assistantId =
    Deno.env.get("ASSISTANT_ID") ||
    url.searchParams.get("assistant_id") ||
    "";
  const prompt = url.searchParams.get("prompt") ?? "test";

  const headers: Record<string, string> = {
    "Authorization": `Bearer ${key}`,
    "Content-Type": "application/json",
    "OpenAI-Beta": "assistants=v2",
    "openai-beta": "assistants=v2", // 👈 try lowercased too
  };

  // Instead of streaming, just forward once and echo OpenAI’s raw response
  const resp = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers,
    body: JSON.stringify({
      assistant_id: assistantId,
      input: [{ role: "user", content: prompt }],
      // ⚠️ no stream, we want the error JSON
    }),
  });

  const text = await resp.text().catch(() => "");
  return new Response(JSON.stringify({
    status: resp.status,
    headersSent: headers,
    body: text,
  }, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
};

export const config = { path: "/stream" };
