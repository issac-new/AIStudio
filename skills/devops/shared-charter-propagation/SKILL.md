---
name: shared-charter-propagation
description: "Use when a doctrine must reach all agent SOULs."
metadata:
  hermes:
    tags: [soul-design, single-source, charter, fleet-propagation, doctrine]
    related_skills: [soul-framework-propagation, delegation-brief-format, soul-protocol-block-insertion]
---

# Shared Charter Propagation（纲领单一事实源传播）

Fleet-wide doctrine (认识论纲领/方法论/政策) reaches all agent SOULs via a **single-source charter file + one reference line per SOUL** — never by pasting the full text into N SOULs.

## Always-On Rules

1. **Doctrine text lives ONCE.** Write it in `~/.hermes/profiles/_shared/<layer>/<name>.md` and commit to the `_shared` git repo. A doctrine revision must be ONE file edit, never N SOUL re-patches (user-mandated: 避免每次动全局所有文件).
2. **SOULs carry a reference line, not the text.** One blockquote line per SOUL, in the same style as existing `_shared` references (exit-protocol.md / output-contract.md): `> 🧠 **<纲领名>**（触发时机）：超短口诀链。全文见 [\\_shared/.../<name>.md\\](~/.hermes/profiles/_shared/.../<name>.md)。`
3. **Per-role customization lives INSIDE the charter** as a role→lens table (e.g. researcher→信息论主镜). SOULs may add at most one lens sentence, copied **verbatim** from that table — never self-invented variants.
4. **Reserved exception:** embedded full-section propagation (see `soul-framework-propagation`, read-only symlink from this profile) is only for content needing materially different per-file domain material a charter table cannot carry.

## Procedure

1. **Write the charter** under `~/.hermes/profiles/_shared/02-org-orchestration/` (org-level doctrine). Sections: 一句话总纲 → operational core (questions/checklists) → 抓手表 (where each part is already implemented in the cluster) → 边界裁决 (what NOT to over-apply) → 岗位主镜表 → 引用方式 (the exact reference line).
2. **Commit it**: `cd ~/.hermes/profiles/_shared && git add <file> && git commit -m "..."`. Record the hash — cards and metadata cite it.
3. **Census anchors** across all target SOUL.md: grep each for candidate headings (`## 标准作业循环`, `## 核心职责`, `## 认知自检`…), one anchor per profile, exact stripped-line match.
4. **Insert one reference line per SOUL** before the decision-entry section the census found. Do NOT append at file end (lands after privacy boilerplate).
5. **Delegate the mechanical pass** (N large) to worker-coder via a kanban card embedding: census table, the verbatim reference line, insertion-position rules per anchor variant, frozen acceptance (per-file grep `<charter-filename>` count == 1 across the FULL roster, spot-check ≥5 teams, missing-files listed BY NAME).
6. **Independently re-verify** — re-run the grep yourself; never accept the worker's self-report.

## Git Topology

- Charter → `_shared` repo (manual commit, hash cited downstream).
- SOUL.md files → NOT under `_shared` git; covered by `~/.hermes/backup/soul-integrity-git` auto-backup. No manual SOUL commits.

## Pitfalls

- Anchor heading variants (`## 标准作业循环` present in 46/47; ops/product use `## 核心职责`; some have neither) silently skip files — reconcile against the full profile roster every time, with missing names listed.
- CJK insertion text in a bash heredoc corrupts via shell escaping mid-fleet — write the batch script to a file with a file tool, then execute it.
- `skill_manage` cannot patch symlinked default-profile skills from orchestrator — that is why this local skill exists; patch suggestions for the default-library skills go through file tools in a file-tool session.
- Expiry check before propagating: if the doctrine duplicates an existing `_shared` file's territory, extend that file instead of creating a parallel charter.

## Related

- `soul-framework-propagation` (default, read-only) — the embedded-section pattern; fallback per rule 4.
- `delegation-brief-format` — card shape for step 5.
- `soul-protocol-block-insertion` — anchor-variant traps in depth.
