export const $ = (id) => document.getElementById(id);

export function escapeHtml(str){
  return String(str ?? "").replace(/[&<>"']/g, (m) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));
}

export function escapeAttr(str){
  return escapeHtml(str).replace(/"/g, "&quot;");
}

export function truncate(s, n){
  const t = String(s||"").replace(/\s+/g," ").trim();
  return t.length > n ? t.slice(0, n-1) + "…" : t;
}

export function downloadFile(filename, content, mime){
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function formatDateTimeLocal(dt) {
  if (!dt) return "___/___/_____";
  try { return new Date(dt).toLocaleString("pt-BR"); } catch { return "___/___/_____"; }
}

export function upperOrBlank(s){ return (s||"").trim() || "________________"; }

export function switchTab(tab){
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === tab));
  document.querySelectorAll(".tabpane").forEach(p => p.classList.remove("active"));
  $( "tab-" + tab )?.classList.add("active");
}
