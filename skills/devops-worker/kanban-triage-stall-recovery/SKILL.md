---
name: kanban-triage-stall-recovery
description: "triage 卡不拾取手动 promote + worker spawn 失败（供应商熔断/协议违规）诊断恢复。"
version: 1.2.0
metadata:
  hermes:
    tags: [kanban, triage, dispatcher, orchestration, troubleshooting]
    related_skills: [kanban-orchestrator, kanban-worker, local-skill-fusion-routing, gateway-smart-routing]
---

# Kanban Triage 卡死排查与恢复

> 2026-08-06 实例提炼：orchestrator 按 routing 规则用 `triage=True` 创建 3 个调研卡，
> 15 分钟后用户问进度才发现全部 stuck——dispatcher 不拾取 triage 状态的卡。
> "kanban_create 成功返回" ≠ "任务会执行"。

## When to Use

- 用 `kanban_create(triage=True)` 创建任务后需要它真正被执行
- 用户问"子任务进度如何"但看板显示任务从未启动
- 排查"卡创建了但 worker 一直没跑"类问题
- 需要对 kanban DB 做原始 SQL 操作（多 board 路径、schema 差异）

## 核心事实

| 状态 | dispatcher 行为 |
|------|----------------|
| `ready` | 正常拾取并 spawn worker |
| `todo`（有未完成 parent） | parent 全 done 后自动 promote 到 ready |
| `triage` | **永不拾取**——triage 是给 specifier 工作流用的（specifier profile 先补全 body 再开工），无 specifier 时卡死 |

## 标准恢复流程

### 1. 定位正确 DB

多 board 部署下，卡落在 `kanban_create(board=...)` 指定的 board 库，**不在根库**：

```bash
# 根库（常常为空）
~/.hermes/kanban/kanban.db
# 各 board 库（卡实际在这里）
~/.hermes/kanban/boards/<board>/kanban.db
# 当前 board 指针
cat ~/.hermes/kanban/current
```

找不到卡时**遍历所有 board 库**，别只查根库或 current board。

### 2. Promote triage → ready

```bash
sqlite3 ~/.hermes/kanban/boards/<board>/kanban.db \
  "UPDATE tasks SET status='ready' WHERE id='<tid>' AND status='triage';"
```

⚠️ **tasks 表无 `updated_at` 列**（schema 里是 `created_at`/`started_at`/`completed_at` 等 INTEGER 时间戳），写进 UPDATE 会报 `no such column: updated_at`。

### 3. 验证 worker 真的 spawn（关键，不可省）

promote 后等 ~15s，确认 dispatcher 已拾取：

```bash
sleep 15
sqlite3 ~/.hermes/kanban/boards/<board>/kanban.db \
  "SELECT id,status,worker_pid,started_at FROM tasks WHERE id='<tid>';"
# 期望：status=running 且 worker_pid 非空
```

只有验证到 running + PID 后，才能向用户报告"已启动"。批量 promote 时逐卡验证。

### 4. dispatcher 活性排查（worker 没被 spawn 时）

```bash
# dispatcher/gateway 进程
ps aux | grep -iE 'hermes.*(dispatch|kanban|gateway)' | grep -v grep
# config 里 dispatcher 是否显式启用（not set ≠ 不跑，看进程为准）
python3 -c "import yaml; c=yaml.safe_load(open('$HOME/.hermes/config.yaml')); print(c.get('kanban',{}).get('dispatcher',{}))"
# worker 日志（按 board 分目录，新 spawn 应有新日志；按时间排）
ls -lt ~/.hermes/kanban/boards/<board>/logs/t_*.log | head -5
tail -30 ~/.hermes/kanban/boards/<board>/logs/t_<id>.log
```

> ⚠️ **日志路径已变（2026-08 实测）**：worker 日志在 `~/.hermes/kanban/boards/<board>/logs/t_<id>.log`，**不在**根目录 `~/.hermes/kanban/logs/`（那是旧路径，最新文件可能停在几周前，会误判"没 spawn"）。找不到今天的新日志时先用 `find ~/.hermes/kanban -name 't_*.log' -newermt 'today'` 定位真实目录。

## 预防：创建时就避免卡死

**triage 使用判据（2026-09-05 用户裁定）**：triage 的价值 = 人工分诊补全 body。判据不是「永不建 triage」，而是「这张卡是否需要人工分诊」：
- **loop graph / 夜间全自动管线 → 禁用 `--triage`**：模板生成的 body（差距描述/证据/验收标准）已齐全，人工分诊零增量价值，triage 只会让卡死在无人分诊的栏位。自动管线建卡直接落 ready。
- **需要 specifier/人工细化 body 的卡 → triage 仍合法**：此时必须确认该 board 有消费 triage 栏的流程或 profile，否则 triage 就是死胡同。

按优先级选一种：

1. **自动管线省略 `triage` 参数**（推荐）——routing 规则要求 triage 语义时，创建后立即按上面 §2-3 promote+验证，把"promote+验证"当作 triage 创建的必要后置步骤
2. 用 `initial_status="running"` 让 dispatcher 直接按正常流程 spawn（跳过 triage）
3. 若确实需要 specifier 先补 body：确认有 specifier profile 在看该 board，否则 triage 就是死胡同

## 排查 checklist（用户问进度时）

1. 查卡的 `status`/`worker_pid`/`started_at`（遍历所有 board 库）
2. status=triage 且无 specifier → 卡死，走 §2-3 恢复
3. status=ready 长时间无 PID → dispatcher 不活，走 §4
4. status=running → 看 worker 日志 `tail ~/.hermes/kanban/boards/<board>/logs/t_<id>.log` 和产出物文件是否存在

## Pitfalls

- **只查根库报"卡不存在"**：卡在 board 子库，根库 `~/.hermes/kanban/kanban.db` 通常不含业务卡。
- **UPDATE 带 updated_at**：tasks 表无此列，报错后 UPDATE 未生效，status 仍是 triage——易误判为"已 promote"。
- **promote 后不验证就向用户报"已启动"**：dispatcher 可能不活，卡 promote 到 ready 后依然不跑。验证到 running+PID 才算数。
- **triage 与 ready 混用**：一批卡里部分 triage 部分 ready，用户看到的"部分在执行"不代表全部健康，逐卡查 status。

---

## Worker spawn 失败：供应商熔断 / rc=0 协议违规（2026-08-24 首实例；2026-08-25 扩为 4 判例 v1.2.0）

> 实例：orchestrator 建 3 个子任务（P1-1/P1-2a/P1-3），全部报
> `worker exited cleanly (rc=0) without calling kanban_complete or kanban_block — protocol violation`，
> `consecutive_failures` 顶到 `failure_limit`(=2) 被 block。
> 根因是模型供应商**瞬时熔断**，不是任务本身问题。
>
> **2026-08-25 基线挖掘（t_f4fd26da）扩充**：同一根因已 4 次复现、跨 swarm+platform 两 board
> （t_37053748 / t_436a8478 / t_7c07c663 / t_66d1140b），且出现**同日两波熔断**（11:35、18:09）。
> 源码级根因：`cli.py:21625-21638` 失败分类器白名单缺口，把「首次 LLM 调用即 5xx 后 rc=0 退出」
> 误分类为 clean_exit → protocol_violation。本章节是该源码修复落地前的运维缓解。

### 症状识别

| 表象 | 含义 |
|------|------|
| `rc=0` 干净退出但无 complete/block | worker 进程起来了，但**第一次 LLM API 调用就失败**，没干活就退 → 被 dispatcher 误判"协议违规" |
| `consecutive_failures` 达到 `failure_limit`（config `kanban.failure_limit`，默认 2） | 任务被自动 block，需手动重置才能重派 |
| 多个不同 board/profile 的任务**同一时间窗**全挂 | 强烈指向共享模型供应商问题，而非单个 worker 配置问题 |

### 诊断：先看 worker 日志的最后一次 API 调用

```bash
# 定位真实日志（见上面路径警告），看尾部是否第一次调用就 5xx
tail -30 ~/.hermes/kanban/boards/<board>/logs/t_<id>.log
# 熔断特征：
#   HTTP 503: 所有供应商已熔断，无可用渠道
#   Provider: custom  Model: aim  Endpoint: http://127.0.0.1:15721
#   "API call failed after 3 retries"
```

**关键判据**：如果当前 orchestrator session（同 endpoint）能正常跑 LLM，说明熔断是**间歇性窗口**且已恢复 → 可以安全重派。这是"重试模式"不是"环境坏了"。

### 先排除：完成后到达的 gave up 通知 = 幽灵重复 spawn（2026-08-27 实证）

判例 t_c524d54c：收到配对通知「✖ gave up after repeated spawn failures / worker exited cleanly (rc=0) without calling kanban_complete」紧随「✔ Kanban done」。实情：真 worker 19:53 落盘 21KB 合并报告、19:54 正常 complete，DB status=done；gave up 是 dispatcher 对同一卡的**重复 spawn 空壳**退出。

**三查后不动**（重派会重复劳动甚至覆盖产物）：
1. DB：`SELECT status, completed_at FROM tasks WHERE id='<tid>';`
2. 交付物：`ls -la` 看 mtime 与 size 是否先于通知
3. 二者吻合 → 判定幽灵通知，kanban_comment 留痕即可，不重派

与 §rc=0 熔断模式的区分：熔断时任务**真没跑**（日志首次 LLM 调用即 5xx、无产物、无 completed_at）；幽灵 spawn 时产物与 completed_at 齐全。先查产物再定性，不要一见 "rc=0 protocol violation" 就走熔断恢复流程。

### 恢复流程（瞬时故障，勿改任务/配置）

1. **kanban_comment 留痕根因**（熔断时间窗 + 503 + 已恢复证据），避免下游误判为 worker 能力问题。
2. **重置失败计数**（计数器顶到 limit 才会 block，重置是重派前提）：
   ```bash
   sqlite3 ~/.hermes/kanban/boards/<board>/kanban.db \
     "UPDATE tasks SET consecutive_failures=0 WHERE id='<tid>';"
   ```
3. **kanban_unblock** → 任务回 `ready`（parents 已 done 时），dispatcher 下一 tick（`dispatch_interval_seconds`，默认 60s）自动拾取。
4. **验证这次真的过了第一次 API 调用**（上次就死在这步）：等 ~75s 确认 `status=running` 且 `worker_pid` 非空，再 `tail` 日志确认有实质工具调用（read_file/terminal/write_file）而非又一波 503。

### 不要做的事

- **不要改任务 body 或 assignee 配置**——根因在供应商，不在任务定义。
- **不要把"rc=0 协议违规"当成 worker 写的代码有 bug** 去 debug worker——先看日志确认是不是第一次 LLM 调用就 5xx。
- **不要盲目重派**——先确认当前 session（同 endpoint）可用，否则只是再撞一次熔断窗口、再把计数器顶回去。
- **不要把本章节当作所有 protocol_violation 的万能解释**（避免确认偏误）——真协议违规也存在：t_7c07c663 曾五连 crash、t_46afbcca 有 4 次「做完没 complete」。只有日志确认为首次 LLM 调用即 5xx 的场景才适用本流程。

### 反复熔断升级（2026-08-25 增补）

若同日发生 2+ 波熔断（判例：t_7c07c663 comment「今日已发生两波 11:35、18:09」）：
1. 在 comment 中建议人工检查 cc-switch 上游渠道配额/稳定性
2. 同一熔断窗口内所有受害任务写一致的根因 comment（可追溯、不重复诊断）
3. 熔断恢复后全 board 扫描残留：`SELECT id FROM tasks WHERE consecutive_failures >= 2 AND status='blocked';`——全部按上述流程重置+重派

### 恢复后验证 checklist（2026-08-25 增补）

- [ ] 重派后任务 `status=running` 且日志出现实质工具调用（非又一波 503）
- [ ] 同一熔断窗口内所有受害任务都有一致的根因 comment
- [ ] 熔断恢复后 `consecutive_failures` 无残留顶格任务

---

## 通知文案陷阱：「max_runtime=0s」≠ 运行时超时（2026-08-25 两次实例）

> 判例：t_a257ada7 / t_a987a4f9(run69) / t_7a2069b8(run84) 三次收到
> `⏱ timed out (max_runtime=0s)` 通知，但 DB 里 `max_runtime_seconds=7200` 全部正常落库。

**机制**：dispatcher 的超时通知模板把**迭代预算耗尽**（`Iteration budget exhausted (N/90)`）也用同一句 "max_runtime=0s" 报出来。看到这条通知时**先查 task_runs.error 的真实文本**，不要直接回头改 max_runtime：

```bash
sqlite3 "file:~/.hermes/kanban/boards/<board>/kanban.db?immutable=1" \
  "SELECT id, status, substr(error,1,120) FROM task_runs WHERE task_id='<tid>' ORDER BY id DESC LIMIT 3;"
# "Iteration budget exhausted (90/90)" → 是迭代上限，不是时间上限
# 迭代上限来自 conversation_loop.py 的 iteration_budget（单 shot worker 默认 90 turns）
```

**两类的不同处置**：
- 真 `max_runtime` 问题（DB 值为 0/NULL）→ 补 `max_runtime_seconds`（重型/goal_mode 卡建议 7200，缺省会被按 0s 立即超时）
- 迭代耗尽（90/90 但 DB 7200 正常）→ 任务对单 run 太大：要么续跑（worktree 有前序产出可接力），要么**拆小卡**（每张子卡 90 turns 内能完成的范围）。**量化拆卡信号（2026-08-25 实证）：同一任务连续 2 次 90-turns 烧完且 worktree 零产出 = 立即拆，不再给第三次整体重试**——判例 t_7a2069b8 三合一卡 run84/run85 各 13min 烧完零产出，拆成 3 张单组卡后全部落地。拆卡时给 worker 提速：staged 提案与勘察合并一个 comment（范围已获 orchestrator 预批则不必单独等审批）。

## 交付核验：源码改动必须查 git log 不是工作树（2026-08-25 实例）

> 判例：worker 自报「F2/F3/F4 done 已核验」且 orchestrator 当日 grep 工作树确认机制存在，
> 但同日 gateway 重启触发上游 git pull，**未 commit 的工作树改动整体消失**——
> 「done 已核验」变成「从没落地过」。

worker 改 hermes-agent 主仓源码的交付核验，orchestrator 必须四要素全查：
1. `git log --oneline | grep <F编号/卡号>` —— commit 真实存在（**这是防回滚的唯一硬证据**）
2. grep 机制块在文件里可见
3. 亲手跑新增测试（不信自报的 passed 数）
4. pytest 基线对比合理

只查 2/3/4 不查 1 = 核验无效（工作树状态随时可被上游 pull 冲掉）。建卡时把「完成即 commit」写进验收标准（frozen: true），commit message 要求含卡号便于追溯。

## 盯卡轮询窗口设计：terminal 前台硬上限 420s（2026-08-27 实证）

`terminal(timeout=580)` 的 for+sleep 轮询在 **420.0s 被强制超时**（前台实际硬上限 420s，timeout 参数填更高无效）。盯卡/盯产物落地状态的标准形态：

```bash
for i in $(seq 1 36); do
  s=$(sqlite3 <board-db> "SELECT status FROM tasks WHERE id='<tid>';")
  [ "$s" = "done" ] && break
  sleep 10
done   # 一窗 ≈ 360s，terminal timeout 参数给 400
```

未果再开下一窗，**宁可多开几窗也不要单窗 >400s**。轮询间隙顺手 `ls -lt` 工作区：worker 分钟级仍在写新文件 = 在干活不是卡死，无需干预（判例：T1 网络面卡 40 分钟出报告，期间持续落证据文件，全程无需介入）。

## 跨 board 建卡：`parents=[]` 不能跨 board 引用（2026-08-24 实例）

> 实例：父任务 `t_xxx` 在 swarm board，orchestrator 想给 platform board 的
> platform-ontology-curator 建子任务并 `parents=[t_xxx]`，报
> `kanban_create: unknown parent task(s): t_xxx`。同 board（swarm→swarm）的另两张卡则正常。

**机制**：`parents=[...]` 的依赖解析只在**目标 board 自己的库**里查父任务 id。父任务在别的 board 的库 → 查不到 → 拒绝建卡。task_links 也是 per-board 的（见各 board 库 `.tables`），跨 board 无法建立 DAG 依赖边。

**降级模式（跨 board 时）**：
1. 省略 `parents=`，在子任务 body 里用文本写溯源：`派生自 <父board> board 父任务 <id>（<标题>），产出物 markings=[...]`。
2. 同一句里完成 markings/clearance 校验声明（父产出物 marking 是否在子任务 assignee 的 clearances 内），因为跨 board 失去了 task_links 的自动 markings 传播。
3. 建完在父任务上 kanban_comment 记录子任务 id + board + 降级原因，保持双向可追溯。

**注意**：跨 board 失去 parents 门控 = 子任务不会被 parent-done 自动 promote，建卡即 `ready` 会被 dispatcher 立即拾取。若需要"等父任务做完再动"，跨 board 只能靠 orchestrator 人工编排时序，不能依赖 DAG。

## 跨 board parent-gating 失效：子任务提前启动（2026-08-25 实例）

> 实例：orchestrator 建跨 board 任务链 swarm(t_26aace0b) → hack(t_2f00c6a4) → ops(t_cec22a64)，
> hack/ops 任务在 swarm parent 未完成时就启动了（dispatcher 立即拾取）。

**根因**：`task_links` 是 per-board 存储的。hack board 的 dispatcher 查 parent 状态时，只查 hack board 的 tasks 表——parent `t_26aace0b` 在 swarm board → 查不到 → 视为无 parent → 直接启动。

**证据**：
- `sqlite3 hack/kanban.db "SELECT * FROM tasks WHERE id='t_26aace0b'"` → 空
- `sqlite3 hack/kanban.db "SELECT * FROM task_links"` → 有 `t_26aace0b|t_2f00c6a4`
- hack 任务事件流：`promoted`（无 `blocked` 或 `todo` 等待期）

**影响**：跨 board 任务链中，子任务会在 parent 未完成时就启动。若 parent 产出是子任务输入，子任务可能基于不完整数据工作。

**处置**：
1. 发现子任务提前启动后，立即检查 parent 状态：`sqlite3 <parent-board>/kanban.db "SELECT status FROM tasks WHERE id='<parent-id>'"`
2. parent 未完成 → 手动 `UPDATE tasks SET status='blocked'` 暂停子任务，等 parent done 后 unblock
3. parent 已完成 → 子任务结果正确，无需干预

**预防**：跨 board 任务链建卡时，在 body 中显式标注"本任务依赖 <父board> 的 <parent-id>，需等其完成后再执行"，由 orchestrator 人工控制时序。
