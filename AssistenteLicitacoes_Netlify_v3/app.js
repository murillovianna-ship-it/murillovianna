/**
 * Assistente de Licitações (estático, uso pessoal)
 * - Projetos em localStorage
 * - Leitura guiada (wizard) => alertas + base legal local (Lei 14.133 em assets/lei14133.txt)
 * - Checklist por modalidade
 * - Gerador de minutas + export .doc timbrado
 * - PDF upload -> extrai texto (PDF.js) -> resumo via Netlify Function -> salva como trechos
 */

import { $, escapeHtml, escapeAttr, truncate, downloadFile, formatDateTimeLocal, upperOrBlank, switchTab } from "./modules/utils.js";
import { LAW, loadLawText, buildLegalBasis } from "./modules/law.js";
import { buildWordHtml, docToHtmlSections } from "./modules/export-doc.js";
import { extractPdfText, summarizeTextViaFunction, summaryToTrechos } from "./modules/pdf.js";

const LS_KEY = "al_projects_v2";

const state = {
  projects: [],
  activeId: null,
  activeTab: "dados",
  wizardStep: 0,
};

const uid = () => Math.random().toString(16).slice(2) + Date.now().toString(16);

/* -------------------- Base de Checklist -------------------- */
const CHECKLIST_PRESETS = {
  pregao: [
    {
      group: "1) Planejamento e leitura do edital/TR",
      items: [
        { id:"p_objeto", title:"Entendi o objeto e o escopo", help:"Verifique o objeto, entregáveis, local, prazos e condições de execução." },
        { id:"p_prazos", title:"Mapeei prazos e datas críticas", help:"Sessão, envio de proposta, prazos de esclarecimento/impugnação, execução/entrega." },
        { id:"p_criterio", title:"Critério de julgamento está claro", help:"Menor preço, maior desconto, técnica e preço, etc." },
        { id:"p_anexos", title:"Listei anexos e modelos exigidos", help:"Planilhas, declarações, termo de proposta, formulários." },
      ]
    },
    {
      group: "2) Habilitação jurídica",
      items: [
        { id:"hj_ato", title:"Ato constitutivo/CCMEI/contrato social (conforme aplicável)", help:"Conferir compatibilidade do CNAE/atividade com o objeto." },
        { id:"hj_representacao", title:"Documento de representação/procuração (se aplicável)", help:"Se quem assina/representa não for o titular/administrador." },
      ]
    },
    {
      group: "3) Regularidade fiscal e trabalhista",
      items: [
        { id:"rf_cnpj", title:"Comprovante de CNPJ", help:"Consulta/Comprovante de inscrição." },
        { id:"rf_fgts", title:"CRF/FGTS (se exigido)", help:"Ver se o edital pede expressamente." },
        { id:"rf_federal", title:"Regularidade Receita Federal/Dívida Ativa (se exigido)", help:"Verificar forma/consulta aceita." },
        { id:"rf_estadual", title:"Regularidade Estadual (se exigido)", help:"ICMS/inscrição estadual quando aplicável." },
        { id:"rf_municipal", title:"Regularidade Municipal (se exigido)", help:"ISS/inscrição municipal quando aplicável." },
        { id:"rf_trabalhista", title:"CNDT (se exigido)", help:"Certidão negativa de débitos trabalhistas." },
      ]
    },
    {
      group: "4) Qualificação técnica",
      items: [
        { id:"qt_atestado", title:"Atestado(s) de capacidade técnica (se exigido)", help:"Checar quantitativo, prazo, escopo, registro/assinatura." },
        { id:"qt_responsavel", title:"Responsável técnico/registro (se exigido)", help:"Apenas se pertinente ao objeto (CREA/CAU etc.)." },
        { id:"qt_catalogo", title:"Catálogo/ficha técnica (se exigido)", help:"Quando envolve bens/soluções técnicas." },
      ]
    },
    {
      group: "5) Econômico-financeira",
      items: [
        { id:"ef_balanço", title:"Balanço/Índices/PL (se exigido)", help:"Se pedir balanço, índices, patrimônio líquido ou capital mínimo." },
        { id:"ef_garantia", title:"Garantia (se exigido)", help:"Se o edital exigir garantia de proposta/contratual." },
      ]
    },
    {
      group: "6) Proposta e anexos",
      items: [
        { id:"pp_planilha", title:"Planilha de custos/formação de preços (se houver)", help:"Conferir itens, unidades, tributos, BDI/margem." },
        { id:"pp_proposta", title:"Proposta comercial conforme modelo", help:"Prazos, validade, condições e declarações." },
        { id:"pp_declaracoes", title:"Declarações do edital (todas)", help:"Cumprimento, inexistência de impedimentos, etc." },
      ]
    },
  ],
  dispensa: [
    {
      group: "1) Preparação (Dispensa)",
      items: [
        { id:"d_objeto", title:"Objeto e escopo claros", help:"Confirme exatamente o que será entregue/executado." },
        { id:"d_prazo", title:"Prazos e condições", help:"Entrega/execução, pagamento, penalidades." },
        { id:"d_criterio", title:"Critério de seleção / menor preço", help:"Como o órgão avaliará a proposta." },
      ]
    },
    {
      group: "2) Documentação mínima (comum)",
      items: [
        { id:"d_cnpj", title:"CNPJ/CCMEI/ato constitutivo", help:"Conforme seu tipo de empresa." },
        { id:"d_fiscal", title:"Regularidade fiscal (se exigida)", help:"Veja exatamente quais certidões pediram." },
        { id:"d_proposta", title:"Proposta assinada", help:"Com validade, prazo e condições." },
      ]
    },
    {
      group: "3) Técnica (quando aplicável)",
      items: [
        { id:"d_atestado", title:"Comprovação técnica (se exigida)", help:"Atestado, portfólio, comprovações." },
        { id:"d_catalogo", title:"Catálogo/ficha técnica (se exigido)", help:"Quando for bens/serviços técnicos." },
      ]
    },
  ]
};

/* -------------------- Wizard -------------------- */
const WIZARD = [
  {
    title: "Objeto & Escopo",
    desc: "Entender exatamente o que querem contratar.",
    questions: [
      { key:"tem_escopo_claro", title:"O escopo/entregáveis estão claros no TR?", help:"Se estiver vago, você pode pedir esclarecimento para evitar risco na proposta.", options:["Sim","Mais ou menos","Não"] },
      { key:"tem_planilha", title:"Existe planilha/modelo obrigatório de proposta ou custos?", help:"Se houver modelo, siga exatamente para evitar desclassificação.", options:["Sim","Não","Não sei"] },
    ]
  },
  {
    title: "Prazos & Condições",
    desc: "Sessão, prazos de envio, execução, amostra, visita técnica etc.",
    questions: [
      { key:"prazo_exiguo", title:"O prazo para preparar proposta/documentos parece exíguo?", help:"Se comprometer competitividade, pode virar pedido de prorrogação/impugnação.", options:["Sim","Não","Não sei"] },
      { key:"pagamento_claro", title:"Condição de pagamento está clara e viável?", help:"Se for confusa/inviável, peça esclarecimento.", options:["Sim","Não","Não sei"] },
    ]
  },
  {
    title: "Especificação técnica",
    desc: "Riscos de restrição à competitividade.",
    questions: [
      { key:"marca_modelo", title:"O edital/TR exige marca/modelo específico?", help:"Sem justificativa e sem “equivalente”, isso pode ser restritivo.", options:["Sim","Não","Não sei"] },
      { key:"exige_certificacao", title:"Exige certificação específica (ISO, selo, laudo) sem explicar o porquê?", help:"Pode ser válido, mas precisa fazer sentido com o objeto.", options:["Sim","Não","Não sei"] },
    ]
  },
  {
    title: "Habilitação e documentos",
    desc: "Excesso, duplicidade ou exigência desproporcional.",
    questions: [
      { key:"atestado_excessivo", title:"Atestado técnico com quantitativo/prazo muito alto?", help:"Exigência desproporcional reduz competição.", options:["Sim","Não","Não sei"] },
      { key:"excesso_docs", title:"Pediram documentos demais ou repetidos na habilitação?", help:"Excesso documental é ponto de atenção.", options:["Sim","Não","Não sei"] },
    ]
  },
  {
    title: "Visita técnica / amostra / garantia",
    desc: "Exigências que derrubam licitante no detalhe.",
    questions: [
      { key:"visita_obrigatoria", title:"Visita técnica é obrigatória?", help:"Se não for indispensável, pode ser restritiva.", options:["Sim","Não","Não sei"] },
      { key:"amostra_indevida", title:"Pediram amostra antes da fase correta ou com prazo inviável?", help:"Pode ser legítima, mas o modo/prazo pode ser questionável.", options:["Sim","Não","Não sei"] },
      { key:"garantia", title:"Existe exigência de garantia (proposta/contratual) fora do normal?", help:"Garantias precisam ser claras e proporcionais.", options:["Sim","Não","Não sei"] },
    ]
  },
];

/* -------------------- Minutas -------------------- */
function buildDoc(project, opts) {
  const { tipo, tom, resumo, pedido, item, destino, trecho, obs, legalBasisText } = opts;

  const titleMap = {
    esclarecimento: "PEDIDO DE ESCLARECIMENTO",
    impugnacao: "IMPUGNAÇÃO AO EDITAL",
    recurso: "RECURSO ADMINISTRATIVO",
    contrarrazoes: "CONTRARRAZÕES",
    diligencia: "MANIFESTAÇÃO / RESPOSTA À DILIGÊNCIA"
  };

  const destinoLine = destino?.trim()
    ? destino.trim()
    : (project.modalidade === "pregao" ? "Pregoeiro(a) / Agente de Contratação" : "Agente de Contratação / Comissão");

  const tomBlocos = {
    tecnico: {
      intro: "vem, respeitosamente, apresentar a presente manifestação, com foco objetivo na adequação do instrumento convocatório/entendimento do objeto, buscando segurança, isonomia e competitividade.",
      direito: "Ressalta-se a necessidade de requisitos proporcionais, objetivos e tecnicamente motivados, preservando a ampla competitividade e a seleção da proposta mais vantajosa, conforme os princípios e diretrizes aplicáveis."
    },
    formal: {
      intro: "vem, respeitosamente, apresentar a presente peça, visando resguardar a legalidade, a isonomia e o caráter competitivo do certame, bem como a obtenção da proposta mais vantajosa para a Administração.",
      direito: "Requisitos habilitatórios e especificações técnicas devem ser motivados, proporcionais e pertinentes ao objeto, sob pena de restrição indevida à competitividade e comprometimento da vantajosidade."
    },
    curto: {
      intro: "vem apresentar a presente peça, de forma direta, para ajuste e esclarecimento dos pontos indicados.",
      direito: "Solicita-se adequação/clareza para evitar restrição de competitividade e risco de inconsistências na proposta."
    }
  };
  const tb = tomBlocos[tom] || tomBlocos.tecnico;

  const cabecalho = `
À
${upperOrBlank(project.orgao)}

A/C: ${upperOrBlank(destinoLine)}

Ref.: ${upperOrBlank(project.edital)}
Objeto: ${upperOrBlank(project.objeto)}
Portal/Plataforma: ${upperOrBlank(project.portal)}
Sessão: ${formatDateTimeLocal(project.sessao)}
`;

  const facts = `
I. DOS FATOS / DO PONTO OBJETO DE ANÁLISE
A empresa ${upperOrBlank(project.empresa)} (CNPJ ${upperOrBlank(project.cnpj)}), contato ${upperOrBlank(project.contato)}, ${tb.intro}

Resumo do ponto:
${upperOrBlank(resumo)}

${item?.trim() ? `Referência: ${item.trim()}\n` : ""}

Trecho do edital/TR:
${(trecho || "").trim() ? `“${trecho.trim()}”` : "(Cole o trecho do edital/TR que embasa o pedido.)"}
`;

  const legal = `
II. DA FUNDAMENTAÇÃO (COMPLETA)
${tb.direito}

Base legal (Lei nº 14.133/2021 — base local):
${(legalBasisText || "").trim() ? legalBasisText.trim() : "(Base legal não carregada. Verifique assets/lei14133.txt)"}

Observações adicionais:
${(obs || "").trim() ? obs.trim() : "(Descreva impactos práticos, risco de restrição, prazos, etc.)"}
`;

  const pedidoBlock = `
III. DO PEDIDO
Diante do exposto, requer-se:
1) ${upperOrBlank(pedido)}
2) que a Administração responda formalmente ao presente pleito, com publicidade e transparência, adotando as providências cabíveis.

Termos em que,
Pede deferimento.

${upperOrBlank(project.cidade)}, ____ de ______________ de 20____.

____________________________________
${upperOrBlank(project.empresa)}
${upperOrBlank(project.contato)}
`;

  return `
${cabecalho.trim()}

${titleMap[tipo] || "MANIFESTAÇÃO"}
(Lei nº 14.133/2021 — referência)

${facts.trim()}

${legal.trim()}

${pedidoBlock.trim()}
`.trim();
}

/* -------------------- Alertas (heurísticas) -------------------- */
function computeAlerts(project) {
  const a = [];
  const w = project.wizard || {};
  const trechos = project.trechos || [];
  const push = (tag, title, text) => a.push({ tag, title, text });

  if (w.marca_modelo === "Sim") push("Restrição", "Possível especificação de marca/modelo",
    "Verifique se há justificativa técnica e se aceita equivalente. Se não, pode caber esclarecimento/impugnação com pedido de descrição por desempenho.");
  if (w.atestado_excessivo === "Sim") push("Técnica", "Atestado possivelmente desproporcional",
    "Compare quantitativo/prazo exigido com o escopo. Se elevar demais a barreira, peça calibragem/justificativa.");
  if (w.visita_obrigatoria === "Sim") push("Competitividade", "Visita técnica obrigatória",
    "Confirme se é indispensável. Se o TR já descreve suficiente, visita obrigatória pode ser restritiva.");
  if (w.excesso_docs === "Sim") push("Habilitação", "Excesso de documentação",
    "Liste duplicidades e documentos fora de fase. Peça simplificação/clareza do rol documental.");
  if (w.prazo_exiguo === "Sim") push("Prazos", "Prazo potencialmente exíguo",
    "Se comprometer proposta/habilitação, pode caber pedido de prorrogação (e retificação se necessário).");
  if (w.exige_certificacao === "Sim") push("Requisito", "Certificação específica sem motivação clara",
    "Confirme pertinência ao objeto e se há alternativa equivalente. Peça justificativa/aceitação de equivalentes quando cabível.");
  if (w.amostra_indevida === "Sim") push("Execução", "Amostra/validação com risco de inviabilidade",
    "Amostra pode ser legítima, mas modo e prazos devem ser objetivos e razoáveis. Se inviável, é ponto de esclarecimento/ajuste.");
  if (w.garantia === "Sim") push("Financeiro", "Garantia fora do padrão",
    "Verifique modalidade, percentuais, prazos e condições. Se confuso ou desproporcional, peça esclarecimento/retificação.");

  if (trechos.length === 0) push("Dica", "Sem trechos salvos ainda",
    "Cole itens de habilitação e especificação técnica para facilitar minuta e checklist com referência (item/página).");

  if (project.modalidade === "dispensa") push("Dispensa", "Atenção à objetividade da proposta",
    "Em dispensa, deixe proposta e condições cristalinas: prazo, forma de entrega, pagamento e validade.");

  return a;
}

/* -------------------- Storage -------------------- */
function loadProjects() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    state.projects = Array.isArray(arr) ? arr : [];
  } catch { state.projects = []; }
}
function saveProjects() { localStorage.setItem(LS_KEY, JSON.stringify(state.projects)); }
function getActiveProject() { return state.projects.find(p => p.id === state.activeId) || null; }

function upsertProject(patch) {
  const idx = state.projects.findIndex(p => p.id === state.activeId);
  if (idx < 0) return;
  state.projects[idx] = { ...state.projects[idx], ...patch, updatedAt: Date.now() };
  saveProjects();
  setAutosave(true);
  renderProjectsList();
  renderReport();
}

let autosaveTimer = null;
function setAutosave(ok) {
  const pill = $("autosavePill");
  if (!pill) return;
  pill.textContent = ok ? "Salvo" : "Salvando...";
  pill.style.opacity = ok ? "1" : ".8";
}
function scheduleAutosave(fn) {
  setAutosave(false);
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => { fn(); setAutosave(true); }, 250);
}

/* -------------------- UI Tabs -------------------- */
function bindTabs() {
  $("tabs").addEventListener("click", (e) => {
    const btn = e.target.closest(".tab"); if (!btn) return;
    const tab = btn.dataset.tab;
    state.activeTab = tab;

    document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === tab));
    document.querySelectorAll(".tabpane").forEach(p => p.classList.remove("active"));
    $("tab-" + tab).classList.add("active");

    if (tab === "checklist") renderChecklist();
    if (tab === "leitura") renderWizard();
    if (tab === "relatorio") renderReport();
  });
}

/* -------------------- Projects -------------------- */
function newProject() {
  const id = uid();
  const p = {
    id,
    name: "Novo projeto",
    modalidade: "pregao",
    orgao: "",
    edital: "",
    portal: "",
    cidade: "",
    objeto: "",
    criterio: "menor_preco",
    sessao: "",
    prazo_interno: "",
    empresa: "Murillo da Silva Vianna",
    cnpj: "64737330000147",
    contato: "(21) 99431-8715",
    obs: "",
    wizard: {},
    trechos: [],
    checklist: {},
    pdfSummary: null,
    updatedAt: Date.now(),
    createdAt: Date.now(),
  };
  state.projects.unshift(p);
  state.activeId = id;
  saveProjects();
  renderProjectsList();
  hydrateProjectToForm();
  renderWizard();
  renderChecklist();
  renderReport();
}

function renderProjectsList() {
  const q = ($("searchProjects").value || "").toLowerCase().trim();
  const box = $("projectsList");
  const list = state.projects.filter(p => {
    if (!q) return true;
    const hay = `${p.name} ${p.orgao} ${p.edital} ${p.objeto}`.toLowerCase();
    return hay.includes(q);
  });

  box.innerHTML = list.map(p => `
    <div class="project ${p.id === state.activeId ? "active":""}" data-id="${p.id}">
      <h3>${escapeHtml(p.name || "Sem nome")}</h3>
      <p>${escapeHtml((p.modalidade || "").toUpperCase())} • ${escapeHtml(p.edital || "Sem nº")}<br/>
      <span class="muted">${escapeHtml(p.orgao || "")}</span></p>
    </div>
  `).join("");

  box.querySelectorAll(".project").forEach(el => {
    el.addEventListener("click", () => {
      state.activeId = el.dataset.id;
      renderProjectsList();
      hydrateProjectToForm();
      renderWizard();
      renderChecklist();
      renderReport();
    });
  });
}

/* -------------------- Dados -------------------- */
function hydrateProjectToForm() {
  const p = getActiveProject(); if (!p) return;

  $("p_nome").value = p.name || "";
  $("p_modalidade").value = p.modalidade || "pregao";
  $("p_orgao").value = p.orgao || "";
  $("p_edital").value = p.edital || "";
  $("p_portal").value = p.portal || "";
  $("p_cidade").value = p.cidade || "";
  $("p_objeto").value = p.objeto || "";
  $("p_criterio").value = p.criterio || "menor_preco";
  $("p_sessao").value = p.sessao || "";
  $("p_prazo_interno").value = p.prazo_interno || "";
  $("p_empresa").value = p.empresa || "";
  $("p_cnpj").value = p.cnpj || "";
  $("p_contato").value = p.contato || "";
  $("p_obs").value = p.obs || "";

  renderTrechos();
  renderAlerts();
  hydratePdfState(p);
}

function bindDataForm() {
  const fields = [
    ["p_nome","name"], ["p_modalidade","modalidade"], ["p_orgao","orgao"], ["p_edital","edital"],
    ["p_portal","portal"], ["p_cidade","cidade"], ["p_objeto","objeto"], ["p_criterio","criterio"],
    ["p_sessao","sessao"], ["p_prazo_interno","prazo_interno"], ["p_empresa","empresa"], ["p_cnpj","cnpj"],
    ["p_contato","contato"], ["p_obs","obs"],
  ];

  fields.forEach(([id, key]) => {
    $(id).addEventListener("input", (e) => {
      scheduleAutosave(() => upsertProject({ [key]: e.target.value }));
      if (key === "name") renderProjectsList();
    });
    $(id).addEventListener("change", (e) => {
      scheduleAutosave(() => upsertProject({ [key]: e.target.value }));
      if (key === "modalidade") { renderChecklist(); renderReport(); }
    });
  });
}

/* -------------------- Wizard -------------------- */
function renderWizard() {
  const p = getActiveProject(); if (!p) return;

  const steps = $("wizardSteps");
  steps.innerHTML = WIZARD.map((s, i) => `
    <div class="step ${i === state.wizardStep ? "active":""}" data-i="${i}">
      <h4>${escapeHtml(s.title)}</h4>
      <p>${escapeHtml(s.desc)}</p>
    </div>
  `).join("");
  steps.querySelectorAll(".step").forEach(el => {
    el.addEventListener("click", () => { state.wizardStep = Number(el.dataset.i); renderWizard(); });
  });

  const pane = $("wizardPane");
  const step = WIZARD[state.wizardStep];
  pane.innerHTML = `
    <h3>${escapeHtml(step.title)}</h3>
    <p class="muted small">${escapeHtml(step.desc)}</p>
    <div class="hr"></div>
    ${step.questions.map(q => renderQuestion(p, q)).join("")}
  `;

  pane.querySelectorAll(".opt").forEach(btn => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.key;
      const val = btn.dataset.val;
      const wizard = { ...(p.wizard || {}), [key]: val };
      upsertProject({ wizard });
      renderWizard();
    });
  });

  renderTrechos();
  renderAlerts();
}

function renderQuestion(p, q) {
  const cur = (p.wizard || {})[q.key] || "";
  return `
    <div class="q">
      <div class="q-title">${escapeHtml(q.title)}</div>
      <div class="q-help">${escapeHtml(q.help)}</div>
      <div class="q-opts">
        ${q.options.map(opt => `
          <div class="opt ${opt===cur ? "active":""}" data-key="${q.key}" data-val="${opt}">${escapeHtml(opt)}</div>
        `).join("")}
      </div>
    </div>
  `;
}

function bindWizardButtons() {
  const reset = () => { upsertProject({ wizard: {} }); state.wizardStep = 0; renderWizard(); };

  $("btnResetWizard").addEventListener("click", reset);
  $("btnResetWizard2").addEventListener("click", reset);

  const run = () => {
    renderAlerts(true);
    renderReport();
    $("alertsBox").scrollIntoView({ behavior:"smooth", block:"start" });
  };

  $("btnRunAnalysis").addEventListener("click", run);
  $("btnRunAnalysis2").addEventListener("click", run);
}

/* -------------------- Trechos -------------------- */
function bindTrechos() {
  $("btnAddTrecho").addEventListener("click", () => {
    const p = getActiveProject(); if (!p) return;
    const item = $("t_item").value.trim();
    const titulo = $("t_titulo").value.trim();
    const texto = $("t_texto").value.trim();
    if (!texto) return alert("Cole um trecho do edital/TR antes de adicionar.");

    const trechos = [...(p.trechos || [])];
    trechos.unshift({ id: uid(), item, titulo, texto, createdAt: Date.now() });
    upsertProject({ trechos });

    $("t_item").value = "";
    $("t_titulo").value = "";
    $("t_texto").value = "";
    renderTrechos();
  });

  $("btnClearTrechos").addEventListener("click", () => {
    if (!confirm("Limpar todos os trechos salvos deste projeto?")) return;
    upsertProject({ trechos: [] });
    renderTrechos();
  });
}

function renderTrechos() {
  const p = getActiveProject(); if (!p) return;
  const list = $("trechosList");
  const trechos = p.trechos || [];

  list.innerHTML = trechos.length ? trechos.map(t => `
    <div class="alert">
      <div class="tag">${escapeHtml(t.item || "Trecho")}</div>
      <h4>${escapeHtml(t.titulo || "Trecho")}</h4>
      <p class="muted small">${new Date(t.createdAt).toLocaleString("pt-BR")}</p>
      <pre class="pre">${escapeHtml(t.texto || "")}</pre>
      <div class="actions">
        <button class="btn ghost" data-del="${t.id}">Remover</button>
        <button class="btn ghost" data-use="${t.id}">Usar na minuta</button>
      </div>
    </div>
  `).join("") : `<p class="muted small">Nenhum trecho salvo ainda.</p>`;

  list.querySelectorAll("[data-del]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.del;
      const trechos2 = (p.trechos || []).filter(x => x.id !== id);
      upsertProject({ trechos: trechos2 });
      renderTrechos();
    });
  });

  list.querySelectorAll("[data-use]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.use;
      const t = (p.trechos || []).find(x => x.id === id);
      if (!t) return;
      $("m_item").value = t.item || $("m_item").value;
      $("m_trecho").value = t.texto || $("m_trecho").value;
      switchTab("minutas");
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });
}

/* -------------------- Alerts -------------------- */
function renderAlerts(showToast) {
  const p = getActiveProject(); if (!p) return;
  const alerts = computeAlerts(p);
  const box = $("alertsBox");

  box.innerHTML = alerts.map(a => `
    <div class="alert">
      <div class="tag">${escapeHtml(a.tag)}</div>
      <h4>${escapeHtml(a.title)}</h4>
      <p>${escapeHtml(a.text)}</p>
    </div>
  `).join("");

  if (showToast) alert("Alertas atualizados. Revise e, se necessário, gere minuta de esclarecimento/impugnação.");
}

/* -------------------- Checklist -------------------- */
function bindChecklistButtons() {
  $("btnApplyPreset").addEventListener("click", () => {
    const p = getActiveProject(); if (!p) return;
    const preset = CHECKLIST_PRESETS[p.modalidade] || CHECKLIST_PRESETS.pregao;
    const checklist = { ...(p.checklist || {}) };
    preset.forEach(g => g.items.forEach(it => { if (!checklist[it.id]) checklist[it.id] = { status:"pend", onde:"", obs:"" }; }));
    upsertProject({ checklist });
    renderChecklist();
  });

  $("btnResetChecklist").addEventListener("click", () => {
    if (!confirm("Zerar status e campos do checklist deste projeto?")) return;
    const p = getActiveProject(); if (!p) return;
    const checklist = { ...(p.checklist || {}) };
    Object.keys(checklist).forEach(k => checklist[k] = { status:"pend", onde:"", obs:"" });
    upsertProject({ checklist });
    renderChecklist();
  });
}

function renderChecklist() {
  const p = getActiveProject(); if (!p) return;
  const preset = CHECKLIST_PRESETS[p.modalidade] || CHECKLIST_PRESETS.pregao;
  const container = $("checklistContainer");

  const checklist = { ...(p.checklist || {}) };
  preset.forEach(g => g.items.forEach(it => { if (!checklist[it.id]) checklist[it.id] = { status:"pend", onde:"", obs:"" }; }));
  upsertProject({ checklist });

  container.innerHTML = preset.map(group => `
    <div class="cl-group">
      <h3>${escapeHtml(group.group)}</h3>
      ${group.items.map(it => renderChecklistItem(it, checklist[it.id])).join("")}
    </div>
  `).join("");

  container.querySelectorAll("[data-status]").forEach(btn => {
    btn.addEventListener("click", () => {
      const itemId = btn.dataset.item;
      const status = btn.dataset.status;
      const p2 = getActiveProject(); if (!p2) return;

      const cl = { ...(p2.checklist || {}) };
      cl[itemId] = { ...(cl[itemId]||{}), status };
      upsertProject({ checklist: cl });
      renderChecklist();
      renderReport();
    });
  });

  container.querySelectorAll("[data-onde]").forEach(inp => {
    inp.addEventListener("input", () => {
      const itemId = inp.dataset.onde;
      const p2 = getActiveProject(); if (!p2) return;
      const cl = { ...(p2.checklist || {}) };
      cl[itemId] = { ...(cl[itemId]||{}), onde: inp.value };
      scheduleAutosave(() => upsertProject({ checklist: cl }));
    });
  });

  container.querySelectorAll("[data-obs]").forEach(inp => {
    inp.addEventListener("input", () => {
      const itemId = inp.dataset.obs;
      const p2 = getActiveProject(); if (!p2) return;
      const cl = { ...(p2.checklist || {}) };
      cl[itemId] = { ...(cl[itemId]||{}), obs: inp.value };
      scheduleAutosave(() => upsertProject({ checklist: cl }));
    });
  });
}

function renderChecklistItem(item, st) {
  const status = st?.status || "pend";
  return `
    <div class="cl-item">
      <div>
        <div class="cl-title">${escapeHtml(item.title)}</div>
        <div class="cl-help">${escapeHtml(item.help || "")}</div>
      </div>

      <div class="status">
        <div class="badge ${status==="ok" ? "active ok":""}" data-item="${item.id}" data-status="ok">Ok</div>
        <div class="badge ${status==="pend" ? "active pend":""}" data-item="${item.id}" data-status="pend">Pendente</div>
        <div class="badge ${status==="na" ? "active na":""}" data-item="${item.id}" data-status="na">N/A</div>
      </div>

      <div class="cl-mini">
        <label>Onde no edital/TR</label>
        <input class="input" data-onde="${item.id}" value="${escapeAttr(st?.onde || "")}" placeholder="Ex.: Item 9.2, pág. 14" />
      </div>

      <div class="cl-mini">
        <label>Obs</label>
        <textarea class="input" rows="2" data-obs="${item.id}" placeholder="Notas, pendências, responsável...">${escapeHtml(st?.obs || "")}</textarea>
      </div>
    </div>
  `;
}

/* -------------------- Minutas -------------------- */
function bindMinutas() {
  $("btnGenerateDoc").addEventListener("click", () => {
    const p = getActiveProject(); if (!p) return;

    const alerts = computeAlerts(p);
    const thesisTags = alerts.map(a => a.tag);
    const basis = buildLegalBasis({ thesisTags });

    const doc = buildDoc(p, {
      tipo: $("m_tipo").value,
      tom: $("m_tom").value,
      resumo: $("m_resumo").value,
      pedido: $("m_pedido").value,
      item: $("m_item").value,
      destino: $("m_destino").value,
      trecho: $("m_trecho").value,
      obs: $("m_obs").value,
      legalBasisText: basis.citations
    });

    $("docPreview").textContent = doc;
    renderReport();
  });

  $("btnClearDoc").addEventListener("click", () => $("docPreview").textContent = "");

  $("btnInsertFromTrechos").addEventListener("click", () => {
    const p = getActiveProject(); if (!p) return;
    const t = (p.trechos || [])[0];
    if (!t) return alert("Não há trechos salvos.");
    $("m_item").value = t.item || $("m_item").value;
    $("m_trecho").value = t.texto || $("m_trecho").value;
  });

  $("btnCopyDoc").addEventListener("click", async () => {
    const text = ($("docPreview").textContent || "").trim();
    if (!text) return alert("Gere a minuta primeiro.");
    await navigator.clipboard.writeText(text);
    alert("Minuta copiada. Cole no Word/Docs e ajuste detalhes do caso.");
  });

  $("btnDownloadTxt").addEventListener("click", () => {
    const text = ($("docPreview").textContent || "").trim();
    if (!text) return alert("Gere a minuta primeiro.");
    downloadFile("minuta.txt", text, "text/plain;charset=utf-8");
  });

  $("btnDownloadDoc").addEventListener("click", () => {
    const text = ($("docPreview").textContent || "").trim();
    if (!text) return alert("Gere a minuta primeiro.");
    const { title, bodyHtml } = docToHtmlSections(text);
    const html = buildWordHtml({ title, bodyHtml });
    const fileName = (title || "minuta").toLowerCase().replace(/[^\w\-]+/g, "_").slice(0, 60);
    downloadFile(`${fileName}.doc`, html, "application/msword");
  });

  $("btnPrint").addEventListener("click", () => {
    const text = ($("docPreview").textContent || "").trim();
    if (!text) return alert("Gere a minuta primeiro.");
    const w = window.open("", "_blank");
    w.document.write(`
      <html><head><meta charset="utf-8"><title>Minuta</title></head>
      <body style="font-family:Arial;padding:20px">
        <pre style="white-space:pre-wrap;font:14px/1.6 Arial">${escapeHtml(text)}</pre>
      </body></html>
    `);
    w.document.close(); w.focus(); w.print();
  });
}

/* -------------------- Relatório -------------------- */
function renderReport() {
  const p = getActiveProject(); if (!p) return;

  const alerts = computeAlerts(p);
  const cl = p.checklist || {};
  const clEntries = Object.entries(cl);

  const pend = clEntries.filter(([_, v]) => (v?.status || "pend") === "pend").length;
  const ok = clEntries.filter(([_, v]) => v?.status === "ok").length;
  const na = clEntries.filter(([_, v]) => v?.status === "na").length;

  const trechos = (p.trechos || []).slice(0, 5).map(t =>
    `- ${t.titulo || "Trecho"} (${t.item || "sem ref"}): ${truncate(t.texto || "", 180)}`
  ).join("\n");

  const alertTxt = alerts.map(a => `- [${a.tag}] ${a.title}: ${a.text}`).join("\n");

  const report = `
RELATÓRIO — ${p.name || "Projeto"}
Modalidade: ${(p.modalidade || "").toUpperCase()}
Órgão: ${p.orgao || "-"}
Edital/Processo: ${p.edital || "-"}
Objeto: ${p.objeto || "-"}
Portal: ${p.portal || "-"}
Sessão: ${formatDateTimeLocal(p.sessao)}
Cidade/UF: ${p.cidade || "-"}
Empresa: ${p.empresa || "-"} (CNPJ ${p.cnpj || "-"}) • ${p.contato || "-"}

CHECKLIST (status)
- Ok: ${ok}
- Pendente: ${pend}
- N/A: ${na}

ALERTAS (leitura guiada)
${alertTxt || "- (sem alertas)"}

TRECHOS SALVOS (últimos 5)
${trechos || "- (nenhum trecho salvo)"}

OBSERVAÇÕES DO PROJETO
${p.obs || "-"}
`.trim();

  $("reportBox").textContent = report;
}

function bindReportButtons() {
  $("btnCopyReport").addEventListener("click", async () => {
    const txt = ($("reportBox").textContent || "").trim();
    if (!txt) return;
    await navigator.clipboard.writeText(txt);
    alert("Relatório copiado.");
  });

  $("btnPrintReport").addEventListener("click", () => {
    const txt = ($("reportBox").textContent || "").trim();
    if (!txt) return;
    const w = window.open("", "_blank");
    w.document.write(`
      <html><head><meta charset="utf-8"><title>Relatório</title></head>
      <body style="font-family:Arial;padding:20px">
        <pre style="white-space:pre-wrap;font:14px/1.6 Arial">${escapeHtml(txt)}</pre>
      </body></html>
    `);
    w.document.close(); w.focus(); w.print();
  });
}

/* -------------------- Import/Export Projeto -------------------- */
function bindImportExport() {
  $("btnExportProject").addEventListener("click", () => {
    const p = getActiveProject(); if (!p) return alert("Selecione um projeto.");
    const json = JSON.stringify(p, null, 2);
    const file = (p.name || "projeto").replace(/[^\w\-]+/g, "_").slice(0,60);
    downloadFile(`${file}.json`, json, "application/json;charset=utf-8");
  });

  $("btnImportProject").addEventListener("click", () => $("importFile").click());

  $("importFile").addEventListener("change", async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const txt = await file.text();
    try {
      const obj = JSON.parse(txt);
      if (!obj || !obj.id) throw new Error("Arquivo inválido.");
      const existing = state.projects.find(x => x.id === obj.id);
      const imported = existing ? { ...obj, id: uid(), name: `${obj.name || "Projeto"} (importado)` } : obj;
      state.projects.unshift(imported);
      state.activeId = imported.id;
      saveProjects();
      renderProjectsList();
      hydrateProjectToForm();
      renderWizard();
      renderChecklist();
      renderReport();
      alert("Projeto importado com sucesso.");
    } catch {
      alert("Não foi possível importar. Verifique se é um JSON exportado pelo sistema.");
    } finally { e.target.value = ""; }
  });
}

/* -------------------- PDF -> Resumo -------------------- */
let lastPdfExtract = { text:"", pagesRead:0, pagesTotal:0 };

function hydratePdfState(p){
  const out = $("pdfOut");
  const btnToTrechos = $("btnPdfToTrechos");
  const btnCopy = $("btnPdfCopy");

  if (p?.pdfSummary) {
    out.textContent = JSON.stringify(p.pdfSummary, null, 2);
    btnToTrechos.disabled = false;
    btnCopy.disabled = false;
  } else {
    out.textContent = "";
    btnToTrechos.disabled = true;
    btnCopy.disabled = true;
  }
}

function bindPdf() {
  const fileInput = $("pdfFile");
  const status = $("pdfStatus");
  const btnExtract = $("btnPdfExtract");
  const btnSumm = $("btnPdfSummarize");
  const txtArea = $("pdfText");

  fileInput.addEventListener("change", () => {
    const f = fileInput.files?.[0];
    status.textContent = f ? `Selecionado: ${f.name} (${Math.round(f.size/1024)} KB)` : "Nenhum arquivo selecionado.";
    btnSumm.disabled = true;
    txtArea.value = "";
    lastPdfExtract = { text:"", pagesRead:0, pagesTotal:0 };
  });

  btnExtract.addEventListener("click", async () => {
    const f = fileInput.files?.[0];
    if (!f) return alert("Selecione um PDF primeiro.");

    status.textContent = "Extraindo texto do PDF...";
    btnExtract.disabled = true;
    btnSumm.disabled = true;

    try {
      const { text, pagesRead, pagesTotal } = await extractPdfText(f, { maxPages: 40 });
      lastPdfExtract = { text, pagesRead, pagesTotal };
      txtArea.value = text || "";
      status.textContent = text
        ? `Texto extraído. Páginas lidas: ${pagesRead}/${pagesTotal}.`
        : `Não consegui extrair texto. Se for PDF escaneado, precisará OCR.`;
      btnSumm.disabled = !text;
    } catch (e) {
      console.error(e);
      status.textContent = "Falha ao extrair texto.";
      alert(e.message || "Falha ao extrair texto do PDF.");
    } finally {
      btnExtract.disabled = false;
    }
  });

  btnSumm.addEventListener("click", async () => {
    const p = getActiveProject(); if (!p) return;
    const text = (txtArea.value || "").trim();
    if (!text) return alert("Extraia ou cole texto antes.");

    const docType = $("pdfDocType").value;
    const goal = $("pdfGoal").value;
    const note = ($("pdfNote").value || "").trim();

    status.textContent = "Enviando para IA (Netlify Function)...";
    btnSumm.disabled = true;

    try {
      const result = await summarizeTextViaFunction({ text, docType, goal, note, project: p });
      upsertProject({ pdfSummary: result });
      hydratePdfState(getActiveProject());
      status.textContent = "Resumo pronto.";
    } catch (e) {
      console.error(e);
      status.textContent = "Falha ao gerar resumo.";
      alert(e.message || "Falha ao gerar resumo com IA.");
    } finally {
      btnSumm.disabled = false;
    }
  });

  $("btnPdfCopy").addEventListener("click", async () => {
    const p = getActiveProject(); if (!p?.pdfSummary) return;
    await navigator.clipboard.writeText(JSON.stringify(p.pdfSummary, null, 2));
    alert("Resumo copiado.");
  });

  $("btnPdfToTrechos").addEventListener("click", () => {
    const p = getActiveProject(); if (!p?.pdfSummary) return;
    const trechos = [...(p.trechos || [])];
    const add = summaryToTrechos(p.pdfSummary);
    if (!add.length) return alert("Nada para salvar como trechos.");
    add.reverse().forEach(t => trechos.unshift(t));
    upsertProject({ trechos });
    renderTrechos();
    alert(`Salvei ${add.length} bloco(s) como Trechos.`);
    switchTab("dados");
  });
}

/* -------------------- Init -------------------- */
async function init() {
  // carrega base legal local
  await loadLawText();

  loadProjects();
  if (state.projects.length === 0) newProject();
  else {
    state.activeId = state.projects[0].id;
    renderProjectsList();
    hydrateProjectToForm();
  }

  bindTabs();
  bindDataForm();
  bindWizardButtons();
  bindTrechos();
  bindChecklistButtons();
  bindMinutas();
  bindReportButtons();
  bindImportExport();
  bindPdf();

  $("btnNewProject").addEventListener("click", newProject);
  $("searchProjects").addEventListener("input", () => renderProjectsList());

  renderWizard();
  renderChecklist();
  renderReport();

  if (!LAW.loaded) {
    console.warn("Lei 14.133 não carregou. Verifique assets/lei14133.txt");
  }
}

init();
