// Read-only guard for SQL written by the agent.
//
// Layer 1 (here): accept exactly one SELECT or WITH statement and reject any
// statement or function that could write, attach files or change settings.
// Layer 2 (in sources.js): every query runs inside a SAVEPOINT that is always
// rolled back, so even a statement that slipped through cannot persist.

const FORBIDDEN = [
  'insert', 'update', 'delete', 'replace', 'upsert', 'merge', 'drop', 'alter', 'create', 'truncate',
  'attach', 'detach', 'pragma', 'vacuum', 'reindex', 'analyze', 'begin', 'commit', 'rollback',
  'savepoint', 'release', 'grant', 'revoke', 'load_extension', 'writefile', 'readfile', 'fts3_tokenizer',
];

class SqlRejected extends Error {}

// Replaces string literals, quoted identifiers and comments with spaces so the
// keyword checks below only see SQL structure, never user data.
function stripLiterals(sql) {
  let out = '';
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    const next = sql[i + 1];
    if (c === '-' && next === '-') {
      while (i < sql.length && sql[i] !== '\n') { out += ' '; i += 1; }
    } else if (c === '/' && next === '*') {
      const end = sql.indexOf('*/', i + 2);
      if (end === -1) throw new SqlRejected('Unterminated comment');
      out += ' '.repeat(end + 2 - i);
      i = end + 2;
    } else if (c === "'" || c === '"' || c === '`' || c === '[') {
      const close = c === '[' ? ']' : c;
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === close) {
          if (close !== ']' && sql[j + 1] === close) { j += 2; continue; }
          break;
        }
        j += 1;
      }
      if (j >= sql.length) throw new SqlRejected('Unterminated quoted text');
      out += ' '.repeat(j + 1 - i);
      i = j + 1;
    } else {
      out += c;
      i += 1;
    }
  }
  return out;
}

function checkReadOnlySql(sql) {
  if (typeof sql !== 'string' || !sql.trim()) throw new SqlRejected('Empty query');
  if (sql.length > 6000) throw new SqlRejected('Query too long');
  const bare = stripLiterals(sql).trim().replace(/;\s*$/, '');
  if (bare.includes(';')) throw new SqlRejected('Only one statement is allowed');
  const lower = bare.toLowerCase();
  if (!/^(select|with)\b/.test(lower)) throw new SqlRejected('Only SELECT or WITH queries are allowed');
  for (const word of FORBIDDEN) {
    if (new RegExp(`\\b${word}\\b`).test(lower)) throw new SqlRejected(`Not allowed: ${word.toUpperCase()}`);
  }
  return sql.trim().replace(/;\s*$/, '');
}

export { checkReadOnlySql, stripLiterals, SqlRejected };
