---
name: orchestrator-worker-failure-triage
description: "Use when kanban worker 秒死/spawn 零拾取/预算耗尽时分类故障根因并修复。"
version: "1.0.0"
metadata:
  hermes:
    tags: [kanban, dispatcher, provider, troubleshooting, orchestrator]
    related_skills: [orchestrator-scheduling-audit, kanban-crash-recovery, cc-switch-provider-troubleshooting, kanban-triage-stall-recovery]
---

# Orchestrator Worker 故障三分类速查

> 2026-09-04 在途清账实战提炼：swarm 板 6 张遗留卡推进过程中同时遭遇三类故障，
> 每类表象相近（卡不动/worker 死）但根因与修法完全不同。先分类再动手，勿混治。
>
> 注意：本 skill 是 orchestrator profile 的分类入口。深度细节分散在各领域的
> default-profile skill 里（见「知识地图」），跨 profile 不可 patch，只能在此引用。

## 三分类决策表

| 表象特征 | 根因 | 首查命令 | 修复方向 |
|---|---|---|---|
| gateway.log 刷 `no such function: kanban_write_sanctioned`（数百次） | 守栏代码-DB 时序窗：触发器在库里、旧进程缺 UDF | `tail gateway.log` + `git log -1 -- hermes_cli/kanban_db.py` | 重启滞留进程（知识：kanban-task-pickup-diagnosis 末节） |
| **完全静默**：无报错、无 claim 事件、无 last_failure_error、ready 队列非空但零 spawn | `board.json` 的 `profile_scope` 域隔离白名单漏 assignee，skip 不留痕 | `jq .profile_scope ~/.hermes/kanban/boards/<board>/board.json` 对照 ready 卡 assignee | 扩 scope；**下一 tick（60s）自动恢复，无需重启** |
| worker spawn 即死：`pid not alive`、log 只活几秒、**多卡同一时间窗集体死** | provider 层熔断风暴：quota 403 确定性错误 → 熔断永不自动恢复 | `sqlite3 ~/.cc-switch/cc-switch.db "SELECT provider_id,is_healthy,consecutive_failures,substr(last_error,1,80) FROM provider_health"` | 复位熔断 + 切 provider（下节详） |

**定性快检**：手动 `hermes -p <worker-profile> --toolsets terminal chat -q "回复ok"` ——
- 同样失败 → provider 层（分类 3）
- 成功 → 调度层（分类 1/2），按表继续查

## Provider 熔断风暴修复序列（顺序敏感）

1. **复位熔断**：`UPDATE provider_health SET is_healthy=1, consecutive_failures=0, last_error=NULL WHERE app_type='<x>';`
2. **切 provider 绕开配额尽的** —— ⚠️ **最大陷阱**：直接改 `~/.cc-switch/settings.json` 会被 CC Switch 常驻进程（Tauri GUI）重启时**回写覆盖**（内存态为准）。必须改 DB：
   ```sql
   UPDATE providers SET is_current=0 WHERE app_type='<x>';
   UPDATE providers SET is_current=1 WHERE name='<可用provider>';  -- is_current 无唯一约束，先清后设
   ```
3. **经 proxy 实测路由**：`curl -sS -m 30 http://127.0.0.1:15721/v1/chat/completions -d '{...}'`，响应里 `Provider:` 字段看实际走到谁——绕过了 GUI 层直接见真相。
4. **模型别名透传坑**：hermes 侧模型别名（如 `aim`）原样透传上游；目标 provider catalog 承接不了时报 `modelCode 不存在`——切到没这名字的 provider = 白切，先看 catalog 再切。
5. **收尾冒烟**：worker 同款命令 EXIT_RC=0 才算通；然后批量复位受害卡（`consecutive_failures=0` + unblock），dispatcher 下一 tick 自动重派。
6. 判定性证据链写 comment：403 配额错文本 + provider_health 全 0 值 + 复位后 200 OK，防下游误判 worker 能力问题。

## 迭代预算耗尽 ≠ 任务失败（续作模式）

- 通知文案陷阱：`timed out (max_runtime=0s)` 可能实为 `Iteration budget exhausted (N/90)`（dispatcher 模板复用），先查 `task_runs.error` 真实文本。
- 预算耗尽 → 卡 blocked，但 **worktree/repo 状态延续**：直接 unblock 重派即可续作。
- **接力提速**：重派前 `tail` 前序 run 的 worker log——worker 常在 log 尾部自列收尾清单（修哪些测试→commit→complete），原样注入 comment 给下轮 worker，省去重新勘察的数十轮。判例 t_cc655ecb：90/90 耗尽 blocked，unblock 后次轮按清单完成并交付（commit d5068a16d5，87 测试独立复跑全过）。
- 预防：长 sleep 轮询外部过程的卡，预算大半耗在等待上——comment 提醒 worker 用 `terminal(background=true)` 代替前台长 sleep。

## 知识地图（跨 profile 深度细节）

- provider/wire_api/熔断机制深挖 → default profile `cc-switch-provider-troubleshooting`
- rc=0 协议违规 vs 幽灵 spawn vs 跨 board parents 陷阱 → default profile `kanban-triage-stall-recovery`
- 根库陷阱 / UDF 时序窗 → default profile `kanban-task-pickup-diagnosis`
- 写入已落盘的中途崩溃验收 → default profile `kanban-crash-recovery`
- 调度健康全景审计脚本 → default profile `orchestrator-scheduling-audit`（scripts/orchestrator_audit.sh）

## 红线

- 多卡同一时间窗集体秒死 = 永远先怀疑共享 provider 层，勿 debug 单个 worker/任务定义。
- 熔断 403 不会随时间自愈（确定性错误），不修 provider 层的重派 = 再撞一次 + 计数器顶回去。
- 修完 provider 必须真实冒烟（EXIT_RC=0）再批量重派，勿凭 provider_health 表值 1 就宣布恢复。
