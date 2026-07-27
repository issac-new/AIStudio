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

### OTel Format

Set `HERMES_RUN_TRACE_FORMAT=otel` to output OpenTelemetry GenAI semantic convention
spans, compatible with Jaeger/Langfuse/Grafana. The Koa API auto-detects both formats.

## Hooks Subscribed

| Hook | Purpose |
|------|---------|
| `on_session_start` | Create JSONL file, write header |
| `on_session_end` | Write trailer, close file |
| `pre_api_request` | Write LLM span start chunk |
| `post_api_request` | Write LLM span end chunk with usage |
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