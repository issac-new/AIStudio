---
name: kanban-blocked-card-disposition
version: "1.1.0"
description: "Use when 处置/清点 blocked/gave_up 卡：核验产物后按三分法补完成/重派/归档。"
metadata:
  hermes:
    tags: [kanban, orchestrator, dispatch, nightly-ops]
---

# Kanban 阻塞卡处置三分法（orchestrator）

blocked 卡先分类再动手。三分依据 = 产物实证 + crash 根因是否已消失，两问都要答。

## 第一步：定性（读证据，不猜）

0. **先盘全量再定性：blocked 清单必须同时查两个库**——中央根库 `~/.hermes/kanban.db`（`kanban_*` 工具与驾驶舱/SwarmStudio 的默认展示源）+ 旧布局 `boards/<slug>/kanban.db`。只扫一个库就宣布「全部处置完成」，用户面板上的 blocked 必然对不上，结论当场被证伪；两库视图差本身就是「kanban 上大量阻塞」误报的最常见来源。
1. `gave_up` 事件 payload 的 `"pid N not alive"` 只说明 worker 进程死了，**不代表任务本身有问题**。真实死因看 `task_runs.error` 原文——区分三类：供应商熔断窗（外部瞬态）/ 协议违规 rc=0 无 terminal call（工作可能已做完）/ 任务自身报错（真失败）。
2. **独立核验产物，不信卡面状态**：
   - 文件存在 + 有效性实测（PDF 用 pymupdf 数页数、读首页文本；register 用 grep 查对应条目的 status/resolved_fix 是否已回填）。
   - workspace_path 目录列内容：空目录 = 真未执行。
   - **验收标准也要实测**：卡面写的数量、版本或“已验证”不是证据；逐项构造能触发目标分支的 fixture/干跑，再读取结构化输出。没有命中目标规则的“无结果”只证明输入未触发，不证明机制正确。
3. 对照同期同类卡：故障时间窗之后同模板卡是否正常完成——是则根因（熔断窗等）已消失。

## 第二步：三分处置

| 判定 | 处置序列 |
|---|---|
| 产物已落盘 + 验收项已勾，仅缺完成调用 | `kanban_unblock` → 逐项核验 → `kanban_complete`(summary+metadata) → comment 留核验记录 |
| workspace 空、真未执行 + 根因已消失 | `kanban_unblock` → comment 留重派依据 → 等一个 dispatcher tick（60s）确认拾取（status→running + current_run_id + last_heartbeat_at 刷新） |
| 真未执行 + 根因仍在，或外部依赖不可解 | 归档，或 `kanban_block(kind="capability")`，comment 留终态依据 |
| **域 gateway 不在**（task_events 每分钟 `respawn_guarded` 且 reason=blocker_auth，域板无一卡在跑） | 归档 + 台账回开（gap_register `status=open` + `reopen_reason` 写解锁钥匙=域 gateway 拉起后重派 + 清 `kanban_task_id`）。不走 needs_input——无人为钥匙可补。修复序列见 `orchestrator-worker-failure-triage` 分类 6 |
| **外部资源依赖**（等用户给真机/账号/环境接入方式） | 维持 `kanban_block(kind="needs_input")` + comment 写明解锁钥匙（用户要提供什么、什么形态可用）。不重派不强推——外部资源没到位前重派必然回到 blocked |
| **授权门挂起**（安全域 dangerous operation 缺书面授权） | 维持 blocked + comment 复述门判定与解锁字段清单。安全门不因「推进压力/批量清阻塞」豁免；用户补齐授权字段后同操作重发即过 |
| **worker 已完成实质工作但被环境权限拦回写**（留言写明定案/产物已就绪、仅回写步被拦） | 先 no-op 写探测 orchestrator 自己的通道（对同一条目同值回写一次）——权限吊销按进程链生效，worker 被拦≠本会话被拦；通道通 → 独立验证引用产物后代为回写（三步定位法见 `worker-completion-independence-verification` §O），产物不可验证的条目回退原状态不代写 |
| **同族重复登记**（同一缺口多张 blocked 卡；夜间调研重复建卡是高发源，按标题精确匹配去重拦不住同义改写） | 合一：保留信息最全最新的一张走其对应处置（通常 unblock 重派），其余逐张 comment 写「被 <保留卡> 吸收」并点名各自独有增量已并入保留卡，再归档。禁逐张重派同族卡——每张各烧一轮预算产出同一份产物；保留卡 comment 里补去重判据（同缺口≠同标题）。**处置完顺手查登记侧防重是否失效**——夜间 `_register_llm_advice` 字面三层防重拦不住同义改写会持续产同族卡，根治手法（语义簇判定第四层 + 回归脚本）见 `nightly-radar-runbook`「gap 登记防重」节 |

根因仍在时禁止重派——重派只会再烧一轮重试预算回到 blocked，同一张卡反复 gave_up 会触发升级。

**用户令「完成所有阻塞任务」时的口径**：处置=每张卡有明确终态（done / 正当挂起+解锁路径留痕），不等于强行推平 blocked 数。正当挂起也是终态——把外部依赖卡和授权门卡强推成重派，只会烧预算回到原点；在 comment 里给用户留「补什么即自动续跑」的钥匙才是有效交付。

## Pitfalls

- **`kanban_complete` 不收 blocked 态**（报 unknown id or already terminal）——补完成前必须先 `kanban_unblock`。
- **`kanban_block` 也不收 blocked 态**（报 unknown id or not in running/ready）——给已 blocked 卡更新挂起理由用 `kanban_comment` 追加复核留痕即可，不要试图重新 block。
- **`kanban_heartbeat` 只对自己 claim 的 running 卡有效**：对派给 worker 的卡代打心跳报 "unknown id or not running"；worker 卡活性看 `last_heartbeat_at`，不代打。
- **task_events 里的 heartbeat 事件可能是 dispatcher 机械盖章，不是 worker 活性证明**：进程已死或僵在子进程链上的卡也会持续带上「新」心跳事件。判活性交叉两源——`ps` 实测 worker 进程链是否还在 + `last_heartbeat_at` 新鲜度，单看事件流会把死卡误判成在跑。
- **tasks 表无 `error` 列**：失败摘录在 `last_failure_error`，run 级完整错误在 `task_runs`（status/outcome/error/metadata）；评论表叫 `task_comments`（无 comments 表）——新库先 `.tables` 再写 JOIN，`2>/dev/null` 会把 no-such-table 变成静默空结果伪健康。
- 补完成的 complete 要带 `reason: work_done_but_completion_missing` 类 metadata，让下游知道这是代补而非原始执行。
- **worker 侧的权限故障不是全局事实**：外置卷/文件访问权限按进程链授权，worker 进程链被吊销时 orchestrator 自己的通道可能仍通——代回写前先跑一次 no-op 写探测，勿把 worker 的「Operation not permitted」直接升级成「需人工恢复权限」。
- **重派前用“当前实际态”重写卡面过期的验收数字**：时间窗之后舰队/产物可能再次漂移（如副本数变化、机制被回退），直接按旧数字派工，worker 会在错误目标上“完成”。重派 comment 里给出本次实测口径 + 实测命令，不用卡面旧数。
- **重派前先审计上次 run 的结论是否经得起独立复核**（尤其 orchestrator 曾打 [REJECT] 的卡）：上轮 worker 的侦察可能正确、其 staged 方案可能可行，但引用的旧验收结论可能本身未被真正触发过。逐项复核后才在 comment 里写“无需重做某项”。
- **重派动作前先读 task_events 的 `respawn_guarded` 事件**——它是 dispatcher 主动护挡的机器可读死因，见到即按 payload reason 定位依赖（blocker_auth=域 gateway 未运行），勿盲目 unblock 重派。
- **重定性/重派前先补「对位评论」再 unblock**：crash 根因已消（同期同板同 assignee 后续卡跑通即证）只回答「为什么死」，不回答「现在值不值得做、怎么做不重复」——comment 写清与既有落地产物的分工（谁给治理机制、谁给执行件）、建议落盘位置、执行顺序后再放行；裸 unblock 让 worker 拿旧语境重跑，极易与期间已落地的机制平行建设。
- **重定性 ready 的卡，新定级依据要可执行**：「升级为生产刚需」这类定级要落到具体的验收补充（落盘位置建议、与已有版本矩阵/台账的挂接、禁第三份副本），否则 worker 拿到的仍是旧 body 的旧口径——定级升了、验收没升 = 空翻案。
- **gave_up 波次按批处置，不逐张勘察**：同一时间窗、同一错误指纹（如清一色 `pid not alive`）的多张卡 = 单一共享根因的一次故障波；定性一次、恢复验证一次、整批 unblock。恢复序列见 `orchestrator-worker-failure-triage`「配额窗已自愈型 crash 波」；重派前过「树健康门」三探针（符号级 import + mtime 双采样 + watchdog 日志复核），勿凭恢复脚本日志宣布树已修好。

## 关联

- 检测与健康审计：`orchestrator-scheduling-audit`（blocked ≠ 僵尸判读、依赖链全景）。
- crash 根因分类与 worker 恢复：`kanban-crash-recovery`、`orchestrator-worker-failure-triage`。