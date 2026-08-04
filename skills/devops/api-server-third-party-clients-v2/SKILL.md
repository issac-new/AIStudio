---
name: api-server-third-party-clients
description: >-
  Connect OpenAI-compatible third-party clients (Cherry Studio, Open WebUI,
  LobeChat, etc.) to the Hermes API Server on port 8650 with multi-model
  routing. Covers API_SERVER_KEY auth, model_routes config, provider
  resolution, the SwarmStudio bundled-version model_routes gap and its
  monkey-patch fix, gateway restart, and per-model verification. Use when
  setting up Cherry Studio or any external LLM client to talk to Hermes.
version: 2.0.0
platforms: [macos, linux, windows]
metadata:
  hermes:
    tags: [api-server, cherry-studio, model-routes, openai-compatible, gateway, swarmstudio]
    related_skills: [swarmstudio-gateway-management, hermes-gateway-operations]
---

# API Server Third-Party Client Access

Connect OpenAI-compatible clients (Cherry Studio, Open WebUI, LobeChat,
Chatbox, etc.) to the Hermes API Server on port 8650, with multi-model
routing so one endpoint serves multiple backend LLMs.

## When to Use

- User wants to connect Cherry Studio / Open WebUI / LobeChat to Hermes
- User needs multiple models accessible from a single API endpoint
- User asks about `model_routes` or API Server authentication
- User wants to expose specific provider models (GLM, DeepSeek, K3, etc.)
  to external clients without giving out raw provider keys
- Cherry Studio can't discover models beyond the default profile name
- User needs to know which API formats the server supports

## Architecture

The Hermes API Server (`gateway/platforms/api_server.py`) is an
**OpenAI-compatible** HTTP server. It exposes:

- `POST /v1/chat/completions` — standard OpenAI chat (streaming supported)
- `POST /v1/responses` — OpenAI Responses API (streaming supported)
- `POST /v1/runs` — async task submission with SSE event streams
- `GET /v1/models` — model listing
- `GET /v1/capabilities` — feature/auth discovery
- `GET /v1/skills` — installed skills listing
- `GET /v1/toolsets` — toolset listing
- `GET /api/sessions` + CRUD — session management endpoints
- `GET /health` — unauthenticated health check

**Auth model**: Bearer token via `API_SERVER_KEY` env var (in `~/.hermes/.env`).
This is the GATEWAY auth token — NOT the upstream LLM key. Upstream provider
keys (`DAMOXING_API_KEY`, `DEEPSEEK_API_KEY`, `KIMI_API_KEY`, etc.) stay in
`.env` and are never exposed to the client.

**Without `model_routes`**: the only model exposed is the profile name (e.g.
`orchestrator`). The API Server creates a full Hermes Agent with tools, skills,
and memory — not a dumb LLM proxy.

**With `model_routes`**: the client sends different `model` field values, and
the API Server routes each request to the configured backend provider+model.

## Configuration: model_routes

### Step 1: Edit BOTH config.yaml files

When SwarmStudio manages the gateway (`multiplex_profiles: true`), it runs the
**orchestrator profile's** config.yaml, not the global one. You must add
`model_routes` to **both** files:

1. `~/.hermes/config.yaml` (global — read by non-SwarmStudio gateways)
2. `~/.hermes/profiles/orchestrator/config.yaml` (profile — read by SwarmStudio)

In both files, add `model_routes` under `platforms.api_server.extra`:

```yaml
platforms:
  api_server:
    enabled: true
    extra:
      host: 127.0.0.1          # 0.0.0.0 for remote access
      port: 8650
      model_routes:
        glm-5.2:               # alias the client sends as "model" field
          model: glm-5.2        # actual model name on the provider
          provider: damoxing    # provider name from config.yaml providers section
        glm-5.1:
          model: glm-5.1
          provider: damoxing
        deepseek-v4-flash:
          model: deepseek-v4-flash
          provider: deepseek
        k3:
          model: k3
          provider: kimicode    # custom_providers entry
        kimi-k2.7-code-highspeed:
          model: kimi-k2.7-code-highspeed
          provider: kimicode
```

Each route supports 4 fields (only `model` is required):
- `model` — actual model name on the upstream provider
- `provider` — provider name from `providers:` or `custom_providers:` in config.yaml
- `api_key` — optional upstream provider key override (NOT caller auth)
- `base_url` — optional upstream base URL override

When `provider` is set but `api_key`/`base_url` omitted, the API Server
resolves credentials from the provider chain automatically.

Also ensure each model is listed in the provider's `models:` section so the
agent can resolve it:

```yaml
providers:
  damoxing:
    # ...
    models:
      - glm-5.2
      - glm-5.1           # ← add new models here too
  deepseek:
    # ...
    models:
      - deepseek-v4-flash  # ← remove models you no longer route
custom_providers:
  - name: kimicode
    # ...
    models:
      k3:
        name: k3
      kimi-k2.7-code-highspeed:     # ← dict format for custom_providers
        name: kimi-k2.7-code-highspeed
```

### Step 2: Restart gateway

`model_routes` is parsed at `__init__` time, not per-request. After editing:

```bash
# Kill current gateway (SwarmStudio auto-restarts it within ~10s)
kill $(python3 -c "import json; print(json.load(open('$HOME/.hermes/profiles/orchestrator/gateway.pid'))['pid'])")
sleep 10
curl -s http://127.0.0.1:8650/health  # verify restart
```

### Step 3: Verify /v1/models returns all routes

```bash
KEY="desk-..."  # your API_SERVER_KEY from ~/.hermes/.env
curl -s -H "Authorization: Bearer $KEY" http://127.0.0.1:8650/v1/models | python3 -m json.tool
```

You should see the default profile name PLUS all route aliases. If you only
see the profile name, see the **SwarmStudio bundled-version gap** pitfall below.

### Step 4: Verify each route works

```bash
KEY="desk-..."  # your API_SERVER_KEY from ~/.hermes/.env
for model in glm-5.2 glm-5.1 deepseek-v4-flash k3 kimi-k2.7-code-highspeed; do
  echo -n "  $model -> "
  curl -s -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
    -d "{\"model\":\"$model\",\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}],\"max_tokens\":20}" \
    http://127.0.0.1:8650/v1/chat/completions \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('choices',[{}])[0].get('message',{}).get('content','ERROR')[:80])"
done
```

### Step 5: Configure the client

For Cherry Studio (and similar OpenAI-compatible clients):

| Setting | Value |
|---------|-------|
| Provider type | OpenAI |
| API Address | `http://127.0.0.1:8650` |
| API Key | `desk-...` (the `API_SERVER_KEY` value from `~/.hermes/.env`) |
| Models | auto-discovered via "获取模型列表" if patched; otherwise manually add each alias |

The client never sees upstream provider keys — it only needs the single
`API_SERVER_KEY` Bearer token.

## Route Resolution Precedence

From `api_server.py` `_run_agent()`:

1. **Session `/model` override** (highest) — if the user issued `/model` on
   the API Server session, it beats everything.
2. **model_routes** — static per-client config from `model_routes`.
3. **Global config default** (lowest) — `model.default` + `model.provider`.

## Discovery Endpoints

```bash
# List models (returns profile name + route aliases if patched)
curl -s -H "Authorization: Bearer $KEY" http://127.0.0.1:8650/v1/models

# Full capability discovery (auth type, features, endpoint map)
curl -s -H "Authorization: Bearer $KEY" http://127.0.0.1:8650/v1/capabilities

# Health (no auth needed)
curl -s http://127.0.0.1:8650/health
```

## Pitfalls

- **No `API_SERVER_KEY` = server refuses to start** — the API Server requires
  a key with sufficient entropy. Use `openssl rand -hex 32` to generate one.
  Set it in `~/.hermes/.env` as `API_SERVER_KEY=<value>`.

- **Config changes need gateway restart** — `model_routes` is parsed once at
  startup. Kill the gateway PID; SwarmStudio respawns within ~10s.

- **CRITICAL: SwarmStudio bundled-version model_routes gap** — SwarmStudio
  ships a bundled Hermes (e.g. v0.19.0 at
  `~/.hermes-web-ui/desktop-runtime/hermes/0.18.0/mac-arm64/python/`) whose
  `api_server.py` does NOT support `model_routes`. The config is silently
  ignored: `/v1/models` returns only the profile name, and Cherry Studio's
  "获取模型列表" only sees one model. Chat requests with route aliases still
  work (the `model` field is passed through to the agent), but model
  discovery fails. See `references/swarmstudio-model-routes-patch.md` for the
  3-point monkey-patch that backports `model_routes` support to the bundled
  version. Re-patch after every SwarmStudio update.

- **Config must be in BOTH global and profile config.yaml** — SwarmStudio's
  gateway reads the orchestrator profile's `config.yaml`
  (`~/.hermes/profiles/orchestrator/config.yaml`), not the global
  `~/.hermes/config.yaml`. Add `model_routes` to both to cover all gateway
  launch paths. The profile config has a write-guard — use Python/sed to
  patch it, not the `patch` tool.

- **Add new models to provider `models:` lists too** — `model_routes` alone
  routes the request, but the agent's model resolver also checks
  `providers.<name>.models` / `custom_providers[].models` to validate the
  model name. If a new model isn't listed there, it may fail silently or
  fall through to the wrong provider.

- **Remote access** — change `host` from `127.0.0.1` to `0.0.0.0` and ensure
  firewall allows the port. No TLS — use a reverse proxy (nginx/caddy) for
  HTTPS in production.

- **API_SERVER_KEY is gateway auth, not LLM auth** — the client uses this
  single token for all requests. Upstream provider keys are resolved
  server-side from `~/.hermes/.env`. Never put upstream keys in the client.

- **Streaming works** — `stream: true` on `/v1/chat/completions` is fully
  supported. Cherry Studio's streaming mode is compatible.

- **API Server creates a full agent** — each request spawns a Hermes AIAgent
  with tools, skills, and memory. This is NOT a thin LLM proxy. If you only
  need raw LLM pass-through, use `model_routes` with explicit `api_key` and
  `base_url` to bypass the provider credential chain (the agent still runs
  but routes to the specified upstream directly).

## Related Skills

- `swarmstudio-gateway-management` — gateway lifecycle, multiplex_profiles,
  dashboard state file symlinks
- `hermes-gateway-operations` — launchd setup, multi-board Kanban, session
  pruning
- `gateway-crash-loop-troubleshooting` — port conflicts, crash loops

## Support Files

- `references/swarmstudio-model-routes-patch.md` — the 3-point monkey-patch
  that backports `model_routes` support to SwarmStudio's bundled Hermes
  (adds `_parse_model_routes` + patches `__init__` + rewrites `_handle_models`)
