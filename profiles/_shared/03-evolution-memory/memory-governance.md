# Memory Governance 宪章

版本：v1.0 | 适用层：运行时权威规则 | 机制细节与证据锚：`research/fusion-20260915-memory-cost/REPORT-memory.md`（本宪章不重复其正文，只定操作规则）

## 1. 分层映射（不新建层）

工作/情景/语义是治理映射，底层仍用现有会话上下文、MEMORY.md/SOUL、Hindsight bank 与 state.db，不新建任何存储。

| 逻辑层 | 集群等效物 | 写入边界 | 读取边界 |
|---|---|---|---|
| 工作记忆 | 当前会话/任务状态、state.db session | 记断点、工具结果、待确认项；临时猜测不升级 | 先取当前任务与会话，避免无谓长期召回 |
| 情景记忆 | Hindsight bank 带时间/来源/环境的事实 | 起步 `memory:provisional`；context 必填 | 先转译意图，再按 tags/时间/实体筛 |
| 语义记忆 | MEMORY.md/SOUL 稳定规则 | 仅重复验证或用户确认才固化 | 作稳定约束，不替代当前事实核验 |

## 2. 写侧门

判别成本不得高于记忆价值，大部分寒暄/重复/一次性细节不写。优先级：用户明确指令与硬约束 > 可复用任务状态、工具经验、失败原因 > 系统推断；推断不得伪装成用户事实。

retain 必填 `context`：适用条件 + 原始环境摘要 + 时间锚（对应 A1「抽取携带来源环境」、A2「原始环境是重构对照参照系」）。新条目打 `memory:provisional`。高风险事实先求证或保留不确定性。

冲突四种动作：覆盖（最新且适用的用户指令替代旧值）/ 合并（互补且边界不冲突）/ 版本化（同事实随状态变化留历史，不抹旧）/ 巩固（碎片被重复验证后抽象为规则，未验证不升格）。消解三判据：时效优先；来源可信度（用户指令 > 系统推断）；概率共存（偏好漂移等软冲突并列保留、调低活跃度，不强行删除）。

## 3. 读侧门

先把问题转译为检索意图（主体、时间、任务阶段、约束），再用 tag/时间/实体过滤后语义召回；TagGroup 支持 AND/OR/NOT。召回后禁止原样复用，强制「批判-重构」三步（worker 可执行提示词工序）：

1. 保留跨场景通用原则；
2. 按当前环境改写与约束冲突的实体、条件、步骤；
3. 完全失配输出 `<EMPTY>`，转纯自主推理。

原始环境必须随记忆保留，作为新旧对照。相似度不是事实正确性。检索失败四模式与处置：

| 模式 | 识别 | 处置 |
|---|---|---|
| 未召回 | 结果为空但问题需历史 | 说明未找到；仅放宽意图/过滤一次，仍空不得凭空补 |
| 噪声淹没 | 候选多、相关度低 | 收紧时间/主体/阶段并限候选数，留证据链 |
| 跨轮漏召 | 同任务断点未接上 | 读工作记忆与 session/task 关联恢复 |
| 幻觉污染 | 过期/不相关/错误记忆入推理 | 标 `memory:stale-suspect`，停止作有效证据，进软退役与审计 |

## 4. 遗忘阶梯（风险递增，可逆优先）

降权（降低检索优先级、保留备查）→ 归档（软退役，`state=invalidated`，可逆）→ 删除（仅凭证/PII/确认错误，删前先用 `hindsight_retain` 存档事实与理由）。默认不物理删除；审计、回滚、历史查询能力靠不真删换来。理念：允许犯错可回滚 > 追求一次不错。

## 5. 标签词表（定版）

- `memory:provisional`：写入即打，未经复验的候选事实。
- `memory:stale-suspect`：疑似过期/失配，检索时降权，待处置。
- `memory:retracted`：撤回语义（用户纠错或事实作废）；状态变更仍须走 `invalidated` 通道，标签只表语义。

## 6. 可追溯可撤回（收缩版 Git 治理）

不建记忆 VCS（单机 batch=1，全量版本树成本不可承受）。用 Hindsight 原生 endpoint 审计（daemon `127.0.0.1:8888`）：

- `GET /v1/default/banks/{bank}/memories/{id}/history`
- `GET /v1/default/banks/{bank}/audit-logs`
- `POST /v1/default/banks/{bank}/consolidate`
- `POST /v1/default/banks/{bank}/reflect`

软退役接口：`PATCH /v1/default/banks/{bank_id}/memories/{memory_id}`，body `{"state":"invalidated","reason":"..."}`；恢复 `{"state":"valid","reason":"..."}`。`invalidated` 排除 recall/consolidation、清理派生 observation 且可逆。

## 7. 季度巡检（4 问 + 可跑命令）

| 问题 | 命令 |
|---|---|
| 记得下吗？ | `grep -R "memory:provisional" ~/.hermes/profiles/*/MEMORY.md` |
| 找得对吗？ | `curl -s http://127.0.0.1:8888/openapi.json \| grep -E 'TagGroup\|memories'` |
| 该忘的忘了吗？ | `grep -R "memory:stale-suspect\|invalidated" ~/.hermes/profiles/_shared/03-evolution-memory` |
| 长本事了吗？ | `sqlite3 ~/.hermes/state.db "select date(started_at),sum(input_tokens+output_tokens),sum(estimated_cost_usd) from sessions group by 1 order by 1 desc limit 4;"` |

四问分别检查写入候选、过滤/召回/更新、失效治理、准确率与单位成本趋势。本轮不吸收：模型内生架构（冻结权重）、MemOS/Metis 内核、多模态记忆、跨组织共享网络/隐私分级、Sleep-time 训练、RL/GRPO 联合重构训练、记忆产品商业化——详见 REPORT 第 7 节。

## 8. 摘要记忆入库校验（S³Gym 融合，2026-10-04）

> 来源：字节 Seed S³Gym（arXiv:2608.31100，题录经 arXiv API 核对）：Summary Memory 路径实测会把**错误的自我评判固化成规则**造成性能下降；三条经验内化路径（原始轨迹 ICL/摘要记忆/参数训练）无万能最优解，效果依赖任务结构。裁决矩阵：`research/harness-fusion-20261004/FUSION-VERDICT.md` §3.1-A8。

**规则**：经验/教训类记忆经巩固（§2 冲突动作之「巩固」）升格或写入 SOUL/规则文件前，其自我评判结论必须带证据锚（与 evals X4 J1「judge verdict 必附理由与证据锚」同规）——**无证据锚的「教训」不得固化为跨会话规则**；判分代理自身未过对齐校验的评分，不得入库为「经验」。与 §2 写侧门的关系：本条是「巩固」动作的前置校验——固化规则时防把一次误判升级为永久约束。原始轨迹 vs 摘要的选择按任务结构判断（精确状态依赖→留轨迹锚；稳定策略→可摘要），无统一最优路径，禁默认摘要压缩。
