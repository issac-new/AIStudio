---
name: kanban-worker-spawn-breakage-desktop-app-gateway
description: Use when 桌面App网关 spawn 全炸 ModuleNotFoundError：.pth 类级修复.
tags: [kanban, dispatcher, crash, desktop-app, hermes-update-drift]
---

# 分类 4b：桌面 App 重生网关 spawn 断链

> 分类总表权威源在 default profile `orchestrator-worker-failure-triage`（其分类 4 = HERMES_BIN 缺失）；
> 本件记录该分类在**桌面 App 网关路径**下的变体与类级修复。跨 profile 不可 patch，落本件。

## 指纹

- 分类 4 同款症状：worker spawn 即死，`python3: Error while finding module specification for 'hermes_cli.main' (ModuleNotFoundError)`，多卡同窗口集体 exit 1 → gave up。
- **但 launchd plist 已注入 HERMES_BIN 仍复发**——与分类 4 原版的分叉点。
- 崩溃窗口前 gateway 进程换代：旧 pid 消失，新 pid 祖链溯源到 `/Applications/Hermes.app`（桌面 App 自我重生），`ps eww <pid> | tr ' ' '\n' | grep ^HERMES_BIN=` 为空。
- 判例 t_38ab74d9（2026-09-30）：旧网关 spawn 的 worker 正常跑 8min → hindsight 插件 120s 超时级联带走旧网关 → 桌面 App 重生内嵌网关接管派工 → 此后所有 worker ModuleNotFoundError → gave up。

## 根因

桌面 App 内嵌网关不走 launchd，plist 注入的 HERMES_BIN 对它无效；worker 子进程继承其环境，裸 tools python 跑 `-m hermes_cli.main` 找不到模块（editable 安装挂在 installs 哈希 venv，site-packages 只有 pip）。`hermes update` 换 tools python 代际后 .pth 丢失是常态诱因。

## 修复（类级，优先于 plist 路线）

```bash
TP=$(ls -d ~/.hermes/tools/python-3.14* | head -1)   # 目录名含脱敏星号，必须 glob 展开勿手打
SP="$TP/lib/python3.14/site-packages"
echo "$HOME/.hermes/hermes-agent" > "$SP/hermes-agent-live.pth"
```

三级验证：V1 裸 python `import hermes_cli` OK → V2 worker 同款 `$TP/bin/python3 -m hermes_cli.main --version` OK → V3 端到端（解锁 ready 卡让 dispatcher 真实 spawn，看 task_runs status=running/heartbeat）。

## 护层

- .pth 会被 `hermes update` 换 tools python 代际冲掉——纳入 update 后自检（与 SKILL.md 计数对账同批）：`ls $SP/*.pth || 修复`。
- **双层断链变体（2026-10-03 判例 t_da1ed8d4）**：.pth 修复后 worker 仍 crash `cannot import name 'register_current_worker_from_env'`——第二层是**本地 WIP 删符号**：工作区 179 个未提交改动（raci 开发中）把 `tools/kanban_tools.py` 的该函数整体删除（连同 kanban_schedule handler），而 `hermes_cli/cli_single_query.py`（HEAD 版，未改）仍 import 它。判定法：`git show HEAD:<file> | grep <symbol>` 有、工作区无 = WIP 漂移而非 update 冲突。修复：从 HEAD 提取函数体 patch 回工作区，**只恢复断链符号，不动 WIP 其他改动**（checkout 单文件会连 WIP 一起回退，禁用）。修复后 worker 报错若仍是旧的，先核对 task_runs 时间戳（crash 行可能是修复前的残留）再下结论。
- 崩溃时序教训：hindsight 超时级联是第一张多米诺（daemon 卡滞待另案治理）；.pth 修复保 spawn 链路，hindsight daemon 修复保网关进程存活，两者独立。
- 工程细节：路径含 `*` 时 echo/cat 必须加引号且用 glob 展开赋值，手打脱敏路径必 404（2026-09-30 实证两连败后第三改对）。

## 受害卡恢复（断链窗口殃及面清理）

修复只救链路；断链窗口内 gave up 的卡要单独扫回——它们不是任务失败，是 spawn 撞墙的连带伤亡，放着不管会积压成假性 backlog：

1. **找受害面**：逐板查 task_events 的 `gave_up` 事件（payload 含 `pid ... exited with`），时间戳落在断链窗口内的即是。勿信 tasks.block_kind——dispatcher 重试耗尽的 auto-block 不写 block_kind（值为 NULL），按事件时间线判，不按字段判。
2. **恢复**：`hermes kanban --board <b> unblock <tid>` 逐张解锁即可。后台 dispatcher 下一 tick 自动 claim+spawn——随后手动 `dispatch --json` 显示 spawned=0 不代表失败（可能已被后台接走），以 task_runs 为准，勿循环重派。
3. **存活复验**：等过历史崩溃窗口再查（秒死类崩溃均在 spawn 后 60s 内，等 90s 足够覆盖）。按「每卡最新一条 run」判 status=running：SQL 必须 `JOIN (SELECT task_id, MAX(id) FROM task_runs WHERE task_id IN (...) GROUP BY task_id)` 取最新 run——`GROUP BY ... HAVING MAX(id)` 语义错，静默返回 0 行假阴性。
4. **自相矛盾即查询 bug**：结果「N 存活=0 且 非running=0」= 查询写错，不是全部成功。计数与明细对不上时先修查询再下结论，勿在矛盾结果上宣布闭环。

## 附属变体：429 风暴殃及跨板（2026-10-01 00:36 判例）

**指纹**：多卡多板同时流断（Stream stale >900s 被杀→心跳断→stale_lock 回收→gave_up），但单卡冒烟 200 OK、mid/big 档 100% 成功、**small/zero 档 100% 撞 429**。

**根因**：另一板某 worker 的 LLM 流被 429 打断后，客户端重试无退避上限→秒级零 token 空请求轰炸（每请求新 session id=循环重试指纹，高峰 >100/min，判例总量 1204 次 429/3.5h）。风暴挤占共享通道，把其他卡正常请求流断杀死。

**定位三步**：①proxy 日志按 token 档切（zero 档 0% 成功=失控重试循环，big/mid 100%=通道本身健康）②按分钟聚找风暴起点与节奏 ③lsof :15721 找连着 proxy 的 python 进程→ps eww 看 HERMES_KANBAN_TASK 定位风暴卡。

**处置**：风暴会自愈（worker 换出死循环路径后归零，判例 00:35），但**等自愈=其他卡持续挨饿**——直接找风暴卡处理（block 那张卡/通知对板 orchestrator），勿在本板空转重派。修复后用「zero 档归零 + mid 档 100% 成功」双指标确认风暴停，再 unblock 受害卡。

**预防待办**：Hermes 客户端 429 重试加退避上限（指数退避+封顶/连续 N 次 429 即 exit 非 0 让 dispatcher 冷却重派），候选 patch 落 agent/conversation_loop.py——未落地，登记 gap。
