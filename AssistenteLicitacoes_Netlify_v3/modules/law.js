import { LEGAL_KEYWORDS } from "./config.js";

export const LAW = {
  loaded: false,
  text: "",
  articles: [],
  byNum: new Map(),
};

export async function loadLawText() {
  try {
    const res = await fetch("./assets/lei14133.txt", { cache: "no-store" });
    if (!res.ok) throw new Error("assets/lei14133.txt não encontrado");
    const text = await res.text();

    LAW.text = text;
    LAW.articles = parseArticles(text);
    LAW.byNum = new Map(LAW.articles.map(a => [a.num, a]));
    LAW.loaded = LAW.articles.length > 0;
  } catch (err) {
    LAW.loaded = false;
    LAW.text = "";
    LAW.articles = [];
    LAW.byNum = new Map();
    console.warn("Base da lei não carregada:", err?.message || err);
  }
}

// Parser tolerante (aceita "Art." / "ART." / "Artigo")
export function parseArticles(text) {
  const t = String(text || "");
  // separa por linhas que começam com Art./Artigo
  const parts = t.split(/\n(?=(?:Art\.|ART\.|Artigo|ARTIGO)\s*\d+)/g);
  const articles = [];

  for (const p of parts) {
    const m = p.match(/^(?:Art\.|ART\.|Artigo|ARTIGO)\s*(\d+[A-Za-z]?(?:º)?)\s*[-–—]?\s*(.*)$/m);
    if (!m) continue;

    const num = m[1].trim();
    const firstLine = (m[2] || "").trim();
    const body = p.trim();
    const title = firstLine.length > 0 ? firstLine : "";

    articles.push({ num, title, body });
  }
  return articles;
}

function escRe(s){ return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

export function findArticlesByKeywords(keywords, { limit = 6 } = {}) {
  if (!LAW.loaded) return [];
  const kws = (keywords || []).map(k => k.toLowerCase()).filter(Boolean);
  if (!kws.length) return [];

  const scored = LAW.articles.map(a => {
    const hay = (a.body || "").toLowerCase();
    const title = (a.title || "").toLowerCase();
    let score = 0;
    for (const k of kws) {
      const hits = (hay.match(new RegExp(escRe(k), "g")) || []).length;
      score += Math.min(hits, 8);
      if (title.includes(k)) score += 2;
    }
    return { a, score };
  });

  return scored
    .filter(x => x.score > 0)
    .sort((x,y) => y.score - x.score)
    .slice(0, limit)
    .map(x => x.a);
}

export function excerpt(text, max = 320) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  return clean.length > max ? clean.slice(0, max - 1) + "…" : clean;
}

export function formatLawCitations(articles) {
  if (!articles || !articles.length) return "";
  return articles.map(a => `• Art. ${a.num}${a.title ? ` — ${a.title}` : ""}\n  Trecho: ${excerpt(a.body, 320)}`).join("\n\n");
}

export function buildLegalBasis({ thesisTags = [], extraKeywords = [] } = {}) {
  const kws = new Set([...extraKeywords]);

  // mapeia tags -> blocos
  const tagMap = {
    "Restrição": LEGAL_KEYWORDS.especificacao.concat(LEGAL_KEYWORDS.competitividade),
    "Competitividade": LEGAL_KEYWORDS.competitividade,
    "Habilitação": LEGAL_KEYWORDS.habilitacao,
    "Prazos": LEGAL_KEYWORDS.prazos,
    "Financeiro": LEGAL_KEYWORDS.garantia,
    "Técnica": LEGAL_KEYWORDS.habilitacao.concat(LEGAL_KEYWORDS.especificacao),
    "Requisito": LEGAL_KEYWORDS.especificacao,
    "Execução": ["execução", "entrega", "amostra", "fiscalização", "sanções", "penalidades"].concat(LEGAL_KEYWORDS.prazos),
    "Dispensa": ["dispensa", "contratação direta", "justificativa", "pesquisa de preços"].concat(LEGAL_KEYWORDS.principios),
    "Dica": LEGAL_KEYWORDS.principios,
  };

  for (const t of thesisTags) {
    const arr = tagMap[t] || [];
    for (const k of arr) kws.add(k);
  }
  // sempre adiciona princípios (base)
  for (const k of LEGAL_KEYWORDS.principios) kws.add(k);

  const arts = findArticlesByKeywords(Array.from(kws), { limit: 10 });
  return {
    keywords: Array.from(kws),
    articles: arts,
    citations: formatLawCitations(arts)
  };
}
