// netlify/edge-functions/stream.ts
// TEMP: Assistant visibility checker (non-streaming, returns JSON)

export default async (req: Request) => {
  const url = new URL(req.url);

  // 🔑 Env you should have set in Netlify → Site configuration → Environment variables
  // - OPENAI_API_KEY  : your key (prefer sk-proj-... from the SAME Project as the assistant)
  // - OPENAI_PROJECT  : proj_... (REQUIRED if your key is NOT sk-proj-...; optional if sk-proj-)
  // - OPENAI_ORG_ID   : org_... (optional; only if you’re in a Team/Org)
  // - ASSISTANT_ID    : asst_... (optional; can also pass via ?assistant_id=...)
  const key       = Deno.env.get("OPENAI_API_KEY")  || "";
  const project   = Deno.env.get("OPENAI_PROJECT")  || "";
  const org       = Deno.env.get("OPENAI_ORG_ID")   || "";
  const assistant = url.searchParams.get("assistant_id")
                 || Deno.env.get("ASSISTANT_ID")
                 || "";

  // Build headers exactly as we will for Assistants v2 calls
  const headers: Record<string, string> = {
    "Authorization": `Bearer ${key}`,
    "Content-Type": "application/json",
    "OpenAI-Beta": "assistants=v2",
  };
  if (project) headers["OpenAI-Project"] = project;       // needed for non sk-proj- keys
  if (org)     headers["OpenAI-Organization"] = org;      // optional

  // Helper to safely parse JSON bodies
  const safeParse = (t: string) => { try { return JSON.parse(t); } catch { return t; } };

  // Basic validation
  if (!key) {
    return json({
      ok: false,
      error: "Missing OPENAI_API_KEY",
      hint: "Use a project key sk-proj-... from the SAME Project as the assistant, or set OPENAI_PROJECT for non-project keys.",
    });
  }
  if (!assistant) {
    return json({
      ok: false,
      error: "Missing assistant_id",
      hint: "Pass ?assistant_id=asst_... in the URL or set ASSISTANT_ID in env.",
    });
  }

  // Call Assistants GET to verify visibility in this context
  let resp: Response;
  let text = "";
  try {
    resp = await fetch(`https://api.openai.com/v1/assistants/${assistant}`, {
      method: "GET",
      headers,
    });
    text = await resp.text().catch(() => "");
  } catch (e) {
    return json({
      ok: false,
      step: "assistant_check_fetch",
      error: String(e),
      sent_headers: redactHeaders(headers),
      key_prefix: key.slice(0, 12),
    });
  }

  // Return diagnostic info
  return json({
    ok: resp.ok,
    step: "assistant_check_result",
    status: resp.status,
    key_prefix: key.slice(0, 12),            // e.g., "sk-proj-xxxxx"
    sent_headers: redactHeaders(headers),    // shows which headers we actually sent
    notes: [
      "If status is 200, your key/project can SEE the assistant.",
      "If status is 403/404, the key/project cannot see this assistant. Use a sk-proj key from the SAME Project, or set OPENAI_PROJECT to proj_... that owns the assistant."
    ],
    assistant_raw: safeParse(text),
    next_steps: resp.ok ? [
      "✅ Replace this checker with the streaming version once you confirm visibility.",
      "In the streaming file, POST /v1/responses with the SAME headers and body: { assistant_id, input, stream:true }.",
    ] : [
      "❌ Fix key/project mismatch:",
      "- Create a Project key (sk-proj-...) in the SAME Project as the assistant (Playground → Project → Settings → API Keys).",
      "- OR, if using a service/global key, also set OPENAI_PROJECT=proj_... and keep the OpenAI-Project header.",
    ],
  });
};

// Utility: return JSON with proper headers
function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

// Redact sensitive header values for display
function redactHeaders(h: Record<string, string>) {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(h)) {
    out[k] = k.toLowerCase() === "authorization" ? v.slice(0, 16) + "…" : v;
  }
  return out;
}

export const config = { path: "/stream" };

