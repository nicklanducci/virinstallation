// netlify/edge-functions/stream.ts
export default async (req: Request) => {
  const url = new URL(req.url);

  const key = Deno.env.get("OPENAI_API_KEY") || "";
  const project = Deno.env.get("OPENAI_PROJECT") || "proj_sze2bx5nsaD49sWm1ysp3Ucy"; // 👈 put your Project ID
  const org = Deno.env.get("OPENAI_ORG_ID") || "";
  const assistantId = url.searchParams.get("assistant_id") || Deno.env.get("ASSISTANT_ID") || "";
  const prompt = url.searchParams.get("prompt") ?? "Say hello!";

  const sse = (o:any) => `data: ${typeof o === "string" ? o : JSON.stringify(o)}\n\n`;

  if (!key) return new Response(sse({error:"Missing OPENAI_API_KEY"})+sse("[DONE]"), {headers:{"Content-Type":"text/event-stream"}});
  if (!assistantId) return new Response(sse({error:"Missing ASSISTANT_ID"})+sse("[DONE]"), {headers:{"Content-Type":"text/event-stream"}});

  const headers: Record<string,string> = {
    "Authorization": `Bearer ${key}`,
    "Content-Type": "application/json",
    "OpenAI-Beta": "assistants=v2",
    "OpenAI-Project": project,         // 👈 force project context
  };
  if (org) headers["OpenAI-Organization"] = org;

  const upstream = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers,
    body: JSON.stringify({
      assistant_id: assistantId,
      input: [{ role: "user", content: prompt }],
      stream: true,
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(()=>"");
    return new Response(sse({upstream_status:upstream.status,error:text||"Upstream error"})+sse("[DONE]"),
      {headers:{"Content-Type":"text/event-stream"}});
  }

  const body = new ReadableStream({
    async start(controller) {
      const reader = upstream.body!.getReader();
      const enc = new TextEncoder();
      while(true){
        const {done,value}=await reader.read();
        if(done)break;
        controller.enqueue(value);
      }
      controller.enqueue(enc.encode(sse("[DONE]")));
      controller.close();
    }
  });

  return new Response(body,{
    headers:{
      "Content-Type":"text/event-stream",
      "Cache-Control":"no-cache, no-transform",
      "Connection":"keep-alive",
      "Access-Control-Allow-Origin":"*",
    }
  });
};

export const config = { path: "/stream" };
