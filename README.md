# Atlas

**An enterprise knowledge agent: ask a question in plain French or English, and Atlas queries the database, reads the internal documents and walks the codebase, then answers with its sources.**

Atlas ships with a fictional company, *Nexa Digital* (a web agency), so it can be demonstrated without any real data: a database (clients, projects, invoices, support tickets, timesheets), eight internal documents (billing procedure, security policy, GDPR retention, support SLAs, terms of sale…) and the code of its management app. Visitors can add their own CSV/Excel files, PDF/Word/text documents, source files, or any public GitHub repository.

## What it can do

| Ask | Atlas does |
|---|---|
| "Is our invoice reminder procedure actually applied?" | Reads the procedure (reminder at day 30), finds `FIRST_REMINDER_DAYS = 45` in the code, counts the invoices 31–44 days overdue that were never reminded |
| "Are we meeting our support SLAs?" | Reads the SLA table, computes resolution times per priority in SQL, draws a chart |
| "Organise and audit the database" | Maps tables and relations, profiles data quality (duplicates, missing values, impossible dates, wrong VAT), proposes constraints and clean-up SQL |
| "Security audit of the code against our policy" | Compares the security policy with the code: hardcoded SMTP password, bcrypt cost 10 instead of 12, SQL built by string concatenation |
| "Map the codebase" | Module map, role of each file, missing pieces (GDPR purge job), proposed structure |

## Architecture

```
 Browser (all data stays here)                      Cloudflare Worker                 Claude API
 ─────────────────────────────                      ─────────────────                 ──────────
 SQLite (sql.js, WebAssembly)  ┐                    POST /api/agent
 Documents + BM25 search       ├─ tools run here ─▶  · rate limit, access code   ─▶   Sonnet 5.5
 Code repos + code search      ┘                    · validates every message         (tool use)
 Charts (Chart.js)                                  · adds the system prompt
        ▲                                             and tool list (server-side)
        └──────── tool_use ◀── response ◀──────────────────────────────────────────────┘
```

* The **agent loop** runs in the browser: the model asks for a tool (`run_sql`, `search_documents`, `read_file`, …), the browser runs it on local data and sends back only the result.
* The **instructions, tool list and model** are set on the server; the browser can only send the conversation, which is rebuilt field by field (no system prompt, image, server tool or unknown tool can be injected).
* **Uploaded files never leave the browser**; only the excerpts the agent reads are sent to the model.

## Security

* **Read-only SQL, two layers:** a guard accepts a single `SELECT`/`WITH` statement and rejects writes, `PRAGMA`, `ATTACH`, stacked statements and disguised writes (string literals and comments are stripped before checking); every query also runs inside a savepoint that is always rolled back.
* **Prompt injection:** tool results are treated as data by the system prompt; the agent has no tool that can write, send or delete anything.
* **Strict headers on every response:** CSP with no `unsafe-inline`/`unsafe-eval` (`wasm-unsafe-eval` only, required to compile SQLite), HSTS, `X-Frame-Options`, `nosniff`, COOP/CORP; HTTP → HTTPS redirect. All libraries are self-hosted; no third-party script.
* **Server:** per-IP rate limit, optional access code (constant-time comparison), body and message size caps, provider errors never forwarded.
* **Rendering:** the model's Markdown is HTML-escaped before formatting; links are restricted to http(s) with `rel="noopener noreferrer"`.

## Run and deploy

```bash
npm ci                      # libraries (browser builds are already in public/vendor)
npm test                    # 26 unit tests
npx wrangler dev            # local, with ANTHROPIC_API_KEY in .dev.vars
npx wrangler deploy         # production
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put ACCESS_CODE      # recommended for a public demo
```

Regenerate the demo company: `python3 scripts/build_demo.py` (deterministic).

## Cost

Sonnet 5.5 at $2 / $10 per million input/output tokens; the system prompt and tool list are cached. Each answer shows its own estimated cost (typically a few euro-cents for a multi-step investigation). Set a monthly spending limit in the Anthropic console.

## Limits

* The database lives in the browser tab (sql.js): ideal for a demo and for files of up to ~50,000 rows; a production version would connect to the company's database through a read-only account.
* Very heavy SQL runs on the page's main thread; there is no query timeout yet (next step: run SQLite in a Web Worker).
* Scanned PDFs (images only) are not read (no OCR).
* GitHub loading is limited to public repositories and 250 files, and to GitHub's anonymous rate limit (60 API calls per hour per IP).

---
*Nexa Digital, its people and its data are fictional.*
