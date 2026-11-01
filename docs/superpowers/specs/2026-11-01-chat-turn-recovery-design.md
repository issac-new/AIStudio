# chat 回合自恢复（agent 主动性产品能力）——立项与设计定稿（2026-10-31 用户指令「务必落地到产品能力」）

日期：2026-11-01（凌晨值守中立项） ｜ 状态：designed（代码批待完整窗口落地） ｜ 类型：feat（hermes-agent 网关/回合生命周期）

## 触发与三现场实据

用户指令（2026-10-31 晚）：「Agent 员工要有主动性，不能死等着别人催干活——务必落地到产品能力」。run24 同夜三次现场实证同一缺口：

1. **22:08 全供应商熔断**：mei 等 agent 回合被打断后 61 分钟静止，靠值守单步令恢复；
2. **23:49 后系分段集体静默**：消息驱动无输入不动，靠驱动催办+人工桥接恢复；
3. **03:06-03:11 devimpl 编码中断**：chen API 失败死回合、xiao/hu 33 分钟静止、两工作区在途计时器冻结 13 分钟，靠单步令恢复（$WieO）。

## 缺口定谳

现有回合恢复（`agent/kanban_turn_recovery.py` 的 `recover_failed_kanban_turns`，gateway/session_kanban.py:366 接线）只保护「看板卡工作回合」（`kanban_turn_recovery_enabled` 要求 task_id 非空）。**群/DM 消息派发的回合（推演派单主战场）异常终态后无任何自恢复面**——回合死即静止，等外部催。mei 板卡实测为空（消息派发无卡），全链不受保护。

## 设计（已定稿，代码批实现）

1. **判定扩展**（kanban_turn_recovery.py 或新模块 chat_turn_recovery.py）：
   - `chat_turn_recovery_enabled()`：env `HERMES_CHAT_TURN_RECOVERY`（缺省=kanban 同值 3；0/off 禁用；clamp [0,10]）；
   - `should_recover_chat_turn(result, attempt)`：终态=API 失败类（error_classifier 判定）+attempt<预算。
2. **恢复 prompt**（无卡版）：复用 kanban 模板骨架改写——「上一回合因服务中断未完成（recovery N/M）。同会话上下文完整。请检查你手头任务与未交付产物，从中断处继续完成，完成后按任务原要求回执。」（弱化版：无卡上下文，防错指任务）。
3. **接线位**：gateway 回合终态分发处（platforms/base.py 会话回合 settled 分支）——kanban 路径已接 recover_failed_kanban_turns 的同层，为非 kanban 会话接 chat 版；预算按会话累计、退避沿用 RECOVERY_DELAYS_SECONDS。
4. **防风暴**：同会话预算共享（耗尽即弃，终态如实）；恢复回合自身失败计同预算；禁在恢复 prompt 中制造新任务（只续做）。

## 决策记录

| # | 决策 | 理由 |
|---|---|---|
| D1 | 代码批不在值守深夜仓促落 | 网关回合生命周期为核心链路，改坏影响全部 agent；设计已锁死、实据三件在案，完整批=patches+守门测试+注入重放，需清醒窗口 |
| D2 | 恢复=续做指令注入而非自动重跑回合 | 与 kanban 版同构（同会话+提示续做）；自动重跑整个回合=重复副作用风险 |
| D3 | 与既有催办体系边界 | 驱动催办=外部兜底（15min 级）；本能力=回合级自愈（秒级退避）；两者叠加不冲突（催办到达时回合多半已自愈） |

## 验证（代码批时）

- 单测：判定/prompt/预算耗尽/防风暴四例（对齐 test_kanban_turn_recovery.py 形态）；
- 注入重放零失败；run24 收官后下轮（run25）起生效，首验=下轮无「熔断后集体静默需人工唤醒」形态。

## 设计文档影响

DESIGN_SYNC: touched——方案正本 §4.3 纪律 85-89 族的自愈底座从「外部催办」升「回合自愈+外部兜底」双层；代码批落地时同批修订纪律表述。
