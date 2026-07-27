# Matrix Gateway — Dependency Troubleshooting

## Symptom: Messages silently dropped (no inbound processing)

**User reports**: Matrix messages are sent to the bot but never processed — no response, no kanban task created, nothing in gateway logs matching the expected message timestamp.

**Root cause**: The Matrix platform adapter (`mautrix`) is not installed in the Hermes venv. The gateway starts and connects email/other platforms but silently skips Matrix — it doesn't log an obvious "mautrix not found" error on startup. The first sign is missing `inbound message` lines in `gateway.log` for Matrix traffic.

## Diagnosis

```bash
# 1. Check gateway logs for Matrix activity
grep "matrix" ~/.hermes/profiles/orchestrator/logs/gateway.log | tail -20

# Expected (healthy): "✓ matrix connected" + "Matrix: initial sync complete"
# Missing / absent: Matrix adapter never loaded

# 2. Verify mautrix is installed in the Hermes venv
~/.hermes/hermes-agent/venv/bin/pip list 2>/dev/null | grep -i mautrix

# No output = mautrix not installed → root cause confirmed

# 3. Check for startup errors (may or may not appear)
grep -i "mautrix\|matrix" ~/.hermes/profiles/orchestrator/logs/gateway.log | grep -i "error\|fail\|traceback\|importerror"
```

## Fix

### Step 1 — Install base dependencies

```bash
~/.hermes/hermes-agent/venv/bin/pip install mautrix aiohttp-socks asyncpg aiosqlite
```

| Package | Purpose | Required? |
|---------|---------|-----------|
| `mautrix` | Matrix client library | ✅ Required |
| `aiohttp-socks` | SOCKS proxy support for Matrix federation | ✅ Required for production homeservers |
| `asyncpg` | PostgreSQL adapter (Gateway DB) | ✅ Required by Gateway |
| `aiosqlite` | SQLite async adapter (kanban DB) | ✅ Required by Gateway |

### Step 2 — Restart Gateway

```bash
hermes gateway restart
# or for launchd-managed setups:
hermes gateway stop && sleep 2 && hermes gateway start
```

### Step 3 — Verify

```bash
grep "matrix" ~/.hermes/profiles/orchestrator/logs/gateway.log | tail -5
# Expected: "✓ matrix connected"
# Expected: "Matrix: initial sync complete, joined N rooms"
```

Then send a test message from Matrix. Check `grep "inbound message" ~/.hermes/profiles/orchestrator/logs/gateway.log | tail -3` — should show the test message.

## `mautrix[encryption]` — python-olm compilation failure on modern macOS

**Do NOT attempt to install `mautrix[encryption]` on macOS with Xcode Clang 21+ and CMake 4.3+.** The `python-olm` package compiles `libolm` from source via CMake and CFFI, and fails with:

```
In file included from .../libolm/include/olm/list.hh:106:13:
error: cannot assign to variable 'other_pos' with const-qualified type 'T *const'
    ++other_pos;
    ^ ~~~~~~~~~
```

### Root cause

- `python-olm` (v3.2.16, the latest release) bundles an old version of `libolm`.
- The bundled `list.hh` has `T * const other_pos` — a const-qualified pointer that is incremented in a copy constructor, which is illegal in C++20+.
- CMake 4.3 removed `cmake_minimum_required()` compatibility with versions < 3.5, triggering a deprecation error in `olm_build.py`'s CMake project config.
- Apple Clang 21.0.0 (Xcode 16+) enforces the C++20 pointer-constraint rule.

### Workaround: skip encryption

**Encryption is NOT needed for local/sandbox homeservers (e.g. `localhost:8008`).** The `mautrix[encryption]` extra provides end-to-end encryption (E2EE, Olm/Megolm protocol). If your Matrix setup uses unencrypted rooms or a local test server, you don't need it.

To verify encryption is not configured:

```bash
grep -r "encryption" ~/.hermes/profiles/orchestrator/config.yaml ~/.hermes/profiles/*/config.yaml 2>/dev/null
# No output = encryption not configured → safe to skip
```

### If you actually need E2EE

Alternative approaches (none tested):

1. **Install `libolm` via Homebrew** — `brew install libolm` is available (currently 3.2.16, the same version) but `python-olm` bundles its own copy and does not use the system library by default.
2. **Use a patched fork** of `python-olm` with updated C++ compatibility.
3. **Use a pre-built binary wheel** if one exists for your platform.
4. **Use an older Xcode / CMake** to compile with C++17 rules.
5. **Migrate to PostgreSQL-backed cryptography** — some PostgreSQL-backed Matrix homeservers handle crypto differently.

In most Hermes Gateway setups, option 1 (installing `libolm` via brew) + working around the build system to link against it may work, but is untested. The pragmatic choice is to skip encryption.

## Additional diagnostic: Gateway logs location

```bash
# Current profile's gateway logs
tail -f ~/.hermes/profiles/orchestrator/logs/gateway.log

# Other profiles
tail -f ~/.hermes/profiles/worker-coder/logs/gateway.log

# Hermes home default
tail -f ~/.hermes/logs/gateway.log
```

## Pitfall: `hermes status` doesn't show Matrix

Even when Matrix is connected and working, `hermes status` may not list "Matrix" in the "Messaging Platforms" section. This is normal. Always verify via logs (`grep "matrix" gateway.log | head -5`), not `hermes status`.
