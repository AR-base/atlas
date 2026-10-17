// Small BM25 search engine for documents and code, accent- and case-insensitive,
// with French and English stop words. No dependencies; runs in the browser.

const STOP = new Set(`a au aux avec ce ces dans de des du elle en et eux il ils je la le les leur lui ma mais me même mes moi mon ne nos notre nous on ou par pas pour qu que qui sa se ses son sur ta te tes toi ton tu un une vos votre vous c d j l m n s t y été être est sont a ont fait faire plus est-ce
the of and to in is are was were be been for on with as by at or an it this that from which not but have has had can will would should what how when where who why all any each other some such no nor only own same so than too very`.split(/\s+/));

function normalize(text) {
  return String(text).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function stem(word) {
  if (word.length > 5 && word.endsWith('ement')) return word.slice(0, -5);
  if (word.length > 4 && (word.endsWith('es') || word.endsWith('s') || word.endsWith('x'))) return word.replace(/(es|s|x)$/, '');
  return word;
}

function tokenize(text) {
  return normalize(text)
    .split(/[^a-z0-9_]+/)
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map(stem);
}

// Splits a document into passages along Markdown headings and blank lines,
// each at most ~900 characters, remembering the nearest heading.
function chunkDocument(doc, maxChars = 900) {
  const chunks = [];
  let heading = doc.title;
  let buf = '';
  const flush = () => {
    const text = buf.trim();
    if (text) chunks.push({ docId: doc.id, title: doc.title, section: heading, text });
    buf = '';
  };
  for (const para of String(doc.text).split(/\n\s*\n/)) {
    const h = para.match(/^#{1,6}\s+(.+)/m);
    if (h && para.trim().startsWith('#')) {
      flush();
      heading = h[1].trim();
    }
    if (buf.length + para.length > maxChars) flush();
    if (para.length > maxChars) {
      for (let i = 0; i < para.length; i += maxChars) {
        buf = para.slice(i, i + maxChars);
        flush();
      }
    } else {
      buf += (buf ? '\n\n' : '') + para;
    }
  }
  flush();
  return chunks;
}

class Bm25Index {
  constructor(k1 = 1.4, b = 0.75) {
    this.k1 = k1;
    this.b = b;
    this.items = [];
    this.df = new Map();
    this.totalLen = 0;
  }

  add(item, text) {
    const tokens = tokenize(text);
    const tf = new Map();
    for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
    for (const t of tf.keys()) this.df.set(t, (this.df.get(t) || 0) + 1);
    this.items.push({ item, tf, len: tokens.length });
    this.totalLen += tokens.length;
  }

  search(query, topK = 5) {
    const terms = [...new Set(tokenize(query))];
    if (!terms.length || !this.items.length) return [];
    const n = this.items.length;
    const avg = this.totalLen / n || 1;
    const scored = [];
    for (const { item, tf, len } of this.items) {
      let score = 0;
      for (const t of terms) {
        const f = tf.get(t);
        if (!f) continue;
        const df = this.df.get(t);
        const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
        score += idf * ((f * (this.k1 + 1)) / (f + this.k1 * (1 - this.b + (this.b * len) / avg)));
      }
      if (score > 0) scored.push({ item, score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }
}

export { tokenize, normalize, chunkDocument, Bm25Index };
