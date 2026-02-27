import { truncate } from "./utils.js";

async function loadScript(src, { timeoutMs = 12000 } = {}) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.defer = true;
    s.async = true;
    const t = setTimeout(() => {
      s.remove();
      reject(new Error("timeout"));
    }, timeoutMs);
    s.onload = () => { clearTimeout(t); resolve(true); };
    s.onerror = () => { clearTimeout(t); s.remove(); reject(new Error("error")); };
    document.head.appendChild(s);
  });
}

async function ensurePdfJsLoaded() {
  if (window.pdfjsLib) return window.pdfjsLib;

  // 1) Prefer same-origin Netlify Function to avoid CDN blocks (AdBlock/Firewall)
  // 2) Fallback to public CDNs if the function is unavailable
  const CDNS = [
    "/.netlify/functions/pdfjs?file=pdf",
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.js",
    "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.js",
    "https://unpkg.com/pdfjs-dist@4.10.38/build/pdf.min.js",
  ];

  for (const url of CDNS) {
    try {
      await loadScript(url);
      if (window.pdfjsLib) return window.pdfjsLib;
    } catch (_) {}
  }
  throw new Error("PDF.js não carregou. Verifique bloqueios de rede/extensões ou se o deploy está com Functions ativas no Netlify.");
}


export async function extractPdfText(file, { maxPages = 40 } = {}) {
  if (!file) throw new Error("Arquivo não informado.");

  // PDF.js: tenta via Function (mesma origem) e, se falhar, usa fallback por CDN
  const pdfjsLib = await ensurePdfJsLoaded();

  // Worker: same-origin via Function (mais robusto). Se não funcionar, cai em CDN.
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = "/.netlify/functions/pdfjs?file=worker";
    pdfjsLib.GlobalWorkerOptions.workerSrcFallback = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.js";
  }

  const arr = new Uint8Array(await file.arrayBuffer());
  let doc;
  try {
    doc = await pdfjsLib.getDocument({ data: arr }).promise;
  } catch (e) {
    // tenta fallback do worker se houver bloqueio/erro
    if (pdfjsLib.GlobalWorkerOptions.workerSrcFallback) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsLib.GlobalWorkerOptions.workerSrcFallback;
      doc = await pdfjsLib.getDocument({ data: arr }).promise;
    } else {
      throw e;
    }
  }

  const total = Math.min(doc.numPages, maxPages);
  const chunks = [];

  for (let i = 1; i <= total; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map(it => (it.str || "")).join(" ").replace(/\s+/g, " ").trim();
    if (pageText) chunks.push(`--- Página ${i} ---\n${pageText}`);
  }
  const text = chunks.join("\n\n").trim();
  return { text, pagesRead: total, pagesTotal: doc.numPages };
}

export async function summarizeTextViaFunction({
  text,
  docType = "tr",
  goal = "resumo",
  note = "",
  project = null,
}) {
  const payload = {
    text,
    docType,
    goal,
    note,
    project: project ? {
      modalidade: project.modalidade || "",
      orgao: project.orgao || "",
      edital: project.edital || "",
      portal: project.portal || "",
      objeto: project.objeto || "",
      sessao: project.sessao || "",
      criterio: project.criterio || ""
    } : null
  };

  const res = await fetch("/.netlify/functions/summarize", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const t = await res.text().catch(()=> "");
    throw new Error(`Falha ao resumir (status ${res.status}). ${t}`);
  }
  return await res.json();
}

// Converte saída estruturada em “trechos” aproveitáveis
export function summaryToTrechos(summaryJson) {
  const trechos = [];
  const now = Date.now();

  const push = (titulo, item, texto) => {
    const clean = String(texto||"").trim();
    if (!clean) return;
    trechos.push({
      id: (Math.random().toString(16).slice(2) + now.toString(16)),
      item: item || "",
      titulo: titulo || "Trecho",
      texto: clean,
      createdAt: now,
    });
  };

  if (!summaryJson) return trechos;

  // Se vier em campos
  if (summaryJson.executive_summary) {
    push("Resumo executivo (PDF)", "PDF", summaryJson.executive_summary);
  }
  if (Array.isArray(summaryJson.key_requirements)) {
    push("Requisitos-chave (PDF)", "PDF", summaryJson.key_requirements.map(x => `- ${x}`).join("\n"));
  }
  if (Array.isArray(summaryJson.deadlines)) {
    push("Prazos & datas (PDF)", "PDF", summaryJson.deadlines.map(x => `- ${x}`).join("\n"));
  }
  if (Array.isArray(summaryJson.required_documents)) {
    push("Documentos exigidos (PDF)", "PDF", summaryJson.required_documents.map(x => `- ${x}`).join("\n"));
  }
  if (Array.isArray(summaryJson.risks_and_flags)) {
    push("Riscos / pontos de atenção (PDF)", "PDF", summaryJson.risks_and_flags.map(x => `- ${x}`).join("\n"));
  }
  if (Array.isArray(summaryJson.possible_challenges)) {
    push("Possíveis impugnações/contestação (PDF)", "PDF", summaryJson.possible_challenges.map(x => `- ${x}`).join("\n"));
  }

  // fallback
  if (!trechos.length && summaryJson.output_text) {
    push("Resumo (PDF)", "PDF", truncate(summaryJson.output_text, 3000));
  }

  return trechos;
}
