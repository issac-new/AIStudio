# All-Profile Hindsight Setup Reference

When the user asks to configure Hindsight for "all agents" or "all profiles",
this is the complete procedure. Hermes operates 9 profiles, and ALL must be
configured — not just the 3 that historically had Hindsight.

## Profiles

1. orchestrator (API host — runs the Hindsight API server on port 8888)
2. architect
3. project-manager
4. requirement-analyst
5. worker-coder
6. worker-deployer
7. worker-researcher
8. worker-reviewer
9. worker-tester

## 5-Point Checklist Per Profile

| # | Check | Where |
|---|-------|-------|
| 1 | `memory.provider: hindsight` | config.yaml `memory:` section |
| 2 | `memory_enabled: true` | config.yaml `memory:` section |
| 3 | `hindsight` in `plugins.enabled` | config.yaml `plugins:` section |
| 4 | `hindsight/config.json` exists | `<profile>/hindsight/config.json` |
| 5 | `memory` in `toolsets` | config.yaml `toolsets:` section |

All 5 must pass. A profile with 4/5 will silently fail (empty recalls, no errors).

## Config.json Template

The same `config.json` works for all profiles — `bank_id_template` auto-isolates
each profile's bank. Use `hermes-{profile}` for single-user, or
`hermes-{user}-{profile}` for multi-user (see `references/bank-isolation.md`):

```json
{
  "mode": "local_external",
  "api_url": "http://localhost:8888",
  "bank_id": "hermes",
  "recall_budget": "mid",
  "recall_method": "recall",
  "auto_recall": true,
  "auto_retain": true,
  "retain_async": true,
  "retain_every_n_turns": 1,
  "memory_mode": "hybrid",
  "recall_types": "observation,world,experience",
  "recall_max_tokens": 4096,
  "bank_id_template": "hermes-{profile}"
}
```

## Bank Initialization

Banks are auto-created on first memory write. To initialize banks for profiles
that have never been used, POST a test memory to each bank.

**⚠️ Use `urllib.request` inside `execute_code`** — do NOT use
`curl ... | python3` (Hermes security scanner blocks pipe-to-interpreter):

```python
import json, urllib.request

profiles = ["architect", "project-manager", "requirement-analyst",
            "worker-coder", "worker-deployer", "worker-researcher",
            "worker-reviewer", "worker-tester"]

for prof in profiles:
    bank = f"hermes-{prof}"
    data = json.dumps({"items": [{"content": f"Bank initialization for {bank}"}]}).encode()
    req = urllib.request.Request(
        f"http://localhost:8888/v1/default/banks/{bank}/memories",
        data=data, headers={"Content-Type": "application/json"}, method="POST"
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        result = json.loads(resp.read())
        print(f"  {'✅' if result.get('success') else '❌'} {bank}")
```

## start.sh Password Bug

The `DATABASE_URL` in `start.sh` may contain `hindsight:***@localhost` — this
`***` is literal text from Hermes' terminal display masking, not a placeholder.
Fix to `hindsight:hindsight_dev@localhost`. Also verify `MIGRATION_DATABASE_URL`
uses the same password. This was found and fixed in the live orchestrator
`start.sh` on 2026-07-21.

## Verification

Use `urllib.request` inside `execute_code` for ALL Hindsight API calls — the
Hermes security scanner blocks `curl ... | python3` pipe-to-interpreter patterns.

1. Health check via `urllib.request.urlopen("http://localhost:8888/health")`
2. Bank listing via `urllib.request.urlopen("http://localhost:8888/v1/default/banks")`
3. Recall test on all 9 profile banks (POST to `/recall` endpoint)
4. Retain test on at least one worker bank (POST to `/memories` endpoint)
