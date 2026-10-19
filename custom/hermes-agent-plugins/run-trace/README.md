# run-trace — Hermes Agent Observability Plugin

Local observability plugin for RunTraceView that writes JSONL trace files.

## Purpose

This plugin captures LLM span boundaries, tool calls, and subagent lifecycle events from hermes-agent and writes them to JSONL files for consumption by the RunTraceView frontend (Layer 3 Koa API).

## Output Format

Files are written to `~/.hermes/traces/<session_id>.jsonl` in header/chunk/trailer format:

```jsonl
{"type": "header", "session_id": "abc123", ...}
{"type": "chunk", "kind": "llm_span", "phase": "pre", ...}
{"type": "chunk", "kind": "llm_span", "phase": "post", "usage": {...}, ...}
{"type": "chunk", "kind": "tool_span", "tool_name": "read_file", ...}
{"type": "chunk", "kind": "subagent_span", "phase": "start", ...}
{"type": "trailer", "ended_at": ..., ...}
```

## Installation

### Option 1: Manual Copy

```bash
# Create user plugins directory
mkdir -p ~/.hermes/plugins

# Copy this plugin
cp -r <overlay>/custom/hermes-agent-plugins/run-trace ~/.hermes/plugins/

# Enable the plugin
hermes plugins enable run-trace
```

### Option 2: Project Plugins (Development)

Set environment variable and place in `.hermes/plugins/`:

```bash
export HERMES_ENABLE_PROJECT_PLUGINS=1

# Create project plugins directory
mkdir -p .hermes/plugins
cp -r <overlay>/custom/hermes-agent-plugins/run-trace .hermes/plugins/

# Enable
hermes plugins enable run-trace
```

## Configuration

Optional environment variables:

- `HERMES_RUN_TRACE_DIR` — Custom trace directory (default: `~/.hermes/traces`)
- `HERMES_RUN_TRACE_FORMAT` — Output format: `legacy` (default) or `otel`

Sampling & retention (v1.1, three-layer hybrid — session-end decision):

- `HERMES_RUN_TRACE_SAMPLE_RATE` — Head-sampling rate for successful sessions, `0`-`1` (default: `1.0` = keep everything, zero behavior change)
- `HERMES_RUN_TRACE_TAIL_TOKENS` — Tail-retention token threshold: sampled-out sessions with total tokens ≥ threshold are still kept (default: `0` = disabled)
- `HERMES_RUN_TRACE_REASONING_CHARS` — Max chars for the `reasoning_preview` field (default: `2000`)

Correlation fields (stamped into the trace header):

- `HERMES_RUN_TRACE_USER_ID` — User id (default: unset → `null`)
- `HERMES_RUN_TRACE_PROMPT_TEMPLATE` — Prompt template name
- `HERMES_RUN_TRACE_PROMPT_VERSION` — Prompt template version

Retention layers at session end (decision recorded in `trailer.sampling`):

1. **error-full** — any API error (`api_request_error` hook), tool error, or trailer error → always kept
2. **head-sample** — successful sessions kept by stable sha1 hash bucket of `session_id` vs `HERMES_RUN_TRACE_SAMPLE_RATE`
3. **tail-cost** — otherwise sampled-out sessions kept when total tokens ≥ `HERMES_RUN_TRACE_TAIL_TOKENS`

Unkept session files are deleted after the trailer is written and flushed.

### OTel Format

Set `HERMES_RUN_TRACE_FORMAT=otel` to output OpenTelemetry GenAI semantic convention
spans, compatible with Jaeger/Langfuse/Grafana. The Koa API auto-detects both formats.
Cache/reasoning token splits use `agentscope.usage.*` extension attributes (GenAI
semconv keys for these are still in Development status); attribute keys are locked
by golden-span assertions in `tests/test_run_trace.py`.

## Hooks Subscribed

| Hook | Purpose |
|------|---------|
| `on_session_start` | Create JSONL file, write header (with correlation fields) |
| `on_session_end` | Write trailer with `sampling` decision, close file, apply retention |
| `pre_api_request` | Write LLM span start chunk |
| `post_api_request` | Write LLM span end chunk with usage split + `reasoning_preview` |
| `api_request_error` | Write LLM error chunk (status_code/retry/error type) — 429 & failure source |
| `post_tool_call` | Write tool chunk with duration |
| `subagent_start` | Write subagent start chunk |
| `subagent_stop` | Write subagent stop chunk |

## Fail-Open Design

If the trace directory is not writable, all hooks are inert (no crashes). This allows hermes-agent to continue running even if observability is not available.

## Integration with RunTraceView

The Layer 3 Koa API (`GET /api/hermes/sessions/:id/trace`) reads these JSONL files and returns `TraceNode[] + TraceEdge[]` to the frontend, enabling:

- Accurate LLM span boundaries (instead of Layer 1's inferred timing)
- Token usage per LLM call
- Tool duration with actual args/result
- Subagent duration and resource usage

## License

Same as overlay project.