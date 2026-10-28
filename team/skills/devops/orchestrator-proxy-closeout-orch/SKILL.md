---
name: orchestrator-proxy-closeout-orch
description: "Use when 限流截断卡裁决代收vs重派、CLI force收口、skill落位symlink核验"
version: 1.0.0
platforms: [macos]
metadata:
  hermes:
    tags: [orchestrator, kanban, closeout, rate-limit, acceptance]
    related_skills: [orchestrator-proxy-closeout, worker-completion-independence-verification]
---

# 限流截断卡的收口裁决（proxy-closeout 的 orchestrator 侧增量）

> 权威源：default profile 的 `orchestrator-proxy-closeout`（顺序门/证据保全/worktree 摘除）与
> `worker-completion-independence-verification`（验收三件套）。本件只补三件 default 侧没有的增量；
> 冲突时以 default 原件为准。

## 1. 代收 vs 等冷却重派的判定线

worker 撞限流（exit 75）/预算截断死亡时，把冻结验收项拆成两类再裁决：

- **实体产物**：契约/代码/yaml/测试/demo——判定所依赖的交付物
- **自述文档**：REPORT.md/收尾叙事——包装性文件

| 实体产物 | 自述文档 | 裁决 |
|---------|---------|------|
| 全部通过机械重跑 | 缺 | **代收**：comment 补验收证据 + force complete |
| 任一缺失/不过 | 任意 | **等重派**：dispatcher 冷却后自动重派，不代收半成品 |

机制：dir 工作区已保住部分产出，重派 worker 从断点续做而非从零开始；代收一张 60% 卡只会把「未完成」洗成「完成」。自述缺失不影响判定——验收方在 comment 里补记逐项验证证据即等价替代。

## 2. force 收口的工具形状

工具层 `kanban_complete` 无 force 参数；worker 死后 claim 僵持时按序执行：

1. `kanban_comment(task_id, body=<逐项验证结论+命令输出>)` —— comment 是代收的审计轨迹，比 complete 回执更耐拒，先落；
2. `HERMES_KANBAN_BOARD=<slug> hermes kanban complete <task_id> --force` —— operator override。

关键形状：`complete` 子命令**不接受 `--board` 旗标**（create/comment 接受），板必须经 `HERMES_KANBAN_BOARD` 环境变量传入；漏了会打到错误板或根库且静默。force 后回读 `tasks.status` 确认终态——CLI 接受≠卡已 done。

## 3. skill 落位核验的假阴性（symlink 共享池）

验收「skill 已建」类产物时的三条防误判：

1. **类目目录是 symlink 板**：各 profile 的 `skills/<cat>/` 常是 `-> ~/.hermes/skills/<cat>` 符号链接——worker 把 skill 建到共享池是**正规落位**不是建错；从 profile 视角 `test -d <profile>/skills/<cat>/<skill>` 能解析即对该 profile 可见。
2. **`cp` 报 "identical (not copied)" = 同 inode 铁证**：想复制到 profile 目录却报源目标相同，说明已是同一文件（符号链接双像），无需任何处置。
3. **禁 `ls | head -N` 判存在**：技能目录几十项时 head 截断会把在场 skill 误判为缺失；判存在只用 `test -d` / 精确路径 `ls` / 定向 grep。

## Pitfalls

- 判定线只对「限流/预算截断」类死亡适用；worker 还在跑（claim 活跃且心跳新鲜）时不得 force 收口——那是撞车。
- 软依赖 block 的恢复闭环（上游 done 后先验产物再 unblock）归 `kanban-orchestrator` GE-1b，勿在本件重复。
