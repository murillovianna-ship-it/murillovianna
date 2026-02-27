// Netlify Function: serve PDF.js assets via same-origin to avoid CDN blocks
// Usage:
//   /.netlify/functions/pdfjs?file=pdf   -> pdf.min.js
//   /.netlify/functions/pdfjs?file=worker -> pdf.worker.min.js
// This function fetches from reputable CDN server-side.

export async function handler(event) {
  try {
    const file = (event.queryStringParameters?.file || "pdf").toLowerCase();
    const version = "4.10.38";
    const base = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${version}/`;

    const map = {
      pdf: "pdf.min.js",
      worker: "pdf.worker.min.js",
    };

    const name = map[file] || map.pdf;
    const url = base + name;

    const res = await fetch(url, {
      headers: {
        // Cloudflare caches aggressively; we can request normal.
        "user-agent": "netlify-function",
      },
    });

    if (!res.ok) {
      return {
        statusCode: 502,
        headers: { "content-type": "text/plain; charset=utf-8" },
        body: `Falha ao obter ${name} do CDN (status ${res.status}).`,
      };
    }

    const body = await res.text();

    return {
      statusCode: 200,
      headers: {
        "content-type": "application/javascript; charset=utf-8",
        // cache no browser e no edge do Netlify
        "cache-control": "public, max-age=86400",
      },
      body,
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "content-type": "text/plain; charset=utf-8" },
      body: `Erro inesperado ao servir PDF.js: ${err?.message || err}`,
    };
  }
}
