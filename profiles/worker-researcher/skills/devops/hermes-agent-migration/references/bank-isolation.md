# Hindsight Bank Isolation — MAC-Based Machine Isolation

## Problem

When Hindsight API runs as a shared service (one instance on one machine,
accessed by agents on multiple other machines), the default
`bank_id_template: hermes-{profile}` only isolates by **profile** — not by
**machine**. All machines accessing the `orchestrator` profile share the same
`hermes-orchestrator` bank. Machine A's memories get recalled when machine B
asks a question.

## Solution: MAC-Based Template

Use `bank_id_template: hermes-{MAC}-{profile}` where `{MAC}` is the local
machine's MAC address (stripped of colons, lowercased). This provides
**per-machine** isolation while keeping per-profile separation.

```json
{
  "bank_id_template": "hermes-32767c6fad0f-{profile}"
}
```

The MAC is written literally into each profile's `config.json` — it is NOT
a Hindsight template placeholder (unlike `{profile}`, `{user}`, etc. which
are resolved at runtime). The MAC is detected once and baked in.

### Why MAC Instead of {user}

The user initially tried `hermes-{user}-{profile}` but found that `{user}`
comes from the Matrix event's `sender` field (a full MXID like
`@testuser1:matrix.org`), which is **per-user, not per-machine**. This caused:

1. **TUI sessions get empty user**: TUI/CLI has no platform user_id →
   `{user}` resolves to `""` → bank_id collapses to `hermes-orchestrator`
   (old format, not isolated).
2. **Same user on different machines shares a bank**: testuser1 on machine A
   and testuser1 on machine B would share the same bank.
3. **MXID sanitization produces long bank IDs**: `@testuser1:matrix.org` →
   `testuser1-matrix-org` → `hermes-testuser1-matrix-org-orchestrator`.

MAC address solves all three: it's machine-unique, available on all platforms
(macOS/Linux/Windows), and deterministic regardless of session source.

### Bank ID Resolution Examples

| Machine | Profile | bank_id |
|---------|---------|---------|
| MAC `32767c6fad0f` | orchestrator | `hermes-32767c6fad0f-orchestrator` |
| MAC `32767c6fad0f` | worker-coder | `hermes-32767c6fad0f-worker-coder` |
| MAC `aabbccddeeff` | orchestrator | `hermes-aabbccddeeff-orchestrator` |

All 9 profiles on the same machine share the same MAC prefix, but each gets
its own bank via the `{profile}` suffix.

## Setup: Automated Script

➡️ `scripts/setup-hindsight-banks.py` — detects MAC and updates all profiles

```bash
# macOS/Linux
python3 ~/.hermes/shared/setup-hindsight-banks.py

# Windows
python %USERPROFILE%\.hermes\shared\setup-hindsight-banks.py

# Manual MAC override
python3 setup-hindsight-banks.py --mac AABBCCDDEEFF

# Preview only
python3 setup-hindsight-banks.py --dry-run
```

The script supports macOS (`ifconfig en0`), Linux (`ip link show`), and
Windows (`getmac`). Run once after migrating to a new machine.

## Migration: Moving Memories to New Banks

➡️ `scripts/migrate-hindsight-banks.py` — recalls from old banks, retains to new

```bash
# Run in background (5-10 min for ~200 memories)
python3 /tmp/migrate-hindsight-banks.py &

# Or via Hermes terminal tool:
terminal(background=true, notify_on_complete=true,
  command="python3 /tmp/migrate-hindsight-banks.py")
```

The migration script:
1. Lists all banks via the Hindsight API
2. Categorizes into MAC-based (target) vs legacy (source)
3. For each legacy bank: recall all memories → re-retain to MAC-based bank
4. Processes in batches of 5 with 1s delay (rate limit safety)
5. Prints a final bank listing showing old + new banks

**Migration is additive** — old banks are NOT deleted. The agent simply stops
using them after `config.json` is updated. Historical data is preserved.

**Proven results** (2026-07-21 session): 208 memories migrated across 13
source banks → 9 target banks, 0 failures. Recall verification confirmed
251 memories in MAC-based banks (208 migrated + 43 derived by DeepSeek LLM
during retain processing).

## Bank Isolation Placeholder Reference

The Hindsight plugin (`__init__.py:584`) supports these runtime placeholders:

| Placeholder | Source | Machine-specific? | Example |
|------------|--------|-------------------|---------|
| `{profile}` | `agent_identity` kwarg | No | `orchestrator` |
| `{user}` | `user_id` kwarg (gateway session) | No (per-user) | `testuser1` |
| `{platform}` | `platform` kwarg | No | `matrix` |
| `{MAC}` | **Not a placeholder** — baked into template | **Yes** | `32767c6fad0f` |
| `{session}` | `session_id` (per-process) | No | `abc123` |

Only `{MAC}` (baked literal) provides machine-level isolation. `{user}`
provides user-level isolation but is empty for TUI sessions and shared
across machines for the same Matrix user.

## History: Evolution of Bank Isolation Strategy

1. **`hermes-{profile}`** (original) — profile isolation only, all machines
   share the same bank per profile.
2. **`hermes-{user}-{profile}`** (intermediate) — user isolation via Matrix
   sender, but TUI sessions collapse to old format and same user on different
   machines shares a bank.
3. **`hermes-{MAC}-{profile}`** (current, recommended) — machine isolation
   via MAC address, works for all session types (TUI, Matrix, Telegram, etc.).

The user explicitly chose MAC after seeing that `{user}` was "not right" for
machine-level isolation: "用户id 这样取值不对，还是取本机mac地址等唯一信息吧".

## When NOT to Use MAC Isolation

- **Single-machine deployment**: If all agents run on one machine and connect
  to a local Hindsight API, `hermes-{profile}` is sufficient. MAC just adds
  a prefix with no isolation benefit.
- **Per-user isolation needed**: If different users on the SAME machine need
  separate memory banks (e.g. shared workstation), use `hermes-{user}-{profile}`
  instead. MAC would give them the same bank.
