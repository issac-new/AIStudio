---
name: kanban-domain-isolation
description: "互斥领域同机共存时配置 kanban 域隔离双门禁与排查越域卡被拒。"
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [kanban, multi-board, isolation, dispatcher, security, board-json]
    related_skills: [orchestrator-board-routing, kanban-task-pickup-diagnosis, hermes-source-patch-persistence]
---

# Kanban 域隔离（Domain Isolation）— 互斥领域同机共存的机械门禁

> 来源：2026-09-02 Q2 域隔离落地（hack 安全攻防 × [已移除] 家庭教育互斥领域同机共存）。
> 核心教训：**纸面规则挡不住机械越域**——能力边界只在 skill 挂载配置层声明时，
> 调度层与建卡层是敞开的。隔离必须落到机械校验（dispatch/create 双门禁）。

## When to Use

- 多领域 agent 团队共享一台 host，其中存在互斥领域（如攻防×教育、竞对客户）
- 用户问「能力边界规则写了但没隔离机制怎么修」
- 新增 board 或 profile 后需要配置/验证域隔离
- 卡长期 ready、`logs/t_<id>.log` 不存在（从未 spawn）——先查 out_of_scope 门禁
- 越域建卡被拒（错误信息含 domain isolation）——按错误信息三条出路处理，或读本 skill 背景

## 隔离架构：五层实勘 + 双门禁

隔离不是一件事，是分层。落地前先实勘五层静态隔离现状（谁已经隔离、洞在哪）：

| 层 | 检查点 | 隔离机制 |
|---|---|---|
| skill 挂载 | 各 profile skills/ 目录 grep 越域关键词 | profiles.yaml `skills_enabled`/`skills_pinned` 白名单 |
| toolset | config.yaml `toolsets` | 攻击工具（acp 等）不进非安全域 |
| 密级 | config.yaml `clearances` | 标签合取传播（TLP/PII） |
| 记忆 | hindsight config bank_id | `hermes-<mac>-<team>` 分库 |
| 看板名册 | board.json `profile_scope` | 声明层——**只有声明没有消费者 = 纸面规则** |

静态层通常已隔离；真正的洞在**动态调度层**（file:line 实证法）：

- `kanban_db.py::_dispatch_once_locked` 候选查询只按 `status='ready' AND claim_lock IS NULL`，不查 assignee↔board 归属
- `kanban_tools.py::_handle_create` 不校验 assignee 与 board 关系
- `board.json` 的 `profile_scope` 零代码消费者（grep kanban 路径无命中）

⇒ **在 hack 板建 assignee=[已移除] 的卡，机械上畅通无阻**。

## 实现：双门禁 + 单一事实源

### 事实源（board.json）

```json
{
  "profile_scope": ["hack-recon", "hack-exploit", "hack-auditor", "hack-forensics"],
  "dispatcher_bypass": ["orchestrator"]
}
```

- `profile_scope`：本板成员名册。**未声明 = 不过滤**（向后兼容，旧板零影响）
- `dispatcher_bypass`：跨板调度白名单。总调度入口（orchestrator）可跨板派单由各板显式授权；不在名册的域编排者（[已移除]-orchestrator/aiteam-orchestrator）越域同样被拒
- 改前快照：`board.json.bak-pre-<change>`

### 门禁 1：调度层（kanban_db.py）

`read_board_metadata` 后新增三个 helper（单一入口，全部 lowercase 归一）：
- `_board_profile_scope(board)` → set（空集 = 不过滤）
- `_board_dispatcher_bypass(board)` → set
- `profile_may_work_board(profile, board)` → bool

`_dispatch_once_locked` 的 ready/review 两条循环内、`profile_exists` 校验**之前**插入门禁：
越域卡 `skipped_out_of_scope.append(...)` + 写 `out_of_scope` 事件（`hermes kanban tail` 可见）+ continue。`DispatchResult` 新增 `skipped_out_of_scope: list[tuple[str, str]]` 字段。

### 门禁 2：建卡层（kanban_tools.py）

`_handle_create` 内 `board = args.get("board")` 之后、`_connect` 之前：`kb.profile_may_work_board(assignee, board=board)` 为 False 时直接 `tool_error` 拒绝，错误信息给三条出路（改 assignee / 扩名册 / 加 bypass）。

### 持久化（防 hermes update 冲掉）

patch `~/.hermes/patches/hermes-kanban-domain-isolation.patch`，注册进 `apply-source-patches.sh` 的 `SPECS` 数组（post-merge 自动重放）。见 `hermes-source-patch-persistence`。

## 验证（三层，全部真实执行）

1. **单元**：import 改后模块断言 scope 读取/bypass/大小写鲁棒
2. **端到端 dry-run**：建 sandbox board（scope=[worker-researcher], bypass=[orchestrator]），放三卡（scope 内/越域/bypass），`dispatch_once(dry_run=True, board=sandbox)` 断言越域卡进 `skipped_out_of_scope`、其余 spawnable
   - 坑：`create_task` 初始态只收 `blocked/running`，测试卡需 `UPDATE tasks SET status='ready'`；测完 `shutil.rmtree` sandbox board
3. **矩阵**：6 block（hack↔[已移除] 双向、swarm worker→两域、aiteam→两域）+ 6 pass（各域内成员、orchestrator 经 bypass、未声明 scope 的板）

## Pitfalls

- **CLI 序列化滞后**：`dispatch --json` 未输出 `skipped_out_of_scope` 桶（dataclass 已加、CLI 打印未加）——诊断以 `task_events` 查询为准：`SELECT kind FROM task_events WHERE task_id='<tid>' AND kind='out_of_scope'`
- **gateway 重启才生效**：正在跑的 gateway 加载旧 dispatcher 代码；patch 升级后行为不变先查进程重启时间
- **锚点全文件多命中**：`board = args.get("board")` 在 kanban_tools.py 出现 12 次——锚点先在函数边界内定位（`def _handle_create` 到下一个 `\ndef `），replace 后 `count==1` assert
- **orchestrator 不在所有名册里**：[已移除]/aiteam 的 scope 不含 orchestrator，但 SOUL 授权它跨板派单——必须用 `dispatcher_bypass` 显式授权，而不是把它塞进 scope（那会破坏「名册=执行者」语义）
- **共存本地 patch**：kanban_db/kanban_tools 已有 workspace_kind=worktree 本地改动，`git diff --` 按文件取会卷进旧改动——生成前 `git diff --stat` 确认现状；patch 文件按「完整文件 diff」管理（旧改动也需要保），但要知道里面有什么
- **stash 舞步**：验证 patch 从零可应用时 `git stash → apply → stash pop` 必然冲突——正确收尾：`git checkout stash@{0} -- <其余被 stash 的文件>` 逐个恢复（deleted 状态文件单独 `git rm --cached`），再 `git stash drop stash@{0}`；永远不依赖 pop。更简单：不 stash，`git apply --reverse --check` 做在场检测就够

## 关联

- 卡不被拾取的**诊断**视角（根库陷阱/triage 死锁/out_of_scope 门禁三模式）→ `kanban-task-pickup-diagnosis`（default profile）
- board 路由（哪条消息进哪个板）vs 本 skill（板内谁能接活）是两层——见 `orchestrator-board-routing`
- patch 持久化/watchdog 三件套 → `hermes-source-patch-persistence`（default profile）
