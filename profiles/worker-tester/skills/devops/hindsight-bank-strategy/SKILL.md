---
name: hindsight-bank-strategy
description: >-
  Decide whether Hindsight memory banks should be shared across agent profiles,
  per-profile isolated, or per-team shared. Covers the bank_id_template
  resolution mechanism, three sharing models with trade-offs, and the
  per-team recommendation for centralized-routing multi-board deployments.
  Use when setting up Hindsight for a multi-profile team, deciding bank
  isolation strategy, or when bank_id_template needs changing.
version: 1.0.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags: [hindsight, memory, multi-agent, bank-strategy, isolation]
    related_skills: [agent-profile-lifecycle, memory-consolidation, hermes-worker-lifecycle]
---

# Hindsight Bank Sharing Strategy

Decide how Hindsight memory banks are shared across multiple Hermes agent
profiles in a multi-profile deployment.

## When to Use

- Setting up Hindsight for a new multi-profile team
- Deciding whether agents should share memory banks or have isolated banks
- Changing `bank_id_template` or `bank_id` in `hindsight/config.json`
- Auditing memory isolation between teams (e.g. hack team vs swarm team)

## Bank ID Resolution Mechanism

Hindsight bank IDs are resolved in `plugins/memory/hindsight/__init__.py`
(`_resolve_bank_id_template`, L584+):

1. **`bank_id_template`** (priority): Template string with placeholders:
   - `{profile}` — active Hermes profile name (e.g. `orchestrator`, `worker-coder`)
   - `{workspace}` — Hermes workspace name
   - `{platform}` — `cli`, `telegram`, `discord`, etc.
   - `{user}` — platform user id (gateway sessions)
   - `{session}` — current session id
2. **`bank_id`** (static fallback): Used when template is empty.
3. **Default**: `"hermes"` if both are unset.

Config file: `~/.hermes/profiles/<profile>/hindsight/config.json`

The `setup-hindsight-banks.py` script at `~/.hermes/shared/` auto-detects the
machine MAC and sets `bank_id_template` to `hermes-{MAC}-{profile}` — giving
per-profile isolation by default. To switch to team-shared banks, set `bank_id`
statically and clear `bank_id_template`.

## Three Sharing Models

### Model A: Fully Shared (all agents -> one bank)

```json
{"bank_id": "hermes-<MAC>-shared", "bank_id_template": ""}
```

| Pros | Cons |
|------|------|
| Cross-agent knowledge instant sharing | Domain pollution (security tools in general memory) |
| Minimal redundant learning | Retrieval noise grows with bank size |
| Simplest management | Hard to trace which agent produced a memory |
| | No team isolation / compartmentalization |

### Model B: Per-Profile (each agent -> own bank)

```json
{"bank_id_template": "hermes-<MAC>-{profile}"}
```

| Pros | Cons |
|------|------|
| Strongest isolation, zero cross-agent interference | Knowledge silos: researcher findings don't reach orchestrator |
| High retrieval precision (small focused banks) | Multiple agents independently learn the same thing |
| Easy per-agent debugging | Cross-agent context only via explicit Kanban handoff |
| hack/swarm naturally isolated | Many banks to manage (15 for a 15-profile deployment) |

### Model C: Per-Team (recommended for multi-board deployments)

```json
// Swarm team (e.g. 9 profiles: orchestrator + 8 workers)
{"bank_id": "hermes-<MAC>-swarm", "bank_id_template": ""}

// Hack team (e.g. 6 profiles: recon/exploit/forensics/auditor/c2/weapons)
{"bank_id": "hermes-<MAC>-hack", "bank_id_template": ""}
```

| Pros | Cons |
|------|------|
| Intra-team knowledge auto-shares (researcher->orchestrator->coder) | Minor intra-team noise |
| Inter-team strict isolation (hack != swarm) | Requires one-time hack profiles config setup |
| Reasonable signal-to-noise (2 banks, domain-focused) | Same agent's different sessions may cross-contaminate |
| Matches centralized routing model | |
| Few banks to manage (2 vs 15) | |

## Recommendation: Per-Team (Model C) for Centralized Routing + Dual Board

For a deployment with:
- **Centralized routing**: orchestrator dispatches all tasks, workers don't
  communicate directly with each other or external messages.
- **Board-isolated teams**: hack board (security) and swarm board (general
  software development) are separate Kanban boards with separate rosters.
- **MEMORY.md already covers high-frequency pits**: credentials, model routing,
  fallback chains — the 2200-char every-turn injection handles cross-session
  operational facts.

**Per-team sharing is optimal** because:

1. **Centralized routing** — orchestrator can recall domain knowledge written by
   any worker on the same board (researcher's findings, coder's pitfalls) without
   relying solely on Kanban `summary`/`metadata` handoffs.
2. **Board isolation** — security toolchain knowledge (attack vectors, exploit
   techniques) stays in the hack bank and never appears in swarm's retrieval.
3. **Kanban handoff supplements** — explicit cross-team knowledge (e.g.
   orchestrator coordinating a joint hack+swarm task) still passes via Kanban
   structured handoff, not via shared banks.
4. **MEMORY.md covers the rest** — high-frequency cross-session operational pits
   remain in every-turn injection. Hindsight stores domain knowledge and
   historical decisions that benefit from team-wide accumulation.

## Implementation (Switching from Per-Profile to Per-Team)

### For swarm team profiles (already have hindsight/config.json):

```bash
for prof in orchestrator architect project-manager requirement-analyst \
            worker-coder worker-deployer worker-researcher worker-reviewer worker-tester; do
  cfg=~/.hermes/profiles/$prof/hindsight/config.json
  python3 -c "
import json
with open('$cfg') as f: c=json.load(f)
c['bank_id']='hermes-XXXXXXXXXXXX-swarm'
c['bank_id_template']=''
with open('$cfg','w') as f: json.dump(c,f,indent=2)
"
  echo "Done: $prof -> swarm bank"
done
```

### For hack team profiles (need config.json created first):

```bash
for prof in hack-recon hack-exploit hack-forensics hack-auditor hack-c2 hack-weapons; do
  mkdir -p ~/.hermes/profiles/$prof/hindsight
  cat > ~/.hermes/profiles/$prof/hindsight/config.json << 'EOF'
{
  "bank_id": "hermes-XXXXXXXXXXXX-hack",
  "bank_id_template": ""
}
EOF
  echo "Done: $prof -> hack bank"
done
```

### Verify:

```bash
for prof in orchestrator architect project-manager requirement-analyst \
            worker-coder worker-deployer worker-researcher worker-reviewer worker-tester \
            hack-recon hack-exploit hack-forensics hack-auditor hack-c2 hack-weapons; do
  cfg=~/.hermes/profiles/$prof/hindsight/config.json
  if [ -f "$cfg" ]; then
    bank=$(python3 -c "import json; print(json.load(open('$cfg')).get('bank_id','?'))")
    tmpl=$(python3 -c "import json; print(json.load(open('$cfg')).get('bank_id_template','?'))")
    echo "$prof: bank=$bank template=$tmpl"
  else
    echo "$prof: (no config.json)"
  fi
done
```

New banks auto-create on first memory write. Historical per-profile banks are
preserved but no longer used. To migrate old memories, use Hindsight API to
recall from old bank and retain to new.

## Pitfalls

- **Hack profiles may lack `hindsight/config.json`**: The hack team profiles
  (recon, exploit, forensics, auditor, c2, weapons) were created without
  hindsight config. They use the default `bank_id: "hermes"` (fully shared with
  everything). Must create config.json manually before per-team isolation works.
- **`bank_id_template` takes priority over `bank_id`**: If template is non-empty,
  the static `bank_id` is ignored. To use static `bank_id`, you MUST clear the
  template (set to empty string `""`).
- **New banks auto-create on first write**: No explicit bank creation API call
  needed. But this means a typo in `bank_id` silently creates a wrong bank.
  Verify with the stats endpoint after first use.
- **Historical banks are preserved**: Switching bank_id does NOT delete old
  banks. Old memories remain accessible via the old bank_id but won't be
  auto-injected. Manual migration (recall old -> retain new) is needed to
  transfer knowledge.

## Related Skills

- **agent-profile-lifecycle** — covers Hindsight bank setup as part of new
  profile creation (Step 7), including the auto-creation mechanism and the
  `/v1/default/banks/{id}/memories/recall` API path.
- **memory-consolidation** — covers the MEMORY.md <-> Hindsight boundary
  (what stays in every-turn injection vs what delegates to vector recall).
  This skill complements it by addressing the bank-level sharing strategy.
- **hermes-worker-lifecycle** — covers Hindsight bank setup for new worker
  profiles (Step 6), including the clone-missing-hindsight-directory pitfall.
