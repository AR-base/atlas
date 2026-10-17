import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkReadOnlySql, SqlRejected } from '../public/js/sqlguard.js';

const ok = (sql) => assert.doesNotThrow(() => checkReadOnlySql(sql), sql);
const bad = (sql) => assert.throws(() => checkReadOnlySql(sql), SqlRejected, sql);

test('accepts ordinary read queries', () => {
  ok('SELECT * FROM clients');
  ok('select count(*) from factures;');
  ok("WITH r AS (SELECT * FROM factures WHERE statut = 'en_retard') SELECT COUNT(*) FROM r");
  ok("SELECT 'drop table x; delete' AS harmless_text");
  ok('SELECT "update" FROM t -- delete in a comment\n');
  ok('SELECT /* insert */ 1');
});

test('rejects writes, schema changes and settings', () => {
  bad('DELETE FROM clients');
  bad('UPDATE factures SET statut = 1');
  bad('INSERT INTO clients VALUES (1)');
  bad('DROP TABLE clients');
  bad('PRAGMA writable_schema = 1');
  bad("ATTACH DATABASE 'x.db' AS x");
  bad('CREATE TABLE x (a)');
  bad('VACUUM');
});

test('rejects stacked statements and disguised writes', () => {
  bad('SELECT 1; DELETE FROM clients');
  bad('SELECT 1;; ');
  bad('WITH x AS (SELECT 1) DELETE FROM clients');
  bad('SELECT * FROM clients WHERE id IN (SELECT id FROM clients); DROP TABLE t');
  bad("SELECT load_extension('evil')");
  bad('SELECT 1 /* unterminated');
  bad("SELECT 'unterminated");
  bad('');
});
