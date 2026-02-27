import { LETTERHEAD } from "./config.js";
import { escapeHtml } from "./utils.js";

function nl2brHtml(s){
  return escapeHtml(String(s ?? "")).replace(/\n/g, "<br/>");
}

export function buildWordHtml({ title, bodyHtml }) {
  const lh = LETTERHEAD;

  const css = `
    @page { size: A4; margin: 2.4cm 2.2cm 2.2cm 2.2cm; }
    body{ font-family: "Calibri", Arial, sans-serif; font-size: 12pt; color:#111; line-height: 1.55; }
    .header{ text-align:center; padding: 8px 0 10px; border-bottom: 1px solid #222; margin-bottom: 14px; }
    .header .name{ font-size: 16pt; font-weight: 700; letter-spacing: .6px; text-transform: uppercase; }
    .header .subtitle{ margin-top: 4px; font-size: 10.5pt; color:#333; }
    .footer{ margin-top: 18px; border-top: 1px solid #222; padding-top: 8px; font-size: 10.5pt; color:#333; text-align:center; }
    h1{ font-size: 14pt; margin: 12px 0 8px; text-align:center; text-transform: uppercase; letter-spacing: .4px; }
    h2{ font-size: 12.5pt; margin: 14px 0 6px; text-transform: uppercase; letter-spacing: .3px; }
    p{ margin: 0 0 10px; text-align: justify; }
    .meta{ width: 100%; border-collapse: collapse; margin: 10px 0 14px; font-size: 11pt; }
    .meta td{ border: 1px solid #333; padding: 8px 10px; vertical-align: top; }
    .meta .k{ width: 28%; font-weight: 700; background: #f2f2f2; }
    .quote{ border-left: 3px solid #333; padding: 10px 12px; margin: 10px 0 12px; background: #fafafa; font-size: 11pt; text-align: justify; white-space: pre-wrap; }
    .box{ border: 1px solid #333; padding: 10px 12px; margin: 10px 0 12px; background: #fcfcfc; font-size: 11pt; white-space: pre-wrap; }
    .small{ font-size: 10.5pt; color:#333; }
  `;

  return `
  <html xmlns:o="urn:schemas-microsoft-com:office:office"
        xmlns:w="urn:schemas-microsoft-com:office:word"
        xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <meta charset="utf-8">
      <title>${escapeHtml(title || "Documento")}</title>
      <style>${css}</style>
    </head>
    <body>
      <div class="header">
        <div class="name">${escapeHtml(lh.name)}</div>
        <div class="subtitle">Documento gerado para apoio operacional em licitações (uso pessoal)</div>
      </div>

      ${bodyHtml || ""}

      <div class="footer">
        <div><strong>${escapeHtml(lh.name)}</strong></div>
        <div>CNPJ: ${escapeHtml(lh.cnpj)} • Contato: ${escapeHtml(lh.contato)}</div>
      </div>
    </body>
  </html>
  `.trim();
}

export function docToHtmlSections(docText){
  const raw = String(docText || "").trim();
  if (!raw) return { title: "Documento", bodyHtml: "<p>(Vazio)</p>" };

  const lines = raw.split(/\r?\n/);
  let mainTitle = "";
  for (const l of lines) {
    const s = l.trim();
    if (/^(PEDIDO DE ESCLARECIMENTO|IMPUGNAÇÃO AO EDITAL|RECURSO ADMINISTRATIVO|CONTRARRAZÕES|MANIFESTAÇÃO)/i.test(s)) {
      mainTitle = s;
      break;
    }
  }
  if (!mainTitle) mainTitle = "DOCUMENTO";

  const grab = (label) => {
    const re = new RegExp(`${label}\\s*:\\s*(.*)`, "i");
    const m = raw.match(re);
    return (m && m[1]) ? m[1].trim() : "";
  };

  const ref = grab("Ref\\.") || "-";
  const objeto = grab("Objeto") || "-";
  const portal = grab("Portal/Plataforma") || "-";
  const sessao = grab("Sessão") || "-";

  const secFacts = raw.split(/II\.\s*DA FUNDAMENTAÇÃO/i)[0];
  const rest = raw.split(/II\.\s*DA FUNDAMENTAÇÃO/i)[1] || "";
  const secLegal = rest.split(/III\.\s*DO PEDIDO/i)[0] || "";
  const secPedido = (rest.split(/III\.\s*DO PEDIDO/i)[1] || "").trim();

  const trechoMatch = secFacts.match(/Trecho do edital\/TR:\s*([\s\S]*)$/i);
  const trecho = trechoMatch ? trechoMatch[1].trim() : "";
  let factsText = secFacts;
  if (trecho) factsText = secFacts.replace(/Trecho do edital\/TR:\s*[\s\S]*$/i, "").trim();

  const metaTable = `
    <table class="meta">
      <tr><td class="k">Referência</td><td>${escapeHtml(ref)}</td></tr>
      <tr><td class="k">Objeto</td><td>${escapeHtml(objeto)}</td></tr>
      <tr><td class="k">Portal/Plataforma</td><td>${escapeHtml(portal)}</td></tr>
      <tr><td class="k">Sessão</td><td>${escapeHtml(sessao)}</td></tr>
    </table>
  `;

  const bodyHtml = `
    <h1>${escapeHtml(mainTitle)}</h1>
    ${metaTable}

    <h2>I. Dos fatos / do ponto objeto de análise</h2>
    <p>${nl2brHtml(factsText)}</p>

    ${trecho ? `<div class="quote"><strong>Trecho do edital/TR:</strong><br/><br/>${nl2brHtml(trecho.replace(/^“|”$/g,""))}</div>` : ""}

    <h2>II. Da fundamentação</h2>
    <div class="box">${nl2brHtml(secLegal.trim() || "(Sem fundamentação)")}</div>

    <h2>III. Do pedido</h2>
    <p>${nl2brHtml(secPedido || "(Sem pedido)")}</p>

    <p class="small"><i>Observação:</i> ajuste e complemente conforme o caso concreto antes de protocolar.</p>
  `.trim();

  return { title: mainTitle, bodyHtml };
}
