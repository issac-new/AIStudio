---
name: kanban-worker-crash-triage-orch
description: "worker 秒死时按 crash 文本定类再修；在途卡进度三信号核查。"
tags: [kanban, dispatcher, crash, update-drift, orchestrator]
---

# Kanban worker crash 定类与在途进度核查（orchestrator 本域版）

> 本件只补 default 层两块缺口：①半更新符号漂移类与修复序列 ②在途卡进度核查程序。
> **崩溃分类总表（熔断/fallback 残留/bootstrap 断链）的权威源在 default 的
> `orchestrator-worker-failure-triage`，读无边界、写有边界——先读它再做深度归因。**
> 两份文件会漂移：本件不含 provider 层修复细节，勿在此重述。

## 铁律：先读 crash 文本再定类

拿到 `worker crashed (pid gone)` 通知，第一动作是读 last output 的错误文本——
文本本身就是定类证据，不是待解读的噪音：

| 错误文本 | 类 | 修向 |
|---|---|---|
| `Your API key was rejected` / `HTTP 403` | provider 层（熔断/fallback 残留） | 权威源 skill 分类 3/4，勿动任务定义 |
| `No module named 'hermes_cli'` | bootstrap 断链（整模块不可见） | HERMES_BIN 注入路线，权威源 skill 分类 4；注意 plist 注入 ≠ 运行中 job env（launchd 改 plist 对已运行 job 不生效）——`ps eww <gateway_pid>` 实测环境块有无 `HERMES_BIN=`，缺失则 `launchctl kickstart -k gui/$(id -u)/<gateway plist label>` 重载 |
| `cannot import name '<符号>' from '<模块>' (<绝对路径>)` + 自带提示 `partially-updated install` | **半更新符号漂移**（本件详述） | 下节序列 |
| 无任何输出、静默死 | 调度/profile 层 | 权威源 skill 分类 1/2 |

分流细节：`cannot import name` 但**无** partially-updated 提示时，先 `git show HEAD:<file> | grep <符号>`——HEAD 有而工作区无 = 本地 WIP 删了符号（只回补该符号，勿 checkout 整文件连 WIP 一起回退；修复细节见 `kanban-worker-spawn-breakage-desktop-app-gateway` 双层断链变体）；HEAD 也无 = 真半更新，走下节序列。另：**修复落地后仍收到同型 crash ≠ 修复无效**——dispatcher 的重试波可能整波启动于修复落地之前，通知因 run 结束才送达而滞后到达；判定看该 run 在 task_runs 的 `started_at`（不是通知到达时刻），早于修复落地时刻的 crash 属修复前旧环境重试，勿据此重启归因、勿回滚已验证的修复。

反例：`cannot import name` 带得出模块绝对路径却去修 provider/熔断 = 误诊白烧一轮。

## 半更新符号漂移：修复序列（快路径优先）

根因：`hermes update` 半程落盘——被调用模块刷到新版删/改了函数，调用方留在旧版。
crash 的自带提示（`Re-run the update`）即定类证据。单卡反复 retry 报同一符号错时
卡本身无问题，勿 debug 任务定义。

1. **快路径**：在源码树 backup/历史副本中 `grep -rn "def <符号>"`，把整个缺失
   函数拷回现文件——分钟级，dispatcher 的 retry 倒计时烧不起慢路径。
2. **慢路径**：重跑 `hermes update` 让整树收敛到同版本（无备份可拷时兜底）。
3. 修完立即 worker 同款冒烟（`hermes -p <assignee> --cli --accept-hooks chat -q "回复ok"`
   → exit 0），**不等 dispatcher 自动 retry**——文件修好 ≠ import 链通了。bootstrap 断链类
   须复刻 spawn 真实形态：worker 走 runpy `-m` 路径（非 launcher，launcher 自带 sys.path 注入），
   用 `(cd /tmp && env -i HOME="$HOME" <tools-python> -m hermes_cli.main --version)` 验证——
   launcher 形态通了 ≠ spawn 形态通；cd /tmp 防工作区 sys.path[0] 劫持。
4. 证据写 comment：缺失符号名 + backup 源锚点 + 冒烟退出码。

## 修复后解熔断重入队（gave_up 熔断挡住自动 retry）

dispatcher 按 consecutive_failures 达上限即熔断（gave_up → blocked），此后**修复落地也不会
自动 retry**。修复冒烟通过后必须手动重入队，否则卡永久滞留 blocked，被误读成「修复无效」：

1. 确认熔断态：`SELECT status, consecutive_failures FROM tasks WHERE id='<tid>'`（blocked + 达限）。
2. 按 `kanban-db-guarded-writes` 认证连接执行：`UPDATE tasks SET consecutive_failures=0
   WHERE id=? AND status='blocked'` + `kb.promote_task(conn, tid, actor="orchestrator")`。
3. 裸 sqlite3 SELECT 回读 `ready` 才算入队；挂 `[requeue]` comment 留时间线证据
   （crash 时刻 vs 修复落地时刻 + 冒烟退出码）。
4. 重入队后再秒死同一错误 → 停止原地修文件，升级 gateway 进程 env 层（上表 bootstrap 行
   kickstart 重载），勿再烧轮次重复同一修法。

## 在途卡进度核查三信号（用户催「检查进度/还剩多久」时）

对 `running` 卡按序采集，三信号全绿才报「运行中+预估完成时间」，**勿干预**——
杀死一个正在实质推进的 worker = 从头重跑：

1. **进程活性**：`ps -p <worker_pid> -o pid,etime,state` —— `Rs` 计算中；`Ss`+心跳新 = LLM 响应在途，都不算卡死。
2. **心跳新鲜度**：tasks 表 `(strftime('%s','now')-last_heartbeat_at)` 秒级（<60s）= 实时。
3. **实质产出**：`hermes kanban --board <slug> log <tid>` 读在途 run 实时日志
   （管道 grep `💻\|📖\|exit` 看最近工具调用与测试退出码）——每轮有新命令/新断言 = 推进中；
   `~/.hermes/kanban/logs/` 找不到日志文件时该命令是最可靠观测面。

升级线：同一条命令连续两轮 exit 1 才介入。正在迭代修测试的 worker 属正常推进，不是卡死。
