// Turns files dropped by the user into knowledge: spreadsheets become database
// tables, PDF/Word/text files become searchable documents, source files join
// an "uploaded code" repository. Everything stays in this browser tab.
// Also loads a public GitHub repository through the GitHub API.

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_ROWS = 50_000;
const MAX_PDF_PAGES = 300;
const CODE_EXT = new Set(['js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'py', 'java', 'cs', 'php', 'rb', 'go', 'rs', 'kt', 'swift',
  'sql', 'html', 'css', 'scss', 'vue', 'json', 'yml', 'yaml', 'toml', 'sh', 'c', 'cpp', 'h', 'dart', 'xml', 'ini', 'env.example']);
const TEXT_EXT = new Set(['txt', 'md', 'markdown', 'rtf', 'log']);

function ext(name) {
  const m = String(name).toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : '';
}

function baseName(name) {
  return String(name).replace(/\.[^.]+$/, '');
}

let pdfjs = null;
async function loadPdfJs() {
  if (!pdfjs) {
    pdfjs = await import('/vendor/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdf.worker.min.mjs';
  }
  return pdfjs;
}

async function pdfToText(buffer) {
  const lib = await loadPdfJs();
  const doc = await lib.getDocument({ data: buffer, isEvalSupported: false, disableFontFace: true }).promise;
  const pages = [];
  for (let p = 1; p <= Math.min(doc.numPages, MAX_PDF_PAGES); p += 1) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    pages.push(`## Page ${p}\n\n${content.items.map((it) => it.str).join(' ').replace(/\s+/g, ' ').trim()}`);
  }
  await doc.destroy();
  return pages.join('\n\n');
}

function parseCsv(text) {
  return new Promise((resolve, reject) => {
    window.Papa.parse(text, {
      header: false,
      skipEmptyLines: 'greedy',
      dynamicTyping: false,
      complete: (res) => resolve(res.data),
      error: reject,
    });
  });
}

// Returns a list of { kind, label, detail } describing what was added.
async function ingestFile(kb, file) {
  if (file.size > MAX_FILE_BYTES) throw new Error(`${file.name}: file larger than 15 MB`);
  const e = ext(file.name);
  const name = baseName(file.name);

  if (e === 'csv' || e === 'tsv') {
    const rows = await parseCsv(await file.text());
    if (rows.length < 2) throw new Error(`${file.name}: no data rows`);
    const res = kb.addTable(name, rows[0], rows.slice(1, MAX_ROWS + 1));
    return [{ kind: 'table', label: res.table, detail: `${res.rows} rows · ${res.columns} columns` }];
  }

  if (e === 'xlsx') {
    const sheets = await window.readXlsxFile(file, { getSheets: true });
    const added = [];
    for (const sheet of sheets.slice(0, 8)) {
      const rows = await window.readXlsxFile(file, { sheet: sheet.name });
      if (rows.length < 2) continue;
      const res = kb.addTable(sheets.length > 1 ? `${name}_${sheet.name}` : name, rows[0], rows.slice(1, MAX_ROWS + 1));
      added.push({ kind: 'table', label: res.table, detail: `${res.rows} rows · ${res.columns} columns` });
    }
    if (!added.length) throw new Error(`${file.name}: no sheet with data`);
    return added;
  }

  if (e === 'pdf') {
    const text = await pdfToText(await file.arrayBuffer());
    if (!text.replace(/## Page \d+/g, '').trim()) throw new Error(`${file.name}: no text found (scanned PDF?)`);
    const id = kb.addDocument({ id: name, title: name, text, source: 'upload' });
    return [{ kind: 'doc', label: name, detail: `PDF · ${text.length.toLocaleString()} characters`, id }];
  }

  if (e === 'docx') {
    const res = await window.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    const id = kb.addDocument({ id: name, title: name, text: res.value, source: 'upload' });
    return [{ kind: 'doc', label: name, detail: `Word · ${res.value.length.toLocaleString()} characters`, id }];
  }

  if (e === 'html' || e === 'htm') {
    const text = new DOMParser().parseFromString(await file.text(), 'text/html').body.textContent || '';
    const id = kb.addDocument({ id: name, title: name, text, source: 'upload' });
    return [{ kind: 'doc', label: name, detail: 'HTML', id }];
  }

  if (TEXT_EXT.has(e)) {
    const text = await file.text();
    const id = kb.addDocument({ id: name, title: name, text, source: 'upload' });
    return [{ kind: 'doc', label: name, detail: `${text.length.toLocaleString()} characters`, id }];
  }

  if (CODE_EXT.has(e)) {
    const repoName = 'uploads';
    const existing = kb.repos.get(repoName);
    const files = existing ? existing.files.filter((f) => f.path !== file.name) : [];
    files.push({ path: file.name, text: await file.text() });
    kb.addRepo(repoName, 'Uploaded code files', files);
    return [{ kind: 'code', label: file.name, detail: 'code file' }];
  }

  throw new Error(`${file.name}: unsupported type (.${e || '?'}). Use CSV, XLSX, PDF, DOCX, TXT, MD or source files.`);
}

// ---------------------------------------------------------------- GitHub
const REPO_RE = /^([A-Za-z0-9-]{1,39})\/([A-Za-z0-9._-]{1,100})$/;
const SKIP_DIR = /(^|\/)(node_modules|dist|build|vendor|\.git|\.next|coverage|__pycache__|\.venv|target)\//;
const MAX_REPO_FILES = 250;
const MAX_REPO_FILE_BYTES = 200_000;

function parseRepo(input) {
  const s = String(input).trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '').replace(/\/+$/, '');
  const m = s.match(REPO_RE);
  if (!m) throw new Error('Use the form owner/repository, for example AR-base/bastion');
  return { owner: m[1], repo: m[2] };
}

async function loadGithubRepo(kb, input, onProgress = () => {}) {
  const { owner, repo } = parseRepo(input);
  const api = `https://api.github.com/repos/${owner}/${repo}`;
  const meta = await fetch(api, { headers: { accept: 'application/vnd.github+json' } });
  if (meta.status === 404) throw new Error('Repository not found or private');
  if (meta.status === 403) throw new Error('GitHub rate limit reached; try again in a few minutes');
  if (!meta.ok) throw new Error(`GitHub error ${meta.status}`);
  const { default_branch: branch } = await meta.json();
  const treeRes = await fetch(`${api}/git/trees/${encodeURIComponent(branch)}?recursive=1`, { headers: { accept: 'application/vnd.github+json' } });
  if (!treeRes.ok) throw new Error(`GitHub error ${treeRes.status}`);
  const tree = await treeRes.json();
  const wanted = tree.tree
    .filter((n) => n.type === 'blob' && n.size <= MAX_REPO_FILE_BYTES && !SKIP_DIR.test(n.path)
      && !/(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$/.test(n.path)
      && (CODE_EXT.has(ext(n.path)) || TEXT_EXT.has(ext(n.path)) || /(^|\/)(Dockerfile|Makefile|README)$/i.test(n.path)))
    .slice(0, MAX_REPO_FILES);
  const files = [];
  let done = 0;
  const queue = [...wanted];
  async function worker() {
    while (queue.length) {
      const n = queue.shift();
      const url = `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(branch)}/${n.path.split('/').map(encodeURIComponent).join('/')}`;
      try {
        const r = await fetch(url);
        if (r.ok) files.push({ path: n.path, text: await r.text() });
      } catch { /* skip unreadable file */ }
      done += 1;
      onProgress(done, wanted.length);
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
  files.sort((a, b) => a.path.localeCompare(b.path));
  const name = `${owner}/${repo}`;
  kb.addRepo(name, `${name} (GitHub)`, files);
  return { name, files: files.length, truncated: tree.truncated || wanted.length >= MAX_REPO_FILES };
}

export { ingestFile, loadGithubRepo, parseRepo };
