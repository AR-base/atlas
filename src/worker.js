// Atlas — Cloudflare Worker.
//
// Serves the static app and one API route, POST /api/agent, which forwards a
// validated conversation to the Claude Messages API with Atlas's own system
// prompt and tools. Tools run in the visitor's browser: the database, the
// documents and the code never reach this server, only the excerpts the agent
// asked for, inside the conversation.

import { LIMITS, ValidationError, buildRequest, validateConversation } from '../lib/agent.js';
import { httpsRedirect, withSecurityHeaders } from '../lib/security-headers.js';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const UPSTREAM_TIMEOUT_MS = 90_000;

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra },
  });
}

async function sha256(text) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

// Constant-time comparison over fixed-length digests.
async function sameSecret(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !b) return false;
  const [x, y] = await Promise.all([sha256(a), sha256(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i += 1) diff |= x[i] ^ y[i];
  return diff === 0;
}

function clientIp(request) {
  return request.headers.get('cf-connecting-ip') || 'unknown';
}

async function rateLimited(env, key) {
  if (!env || !env.AGENT_RATE_LIMITER) return false;
  const { success } = await env.AGENT_RATE_LIMITER.limit({ key });
  return !success;
}

async function handleAgent(request, env) {
  if (await rateLimited(env, clientIp(request))) {
    return json({ error: 'rate_limited' }, 429, { 'retry-after': '60' });
  }
  if (env.ACCESS_CODE && !(await sameSecret(request.headers.get('x-access-code') || '', env.ACCESS_CODE))) {
    return json({ error: 'access_code' }, 401);
  }
  if (!env.ANTHROPIC_API_KEY) return json({ error: 'not_configured' }, 503);

  const type = request.headers.get('content-type') || '';
  if (!type.startsWith('application/json')) return json({ error: 'bad_request' }, 415);
  const length = Number(request.headers.get('content-length') || 0);
  if (length > LIMITS.bodyBytes) return json({ error: 'too_large' }, 413);

  let raw;
  try {
    raw = await request.text();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  if (raw.length > LIMITS.bodyBytes) return json({ error: 'too_large' }, 413);

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: 'bad_request' }, 400);
  }

  let messages;
  try {
    messages = validateConversation(body && body.messages);
  } catch (err) {
    if (err instanceof ValidationError) return json({ error: 'invalid', detail: err.message }, 400);
    throw err;
  }
  const lang = body.lang === 'en' ? 'en' : 'fr';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  let upstream;
  try {
    upstream = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(buildRequest(messages, { model: env.AI_MODEL, lang })),
      signal: controller.signal,
    });
  } catch {
    return json({ error: 'upstream_unreachable' }, 502);
  } finally {
    clearTimeout(timer);
  }

  if (!upstream.ok) {
    // Never forward provider error bodies (they can reveal account details).
    const status = upstream.status === 429 || upstream.status === 529 ? 503 : 502;
    return json({ error: status === 503 ? 'busy' : 'upstream_error' }, status);
  }
  const data = await upstream.json();
  return json({ content: data.content || [], stop_reason: data.stop_reason || null, usage: data.usage || null });
}

async function route(request, env) {
  const url = new URL(request.url);
  if (url.pathname === '/api/agent') {
    if (request.method !== 'POST') return json({ error: 'method' }, 405, { allow: 'POST' });
    return handleAgent(request, env || {});
  }
  if (url.pathname === '/api/config') {
    return json({ accessCodeRequired: Boolean(env && env.ACCESS_CODE), configured: Boolean(env && env.ANTHROPIC_API_KEY) });
  }
  if (env && env.ASSETS) return env.ASSETS.fetch(request);
  return new Response('Not found', { status: 404 });
}

export default {
  async fetch(request, env) {
    const redirect = httpsRedirect(request);
    if (redirect) return redirect;
    try {
      return withSecurityHeaders(await route(request, env));
    } catch {
      return withSecurityHeaders(json({ error: 'internal' }, 500));
    }
  },
};

export { route, handleAgent, sameSecret };
