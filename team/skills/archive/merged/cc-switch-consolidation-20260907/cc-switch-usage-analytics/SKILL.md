---
name: cc-switch-usage-analytics
description: Use for cc-switch usage/throughput analytics from SQLite.
---

# cc-switch Usage Analytics

Analyze historical usage of the local cc-switch proxy (127.0.0.1:15721) from its SQLite DB at `~/.cc-switch/cc-switch.db`. Read-only analytics — never write to this DB while the CC Switch app is running.

## When to use

- "统计今天/最近N天所有 provider 及模型的使用耗时，测算吞吐率"
- Cost/token/cache-hit analysis across cc-switch providers
- Failover/error-rate analysis across the provider queue

For live proxy status (current provider, balance/quota widgets) use the `cc-switch-monitoring` / `cc-switch-integration` skills (default profile, user-owned) instead — this skill is historical log analytics, not widget/proxy monitoring.

## Key tables

- `proxy_request_logs` — per-request rows: `provider_id, app_type, model, request_model, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, latency_ms, first_token_ms, status_code, is_streaming, created_at` (epoch seconds), `session_id, total_cost_usd`.
- `usage_daily_rollups` — pre-aggregated per (date, app_type, provider_id, model, request_model, pricing_model): request/success counts, token sums, `total_cost_usd`, `avg_latency_ms`. Use to cross-check raw-log aggregates.
- `providers` — id → human `name` + `app_type` + `is_current` + `in_failover_queue`.

## Correct methodology (validated 2026-08-03 on 13k+ rows)

1. **Streaming throughput** = `output_tokens / (latency_ms - first_token_ms)`. Do NOT use `output/latency` — latency includes TTFT (median 5–9s here) and understates generation speed ~2-3×.
2. Restrict throughput to `status_code=200 AND first_token_ms IS NOT NULL AND latency_ms > first_token_ms AND output_tokens > 5`. Report both median per-request speed and aggregate (sum(out)/sum(gen_time)).
3. **Cache hit rate** = `cache_read_tokens / (input_tokens + cache_read_tokens)`. Anthropic-format providers show 90-95%; openai-format providers may report 0% (cache not surfaced) — that is a reporting artifact, not real cache absence.
4. Report TTFT (median of first_token_ms) and end-to-end latency separately from generation speed.
5. Time windows: `created_at` is epoch seconds; compute window start in local time.

## Provider-mapping quirks

- `provider_id` is a UUID-ish string; always join against `providers` for display names.
- Rows for **deleted providers** remain in logs but have no `providers` entry — label them "(deleted provider)".
- `provider_id='default'` **collides across app_types** (e.g. 'Mkim'/claude vs 'Kimi'/claude-desktop). Disambiguate by grouping logs on `(provider_id, app_type)` or checking which app_type dominates.
- The proxy ignores the request's model name and routes to the active failover-queue provider; the `model` column is the actual upstream model. Non-routed health-check rows appear with model names like `claude-haiku-4-5` and zero tokens / status 403 — separate them from real traffic.

## Verifying report numbers (live DB)

- The DB is **live** — rows keep arriving between analysis and verification. Verification scripts must use tolerance (`>= reported` and `<= reported * 1.03`), never exact equality.
- Cross-checks that work: group counts sum back to total; status-200 share ≥99%; per-provider median recompute within a band; rollups vs raw-log token sums.
- Hermes injects "verify your latest changes" reminders on temp-script workflows — an ad-hoc verification script run then deleted is the right response; there is no project test suite for throwaway analysis.

## Pitfalls

- **Do NOT run python via terminal heredoc** (`python3 << 'EOF'`): the Hermes lifecycle_guard fails with `ValueError: embedded null byte`. Instead `write_file` the script to `/tmp/x.py`, then `terminal: python3 /tmp/x.py`. Applies to any heredoc-in-terminal pattern in this environment.
- Clean up `/tmp` analysis scripts after the run (they otherwise accumulate in the session's changed-paths list and trigger repeated verification prompts).

## Scripts

- `scripts/cc_switch_usage_report.py` — full report generator: `python3 cc_switch_usage_report.py [--days N]`. Prints per-provider+model request counts, tokens, cache hit, TTFT/latency medians, median+aggregate streaming throughput, status-code distribution, and daily volume, with provider-name resolution and deleted-provider labeling.
