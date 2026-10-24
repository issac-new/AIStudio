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
| **单卡** exit 78 + `Your API key was rejected by the provider` + `HTTP 403: 用户额度不足, 剩余额度: ￥0.000000` | 该 profile `config.yaml` 的 `fallback_providers` 链残留已失效/欠费模型——主模型调用失败时切到残留 fallback，上游返回确定性 403（与 cc-switch 熔断是两条独立路径） | `grep -A3 'fallback_providers' ~/.hermes/profiles/<assignee>/config.yaml` 对照主 `model:` 与全舰队口径 | 清空 `fallback_providers: []` 对齐模型裁决（改前 `cp config.yaml config.yaml.bak-<日期>`）；清后实弹冒烟（下节第 5 步）再 unblock 重派 |

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

### 配额窗已自愈型 crash 波（provider 无需手术的收口序列）

指纹与熔断风暴相同（多卡同一时间窗集体 crashed/gave_up，`pid not alive` 与 workspace spawn_failed 混杂），但复检时 provider 已恢复正常（如配额周期重置自愈、熔断未卡死）——上节第 1/2 步的 DB 复位与切流**全部不需要**，直接收口：

1. 实弹探针证明根因消失：worker 同款命令冒烟 EXIT_RC=0；波次错误含 spawn_failed/worktree 的，加测 worktree 机制探针（一次性分支 `git worktree add` + `remove --force` 建删成功）。
2. 整批 unblock：同一波全部 unblock（工具或 CLI 均走状态机；中央根库卡不带 board 参数），dispatcher 下一 tick 自动重派。
3. 存活复验后才收工：等 2-3 分钟读 `last_heartbeat_at`（<5min = worker 真活），全批有心跳才算救活；波次定性写一张卡的 comment 即可（共享根因 + 探针证据 + 已批量重派），勿逐卡重复。
4. gave_up 卡的 blocked 是重试熔断的停车位，不是待决策态——根因消失后批量 unblock 即愈，无需逐卡重开。

## 迭代预算耗尽 ≠ 任务失败（续作模式）

- 通知文案陷阱：`timed out (max_runtime=0s)` 可能实为 `Iteration budget exhausted (N/90)`（dispatcher 模板复用），先查 `task_runs.error` 真实文本。
- 预算耗尽 → 卡 blocked，但 **worktree/repo 状态延续**：直接 unblock 重派即可续作。
- **接力提速**：重派前 `tail` 前序 run 的 worker log——worker 常在 log 尾部自列收尾清单（修哪些测试→commit→complete），原样注入 comment 给下轮 worker，省去重新勘察的数十轮。判例 t_cc655ecb：90/90 耗尽 blocked，unblock 后次轮按清单完成并交付（commit d5068a16d5，87 测试独立复跑全过）。
- 预防：长 sleep 轮询外部过程的卡，预算大半耗在等待上——comment 提醒 worker 用 `terminal(background=true)` 代替前台长 sleep。

## 知识地图（跨 profile 深度细节）

- provider/wire_api/熔断机制深挖 → default profile `cc-switch-provider-troubleshooting`
- 单卡被 respawn guard 长期扣留（provider 已愈、冒烟过，但该卡仍每 tick 静默跳过）→ 本 profile `orchestrator-scheduling-audit` 分类 4（清 `last_failure_error` 解扣）
- rc=0 协议违规 vs 幽灵 spawn vs 跨 board parents 陷阱 → default profile `kanban-triage-stall-recovery`
- 根库陷阱 / UDF 时序窗 → default profile `kanban-task-pickup-diagnosis`
- 写入已落盘的中途崩溃验收 → default profile `kanban-crash-recovery`
- 调度健康全景审计脚本 → default profile `orchestrator-scheduling-audit`（scripts/orchestrator_audit.sh）

### 诊断补丁（2026-09-17 teamai-cli 融合链 friction dogfood 实测，用户批准落地）
- **agent.log 静默 ≠ worker 挂死**：`nettop -p <pid> -L 1 -n` 间隔 ~45s 采两次比 `bytes_in`，仍在涨 = 流式 LLM 长响应在途（蒸馏/大文档任务单调用 10min+ 属正常）；走平才介入。配合 task_events 心跳表（60s/拍）判活。
- **蒸馏写作型任务的正常进度信号**：读快照→转译大文档的瓶颈在单口大模型响应；中途 `kanban_comment`「前线侦察摘要」= 推进中，非卡死，勿干预。
- **卡寻址 = board 参数匹配卡片实际落库**：`kanban_create(board=X)` 落 `boards/<X>/kanban.db` 时，后续 complete/comment 必须带同参 `board=X`，否则报 unknown id/task；反之中央根库卡（工具默认落点 `~/.hermes/kanban.db`）**显式带 board=X 也会报 unknown id**（该参数强制走旧布局库查找）。报 unknown id 先判卡片在哪个库，再决定带不带 board 参数，勿改写 id 盲目重试。

## 分类 4：worker 秒死 + `ModuleNotFoundError: No module named 'hermes_cli'`（2026-09-27 判例）

**指纹**：dispatcher 日志 `pid ... exited with code 1`，worker last output 只有 `Error while finding module specification for 'hermes_cli.main'`；多卡同窗口集体 gave up；但卡本身无问题（TUI 手动 complete 正常）。

**根因链**：网关经 `-c` bootstrap 启动（`sys.path.insert(0, hermes-agent)`）→ 进程内 `find_spec("hermes_cli")` 成功 → `_resolve_hermes_argv()` 选 `sys.executable -m hermes_cli.main`（模块形态优先于 PATH，防影子进程的安全设计）→ 但 spawn 的 worker 子进程不继承 sys.path，裸 tools python 的 site-packages 只有 pip，editable 安装挂在 installs 哈希路径 venv 里 → 全部 worker 启动即 ModuleNotFoundError。

**修复**（逃生门 = `HERMES_BIN` 环境变量，`_resolve_hermes_argv` 最高优先级）：
1. 注入 plist：`~/Library/LaunchAgents/ai.hermes.gateway-<profile>.plist` 的 `EnvironmentVariables` 加 `HERMES_BIN=/Users/YOURNAME/.hermes/hermes-agent/.hermes/bin/hermes`（wrapper 自带 bootstrap sys.path，不依赖 site-packages）。
2. `launchctl bootout` + `bootstrap` 重启网关；`ps eww <pid> | tr ' ' '\n' | grep ^HERMES_BIN=` 验证进程环境。
3. 冒烟：`/Users/YOURNAME/.hermes/hermes-agent/.hermes/bin/hermes -p <worker> --cli --accept-hooks chat -q "回复ok"` → EXIT_RC=0。
4. 端到端：建测试卡让 dispatcher spawn，确认 task_runs status=done。

**注意**：[已移除] 等其他 multiplex 网关若有同样症状，同法注入各自 plist（backup 先行）。`hermes update` 后 installs 哈希路径变更是这类断链的常见诱因。

## 分类 5：spawn 链路双层断（module 层修复后又撞 symbol 层）

crash 文本是 import 类错误时是 spawn 链路故障，不是 provider 层——先按文本定层，勿见集体死就复位熔断：

1. **module 层**：`No module named 'hermes_cli'` / `Error while finding module specification` → `.pth` 断链，修法见分类 4 与 kanban-worker-spawn-breakage-desktop-app-gateway（tools python 换代冲掉 site-packages `.pth` 是常态诱因）。
2. **symbol 层**：module 已能找到后报 `cannot import name 'X'` → `git log -p -S X -- <file>` + `git diff HEAD -- <file>` 判 HEAD↔工作区漂移：HEAD 有、工作区无 = 脏树上的未提交改动删掉了 spawn 入口仍 import 的函数。修复 = 内容级恢复该函数体（从 HEAD 提取 patch 回去），**禁 `git checkout -- <file>` 整文件回滚**——脏树上并存的 patch overlay/WIP 会被一起洗掉。pyc 时间戳已新仍报旧错时先排除 dual runtime（worker 实际跑 desktop-runtime 副本），查 spawn 实际命令再怀疑缓存。

**断链窗口受害卡恢复**：窗口内 auto-block/gave_up 的卡是停车位不是任务失败——用真实 spawn 验证修复（dispatch 拿到 worker pid 且存活跨过历史崩溃窗口线，如 60s），再整批 unblock 重派；勿用单次 dispatch JSON 判成功，勿逐卡重开。

**重派前的树健康门（三探针全绿才 dispatch）**：「树已修好」必须实测，勿凭恢复脚本日志宣布：
1. 符号级 import 探针：`sys.path.insert(0, <hermes-agent根>)` 后 `from tools.kanban_tools import <被冲掉的函数>`——只探 `import tools.kanban_tools` 会漏掉函数级缺失（crash 文本正是 `cannot import name`）。
2. mtime 双采样：间隔 10s 两次 `stat -f %m <关键文件>` 一致才算稳——恢复流程分多步落盘，中途 dispatch 会撞坏树尾窗。
3. patch-watchdog 日志复核：watchdog 报 `hermes update in flight (pgrep)` 可能是其 pgrep 模式自捕获的误报（树 mtime 稳定、无锁文件、无 update 进程）——自行复核三项再解冻，勿单信一行 ERROR 冻结恢复。

**批量恢复杠杆**：`hermes kanban --board <b> dispatch` 一次补 spawn 该板全部 ready 卡；blocked(n/N) 熔断停车卡走 CLI `unblock` + `dispatch` 即重置计数重派，无需 DB 手术清计数器。恢复内容落盘后**立即 commit**——共享源码树上未提交的恢复会被并发的 fast-import+reset 再次冲掉。

## 分类 6：respawn_guarded(blocker_auth) 空转循环 = 目标域 orchestrator gateway 未运行

**指纹**：域板（aiteam/pay 等）单卡长期 status 不动，`task_events` 每分钟一条 `respawn_guarded`、payload `{"reason": "blocker_auth"}`，无 worker pid、无 last_failure_error。
**首查**：`ps aux | grep "profile <域>-orchestrator"`——域 gateway 进程未运行，dispatcher 无法完成 auth 握手，每 tick 空转重试。这是进程级依赖，不是 provider/任务/授权字段问题；对该卡复位熔断、unblock、重派全部无效。
**处置**（试验/建议类 P2 卡，如夜间调研自动登记）：不强行派工、不走 needs_input（无人为钥匙可补）——归档卡 + 台账回开保可追踪：
```bash
python3 <life-workbench>/scripts/gap_register.py --register <reg>.yaml update <gap-id> \
  --set status=open --set reopen_reason="<gateway 未运行,卡已归档;gateway 拉起后按本条重派>" \
  --set kanban_task_id=None
```
- `reopen_reason` 是回开的 CLI 机械护栏（缺它拒绝执行），照实写即可，不是障碍。
- `kanban_task_id` 指向已归档卡时必须清掉——台账指僵尸卡会让下次重派寻址失败。
**真正解锁** = 把域 gateway 拉起。

## 红线

- 多卡同一时间窗集体秒死 = 先读 crash 文本定层（provider 熔断 / spawn 链路 module 层 / symbol 层）再动手——集体死 ≠ 必然 provider 层；无论哪层，勿 debug 单个 worker/任务定义。
- 熔断 403 不会随时间自愈（确定性错误），不修 provider 层的重派 = 再撞一次 + 计数器顶回去。
- exit 78 单卡 403 = 先查该 profile config.yaml `fallback_providers` 残留，再查 cc-switch 熔断——两个根因独立，跳过 fallback 检查直接动 cc-switch DB 是误诊；清残留前必备份 config.yaml。
- 改 fallback/模型配置后必须跑 worker 同款实弹冒烟（EXIT_RC=0）才 unblock——配置改对了 ≠ provider 路径通了（别名透传、catalog 缺名仍会炸）。
- 修完 provider 必须真实冒烟（EXIT_RC=0）再批量重派，勿凭 provider_health 表值 1 就宣布恢复。
