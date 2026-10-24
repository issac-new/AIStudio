---
name: semantica-runtime
description: >
  Manage the semantica knowledge-graph runtime on this host: health checks,
  MCP access (python -m semantica_mcp.mcp), graph operations against
  /Users/YOURNAME/.hermes/semantica/kg.json, and upstream sync anchors. Use when
  a task needs to inspect, query, or extend the semantica KG, or check
  semantica MCP tool availability/health.
version: 1.0.1
---

# semantica-runtime

Manage the semantica knowledge-graph runtime installed on this host: health
checks, MCP access, common graph operations, and upstream sync anchors.

## When to Use

- Cluster needs persistent knowledge-graph / decision-provenance runtime
  (semantica is the base runtime, continuously updated — not a one-shot fusion).
- Task asks to inspect, query, or extend the semantica KG at
  `/Users/YOURNAME/.hermes/semantica/kg.json`.
- Task asks about semantica MCP tools availability or health.

## Version Anchors (update these on every upgrade)

| Anchor | Value | Source |
|---|---|---|
| Pinned version | 0.7.0 | pip install semantica==0.7.0 |
| Upstream main at research | b14a2b8d2f989c8c3deca107a21d1da93ee2a506 | git ls-remote 2026-09-23 |
| Release tag | v0.7.0 (commit 2a9afec6) | semantica CHANGELOG.md:12 |
| Tarball sha256 at research | 275af1c2c145624c5b433b834d024d9c5390730d23199f6dbcf2fc4fb95d5bcd | shasum -a 256 |
| Research report | research/2026-09-23-semantica-source-analysis.md (t_af789076) | file:line refs 37 |
| Requests constraint | venv pins requests==2.33.0 (hermes-agent requirement); semantica wants >=2.34.2 — network-ingest features NOT verified; graph/memory/MCP chain verified on 2.33.0 | t_8292467f landing report |

0.x upstream evolves fast with breaking changes (v0.7.0 had 4). Before any
upgrade, diff the CHANGELOG breaking section; bump the anchors above in the
same change.

## Runtime Layout

- Install: Hermes venv only (`/Users/YOURNAME/.hermes/hermes-agent/venv`), never
  system Python (hermes-tool-dependencies rule).
- MCP entry: `python -m semantica_mcp.mcp` (independent package, 21 tools —
  upstream's main entry; the built-in `semantica/mcp_server` has only 15).
- KG persistence: `/Users/YOURNAME/.hermes/semantica/kg.json` (auto-loaded on
  server start, auto-written on change; full-snapshot write, not incremental).
- Vector backend: `inmemory` (sqlite available via SEMANTICA_VECTOR_BACKEND=sqlite
  + SEMANTICA_VECTOR_DB_PATH; faiss/pgvector are rejected by MCP tool layer).
- Hermes wiring: `~/.hermes/config.yaml` `mcp_servers.semantica` (enabled: true).

## Copy-Paste Command Handbook

```bash
VENV=/Users/YOURNAME/.hermes/hermes-agent/venv

# 1. Health check: import + version (exit 0 = healthy)
$VENV/bin/python -c "import semantica; print(semantica.__version__)"

# 2. Health check: MCP server boots and lists tools (expect 21)
export SEMANTICA_KG_PATH=/Users/YOURNAME/.hermes/semantica/kg.json
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"hc","version":"1"}}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | $VENV/bin/python -m semantica_mcp.mcp 2>/dev/null | head -2

# 3. Inspect KG snapshot size / node ids without starting the server
python3 -c "import json; g=json.load(open('/Users/YOURNAME/.hermes/semantica/kg.json')); print('nodes:', len(g.get('nodes',[])))"

# 4. Upgrade (after CHANGELOG breaking-section diff + anchor bump)
$VENV/bin/pip install --dry-run semantica  # check delta first
$VENV/bin/pip install semantica==<new-version>
```

## Design Constraints (from cross-research verdicts X2/X4 — do not re-decide)

- Supply forms (handbook M11 [p.44-45] via X2): semantica serves the
  "API structured query / local file retrieval" supply forms; real-time query
  needs the MCP server running. Supply is not only RAG.
- Retrieval hit-rate evaluation (handbook M12 [p.47] via X4): when evaluating
  semantica retrieval, metric anchors are hit-rate (did the agent pick the
  right tool/query) + success rate (did it complete with correct params).
  Count these into evals L1 — no separate metrics system (X3).
- Acceptance tri-state: verification of this runtime follows
  `~/.hermes/profiles/_shared/02-org-orchestration/acceptance-tri-state-protocol.md`
  (PASS/BLOCKED/UNKNOWN; UNKNOWN never counts as PASS).
- Asset count feeds evals L1 (X3): any skill/session using semantica MCP tools
  should be countable from evals L1 indicators, not a parallel ledger.

## References

- [w3c-semantic-stack.md](references/w3c-semantic-stack.md) — W3C 五标准分工表（RDF/RDFS/OWL/SPARQL/SHACL）+ 四件事边界（推理≠查询≠数据完备≠授权）+ 常见混淆对照 + 运行态九要素检查单。评估外部本体/语义层方案时作参照基准，非本机实现规范（t_267c3479, 2026-09-25）。

## Known Frictions (from C1 report §6.d, verified at landing)

- Full-snapshot persistence: write amplification grows with graph size;
  before scaling past tens of thousands of nodes, evaluate Neo4j backend.
- **Cross-batch entity id stability (dynamic-ontology fusion, 2026-10-02)**:
  conflict detection / provenance / dedup across batches all presuppose the
  same real-world entity is recorded under the SAME id every time. Re-running
  NER/extract per batch regenerates ids and silently breaks matching (the
  AI砖家成长日记 dynamic-ontology trilogy honestly demonstrated this: a
  deliberately planted cross-batch conflict was detected 0 times). When
  recording decisions/entities into the local KG, reuse existing ids via
  `search_graph` before `add_entity`; never mint a fresh id for an entity
  that may already exist.
- **Similarity dedup parameter anchors (same fusion)**: for any future entity
  merge/dedup pass over the KG, the trilogy's tuned thresholds are a starting
  point — 0.85 auto-alias, 0.6 manual-review, three-way verdict
  (auto-alias / manual / genuinely-new); and a circuit breaker when a single
  batch adds >20% of existing class count (all-manual). These are upstream
  experiment results, not semantica defaults.
- Single-process in-memory state: restart loses in-memory window (KG file
  restores last snapshot); no cross-process concurrent-write coordination.
- Chinese NER needs an extra spaCy model (`zh_core_web_sm`) — not installed.
- `search_graph` failed on embedding-model init under inmemory backend during
  landing smoke tests (2026-09-23 am); re-verified WORKING same day by C4
  regression t_5dfc880a (2/2 runs, query "landing" → 2 hits, ~1-1.6s wall).
  Capability now verified — re-check after backend/backend-path changes
  (previously mis-stated as permanent UNKNOWN; C4 勘误).
- add_entity requires `id` (not just name); record_decision requires 5 fields:
  `category`, `scenario`, `reasoning`, `outcome`, `confidence`
  (semantica_mcp tools/list inputSchema.required, verified 2026-09-23; C4 勘误
  — previously under-reported as 2 fields).
