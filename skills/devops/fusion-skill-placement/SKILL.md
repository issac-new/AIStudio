---
name: fusion-skill-placement
description: "融合产物按执行职责归位到 devops(编排)或devops-worker(执行)。"
version: 1.0.0
metadata:
  hermes:
    tags: [skills, placement, distribution, fusion, multi-profile]
    related_skills: [skill-board-scoping, local-skill-fusion-routing, skill-library-maintenance]
---

# 融合 Skill 落点归位

> 2026-08-06 三源融合（BMAD+maestro+swarm-yuan）实测提炼。用户纠正：**skills 有统一管理（共享层 + profile symlink 挂载）**，融合产物不能全堆在 orchestrator 可见的 devops/ 下，必须按执行职责归位，否则 worker 看不到。

## When to Use

- 融合/新建 skill 落地后，用户问「skills 和 agent 的适配关系调整了没」
- 新 skill 创建到共享层后需要分发给多 profile
- 验证某 skill 是否对目标 worker profile 可见

## 核心机制（统一管理 = 共享层 + symlink 挂载）

| 概念 | 位置 | 说明 |
|------|------|------|
| 共享层 | `~/.hermes/skills/` | skill 实体唯一存放处 |
| profile 挂载 | `~/.hermes/profiles/<p>/skills/` | symlink 指向共享层类别 |
| devops | 仅 orchestrator 挂载 | 编排层 139+ 治理 skill |
| devops-worker | worker-*/hack-* 挂载 | 执行层 12+ worker skill |

canonical 挂载映射见 `skill-board-scoping`。

## 归位判定

**谁消费这个 skill 的动作？**

| 落点 | 挂载者 | 放什么（2026-08-06 实测） |
|------|--------|--------|
| `~/.hermes/skills/devops/` | 仅 orchestrator | 编排层：scale-adaptive-routing, delegation-brief-format, orchestrator-kanban-tracing, kanban-triage-stall-recovery |
| `~/.hermes/skills/devops-worker/` | worker-*/hack-* | 执行层：memlog, decision-taxonomy, task-type-gate-routing, kernel-context-budget, context-layering-rules, adversarial-review-lens, evidence-based-retro, rule-system-verification |

orchestrator 消费（路由/分解/留痕/恢复）→ devops；worker 在 kanban 任务里消费（编码/评审/复盘/决策/上下文）→ devops-worker。

## 执行步骤

```bash
S=~/.hermes/skills
# 1) 共享层内移动（mv，不是复制）
for s in <执行层 skill...>; do mv "$S/devops/$s" "$S/devops-worker/$s"; done
# worker-*/hack-* 的 devops-worker symlink 自动跟随，零额外配置
```

### 2) 同步更新 orchestrator_rules.md 的 §skills 索引

补落点列（devops/devops-worker）+ 终态架构说明，否则 orchestrator 下次按旧路径找不到。示例见 §0.7.7（三源融合产物索引）。

### 3) 验证（穿透 symlink，不可省）

```bash
# 目标 profile 视角可见性
find -L ~/.hermes/profiles/worker-coder/skills/devops-worker -maxdepth 1 -type d
# 断链检查（必须 0）
for l in $(find ~/.hermes/skills $HOME/.hermes/profiles/*/skills -maxdepth 1 -type l 2>/dev/null); do [ -e "$l" ] || echo "BROKEN: $l"; done
# 注册状态
hermes skills list --source local -p orchestrator | grep -E "<skill>"
```

基线对照（2026-08）：worker-coder 索引 103→111（+8 执行层），orchestrator 311→327（+4 编排层 + devops-worker 内嵌）。与 `skill-board-scoping` baselines 比对，防全家桶回归。

## Pitfalls

- **全放 devops/ 的后果**：worker 看不到新 skill，用户问「适配关系调整了没」——归位是融合的必需后置步骤，不是可选项。
- **复制而非 mv**：共享层内移动用 mv；跨层分发若需保留原处才复制。复制会产生两份实体，破坏单一事实源。
- **只归位不更新索引**：orchestrator_rules.md §skills 索引必须同步，否则编排层按旧路径加载失败。
- **归位后不验证**：mv 后必须穿透 symlink 确认 worker 可见 + 断链检查 + skills list 抽查，三步缺一不可。
- **skill_manage 无法 patch 共享层 skill**：共享层 skill 注册在 default profile，orchestrator 会话 patch 报 "not found in active profile"。要改 `skill-board-scoping`/`local-skill-fusion-routing` 等共享层 skill 需 `hermes curator adopt` 或直接文件操作。

## Related Skills

- **skill-board-scoping** — canonical 挂载映射（哪类 skill 挂哪个 profile）
- **local-skill-fusion-routing** — 双通道融合分流（通道 A→Claude Code，通道 B→Hermes）
- **skill-library-maintenance** — 物理副本去重 + symlink 修复（结构健康）
