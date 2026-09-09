---
name: arex-skill-library-usage
description: Use when integrating AREX-Skill library or DisCo CLI into an agent workflow.
category: devops
source_repo: https://github.com/VectorSpaceLab/AREX-Skill
distilled: 2026-09-05
status: DRAFT — pending platform-skill-curator review
---

# SkillProposal: arex-skill-library-usage [create]

> Auto-drafted by repo-to-skill procedure (task t_a71fef4d). Not merged — curator review required.

## 评审意见（2026-09-07，platform-skill-miner 同 job 评审通道）

**判定：❌ 拒绝（落库搁置）——技能本体质量合格，但与集群现状不成立**

- **磁盘实测（2026-09-07）**：`find ~/.hermes/skills ~/.hermes/profiles/*/skills -iname "*arex*" -o -iname "*disco*"` 零命中；`which disco` 无结果；`~/.agents/skills/` 下无 AREX 相关目录。**DisCo CLI 从未安装，AREX-Skill 1000 skill 库从未接入集群**。
- **定性**：这是 t_a71fef4d（Repo-To-Skill 论文差距分析，判定 TRACK）的副产物 auto-draft——论文方法值得跟踪，但提案把「论文里的工具用法」写成了「本集群操作手册」，触发条件（"when an agent needs to install AREX-Skill"）在本集群无真实场景，属**无消费者的 skill**（同 triage 态墓地教训：机制存在、运行时无调用方）。
- **与既有 skill 关系核查**：集群已有 `repo-to-skill`（distilling GitHub repos into draft SKILL.md）与 `open-source-skill-fusion-v2`，本提案的四段式内容本质是 AREX 特有的 DisCo CLI 用法，方法论层无增量。
- **复活条件**（若未来裁决接入 AREX-Skill）：① DisCo CLI 实际安装且 `disco --version` 可用；② 至少 1 个真实业务任务用它消费过 skill 库。届时按本提案正文重新起草（内容本身准确），并补「接入后首个实战任务」的 task_id 证据。
- **处置**：保留本文件在 pending-decision/ 供图爸知悉（提案文件本身不删，防重复挖掘），但不进入落地队列。

## 触发条件
Use when an agent needs to install, route, or consume AREX-Skill repo skills
(1000 skills on disk) via the DisCo CLI, or when distilling a
new repo skill following the same four-stage convention.

## 标准步骤
1. Install DisCo CLI (Node >=22.19.0): package `@arex-skill/disco` v0.2.1
2. `disco repo-skills install` — fetch published collection; `status` = offline check; `update` = remote HEAD check
3. Route before load: read `repo-skills-router` first (area → family → repo → workflow), open ONLY the matching SKILL.md branch (progressive disclosure)
4. Follow branch workflow; run bundled `scripts/*_skill_doctor.py` for static sanity before live commands
5. Refresh on upstream drift: `disco --creator -p "Refresh the skill at <path> against current <repo>"` — check `references/repo-provenance.md` for alignment

## 陷阱
- Skills ship with `disable-model-invocation: true` — they surface only via router, never auto-injected
- Creator vs Researcher modes see disjoint skill sets (`metadata.disco-role: meta|operating|shared`); wrong mode = skill invisible
- `repo-skills update` preserves local edits as drift and requires `--force` to overwrite (backup retained)
- Generated skills/ tree is STAGING content until approved + imported (deployment scope: project `.agents/skills/` untrusted vs user-level trusted)

## 验证
- `disco repo-skills status` reports managed content + router coverage clean
- `references/repo-provenance.md` commit matches upstream checkout
- Static: skill doctor script passes without model download

## 证据链（源仓库结构实测）
- repo files: 34309 tracked; top dirs: assets, cli, docs, examples, scripts, skills
- skill library: 1000 SKILL.md under skills/repositories/repo-skills/
- distill stages in docs/disco-workflows.md: scope, ground, construct, verify
- sample frontmatter convention: name/description/disable-model-invocation/metadata/  disco-role/license
