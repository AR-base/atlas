// The knowledge base held in the browser: a SQLite database (sql.js), a set of
// documents with a search index, and code repositories. Implements every tool
// the agent can call. Results come back as { text, view }: `text` goes to the
// model (capped), `view` is what the interface shows the user.

import { checkReadOnlySql, SqlRejected } from './sqlguard.js';
import { Bm25Index, chunkDocument } from './search.js';

const MAX_RESULT_CHARS = 20_000;
const MAX_ROWS = 200;
const COUNT_CAP = 100_000;

const LANG_BY_EXT = {
  js: 'JavaScript', mjs: 'JavaScript', cjs: 'JavaScript', ts: 'TypeScript', tsx: 'TypeScript', jsx: 'JavaScript',
  py: 'Python', java: 'Java', cs: 'C#', php: 'PHP', rb: 'Ruby', go: 'Go', rs: 'Rust', kt: 'Kotlin', swift: 'Swift',
  sql: 'SQL', html: 'HTML', css: 'CSS', scss: 'SCSS', vue: 'Vue', md: 'Markdown', json: 'JSON', yml: 'YAML',
  yaml: 'YAML', toml: 'TOML', sh: 'Shell', c: 'C', cpp: 'C++', h: 'C/C++ header', dart: 'Dart', xml: 'XML',
};

function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function cap(text, max = MAX_RESULT_CHARS) {
  return text.length > max ? `${text.slice(0, max)}\n… [truncated: ${text.length - max} more characters]` : text;
}

function cell(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 10000) / 10000);
  if (v instanceof Uint8Array) return `<blob ${v.length} bytes>`;
  const s = String(v).replace(/\s+/g, ' ');
  return s.length > 160 ? `${s.slice(0, 157)}…` : s;
}

function rowsToText(columns, rows) {
  return [columns.join(' | '), ...rows.map((r) => r.map(cell).join(' | '))].join('\n');
}

function firstComment(text) {
  for (const raw of String(text).split('\n').slice(0, 25)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^(?:\/\/+|#+|\/\*+|\*|--|"""|''')\s*(.+?)\s*(?:\*\/)?$/);
    if (m && m[1] && !/^!|eslint|use strict/i.test(m[1])) return m[1].slice(0, 120);
  }
  return '';
}

class KnowledgeBase {
  constructor(SQL) {
    this.SQL = SQL;
    this.db = new SQL.Database();
    this.docs = new Map();
    this.repos = new Map();
    this.index = new Bm25Index();
    this.dirtyIndex = false;
    this.listeners = new Set();
  }

  onChange(fn) { this.listeners.add(fn); }

  changed() { for (const fn of this.listeners) fn(this.summary()); }

  // ----------------------------------------------------------------- loading
  loadSql(sql) {
    this.db.exec(sql);
    this.changed();
  }

  addDocument({ id, title, text, source = 'upload' }) {
    let docId = String(id).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'document';
    while (this.docs.has(docId) && this.docs.get(docId).text !== text) docId += '-2';
    this.docs.set(docId, { id: docId, title: String(title).slice(0, 200), text: String(text), source });
    this.dirtyIndex = true;
    this.changed();
    return docId;
  }

  addRepo(name, label, files) {
    const clean = files
      .filter((f) => f && typeof f.path === 'string' && typeof f.text === 'string')
      .map((f) => ({ path: f.path.replace(/^\/+/, ''), text: f.text }));
    this.repos.set(name, { name, label: label || name, files: clean });
    this.changed();
    return name;
  }

  uniqueTableName(base) {
    let name = String(base).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'import';
    if (/^\d/.test(name)) name = `t_${name}`;
    const existing = new Set(this.tableNames());
    let candidate = name;
    for (let i = 2; existing.has(candidate); i += 1) candidate = `${name}_${i}`;
    return candidate;
  }

  // header: column names; rows: arrays of values (string|number|null)
  addTable(base, header, rows) {
    const table = this.uniqueTableName(base);
    const seen = new Set();
    const cols = header.map((h, i) => {
      let c = String(h ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || `col_${i + 1}`;
      if (/^\d/.test(c)) c = `c_${c}`;
      while (seen.has(c)) c += '_';
      seen.add(c);
      return c;
    });
    const types = cols.map((_, ci) => {
      let numeric = 0;
      let integer = 0;
      let filled = 0;
      for (const r of rows.slice(0, 500)) {
        const v = r[ci];
        if (v === null || v === undefined || v === '') continue;
        filled += 1;
        const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
        if (Number.isFinite(n) && String(v).trim() !== '') {
          numeric += 1;
          if (Number.isInteger(n)) integer += 1;
        }
      }
      if (filled && numeric === filled) return integer === filled ? 'INTEGER' : 'REAL';
      return 'TEXT';
    });
    this.db.exec(`CREATE TABLE ${quoteIdent(table)} (${cols.map((c, i) => `${quoteIdent(c)} ${types[i]}`).join(', ')})`);
    const stmt = this.db.prepare(`INSERT INTO ${quoteIdent(table)} VALUES (${cols.map(() => '?').join(', ')})`);
    this.db.exec('BEGIN');
    try {
      for (const r of rows) {
        stmt.run(cols.map((_, i) => {
          const v = r[i];
          if (v === undefined || v === '') return null;
          if (v instanceof Date) return v.toISOString().slice(0, 10);
          if (types[i] !== 'TEXT') {
            const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
            return Number.isFinite(n) ? n : null;
          }
          return String(v);
        }));
      }
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    } finally {
      stmt.free();
    }
    this.changed();
    return { table, columns: cols.length, rows: rows.length };
  }

  // ----------------------------------------------------------------- reading
  tableNames() {
    const res = this.db.exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
    return res.length ? res[0].values.map((v) => v[0]) : [];
  }

  requireTable(name) {
    const tables = this.tableNames();
    const found = tables.find((t) => t === name) || tables.find((t) => t.toLowerCase() === String(name).toLowerCase());
    if (!found) throw new Error(`Unknown table "${name}". Available: ${tables.join(', ') || 'none'}`);
    return found;
  }

  summary() {
    const tables = this.tableNames().map((t) => ({
      name: t,
      rows: this.db.exec(`SELECT COUNT(*) FROM ${quoteIdent(t)}`)[0].values[0][0],
    }));
    const docs = [...this.docs.values()].map((d) => ({ id: d.id, title: d.title, source: d.source, chars: d.text.length }));
    const repos = [...this.repos.values()].map((r) => ({ name: r.name, label: r.label, files: r.files.length }));
    return { tables, docs, repos };
  }

  ensureIndex() {
    if (!this.dirtyIndex) return;
    this.index = new Bm25Index();
    for (const d of this.docs.values()) {
      for (const c of chunkDocument(d)) this.index.add(c, `${c.title} ${c.section} ${c.text}`);
    }
    this.dirtyIndex = false;
  }

  repo(name) {
    if (!this.repos.size) throw new Error('No code repository is loaded.');
    if (!name) return this.repos.values().next().value;
    const r = this.repos.get(name) || [...this.repos.values()].find((x) => x.label === name || x.name.toLowerCase() === String(name).toLowerCase());
    if (!r) throw new Error(`Unknown repository "${name}". Available: ${[...this.repos.keys()].join(', ')}`);
    return r;
  }

  // ----------------------------------------------------------------- tools
  async runTool(name, input = {}) {
    switch (name) {
      case 'list_sources': return this.toolListSources();
      case 'describe_table': return this.toolDescribe(input.table);
      case 'profile_table': return this.toolProfile(input.table);
      case 'run_sql': return this.toolSql(input.query, input.purpose);
      case 'search_documents': return this.toolSearchDocs(input.query, input.top_k);
      case 'read_document': return this.toolReadDoc(input.doc_id);
      case 'code_overview': return this.toolCodeOverview(input.repo);
      case 'search_code': return this.toolSearchCode(input.query, input.repo, input.regex);
      case 'read_file': return this.toolReadFile(input.path, input.repo, input.start_line, input.end_line);
      case 'create_chart': return this.toolChart(input);
      default: throw new Error(`Unknown tool ${name}`);
    }
  }

  toolListSources() {
    const s = this.summary();
    const text = [
      `DATABASE (${s.tables.length} tables): ${s.tables.map((t) => `${t.name} (${t.rows} rows)`).join(', ') || 'none'}`,
      `DOCUMENTS (${s.docs.length}): ${s.docs.map((d) => `[${d.id}] ${d.title}`).join('; ') || 'none'}`,
      `CODE (${s.repos.length} repositories): ${s.repos.map((r) => `${r.name} — ${r.label} (${r.files} files)`).join('; ') || 'none'}`,
    ].join('\n');
    return { text, view: { kind: 'sources', summary: s } };
  }

  toolDescribe(table) {
    const t = this.requireTable(table);
    const cols = this.db.exec(`PRAGMA table_info(${quoteIdent(t)})`)[0];
    const fks = this.db.exec(`PRAGMA foreign_key_list(${quoteIdent(t)})`);
    const sample = this.db.exec(`SELECT * FROM ${quoteIdent(t)} LIMIT 3`);
    const count = this.db.exec(`SELECT COUNT(*) FROM ${quoteIdent(t)}`)[0].values[0][0];
    const colLines = cols.values.map((c) => `- ${c[1]} ${c[2] || ''}${c[3] ? ' NOT NULL' : ''}${c[5] ? ' PRIMARY KEY' : ''}`);
    const fkLines = fks.length ? fks[0].values.map((f) => `- ${f[3]} → ${f[2]}.${f[4]}`) : [];
    const text = [`Table ${t} (${count} rows)`, 'Columns:', ...colLines,
      fkLines.length ? 'Foreign keys:' : 'Foreign keys: none', ...fkLines,
      'Sample rows:', sample.length ? rowsToText(sample[0].columns, sample[0].values) : '(empty)'].join('\n');
    return { text: cap(text), view: { kind: 'schema', table: t, columns: cols.values.map((c) => ({ name: c[1], type: c[2], pk: !!c[5] })), count } };
  }

  toolProfile(table) {
    const t = this.requireTable(table);
    const cols = this.db.exec(`PRAGMA table_info(${quoteIdent(t)})`)[0].values.slice(0, 40);
    const total = this.db.exec(`SELECT COUNT(*) FROM ${quoteIdent(t)}`)[0].values[0][0];
    const rows = cols.map((c) => {
      const q = quoteIdent(c[1]);
      const r = this.db.exec(`SELECT COUNT(*) - COUNT(${q}), COUNT(DISTINCT ${q}), MIN(${q}), MAX(${q}) FROM ${quoteIdent(t)}`)[0].values[0];
      return [c[1], r[0], r[1], r[2], r[3]];
    });
    const nonPk = cols.filter((c) => !c[5]).map((c) => quoteIdent(c[1]));
    let dupRows = 0;
    if (nonPk.length) {
      const d = this.db.exec(`SELECT COALESCE(SUM(n - 1), 0) FROM (SELECT COUNT(*) AS n FROM ${quoteIdent(t)} GROUP BY ${nonPk.join(', ')} HAVING n > 1)`);
      dupRows = d[0].values[0][0];
    }
    const text = [`Profile of ${t}: ${total} rows, ${dupRows} exact duplicate rows (ignoring the primary key).`,
      rowsToText(['column', 'missing', 'distinct', 'min', 'max'], rows)].join('\n');
    return { text: cap(text), view: { kind: 'table', columns: ['column', 'missing', 'distinct', 'min', 'max'], rows, total: rows.length, caption: `${t} · ${total}` } };
  }

  toolSql(query, purpose) {
    let sql;
    try {
      sql = checkReadOnlySql(query);
    } catch (err) {
      if (err instanceof SqlRejected) throw new Error(`Query rejected: ${err.message}`);
      throw err;
    }
    // Defence in depth: whatever the statement does is rolled back.
    this.db.exec('SAVEPOINT atlas_read');
    const started = performance.now();
    let columns = [];
    const rows = [];
    let total = 0;
    try {
      const stmt = this.db.prepare(sql);
      try {
        columns = stmt.getColumnNames();
        while (stmt.step()) {
          total += 1;
          if (rows.length < MAX_ROWS) rows.push(stmt.get());
          if (total >= COUNT_CAP) break;
        }
      } finally {
        stmt.free();
      }
    } catch (err) {
      throw new Error(`SQL error: ${err.message}`);
    } finally {
      this.db.exec('ROLLBACK TO atlas_read');
      this.db.exec('RELEASE atlas_read');
    }
    const ms = Math.round(performance.now() - started);
    const more = total > rows.length ? `\n(${total >= COUNT_CAP ? `${COUNT_CAP}+` : total} rows in total; first ${rows.length} shown)` : '';
    const text = `${total} row(s) in ${ms} ms\n${rowsToText(columns, rows)}${more}`;
    return { text: cap(text), view: { kind: 'table', sql, purpose, columns, rows, total, ms } };
  }

  toolSearchDocs(query, topK = 5) {
    if (typeof query !== 'string' || !query.trim()) throw new Error('Empty search');
    this.ensureIndex();
    const k = Math.min(Math.max(Number(topK) || 5, 1), 10);
    const hits = this.index.search(query, k);
    if (!hits.length) return { text: `No passage matches "${query}".`, view: { kind: 'docs', query, hits: [] } };
    const text = hits.map(({ item, score }, i) =>
      `#${i + 1} [${item.docId}] ${item.title} › ${item.section} (score ${score.toFixed(2)})\n${item.text}`).join('\n\n');
    return { text: cap(text), view: { kind: 'docs', query, hits: hits.map(({ item }) => ({ id: item.docId, title: item.title, section: item.section, text: item.text })) } };
  }

  toolReadDoc(docId) {
    const d = this.docs.get(docId) || [...this.docs.values()].find((x) => x.title === docId);
    if (!d) throw new Error(`Unknown document "${docId}". Use list_sources to see ids.`);
    return { text: cap(`[${d.id}] ${d.title}\n\n${d.text}`), view: { kind: 'doc', id: d.id, title: d.title, text: d.text } };
  }

  toolCodeOverview(repoName) {
    const r = this.repo(repoName);
    const langs = new Map();
    const lines = r.files.map((f) => {
      const ext = (f.path.split('.').pop() || '').toLowerCase();
      const lang = LANG_BY_EXT[ext] || ext.toUpperCase() || 'file';
      langs.set(lang, (langs.get(lang) || 0) + 1);
      const loc = f.text.split('\n').length;
      const note = firstComment(f.text);
      return `${f.path} (${loc} lines${note ? ` — ${note}` : ''})`;
    });
    const text = [`Repository ${r.name} (${r.label}): ${r.files.length} files`,
      `Languages: ${[...langs].map(([l, n]) => `${l} ${n}`).join(', ')}`, '', ...lines].join('\n');
    return { text: cap(text), view: { kind: 'tree', repo: r.label, files: r.files.map((f) => f.path) } };
  }

  toolSearchCode(query, repoName, regex) {
    if (typeof query !== 'string' || !query || query.length > 200) throw new Error('Search text must be 1–200 characters');
    const repos = repoName ? [this.repo(repoName)] : [...this.repos.values()];
    if (!repos.length) throw new Error('No code repository is loaded.');
    let test;
    if (regex) {
      let re;
      try { re = new RegExp(query, 'i'); } catch (err) { throw new Error(`Invalid regular expression: ${err.message}`); }
      test = (line) => re.test(line);
    } else {
      const needle = query.toLowerCase();
      test = (line) => line.toLowerCase().includes(needle);
    }
    const matches = [];
    outer: for (const r of repos) {
      for (const f of r.files) {
        const lines = f.text.split('\n');
        for (let i = 0; i < lines.length; i += 1) {
          if (lines[i].length < 2000 && test(lines[i])) {
            matches.push({ repo: r.name, path: f.path, line: i + 1, text: lines[i].trim().slice(0, 200) });
            if (matches.length >= 60) break outer;
          }
        }
      }
    }
    const text = matches.length
      ? matches.map((m) => `${repos.length > 1 ? `${m.repo}:` : ''}${m.path}:${m.line}: ${m.text}`).join('\n') + (matches.length >= 60 ? '\n(first 60 matches)' : '')
      : `No match for "${query}".`;
    return { text: cap(text), view: { kind: 'grep', query, matches } };
  }

  toolReadFile(path, repoName, start, end) {
    const r = this.repo(repoName);
    const clean = String(path || '').replace(/^\/+/, '');
    const f = r.files.find((x) => x.path === clean) || r.files.find((x) => x.path.endsWith(`/${clean}`));
    if (!f) throw new Error(`File not found: ${path}`);
    const lines = f.text.split('\n');
    const from = Math.max(1, Number(start) || 1);
    const to = Math.min(lines.length, Number(end) || from + 399, from + 399);
    const body = lines.slice(from - 1, to).map((l, i) => `${String(from + i).padStart(4)}  ${l}`).join('\n');
    const text = `${r.name}/${f.path} (lines ${from}–${to} of ${lines.length})\n${body}`;
    return { text: cap(text), view: { kind: 'file', repo: r.label, path: f.path, from, lines: lines.slice(from - 1, to) } };
  }

  toolChart(spec) {
    const types = ['bar', 'line', 'pie', 'doughnut'];
    if (!spec || !types.includes(spec.type)) throw new Error('Chart type must be bar, line, pie or doughnut');
    const labels = (Array.isArray(spec.labels) ? spec.labels : []).slice(0, 60).map((l) => String(l).slice(0, 60));
    const datasets = (Array.isArray(spec.datasets) ? spec.datasets : []).slice(0, 4).map((d) => ({
      label: String(d.label || '').slice(0, 60),
      data: (Array.isArray(d.data) ? d.data : []).slice(0, labels.length).map((n) => (Number.isFinite(Number(n)) ? Number(n) : 0)),
    }));
    if (!labels.length || !datasets.length) throw new Error('A chart needs labels and at least one dataset');
    const title = String(spec.title || '').slice(0, 120);
    return { text: `Chart "${title}" displayed to the user.`, view: { kind: 'chart', type: spec.type, title, labels, datasets } };
  }
}

export { KnowledgeBase, quoteIdent, rowsToText };
