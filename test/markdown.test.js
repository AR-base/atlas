import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown } from '../public/js/markdown.js';

test('escapes HTML coming from the model', () => {
  const html = renderMarkdown('<img src=x onerror=alert(1)> **gras** <script>alert(1)</script>');
  assert.doesNotMatch(html, /<img|<script/);
  assert.match(html, /&lt;img/);
  assert.match(html, /<strong>gras<\/strong>/);
});

test('links only for http(s) URLs, opened safely', () => {
  assert.doesNotMatch(renderMarkdown('[x](javascript:alert(1))'), /<a /);
  const html = renderMarkdown('[doc](https://example.com/a)');
  assert.match(html, /href="https:\/\/example\.com\/a"/);
  assert.match(html, /rel="noopener noreferrer"/);
});

test('no attribute injection through link text or URL', () => {
  const html = renderMarkdown('[a](https://e.com/"onmouseover="x)');
  assert.doesNotMatch(html, /onmouseover="/);
});

test('renders tables, lists, headings and code', () => {
  const html = renderMarkdown('## Titre\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n- un\n- deux\n\n```sql\nSELECT 1;\n```');
  assert.match(html, /<h4>Titre<\/h4>/);
  assert.match(html, /<table>.*<th>a<\/th>.*<td>2<\/td>/s);
  assert.match(html, /<ul><li>un<\/li><li>deux<\/li><\/ul>/);
  assert.match(html, /<pre class="code" data-lang="sql"><code>SELECT 1;<\/code><\/pre>/);
});
