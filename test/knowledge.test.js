// Runs the browser knowledge base in Node with the real sql.js and the real
// demo data, and checks that the planted findings are reachable by the tools.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { KnowledgeBase } from '../public/js/sources.js';

const require = createRequire(import.meta.url);
const initSqlJs = require('sql.js');
const facts = JSON.parse(readFileSync(new URL('./demo-facts.json', import.meta.url), 'utf8'));
let kb;

before(async () => {
  const SQL = await initSqlJs();
  kb = new KnowledgeBase(SQL);
  kb.loadSql(readFileSync(new URL('../public/data/demo.sql', import.meta.url), 'utf8'));
  for (const d of JSON.parse(readFileSync(new URL('../public/data/docs.json', import.meta.url), 'utf8'))) kb.addDocument(d);
  const code = JSON.parse(readFileSync(new URL('../public/data/code.json', import.meta.url), 'utf8'));
  kb.addRepo(code.name, code.label, code.files);
});

test('list_sources shows the three kinds of source', async () => {
  const { text } = await kb.runTool('list_sources');
  assert.match(text, /factures \(\d+ rows\)/);
  assert.match(text, /02-procedure-facturation-relance/);
  assert.match(text, /nexa-gestion/);
});

test('run_sql answers questions and can never write', async () => {
  const r = await kb.runTool('run_sql', { query: "SELECT COUNT(*) AS n FROM factures WHERE statut = 'en_retard' AND nb_relances = 0 AND julianday('2026-10-15') - julianday(date_echeance) BETWEEN 31 AND 44" });
  assert.equal(r.view.rows[0][0], facts.overdue_31_44_no_reminder.length);
  await assert.rejects(kb.runTool('run_sql', { query: 'DELETE FROM factures' }), /rejected/);
  await assert.rejects(kb.runTool('run_sql', { query: 'SELECT 1; DROP TABLE factures' }), /rejected/);
  const after = await kb.runTool('run_sql', { query: 'SELECT COUNT(*) FROM factures' });
  assert.equal(after.view.rows[0][0], facts.counts.factures);
  await assert.rejects(kb.runTool('run_sql', { query: 'SELECT * FROM nope' }), /SQL error/);
});

test('rows are capped at 200 but the total is reported', async () => {
  const r = await kb.runTool('run_sql', { query: 'SELECT id FROM tickets' });
  assert.equal(r.view.rows.length, 200);
  assert.equal(r.view.total, facts.counts.tickets);
});

test('profile_table finds the planted duplicate clients', async () => {
  const r = await kb.runTool('run_sql', { query: 'SELECT contact_email, COUNT(*) FROM clients WHERE contact_email IS NOT NULL GROUP BY contact_email HAVING COUNT(*) > 1' });
  assert.equal(r.view.total, facts.duplicate_clients.length);
  const p = await kb.runTool('profile_table', { table: 'clients' });
  assert.match(p.text, /contact_email \| 2 \|/);
});

test('document search finds the reminder procedure and its 30-day rule', async () => {
  const r = await kb.runTool('search_documents', { query: 'relance facture impayée délai' });
  assert.equal(r.view.hits[0].id, '02-procedure-facturation-relance');
  const doc = await kb.runTool('read_document', { doc_id: '02-procedure-facturation-relance' });
  assert.match(doc.text, /J\+30/);
  const en = await kb.runTool('search_documents', { query: 'conservation tickets RGPD' });
  assert.equal(en.view.hits[0].id, '04-politique-rgpd-conservation');
});

test('code tools expose the 45-day reminder and the security issues', async () => {
  const grep = await kb.runTool('search_code', { query: 'FIRST_REMINDER_DAYS' });
  assert.ok(grep.view.matches.some((m) => m.path === 'src/billing/reminders.js' && /= 45/.test(m.text)));
  const file = await kb.runTool('read_file', { path: 'src/config.js' });
  assert.match(file.text, /password: 'Nexa2024!Facturation'/);
  const re = await kb.runTool('search_code', { query: "ILIKE '%\" \\+", regex: true });
  assert.ok(re.view.matches.some((m) => m.path === 'src/routes/factures.js'));
  const tree = await kb.runTool('code_overview', {});
  assert.match(tree.text, /src\/billing\/reminders\.js/);
  await assert.rejects(kb.runTool('read_file', { path: '../../etc/passwd' }), /not found/);
  await assert.rejects(kb.runTool('search_code', { query: '(', regex: true }), /Invalid regular expression/);
});

test('uploaded spreadsheets become typed, queryable tables', async () => {
  const res = kb.addTable('Ventes 2026', ['Mois', 'Montant €', 'Région'], [['2026-01', '1200,50', 'Ouest'], ['2026-02', 980, 'Est'], ['2026-03', '', 'Ouest']]);
  assert.equal(res.table, 'ventes_2026');
  const r = await kb.runTool('run_sql', { query: 'SELECT SUM(montant) FROM ventes_2026' });
  assert.equal(r.view.rows[0][0], 2180.5);
  const again = kb.addTable('ventes 2026', ['a'], [['x']]);
  assert.equal(again.table, 'ventes_2026_2');
  const tricky = kb.addTable('x"; DROP TABLE clients; --', ['a"b'], [['1']]);
  assert.match(tricky.table, /^[a-z0-9_]+$/);
  assert.ok(kb.tableNames().includes('clients'));
});

test('charts are validated and capped', async () => {
  const r = await kb.runTool('create_chart', { type: 'bar', title: 'SLA', labels: ['a', 'b'], datasets: [{ label: '%', data: [80, 'x', 5] }] });
  assert.deepEqual(r.view.datasets[0].data, [80, 0]);
  await assert.rejects(kb.runTool('create_chart', { type: 'radar', title: 't', labels: ['a'], datasets: [{ label: 'x', data: [1] }] }));
});
