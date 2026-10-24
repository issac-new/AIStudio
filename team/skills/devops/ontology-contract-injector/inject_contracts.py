"""Ontology Contract Injector — idempotent staged-action + marking-rules block injection.

Injects the two mandatory contract blocks (Staged Action protocol + Markings propagation
obligation) into a profile's SOUL.md, anchored after the existing Ontology-reference zone
(the last line referencing `_shared/ontology.md` / `output-contract.md` / `CompletionHandoff`).
Falls back to appending a new section at EOF if no anchor is found.

Idempotent: profiles already containing the keywords `staged-action` / `marking-rules.md`
are skipped (no contract-segment accumulation on re-run).

CLI:
  python inject_contracts.py                 # full sweep over all profiles
  python inject_contracts.py --profile FOO   # incremental re-inject: only profile FOO
  python inject_contracts.py --base /tmp/x --profile FOO   # test against a temp base

Exit code 0 always (this is a report-only injector); per-profile outcome in JSON stdout.
"""
import os
import json
import argparse

BASE = os.path.expanduser("~/.hermes/profiles")

STAGED_BLOCK = (
    "\n> ⏸️ **Staged Action 协议（强制）**：执行 `ontology.md §二` 中 `reversible=false` 的动作"
    "（acp_send / delegate_task / cronjob / computer_use / browser_* / 不可逆 terminal 命令如 git push、rm、部署）前，"
    "必须先 `kanban_comment` 提交 `<staged-action-proposal>`（含动作、意图、影响范围、回滚命令、预计后果），"
    "按 [`_shared/forward-deployed-protocol.md`](~/.hermes/profiles/_shared/forward-deployed-protocol.md) §三 等待确认后执行；"
    "失败须回滚并 `kanban_block`。\n"
)

MARKING_BLOCK = (
    "\n> 🏷️ **Markings 传播义务（强制）**：产出物引用带 markings 的上游 artifact/finding/decision 时，"
    "必须继承其全部 markings（合取 AND），传播规则与机械校验点详见 "
    "[`_shared/marking-rules.md`](~/.hermes/profiles/_shared/marking-rules.md)；"
    "产出物 markings 超出本 profile clearances → `kanban_block(kind=\"capability\")`。\n"
)

# Injection anchor: last line of the Ontology-reference / CompletionHandoff zone.
ANCHOR_HINTS = ("_shared/ontology.md", "output-contract.md", "CompletionHandoff", "Markings 自检")


def inject_one(profile_dir, fname):
    """Inject missing blocks into one SOUL.md. Returns a status string.

    Idempotent: returns 'skipped' (no mutation) if both blocks already present.
    """
    f = os.path.join(profile_dir, fname)
    if not os.path.exists(f):
        return "no-soul"

    t = open(f, encoding="utf-8").read()
    need_staged = ("staged-action" not in t.lower()) and ("Staged Action" not in t)
    need_marking = "marking-rules.md" not in t
    if not need_staged and not need_marking:
        return "already-wired"

    block = ""
    if need_staged:
        block += STAGED_BLOCK
    if need_marking:
        block += MARKING_BLOCK

    lines = t.split("\n")
    anchor = None
    for i, ln in enumerate(lines):
        if any(h in ln for h in ANCHOR_HINTS):
            anchor = i
    if anchor is not None:
        lines.insert(anchor + 1, block.rstrip("\n"))
    else:
        lines.append("\n## Ontology 契约（强制）\n" + block)
    open(f, "w", encoding="utf-8").write("\n".join(lines))
    return f"injected: staged={need_staged} marking={need_marking}"


def main():
    ap = argparse.ArgumentParser(description="Idempotent Ontology contract-block injector")
    ap.add_argument("--profile", help="Only (re)inject this single profile's SOUL.md")
    ap.add_argument("--base", default=BASE, help="Profiles base dir (default ~/.hermes/profiles)")
    args = ap.parse_args()

    base = os.path.expanduser(args.base)
    report = {}

    if args.profile:
        d = os.path.join(base, args.profile)
        if not os.path.isdir(d):
            report[args.profile] = "no-such-profile"
        else:
            report[args.profile] = inject_one(d, "SOUL.md")
    else:
        for p in sorted(os.listdir(base)):
            d = os.path.join(base, p)
            if not os.path.isdir(d) or p.startswith("_"):
                continue
            report[p] = inject_one(d, "SOUL.md")

    print(json.dumps(report, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
