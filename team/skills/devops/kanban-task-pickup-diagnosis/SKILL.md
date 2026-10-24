---
name: kanban-task-pickup-diagnosis
description: "kanban 卡建成功但从未被 dispatcher 拾取时用：根库陷阱 + triage 父卡连锁死锁诊断与迁移重建。"
version: 1.0.1
metadata:
  hermes:
    tags: [kanban, dispatcher, troubleshooting, root-db-trap]
    related_skills: [kanban-triage-stall-recovery, kanban-orchestrator]
---

# Kanban 卡不被拾取：落点诊断与迁移重建

> 2026-09-01 实例：TUI 会话建 5 卡任务链（父 triage + 4 子卡），kanban_create 全部 ok、
> kanban_list 全部可见 → 20 分钟零进度。双重死锁：卡写进 dispatcher 不扫的根库 +
> 父卡 triage 永不 done 锁死子卡 parent-gate。

## 核心事实

| 卡所在位置 | dispatcher 是否拾取 |
|---|---|
| `~/.hermes/kanban/boards/<board>/kanban.db`（board 分库） | ✅ 正常 |
| `~/.hermes/kanban.db`（**根级库**，与 kanban/ 目录同级） | ❌ 永不——会话 kanban_* 工具 board=default 时写这里 |
| `~/.hermes/kanban/kanban.db` | 0 字节占位，无业务卡 |

状态维度：`ready` 正常拾取；`todo` 等全 parent done；`triage` **永不拾取**（无 specifier 时）。

**卡不被拾取 = 位置错误 或 状态错误，两者可叠加成死锁。**

## 诊断流程（建卡后 ~2 分钟无 running 即跑）

**所有 CLI 与读操作都显式传 `--board <slug>`**；省略 board 会落到当前/default 板，可能读到另一张同样可见但不相关的卡，造成假进度。

```bash
# 0. 先确认目标板与卡的完整状态；不要用默认板的 list 代替
hermes kanban --board <board> show <tid>
hermes kanban --board <board> runs <tid>

# 1. 先定位卡真实落点（三个位置 + 最近被写的库）
for d in ~/.hermes/kanban/boards/*/; do
  sqlite3 "$d/kanban.db" "SELECT id,status FROM tasks WHERE id='<tid>';" 2>/dev/null
done
sqlite3 ~/.hermes/kanban.db "SELECT id,status FROM tasks WHERE id='<tid>';"
find ~/.hermes -name 'kanban.db*' -newermt 'today' 2>/dev/null   # 谁刚被写

# 2. 分库命中但无 running → 查 worker_pid/started_at + 日志
ls -lt ~/.hermes/kanban/boards/<board>/logs/t_*.log | head -5

# 3. 根级库命中 → 根库陷阱，走迁移重建
# 4. 分库命中且 status=triage → promote；父卡 triage 则先修父卡（子卡 gate 才能释放）
# 5. 排除 respawn guard / 幽灵 assignee：
#    - respawn guard：SELECT substr(last_failure_error,1,200)，有旧 provider 文本=被扣留（见下方分类4）
#    - 幽灵 assignee：test -d ~/.hermes/profiles/<assignee>，目录缺=无人可派
# 6. 以上全否 → 查板级 watcher 是否缺席（见下方「watcher 缺席」分诊）
```

**反直觉点**：`kanban_list`/`kanban_show` 能读回卡 ≠ 卡会被执行——工具与写入方同库即可见，dispatcher 扫描范围才是执行前提。

## watcher 缺席分诊（前 5 项排除后仍零拾取的最大嫌疑）

dispatcher 以**板**为单位常驻，每块板要有一个 `kanban --board <slug> watch` 进程认领该板 ready 卡。卡本身健康（分库/ready/assignee 在位/无 gate/无旧错误文本）却仍零拾取时，缺口就是板级 watcher 缺席。特征信号：事件流里 `out_of_scope` 每 tick 一条刷屏、无 `claimed`/`spawned`。

```bash
# 判别：本机哪些板有 watcher + 目标板在不在
ps -eo args | grep -oE "kanban --board [a-z-]+ watch" | sort -u
ps -eo args | grep -E "kanban --board <board> watch" | grep -v grep || echo "watcher 缺席"

# 卡侧证据齐了就指向 watcher：分库命中 + ready + runs=0 + 无 gate + assignee 目录在位
sqlite3 ~/.hermes/kanban/boards/<board>/kanban.db "SELECT id,status,assignee FROM tasks WHERE id='<tid>';"
sqlite3 ~/.hermes/kanban/boards/<board>/kanban.db "SELECT count(*) FROM task_runs WHERE task_id='<tid>';"
sqlite3 ~/.hermes/kanban/boards/<board>/kanban.db "SELECT kind,count(*) FROM task_events WHERE task_id='<tid>' GROUP BY kind;"

# 根治：补起该板 watcher（后台常驻，下一 tick 自动认领积压卡，无需改卡/unblock）
hermes kanban --board <board> watch --interval 0.5 &
```

**判级**：补 watcher 是基础设施修复，是根治；逐张 `unblock` 无效——watcher 缺席时 unblock 后仍没人认领，等于白做。缺席常见原因：板新建后没拉 watcher、机器重启后 launchd/裸进程没自动带起。本机实测：36 块板全有 watcher，唯独某板缺席，补起后该板积压卡下一 tick 被认领。

## 恢复：迁移重建（根库卡原地 SQL promote 无用——dispatcher 根本不看该库）

1. 根库旧卡归档留痕（不删，保审计）：
   ```bash
   sqlite3 ~/.hermes/kanban.db "UPDATE tasks SET status='archived', \
     result='[superseded] 写入 board=default 根库，dispatcher 不扫根库；已迁往 <board> 重建: <新id列表>' \
     WHERE id IN (...);"
   ```
2. 在真实 board 重建任务链：无依赖卡**不设 parents/triage**（直接落 ready 被立即拾取）；依赖用 parents 表达
3. sleep ~70s 后验证：分库 status=running + `worker_pid`/run 记录非空 + 日志有实质工具调用；仅三者都满足，才可向用户报「已启动」。只有数据库状态变成 `running` 仍不足以证明 worker 已拾取。
4. 向用户报告附事故复盘（误判根因 + 修正后预估），不等用户二次催问；若没有产物、测试或日志证据，不得把验收标准改写成已实现能力。

## 预防
- 建卡后立即 SQL 确认落点是 board 分库（一条 SELECT 的事）
- 分解壳父卡**不用 triage**；确需 triage 语义则建完立刻 SQL promote+验证（kanban_complete 对 triage 卡会报 unknown id）
- 带依赖的下游卡用 parents；建卡漏链的用 kanban_link 补

## Pitfalls
- `cat ~/.hermes/kanban/current` 报 Is a directory——current 是指向 board 目录的**符号链接**，用 `readlink` 读
- 首轮进度报告只看 kanban_list 状态不验 DB 落点 = 把死锁报成「正常等待」，20 分钟后用户二次催问才暴露
- 根库 UPDATE 后仍要重建——别以为 promote 根库卡就能被拾取
- **kanban_comment 也会撞根库陷阱**：卡写进根库后，`kanban_comment` 工具若走 board 参数（如 swarm 板库）会报 `unknown task t_xxx`——不是卡丢了，是查错库。诊断顺序同 tasks 表：先确认卡真实落点（根库 vs board 分库），再选对通道写入。CLI 通道（`hermes kanban --board <slug> comment`）或 kanban_comment(board=) 参数必须与卡的实际所在库一致。
- **不要把"规格化成功"当作"执行成功"**：`kanban specify` 只负责把 triage 卡转成可调度规格；随后必须重新读取目标板的卡状态、run 记录和日志，并分别报告"已规格化""已拾取""已有实质产出"三种证据等级。

## 坑：`no such function: kanban_write_sanctioned`（护栏代码-DB 时序窗，2026-09-04 实例）

- 机制：guard 触发器持久在 **DB 侧**，UDF 注册在**代码侧**；代码缺失的窗口期 = 全部写路径阵亡（含 dispatcher `claim_task`，现象为 ready 队列持续零 spawn + cron 任务同死）。
- 典型引爆：`hermes update` autostash 收走未提交的护栏代码 → 重启进程跑上游代码撞持久化触发器。**护栏类改动必须即改即 commit**，否则每次 update 复炸。
- 诊断三步：① 哪些库有触发器（`sqlite_master WHERE name LIKE 'kanban_guard%'`）② 磁盘代码是否已修（`grep register_write_sanction_udf hermes_cli/kanban_db.py` + `git log`）③ 哪些进程启动早于修复 commit（`ps` 对时间）——滞留旧代码的进程继续炸。
- 修复 = **重启滞留进程**（launchd: `launchctl kickstart -k`；裸进程: kill → 等 `.dispatcher.lock` 释放 → terminal(background=true) 重拉 gateway），**不是修数据**——claim 的 INSERT 无论数据如何都撞触发器。
- 会话内 kanban_* 工具全挂时：CLI 通道（`hermes kanban --board <slug> ...`）是合法恢复路径（terminal 子进程无 delegate 标记，护栏放行）；必须带 `--board`（会话 env 默认 default=根库，叠加根库陷阱）。CLI 命令挂起时加 timeout，先查 DB 是否已生效再重试。
- triage 卡出口是 `kanban specify`（promote 只认 todo/blocked；complete 对 triage 卡报 unknown id）。

## 坑：current 指针目录 symlink + default 板=活跃根库（2026-10-03 实证）

- 解析链（`kanban_db.py get_current_board`）：override → `HERMES_KANBAN_BOARD` → per-home `kanban.default_board` → `<root>/kanban/current`（**只认一行 slug 文本**）→ default。env 一旦已设，current 被跳过。
- 本机 `current` 曾是指向 boards/platform 的**目录 symlink**（旧机制残留）→ `read_text()` 抛 IsADirectoryError 被 `except OSError` 静默吞 → 落 default。判别：`python3 -c "from hermes_cli.kanban_db import *; print(get_current_board())"`；修复：`rm current && printf '<slug>\n' > current`（文本文件）。
- **default 板的 DB = 根级 `~/.hermes/kanban.db`（不是 0 字节的 `kanban/kanban.db` 占位），且是活跃板**（gap 自动化卡落此）。「卡在其他板 + 调用不带 board」→ 落到真实存在但无此卡的根库 → unknown id。诊断先跑 `sqlite3 ~/.hermes/kanban.db "SELECT ..."` 确认卡是否在根库。
- 追责写入者：`.bak.<epoch>` 孪生的毫秒时间戳 ↔ zcode `~/.zcode/cli/db/db.sqlite` 的 `tool_usage` 表 `started_at`（毫秒）对齐，可精确定位写入会话与其 todo/记忆文件（写者自述恢复配方）。
- worker spawn 秒死 `No module named 'hermes_cli'`：tools python 的 `hermes-live-root.pth` 丢失所致，修复=`printf 'hermes-src-root\n/Users/YOURNAME/.hermes/hermes-agent\n' > <tools-python>/lib/python3.*/site-packages/hermes-live-root.pth`，再跑 `python-drift-watchdog.sh` 应 rc=0。修复后重置失败计数（认证连接 UPDATE status='ready', consecutive_failures=0）即可重派。

## 关联
- 完整时间线与 runbook：`_shared/failures/2026-09-04-kanban-udf-stale-process-incident.md`
- triage 语义与状态机细节、供应商熔断/rc=0 协议违规 → `kanban-triage-stall-recovery`（default profile；跨 profile patch 被拒时先 `hermes curator adopt` 或直接编辑源文件）