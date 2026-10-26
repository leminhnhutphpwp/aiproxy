# aiproxy

A self-hosted LLM gateway in plain Node.js with no npm dependencies. It speaks the OpenAI and
Anthropic wire formats, routes each model alias through a chain of upstream providers, and falls
back to the next one when a provider is slow, rate-limited or down. A built-in web dashboard shows
health, logs and routing, and lets you edit providers without a restart.

```
client (OpenAI / Anthropic SDK)
        │
        ▼
   aiproxy :4097 ── /v1/chat/completions · /v1/messages · /v1/responses
        │
        ├─ model alias → fallback chain (config/public-models.json)
        ├─ key pool per provider: weights, RPM limits, circuit breaker per key
        ├─ health checker + error cooldowns (auth / quota / rate limit / timeout)
        │
        ├──► OpenAI-compatible providers (config/direct-providers.json)
        └──► OpenCode server (optional, config/provider-pools.json)
```

## Features

- **Three API formats.** OpenAI Chat Completions, Anthropic Messages and OpenAI Responses, with
  streaming. Requests are translated to whatever the upstream provider speaks.
- **Fallback chains.** One public alias such as `llama-3.3-70b` maps to an ordered list of
  `provider/model` pairs. The router skips providers whose circuit breaker is open.
- **Key pools.** Each provider can hold several keys with weights and RPM limits. A key that keeps
  failing is taken out of rotation, retried after a cooldown, then put on probation.
- **Health checks.** A background prober marks models healthy or degraded, and
  `GET /v1/models/status` reports it.
- **Dashboard.** Overview, providers, routing, breakers, logs, memories and settings, served at
  `/dashboard` (vanilla JS + DaisyUI, Vietnamese and English UI).
- **Optional extras.** Per-user conversation memory, reusable prompt "skills" (`config/skills/`),
  and retrieval-augmented "specialized" models built from a folder of Markdown documents (BM25 +
  embeddings + reranking).

## Quick start

Requires Node.js 20 or newer. There is nothing to `npm install`.

```bash
git clone https://github.com/leminhnhutphpwp/aiproxy.git
cd aiproxy
cp .env.example .env      # then fill in at least one provider key and the auth values
npm start                 # listens on http://127.0.0.1:4097
```

Check it is up:

```bash
curl http://127.0.0.1:4097/v1/models/status
```

## Calling the API

Clients authenticate with HTTP Basic using `OPENCODE_USERNAME` / `OPENCODE_PASSWORD` from `.env`.
**Set both values.** When either is empty, any Basic credentials are accepted.

```bash
curl http://127.0.0.1:4097/v1/chat/completions \
  -u "$OPENCODE_USERNAME:$OPENCODE_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"model": "llama-3.3-70b", "messages": [{"role": "user", "content": "Hello!"}], "stream": true}'
```

To issue per-user API keys instead, run a separate portal that answers
`POST /api/internal/validate-key`, then set `PORTAL_BASE_URL` and `INTERNAL_API_SECRET`. Clients
can then send `Authorization: Bearer <key>`.

| Method | Path | Description |
|---|---|---|
| GET | `/v1/models` | Public model aliases (auth required) |
| GET | `/v1/models/status` | Health of each alias |
| POST | `/v1/chat/completions` | OpenAI Chat Completions |
| POST | `/v1/messages` | Anthropic Messages |
| POST | `/v1/responses` | OpenAI Responses |

## Configuration

| File | What it holds |
|---|---|
| `.env` | Ports, dashboard login, client auth, provider keys (see `.env.example`) |
| `config/direct-providers.json` | Upstream providers: base URL, path, key env names, models |
| `config/public-models.json` | Public aliases and their fallback chains |
| `config/provider-pools.json` | Optional OpenCode pool |
| `config/dashboard-config.json` | Health-check, breaker, cooldown and rate-limit tuning |

The repository ships with two example providers, NVIDIA NIM and GitHub Models. Adding another
OpenAI-compatible provider means adding an entry to `direct-providers.json` that names the env
variables holding its keys, then referencing it from a chain in `public-models.json`. You can also
do this from the dashboard. API keys never go in the JSON files, only env variable names.

## Running in production

- Keep `HOSTNAME=127.0.0.1` and put a reverse proxy with TLS (nginx, Caddy) in front.
- `pm2.config.js` is included if you use PM2 (`pm2 start pm2.config.js`).
- Use only providers whose terms allow the way you use them, and only keys you own.

## Tests

```bash
npm test
```

## License

[MIT](LICENSE)
