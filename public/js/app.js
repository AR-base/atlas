// Atlas interface and agent loop.
import { KnowledgeBase } from './sources.js';
import { ingestFile, loadGithubRepo } from './ingest.js';
import { renderMarkdown } from './markdown.js';

// ------------------------------------------------------------------ text
const TEXT = {
  fr: {
    tagline: "Agent de connaissance d'entreprise",
    sources: 'Sources connectées', database: 'Base de données', documents: 'Documents', code: 'Code',
    rows: 'lignes', files: 'fichiers', newChat: 'Nouvelle conversation',
    dropTitle: 'Ajoutez vos fichiers', dropHint: 'CSV, Excel, PDF, Word, texte ou code. Glissez-déposez ou cliquez.',
    githubLabel: 'Dépôt GitHub public', githubPh: 'propriétaire/dépôt', githubBtn: 'Charger',
    privacy: 'Vos fichiers restent dans ce navigateur. Seuls les extraits consultés par l’agent sont envoyés au modèle.',
    demoBadge: 'Données de démonstration fictives : Nexa Digital, agence web',
    heroTitle: 'Posez une question à votre entreprise.',
    heroText: 'Atlas interroge la base de données, lit les documents internes et parcourt le code, puis répond avec ses sources.',
    placeholder: 'Ex. : nos procédures sont-elles appliquées dans le code et les données ?',
    send: 'Envoyer', hint: 'Entrée pour envoyer · Maj+Entrée pour une nouvelle ligne',
    thinking: 'Atlas enquête…', steps: (n) => `${n} étape${n > 1 ? 's' : ''}`,
    groups: { cross: 'Croiser les sources', db: 'Base de données', code: 'Code', docs: 'Documents' },
    tools: {
      list_sources: 'Inventaire des sources', describe_table: 'Structure de la table', profile_table: 'Qualité des données',
      run_sql: 'Requête SQL', search_documents: 'Recherche dans les documents', read_document: 'Lecture du document',
      code_overview: 'Cartographie du code', search_code: 'Recherche dans le code', read_file: 'Lecture du fichier', create_chart: 'Graphique',
    },
    errors: {
      rate_limited: 'Trop de requêtes. Patientez une minute.', access_code: 'Code d’accès requis ou incorrect.',
      not_configured: 'La clé API n’est pas configurée sur le serveur.', busy: 'Le modèle est très sollicité. Réessayez dans un instant.',
      generic: 'Une erreur est survenue. Réessayez.', network: 'Connexion impossible au serveur.', limit: 'Limite d’étapes atteinte : réponse partielle.',
    },
    accessTitle: 'Code d’accès', accessText: 'Cette démonstration est protégée. Saisissez le code fourni.', accessBtn: 'Valider',
    added: 'Ajouté', loading: 'Chargement…', cost: (eur) => `≈ ${eur.toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} €`,
    totalRows: (n) => `${n.toLocaleString('fr-FR')} ligne(s)`, more: (n) => `+ ${n} autre(s)`,
  },
  en: {
    tagline: 'Enterprise knowledge agent',
    sources: 'Connected sources', database: 'Database', documents: 'Documents', code: 'Code',
    rows: 'rows', files: 'files', newChat: 'New conversation',
    dropTitle: 'Add your files', dropHint: 'CSV, Excel, PDF, Word, text or code. Drag and drop or click.',
    githubLabel: 'Public GitHub repository', githubPh: 'owner/repository', githubBtn: 'Load',
    privacy: 'Your files stay in this browser. Only the excerpts the agent reads are sent to the model.',
    demoBadge: 'Fictional demo data: Nexa Digital, web agency',
    heroTitle: 'Ask your company a question.',
    heroText: 'Atlas queries the database, reads internal documents and walks the code, then answers with its sources.',
    placeholder: 'E.g. are our procedures actually applied in the code and the data?',
    send: 'Send', hint: 'Enter to send · Shift+Enter for a new line',
    thinking: 'Atlas is investigating…', steps: (n) => `${n} step${n > 1 ? 's' : ''}`,
    groups: { cross: 'Cross-check sources', db: 'Database', code: 'Code', docs: 'Documents' },
    tools: {
      list_sources: 'Source inventory', describe_table: 'Table structure', profile_table: 'Data quality',
      run_sql: 'SQL query', search_documents: 'Document search', read_document: 'Reading document',
      code_overview: 'Code map', search_code: 'Code search', read_file: 'Reading file', create_chart: 'Chart',
    },
    errors: {
      rate_limited: 'Too many requests. Please wait a minute.', access_code: 'Access code required or incorrect.',
      not_configured: 'The API key is not configured on the server.', busy: 'The model is busy. Try again in a moment.',
      generic: 'Something went wrong. Please try again.', network: 'Cannot reach the server.', limit: 'Step limit reached: partial answer.',
    },
    accessTitle: 'Access code', accessText: 'This demo is protected. Enter the code you were given.', accessBtn: 'Continue',
    added: 'Added', loading: 'Loading…', cost: (eur) => `≈ €${eur.toFixed(3)}`,
    totalRows: (n) => `${n.toLocaleString('en-GB')} row(s)`, more: (n) => `+ ${n} more`,
  },
};

const SUGGESTIONS = {
  fr: [
    ['cross', 'Notre procédure de relance des factures est-elle réellement appliquée ? Compare la procédure, le code et les données.'],
    ['cross', 'Respectons-nous nos engagements de délai de support (SLA) ? Montre un graphique par priorité.'],
    ['cross', 'Sommes-nous conformes à notre politique RGPD de conservation des tickets ?'],
    ['db', 'Organise et audite la base de données : structure, relations, qualité des données et corrections proposées.'],
    ['db', 'Quel est le chiffre d’affaires facturé par année et par type de projet ?'],
    ['code', 'Fais un audit de sécurité du code de Nexa Gestion par rapport à notre politique de sécurité.'],
    ['code', 'Cartographie le code : rôle de chaque module, et propose une meilleure organisation.'],
    ['docs', 'Que prévoient nos conditions générales en cas de retard de paiement ?'],
  ],
  en: [
    ['cross', 'Is our invoice reminder procedure actually applied? Compare the procedure, the code and the data.'],
    ['cross', 'Are we meeting our support time commitments (SLA)? Show a chart by priority.'],
    ['cross', 'Do we comply with our GDPR retention policy for support tickets?'],
    ['db', 'Organise and audit the database: structure, relations, data quality and proposed fixes.'],
    ['db', 'What is our invoiced revenue by year and by project type?'],
    ['code', 'Run a security audit of the Nexa Gestion code against our security policy.'],
    ['code', 'Map the codebase: the role of each module, and propose a better organisation.'],
    ['docs', 'What do our terms of sale say about late payment?'],
  ],
};

// Sonnet 5.5 list prices (USD per million tokens) and a fixed EUR rate, for the
// per-answer cost shown under each reply. Cache reads at 0.1x, writes at 1.25x.
const PRICE = { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5, eurPerUsd: 1 / 1.1239 };
const MAX_STEPS = 14;
const MAX_HISTORY = 70;

// ------------------------------------------------------------------ state
const state = {
  lang: (() => { try { return localStorage.getItem('atlas_lang') || 'fr'; } catch { return 'fr'; } })(),
  messages: [],
  busy: false,
  accessCode: (() => { try { return sessionStorage.getItem('atlas_code') || ''; } catch { return ''; } })(),
  kb: null,
};
const t = () => TEXT[state.lang];

// ------------------------------------------------------------------ DOM helpers
const $ = (sel, root = document) => root.querySelector(sel);
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) node.append(c.nodeType ? c : document.createTextNode(String(c)));
  return node;
}

// ------------------------------------------------------------------ sidebar
function renderSources(summary) {
  const T = t();
  const db = $('#src-db');
  db.replaceChildren(...summary.tables.map((tb) => el('li', {},
    el('span', { class: 'name', text: tb.name }), el('span', { class: 'meta', text: `${tb.rows.toLocaleString()} ${T.rows}` }))));
  $('#count-db').textContent = summary.tables.length;
  const docs = $('#src-docs');
  docs.replaceChildren(...summary.docs.map((d) => el('li', { class: d.source === 'upload' ? 'is-new' : '' },
    el('span', { class: 'name', text: d.title }))));
  $('#count-docs').textContent = summary.docs.length;
  const code = $('#src-code');
  code.replaceChildren(...summary.repos.map((r) => el('li', {},
    el('span', { class: 'name', text: r.label }), el('span', { class: 'meta', text: `${r.files} ${T.files}` }))));
  $('#count-code').textContent = summary.repos.length;
}

function applyLanguage() {
  const T = t();
  document.documentElement.lang = state.lang;
  for (const node of document.querySelectorAll('[data-t]')) {
    const key = node.getAttribute('data-t');
    if (typeof T[key] === 'string') node.textContent = T[key];
  }
  $('#q').placeholder = T.placeholder;
  $('#gh').placeholder = T.githubPh;
  for (const b of document.querySelectorAll('.lang button')) b.classList.toggle('on', b.dataset.lang === state.lang);
  if (state.kb) renderSources(state.kb.summary());
  renderSuggestions();
}

function renderSuggestions() {
  const T = t();
  const box = $('#suggestions');
  if (!box) return;
  const groups = {};
  for (const [g, q] of SUGGESTIONS[state.lang]) (groups[g] ||= []).push(q);
  box.replaceChildren(...Object.entries(groups).map(([g, qs]) => el('div', { class: `sg sg-${g}` },
    el('div', { class: 'sg-label', text: T.groups[g] }),
    ...qs.map((q) => el('button', { class: 'sg-q', type: 'button', onclick: () => ask(q) }, q)))));
}

function toast(message, kind = 'info') {
  const node = el('div', { class: `toast ${kind}`, role: 'status', text: message });
  $('#toasts').append(node);
  setTimeout(() => node.classList.add('out'), 4200);
  setTimeout(() => node.remove(), 4800);
}

// ------------------------------------------------------------------ views
function renderTableView(v, limit = 12) {
  const T = t();
  const wrap = el('div', { class: 'view-table' });
  const table = el('table', {},
    el('thead', {}, el('tr', {}, ...v.columns.map((c) => el('th', { text: c })))),
    el('tbody', {}, ...v.rows.slice(0, limit).map((r) => el('tr', {}, ...r.map((c) => el('td', { text: c === null ? '∅' : String(c) }))))));
  wrap.append(el('div', { class: 'scroll' }, table));
  const more = v.total - Math.min(limit, v.rows.length);
  wrap.append(el('div', { class: 'cap', text: `${T.totalRows(v.total)}${v.ms !== undefined ? ` · ${v.ms} ms` : ''}${more > 0 ? ` · ${T.more(more)}` : ''}` }));
  return wrap;
}

function renderView(v) {
  if (!v) return null;
  switch (v.kind) {
    case 'table': {
      const box = el('div');
      if (v.sql) box.append(el('pre', { class: 'sql' }, el('code', { text: v.sql })));
      box.append(renderTableView(v));
      return box;
    }
    case 'docs':
      return el('ul', { class: 'hits' }, ...v.hits.map((h) => el('li', {},
        el('b', { text: `${h.title} › ${h.section}` }), el('span', { text: h.text.replace(/\s+/g, ' ').slice(0, 220) + (h.text.length > 220 ? '…' : '') }))));
    case 'doc':
      return el('div', { class: 'doc' }, el('b', { text: v.title }), el('p', { text: v.text.replace(/\s+/g, ' ').slice(0, 420) + '…' }));
    case 'grep':
      return el('pre', { class: 'grep' }, el('code', { text: v.matches.slice(0, 20).map((m) => `${m.path}:${m.line}  ${m.text}`).join('\n') || '—' }));
    case 'file':
      return el('pre', { class: 'file' }, el('code', { text: `// ${v.path}\n` + v.lines.slice(0, 40).map((l, i) => `${String(v.from + i).padStart(3)}  ${l}`).join('\n') }));
    case 'tree':
      return el('pre', { class: 'tree' }, el('code', { text: v.files.slice(0, 50).join('\n') }));
    case 'schema':
      return el('div', { class: 'chips' }, ...v.columns.map((c) => el('span', { class: `chip${c.pk ? ' pk' : ''}`, text: `${c.name} ${c.type || ''}`.trim() })));
    case 'sources': {
      const s = v.summary;
      return el('div', { class: 'chips' },
        el('span', { class: 'chip', text: `${s.tables.length} tables` }),
        el('span', { class: 'chip', text: `${s.docs.length} documents` }),
        el('span', { class: 'chip', text: `${s.repos.length} repos` }));
    }
    default:
      return null;
  }
}

const CHART_COLORS = ['#0f766e', '#c2410c', '#14213d', '#a16207', '#7c3aed', '#be123c'];
function renderChart(v) {
  const box = el('figure', { class: 'chart' }, el('figcaption', { text: v.title }));
  const canvas = el('canvas', { role: 'img', 'aria-label': v.title });
  box.append(el('div', { class: 'chart-area' }, canvas));
  const round = v.type === 'pie' || v.type === 'doughnut';
  requestAnimationFrame(() => {
    // eslint-disable-next-line no-new
    new window.Chart(canvas, {
      type: v.type,
      data: {
        labels: v.labels,
        datasets: v.datasets.map((d, i) => ({
          label: d.label,
          data: d.data,
          backgroundColor: round ? v.labels.map((_, j) => CHART_COLORS[j % CHART_COLORS.length]) : CHART_COLORS[i % CHART_COLORS.length],
          borderColor: round ? '#fffdf8' : CHART_COLORS[i % CHART_COLORS.length],
          borderWidth: round ? 2 : 2,
          borderRadius: v.type === 'bar' ? 4 : 0,
          tension: 0.25,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: round || v.datasets.length > 1, labels: { font: { family: 'IBM Plex Sans' } } } },
        scales: round ? {} : { x: { grid: { display: false } }, y: { beginAtZero: true, grid: { color: '#e7e1d4' } } },
      },
    });
  });
  return box;
}

// ------------------------------------------------------------------ chat rendering
function scrollDown() {
  const log = $('#log');
  log.scrollTop = log.scrollHeight;
}

function addUserMessage(text) {
  $('#hero')?.remove();
  $('#log').append(el('div', { class: 'msg user' }, el('div', { class: 'bubble', text })));
  scrollDown();
}

function addAgentMessage() {
  const T = t();
  const trace = el('ol', { class: 'trace' });
  const summary = el('summary', {}, el('span', { class: 'pulse' }), el('span', { class: 'sum-text', text: T.thinking }));
  const details = el('details', { class: 'trace-box', open: true }, summary, trace);
  const charts = el('div', { class: 'charts' });
  const answer = el('div', { class: 'answer' });
  const foot = el('div', { class: 'foot' });
  const node = el('div', { class: 'msg agent' }, el('div', { class: 'avatar', 'aria-hidden': 'true' }), el('div', { class: 'body' }, details, charts, answer, foot));
  $('#log').append(node);
  scrollDown();
  return { node, trace, summary, details, charts, answer, foot };
}

function addStep(ui, call) {
  const T = t();
  const label = T.tools[call.name] || call.name;
  const sub = call.name === 'run_sql' ? call.input.purpose
    : call.name === 'search_documents' || call.name === 'search_code' ? `« ${call.input.query} »`
      : call.name === 'read_document' ? call.input.doc_id
        : call.name === 'read_file' ? call.input.path
          : call.name === 'describe_table' || call.name === 'profile_table' ? call.input.table
            : call.name === 'create_chart' ? call.input.title : '';
  const status = el('span', { class: 'status' });
  const head = el('summary', {}, el('span', { class: `ico ico-${call.name}` }), el('span', { class: 'lbl', text: label }),
    sub ? el('span', { class: 'sub', text: String(sub) }) : null, status);
  const body = el('div', { class: 'step-body' });
  const item = el('li', { class: 'step running' }, el('details', {}, head, body));
  ui.trace.append(item);
  scrollDown();
  return {
    done(view) {
      item.classList.replace('running', 'ok');
      const v = renderView(view);
      if (v) body.append(v);
    },
    failed(message) {
      item.classList.replace('running', 'err');
      body.append(el('p', { class: 'err-text', text: message }));
    },
  };
}

function addNote(ui, text) {
  ui.trace.append(el('li', { class: 'note' }, el('p', { text })));
}

// ------------------------------------------------------------------ agent loop
function trimHistory(messages) {
  let msgs = messages;
  while (msgs.length > MAX_HISTORY) {
    // drop the oldest exchange: everything up to the next user text message
    let i = 1;
    while (i < msgs.length && !(msgs[i].role === 'user' && typeof msgs[i].content === 'string')) i += 1;
    msgs = msgs.slice(i);
  }
  // keep the payload small: shorten tool results from earlier questions
  const lastQuestion = msgs.map((m) => m.role === 'user' && typeof m.content === 'string').lastIndexOf(true);
  return msgs.map((m, idx) => {
    if (idx >= lastQuestion || m.role !== 'user' || typeof m.content === 'string') return m;
    return { role: 'user', content: m.content.map((b) => (b.type === 'tool_result' && b.content.length > 1500
      ? { ...b, content: `${b.content.slice(0, 1500)}\n… [earlier result shortened]` } : b)) };
  });
}

async function callAgent(messages) {
  let res;
  try {
    res = await fetch('/api/agent', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(state.accessCode ? { 'x-access-code': state.accessCode } : {}) },
      body: JSON.stringify({ messages: trimHistory(messages), lang: state.lang }),
    });
  } catch {
    throw Object.assign(new Error('network'), { code: 'network' });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'generic'), { code: data.error || 'generic', status: res.status });
  return data;
}

function costOf(usage) {
  if (!usage) return 0;
  const usd = ((usage.input_tokens || 0) * PRICE.input + (usage.output_tokens || 0) * PRICE.output
    + (usage.cache_read_input_tokens || 0) * PRICE.cacheRead + (usage.cache_creation_input_tokens || 0) * PRICE.cacheWrite) / 1e6;
  return usd * PRICE.eurPerUsd;
}

async function ask(question) {
  const text = String(question || '').trim();
  if (!text || state.busy) return;
  state.busy = true;
  $('#send').disabled = true;
  $('#q').value = '';
  autoGrow();
  addUserMessage(text);
  const ui = addAgentMessage();
  const T = t();
  const started = performance.now();
  let steps = 0;
  let cost = 0;
  state.messages.push({ role: 'user', content: text });
  const checkpoint = state.messages.length - 1;
  try {
    for (let round = 0; round < MAX_STEPS; round += 1) {
      let res;
      try {
        res = await callAgent(state.messages);
      } catch (err) {
        if (err.code === 'busy' && round < MAX_STEPS) {
          await new Promise((r) => setTimeout(r, 3000));
          res = await callAgent(state.messages);
        } else {
          throw err;
        }
      }
      cost += costOf(res.usage);
      const content = Array.isArray(res.content) ? res.content.filter((b) => b.type === 'text' || b.type === 'tool_use') : [];
      state.messages.push({ role: 'assistant', content: content.length ? content : [{ type: 'text', text: '…' }] });
      const calls = content.filter((b) => b.type === 'tool_use');
      const texts = content.filter((b) => b.type === 'text').map((b) => b.text).join('\n\n').trim();
      if (res.stop_reason === 'tool_use' && calls.length) {
        if (texts) addNote(ui, texts);
        const results = [];
        for (const call of calls) {
          steps += 1;
          const step = addStep(ui, call);
          try {
            const out = await state.kb.runTool(call.name, call.input || {});
            step.done(out.view);
            if (out.view && out.view.kind === 'chart') ui.charts.append(renderChart(out.view));
            results.push({ type: 'tool_result', tool_use_id: call.id, content: out.text });
          } catch (err) {
            step.failed(err.message);
            results.push({ type: 'tool_result', tool_use_id: call.id, content: `Error: ${err.message}`, is_error: true });
          }
        }
        state.messages.push({ role: 'user', content: results });
        continue;
      }
      ui.answer.innerHTML = renderMarkdown(texts || '…');
      if (res.stop_reason === 'max_tokens') ui.answer.append(el('p', { class: 'warn', text: T.errors.limit }));
      break;
    }
    if (state.messages[state.messages.length - 1].role === 'user') {
      // loop ended on tool results (step limit): keep history valid
      state.messages.push({ role: 'assistant', content: [{ type: 'text', text: '(step limit reached)' }] });
      ui.answer.append(el('p', { class: 'warn', text: T.errors.limit }));
    }
  } catch (err) {
    state.messages.length = checkpoint; // drop the failed exchange so history stays valid
    const code = err.code || 'generic';
    ui.answer.append(el('p', { class: 'warn', text: T.errors[code] || T.errors.generic }));
    if (code === 'access_code') askAccessCode();
  } finally {
    const secs = ((performance.now() - started) / 1000).toFixed(1);
    ui.summary.querySelector('.sum-text').textContent = `${T.steps(steps)} · ${secs} s`;
    ui.summary.querySelector('.pulse').classList.add('done');
    if (steps) ui.details.open = false;
    else ui.details.remove();
    if (cost) ui.foot.append(el('span', { text: T.cost(cost) }));
    state.busy = false;
    $('#send').disabled = false;
    $('#q').focus();
    scrollDown();
  }
}

// ------------------------------------------------------------------ access code
function askAccessCode() {
  const dlg = $('#access');
  if (dlg.open) return;
  dlg.showModal();
  $('#access-input').focus();
}

// ------------------------------------------------------------------ uploads
async function handleFiles(fileList) {
  const T = t();
  for (const file of [...fileList].slice(0, 20)) {
    try {
      const added = await ingestFile(state.kb, file);
      for (const a of added) toast(`${T.added} : ${a.label} (${a.detail})`, 'ok');
    } catch (err) {
      toast(err.message, 'err');
    }
  }
}

function autoGrow() {
  const q = $('#q');
  q.style.height = 'auto';
  q.style.height = `${Math.min(q.scrollHeight, 200)}px`;
}

// ------------------------------------------------------------------ boot
async function boot() {
  const SQL = await window.initSqlJs({ locateFile: (f) => `/vendor/${f}` });
  const kb = new KnowledgeBase(SQL);
  state.kb = kb;
  kb.onChange(renderSources);
  const [sql, docs, code] = await Promise.all([
    fetch('/data/demo.sql').then((r) => r.text()),
    fetch('/data/docs.json').then((r) => r.json()),
    fetch('/data/code.json').then((r) => r.json()),
  ]);
  kb.loadSql(sql);
  for (const d of docs) kb.addDocument({ ...d, source: 'demo' });
  kb.addRepo(code.name, code.label, code.files);

  applyLanguage();
  document.body.classList.add('ready');

  $('#composer').addEventListener('submit', (e) => { e.preventDefault(); ask($('#q').value); });
  $('#q').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); ask($('#q').value); }
  });
  $('#q').addEventListener('input', autoGrow);
  for (const b of document.querySelectorAll('.lang button')) {
    b.addEventListener('click', () => {
      state.lang = b.dataset.lang;
      try { localStorage.setItem('atlas_lang', state.lang); } catch { /* storage unavailable */ }
      applyLanguage();
    });
  }
  $('#new-chat').addEventListener('click', () => {
    if (state.busy) return;
    state.messages = [];
    $('#log').replaceChildren(heroNode);
    renderSuggestions();
  });
  const drop = $('#drop');
  const input = $('#file');
  drop.addEventListener('click', () => input.click());
  drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
  input.addEventListener('change', () => { handleFiles(input.files); input.value = ''; });
  for (const ev of ['dragenter', 'dragover']) drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); });
  for (const ev of ['dragleave', 'drop']) drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); });
  drop.addEventListener('drop', (e) => handleFiles(e.dataTransfer.files));
  document.addEventListener('dragover', (e) => e.preventDefault());
  document.addEventListener('drop', (e) => { if (!drop.contains(e.target)) { e.preventDefault(); handleFiles(e.dataTransfer.files); } });

  $('#gh-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#gh-btn');
    const value = $('#gh').value;
    btn.disabled = true;
    btn.textContent = t().loading;
    try {
      const res = await loadGithubRepo(state.kb, value, (done, total) => { btn.textContent = `${done}/${total}`; });
      toast(`${t().added} : ${res.name} (${res.files} ${t().files})`, 'ok');
      $('#gh').value = '';
    } catch (err) {
      toast(err.message, 'err');
    } finally {
      btn.disabled = false;
      btn.textContent = t().githubBtn;
    }
  });

  $('#access-form').addEventListener('submit', (e) => {
    e.preventDefault();
    state.accessCode = $('#access-input').value.trim();
    try { sessionStorage.setItem('atlas_code', state.accessCode); } catch { /* storage unavailable */ }
    $('#access').close();
  });
  $('#menu').addEventListener('click', () => document.body.classList.toggle('side-open'));

  const cfg = await fetch('/api/config').then((r) => r.json()).catch(() => ({}));
  if (cfg.accessCodeRequired && !state.accessCode) askAccessCode();
}

const heroNode = document.getElementById('hero');
boot().catch((err) => {
  console.error(err);
  toast(t().errors.generic, 'err');
});

export { trimHistory, costOf };
