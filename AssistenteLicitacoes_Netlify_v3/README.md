# Assistente de Licitações (Netlify) — Checklist + Minutas + Resumo PDF (IA)

Ferramenta **pessoal** (estática) para organizar leitura de edital/TR, checklist e geração de minutas com **base local** da Lei 14.133/2021 (`assets/lei14133.txt`).

## O que tem aqui
- Projetos salvos no `localStorage`
- Leitura guiada (wizard) → gera alertas e sugere fundamentos
- Checklist por modalidade (Pregão/Dispensa)
- Trechos salvos (item/página + texto)
- Gerador de minutas (esclarecimento/impugnação/recurso etc.)
- Exportação `.doc` timbrado (HTML compatível com Word)
- Upload de PDF (TR/Edital) → extração de texto no navegador (PDF.js) → resumo estruturado via OpenAI **(seguro via Netlify Function)**

---

## Como rodar localmente (sem dar erro de `file://`)
Use um servidor local:

### Opção A — Netlify Dev (recomendado)
1. Instale o Netlify CLI: `npm i -g netlify-cli`
2. Na pasta do projeto: `netlify dev`
3. Abra o endereço mostrado (ex.: http://localhost:8888)

### Opção B — Live Server (VSCode)
1. Instale extensão “Live Server”
2. Botão direito `index.html` → “Open with Live Server”

---

## Deploy no Netlify
1. Crie um site no Netlify e faça deploy desta pasta
2. Crie uma variável de ambiente em **Site settings → Environment variables**:
   - `OPENAI_API_KEY` = sua chave da API

> Importante: **ChatGPT Plus não é a mesma coisa que OpenAI API.**
> Você precisa de uma API key e o uso é cobrado por tokens. (Docs oficiais da OpenAI e Netlify)
- OpenAI Responses API: https://platform.openai.com/docs
- Netlify env vars em Functions: https://docs.netlify.com/build/functions/environment-variables/  (acesso via `process.env` ou `Netlify.env`)

---

## Arquivos
- `index.html`, `styles.css` → UI
- `app.js` → orquestra módulos
- `/modules/*.js` → lógica (law, wizard, checklist, export doc, pdf)
- `/assets/lei14133.txt` → sua base local
- `/netlify/functions/summarize.js` → chama OpenAI Responses API (a chave fica no servidor)

---

## Observação sobre PDFs
O PDF.js extrai **texto selecionável**. Se o PDF for “scan/foto”, a extração pode vir vazia.
OCR é possível, mas não incluído neste zip para manter leve.
