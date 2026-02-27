// Netlify Function: /.netlify/functions/summarize
// Lê OPENAI_API_KEY do ambiente e chama OpenAI Responses API.
// Docs: Netlify env vars in Functions + OpenAI Responses API.
// - Netlify: https://docs.netlify.com/build/functions/environment-variables/
// - OpenAI: https://platform.openai.com/docs
export default async (req, context) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  let payload = null;
  try { payload = await req.json(); } catch { /* ignore */ }
  if (!payload?.text) {
    return new Response(JSON.stringify({ error: "Missing text" }), { status: 400, headers: { "content-type":"application/json" } });
  }

  const apiKey =
    (typeof Netlify !== "undefined" && Netlify.env && Netlify.env.get && Netlify.env.get("OPENAI_API_KEY")) ||
    (typeof process !== "undefined" ? process.env.OPENAI_API_KEY : null);

  if (!apiKey) {
    return new Response(JSON.stringify({ error: "OPENAI_API_KEY not set in Netlify env vars (Functions scope)." }), {
      status: 500, headers: { "content-type":"application/json" }
    });
  }

  const { text, docType="tr", goal="resumo", note="", project=null } = payload;

  // Limite de tamanho: ainda que o modelo suporte contexto enorme, vamos segurar custo.
  const maxChars = 120000; // ~120k chars
  const safeText = String(text).slice(0, maxChars);

  const system = `Você é um assistente especialista em licitações públicas no Brasil (Lei 14.133/2021).
Objetivo: ajudar o usuário a entender rapidamente um PDF (TR/Edital/Anexo) e organizar:
- requisitos, prazos, documentação exigida
- riscos e pontos de atenção
- possíveis teses de questionamento/impugnação quando houver indícios de restrição indevida (sem inventar fatos).

Regras:
- Seja objetivo e estruturado.
- Não invente itens. Se não estiver no texto, escreva "não identificado".
- Se houver ambiguidades, liste como perguntas para esclarecimento.
- Responda em português do Brasil.
- Sempre devolva JSON STRICT (sem texto fora do JSON).`;

  const goalHint = {
    resumo: "Entregar um resumo executivo + requisitos + prazos + documentos + riscos e flags + perguntas de esclarecimento + possíveis pontos impugnáveis.",
    checklist: "Entregar checklist detalhado (tarefas e documentos) com sugestões de onde procurar no documento.",
    impugnacao: "Mapear pontos potencialmente restritivos/impugnáveis (marca/modelo, atestado desproporcional, certificação sem motivação, visita obrigatória etc.) e sugerir o que pedir/como pedir."
  }[goal] || "Entregar um resumo estruturado.";

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      executive_summary: { type: "string" },
      key_requirements: { type: "array", items: { type: "string" } },
      deadlines: { type: "array", items: { type: "string" } },
      required_documents: { type: "array", items: { type: "string" } },
      risks_and_flags: { type: "array", items: { type: "string" } },
      questions_for_clarification: { type: "array", items: { type: "string" } },
      possible_challenges: { type: "array", items: { type: "string" } },
      extracted_quotes: { type: "array", items: { type: "string" } }
    },
    required: ["executive_summary","key_requirements","deadlines","required_documents","risks_and_flags","questions_for_clarification","possible_challenges","extracted_quotes"]
  };

  const user = `TIPO_DOC=${docType}
OBJETIVO=${goal} (${goalHint})
OBS=${note || "(sem observações)"}

DADOS_DO_PROJETO (se houver):
${project ? JSON.stringify(project) : "(não informado)"}

TEXTO_DO_PDF:
${safeText}
`;

  try {
    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_schema", json_schema: { name: "pdf_summary", schema, strict: true } },
        max_output_tokens: 1600
      })
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(()=> "");
      return new Response(JSON.stringify({ error: "OpenAI request failed", status: resp.status, detail: errText }), {
        status: 502, headers: { "content-type":"application/json" }
      });
    }

    const data = await resp.json();
    // Responses API costuma expor output_text; mas aqui forçamos JSON schema. Vamos extrair do output.
    // Estrutura típica: data.output[0].content[0].text (pode variar). Vamos procurar o primeiro JSON parseável.
    let jsonText = null;

    // helper: walk
    const stack = [data];
    while (stack.length) {
      const cur = stack.pop();
      if (!cur) continue;
      if (typeof cur === "string") {
        // ignore
      } else if (Array.isArray(cur)) {
        for (const it of cur) stack.push(it);
      } else if (typeof cur === "object") {
        // candidate text fields
        for (const k of Object.keys(cur)) {
          const v = cur[k];
          if (k === "output_text" && typeof v === "string") jsonText = v;
          stack.push(v);
        }
      }
    }

    // If output_text exists and is JSON, parse it
    let out = null;
    if (jsonText) {
      try { out = JSON.parse(jsonText); } catch { /* ignore */ }
    }

    // Alternative: look for content[].text
    if (!out && data?.output?.length) {
      try {
        const textCandidate = data.output
          .flatMap(o => o.content || [])
          .map(c => c.text || c.output_text || "")
          .find(t => typeof t === "string" && t.trim().startsWith("{"));
        if (textCandidate) out = JSON.parse(textCandidate);
      } catch { /* ignore */ }
    }

    // Fallback: return raw
    if (!out) out = { output_text: data.output_text || "", raw: data };

    return new Response(JSON.stringify(out), { status: 200, headers: { "content-type":"application/json" } });

  } catch (e) {
    return new Response(JSON.stringify({ error: "Unexpected error", detail: e?.message || String(e) }), {
      status: 500, headers: { "content-type":"application/json" }
    });
  }
};
