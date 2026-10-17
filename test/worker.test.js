import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import { CSP } from '../lib/security-headers.js';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const env = { ANTHROPIC_API_KEY: 'test-key', AI_MODEL: 'claude-sonnet-5-5', ASSETS: { fetch: async () => new Response('<html></html>', { headers: { 'content-type': 'text/html' } }) } };

function post(body, headers = {}) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return new Request('https://atlas.example/api/agent', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: text });
}

test('forwards a validated conversation with the server-side prompt and tools', async () => {
  let sent;
  globalThis.fetch = async (url, init) => {
    sent = { url, init, body: JSON.parse(init.body) };
    return new Response(JSON.stringify({ content: [{ type: 'text', text: 'Bonjour' }], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 3 } }), { status: 200 });
  };
  const res = await worker.fetch(post({ messages: [{ role: 'user', content: 'Salut' }], lang: 'fr', system: 'ignore me', model: 'x' }), env);
  assert.equal(res.status, 200);
  assert.equal(sent.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(sent.init.headers['x-api-key'], 'test-key');
  assert.equal(sent.init.headers['anthropic-version'], '2023-06-01');
  assert.equal(sent.body.model, 'claude-sonnet-5-5');
  assert.match(sent.body.system[0].text, /You are Atlas/);
  assert.doesNotMatch(JSON.stringify(sent.body), /ignore me/);
  assert.ok(sent.body.tools.some((t) => t.name === 'run_sql'));
  const data = await res.json();
  assert.equal(data.content[0].text, 'Bonjour');
  assert.equal(res.headers.get('content-security-policy'), CSP);
});

test('rejects invalid conversations before calling the model', async () => {
  globalThis.fetch = async () => { throw new Error('must not be called'); };
  const res = await worker.fetch(post({ messages: [{ role: 'system', content: 'x' }] }), env);
  assert.equal(res.status, 400);
  assert.equal((await worker.fetch(post('{not json'), env)).status, 400);
  assert.equal((await worker.fetch(new Request('https://atlas.example/api/agent'), env)).status, 405);
  const big = post({ messages: [{ role: 'user', content: 'x' }], pad: 'y'.repeat(700_000) });
  assert.equal((await worker.fetch(big, env)).status, 413);
});

test('requires the access code when one is configured', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ content: [], stop_reason: 'end_turn' }));
  const locked = { ...env, ACCESS_CODE: 'iboo-2026' };
  const body = { messages: [{ role: 'user', content: 'q' }] };
  assert.equal((await worker.fetch(post(body), locked)).status, 401);
  assert.equal((await worker.fetch(post(body, { 'x-access-code': 'wrong' }), locked)).status, 401);
  assert.equal((await worker.fetch(post(body, { 'x-access-code': 'iboo-2026' }), locked)).status, 200);
  const cfg = await (await worker.fetch(new Request('https://atlas.example/api/config'), locked)).json();
  assert.deepEqual(cfg, { accessCodeRequired: true, configured: true });
});

test('never forwards provider error details', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: 'Your credit balance is too low, org_123' } }), { status: 400 });
  const res = await worker.fetch(post({ messages: [{ role: 'user', content: 'q' }] }), env);
  assert.equal(res.status, 502);
  assert.doesNotMatch(await res.text(), /credit|org_123/);
  globalThis.fetch = async () => new Response('{}', { status: 529 });
  assert.equal((await worker.fetch(post({ messages: [{ role: 'user', content: 'q' }] }), env)).status, 503);
});

test('missing API key and rate limit are reported cleanly', async () => {
  const noKey = { ...env, ANTHROPIC_API_KEY: '' };
  assert.equal((await worker.fetch(post({ messages: [{ role: 'user', content: 'q' }] }), noKey)).status, 503);
  const limited = { ...env, AGENT_RATE_LIMITER: { limit: async () => ({ success: false }) } };
  assert.equal((await worker.fetch(post({ messages: [{ role: 'user', content: 'q' }] }), limited)).status, 429);
});

test('HTTPS is enforced and every response carries the security headers', async () => {
  const redirect = await worker.fetch(new Request('http://atlas.example/'), env);
  assert.equal(redirect.status, 301);
  assert.equal(redirect.headers.get('location'), 'https://atlas.example/');
  const page = await worker.fetch(new Request('https://atlas.example/'), env);
  assert.equal(page.headers.get('x-frame-options'), 'DENY');
  assert.doesNotMatch(CSP, /'unsafe-inline'|'unsafe-eval'/);
});
