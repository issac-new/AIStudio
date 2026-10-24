# SkillProposal: kanban-transient-outage-recovery [create]

> **落地状态**: ✅ 已合并 2026-08-25（图爸裁决方案A）：patch 入 devops-worker/kanban-triage-stall-recovery v1.2.0——4 判例扩充 + cli.py:21625 源码根因 + 反复熔断升级节 + 恢复后验证 checklist


> 产出： platform-skill-miner · 2026-08-25 · 基线挖掘 t_f4fd26da
> markings: [TLP:GREEN, EYES-ONLY:platform]

## 触发条件

当 kanban worker 任务出现「rc=0 干净退出但未调 kanban_complete / kanban_block」被 dispatcher 判为 protocol_violation、且 `consecutive_failures` 顶到 `failure_limit` 被自动 block 时——加载本 skill。**先诊断供应商熔断，勿改任务定义。**

## 证据链

| # | task_id | board | snippet（可回溯 comment） |
|---|---------|-------|--------------------------|
| 1 | t_37053748 | swarm | orchestrator 失败根因诊断：worker 日志统一报 `HTTP 503: 所有供应商已熔断`（Endpoint 127.0.0.1:15721），首次 API 调用即 503，重试3次全挂 → rc=0 干净退出 → 误判协议违规。熔断窗口 11:35，16:58 探测已恢复。重置 consecutive_failures=0 + unblock 重派 |
| 2 | t_436a8478 | swarm | 同 t_37053748：模型供应商瞬时熔断（HTTP 503），首次 API 调用即失败，rc=0 干净退出被误判协议违规。重置计数器 + unblock 重派 |
| 3 | t_7c07c663 | swarm | P1-2b spawn 失败非任务本身问题，是模型供应商瞬时熔断（与 t_37053748 同根因）：`HTTP 503 所有供应商已熔断` → `HTTP 502 请求转发失败`。熔断窗口 18:09；18:40 探测同 endpoint 实际 LLM 调用成功 → 渠道已恢复。**观察：供应商熔断今日已发生两波（11:35、18:09），均为间歇性** |
| 4 | t_66d1140b | platform | 模型供应商瞬时熔断（HTTP 503 所有供应商已熔断），首次 API 调用即失败，rc=0 干净退出被误判协议违规。熔断窗口 11:35，16:58 探测已恢复。非任务本身问题。重置计数器 + unblock 重派 |

**频率**: 4 / 53（跨 swarm+platform 两 board，同一根因在不同 assignee 上重复出现；另 t_a257ada7 解剖②提供分类器失配的源码级根因：`cli.py:21625-21638` 白名单缺口把熔断误分类为 clean_exit）

## 四段式内容

### 1. 触发条件 → 具体信号

- kanban 任务状态变为 `blocked`，`block_kind=protocol_violation` 或 comment 含「rc=0 cleanly without kanban_complete」
- `consecutive_failures >= kanban.failure_limit`（默认 2）
- **关键区分信号**（供应商熔断 vs 真协议违规）：
  - 多个不同 board/profile 的任务在**同一时间窗**全挂 → 强烈指向共享供应商问题
  - worker 日志尾部显示**首次 LLM API 调用即 5xx**（503 所有供应商已熔断 / 502 上游 Connect error），Context 仅 2-3 msgs，duration 秒级，**零工具调用**
  - 当前 orchestrator session（同 endpoint）能正常跑 LLM → 熔断是间歇性窗口且已恢复

### 2. 标准步骤

1. **看 worker 日志最后一次 API 调用**：
   ```bash
   ls -lt ~/.hermes/kanban/boards/<board>/logs/t_*.log | head -5
   tail -30 ~/.hermes/kanban/boards/<board>/logs/t_<id>.log
   # 熔断特征：HTTP 503 所有供应商已熔断 / Endpoint 127.0.0.1:15721 / "API call failed after 3 retries"
   ```
2. **kanban_comment 留痕根因**（熔断时间窗 + 503/502 + 已恢复证据），避免下游误判为 worker 能力问题
3. **重置失败计数**（计数器顶到 limit 才会 block，重置是重派前提）：
   ```bash
   sqlite3 ~/.hermes/kanban/boards/<board>/kanban.db \
     "UPDATE tasks SET consecutive_failures=0 WHERE id='<tid>';"
   ```
4. **kanban_unblock** → 任务回 `ready`，dispatcher 下一 tick 自动拾取
5. **验证这次真的过了第一次 API 调用**：等 ~75s 确认 `status=running` 且 `worker_pid` 非空，再 `tail` 日志确认有实质工具调用（read_file/terminal/write_file）而非又一波 503
6. **反复熔断升级**：若同日发生 2+ 波（证据：t_7c07c663 comment「今日已发生两波」），在 comment 中建议人工检查 cc-switch 上游渠道配额/稳定性

### 3. 陷阱

- **不要把「rc=0 协议违规」当 worker 代码 bug 去 debug**——先看日志确认是不是第一次 LLM 调用就 5xx
- **不要盲目重派**——先确认当前 session（同 endpoint）可用，否则只是再撞一次熔断窗口、再把计数器顶回去
- **不要改任务 body 或 assignee 配置**——根因在供应商，不在任务定义
- **UPDATE 别带 updated_at**——tasks 表无此列，写进 UPDATE 会报错且 status 未变，易误判「已重置」
- **注意真协议违规也存在**：t_7c07c663 曾五连 crash、t_46afbcca 有 4 次「做完没 complete」——本 skill 仅适用于诊断为熔断的场景，不能当作所有 protocol_violation 的万能解释（避免确认偏误）

### 4. 验证（如何机械验证 skill 生效）

- 重派后任务 `status=running` 且日志出现实质工具调用（非又一波 503）
- 同一熔断窗口内所有受害任务都有一致的根因 comment（可追溯、不重复诊断）
- 熔断恢复后 `consecutive_failures` 无残留顶格任务（全 board 扫描 `WHERE consecutive_failures >= 2 AND status='blocked'`）

## 与既有 skill 关系

- **新增，但与 `kanban-triage-stall-recovery` 高度相关**：后者 §Worker spawn 失败章节已含本模式的 2026-08-24 单实例记录。建议 curator 裁决二选一：
  - **方案A（推荐）**：将本提案作为 patch 合并进 `kanban-triage-stall-recovery`（把单实例扩为 4 实例判例 + 补源码根因 cli.py:21625 分类器缺口 + 补「反复熔断升级」步骤6）
  - **方案B**：独立成 skill，与 triage-stall 互链（triage-stall 聚焦「卡不拾取」，本 skill 聚焦「拾起后误判协议违规」）
- 与 `cc-switch-provider-troubleshooting` 互补：后者修 cc-switch 本身，本 skill 处理熔断的 kanban 侧善后

## 预期收益

- 消除重复诊断：同一根因 4 次出现，前 3 次都是现场重新排查；skill 化后诊断时间从 ~15min → ~2min
- 防止误伤 worker：避免把供应商问题记入 worker 能力档案
- 为分类器修复提供输入：cli.py:21625 白名单缺口是源码级根治点，本 skill 是其落地前的运维缓解
