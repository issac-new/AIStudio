---
name: agent-memory-curation
description: Curate, reconstruct, and retire agent memories safely.
version: 1.2.0
author: Hermes Agent
license: MIT
platforms: [macos, linux, windows]
metadata:
  hermes:
    tags: [memory, hindsight, curation]
---

# Agent Memory Curation

当任务涉及记忆写入、召回重构、失效处置或季度治理时加载本 skill。以下步骤是 `~/.hermes/profiles/_shared/03-evolution-memory/memory-governance.md` 的操作投影；该宪章是运行时权威来源，本 skill 不新增机制或存储。

## 1. 写入 SOP

1. 先做低成本价值门控：用户明确指令与硬约束优先，其次是可复用的任务状态、工具经验和失败原因；寒暄、重复和一次性细节不写。推断不得伪装成用户事实。
2. 先用 `memory` tool 写入每轮都要改变下一步行为的稳定操作事实；需要按需语义召回、带来源环境的情景事实时，用 `hindsight_retain`。两者边界参照 `memory-consolidation` 的 “MEMORY ↔ Hindsight boundary”。
3. 使用 `hindsight_retain` 时必须填写 `context`，至少包含适用条件、原始环境摘要和时间锚；新候选条目加 `memory:provisional`。高风险事实先求证或保留不确定性。机械约束：`metadata` 值必须全为字符串（数字/布尔直接 422），标签走独立 `tags` 字段不进 metadata；retain 成功≠立即可召回——语义索引对刚写入条目有秒级延迟，确认「已入库」走确定性端点 `GET /v1/default/banks/{bank}/memories/list?limit=N` 而非 recall；LLM 增强会为中文条目生成英文镜像文本，list 里成对出现是正常形态非重复污染。
4. 写入前检查重复、实体、时间与来源；同一事实不得因多轮复述无限复制。完成标准：候选已通过价值、来源、时间和重复检查。
5. 按以下冲突树只选一个动作：
   - 覆盖：最新且适用的用户指令替代旧值。
   - 合并：两条事实互补且边界不冲突。
   - 版本化：同一事实随状态变化，保留历史而不抹旧值。
   - 巩固：碎片已重复验证，才抽象为稳定规则；未验证不升格。
   来源可信度不足时不覆盖；偏好漂移等软冲突概率共存，降低活跃度而不强删。
6. 写入后记录可追溯的来源、环境和时间信息，作为日后重构的对照。完成标准：只使用已确认或明确标注不确定性的内容。
7. **预算满员时的补写降级路径**：`memory` 工具报「free at least N chars」时禁连续重试——写入是原子的，满员状态下同量级 replace 不产生净缩减、两个 replace 叠加只会净超限，重试以同一错误失败并烧掉本轮重试预算。正确路径：①同一批必须含真正的删除或缩短项，先算净差再发；②腾不出净差时，把条目以「可执行补写草稿」落持久文件（条目全文 + 替换目标的 old_text 原文），挂进任务收尾产物，下一会话首轮凭草稿一次补写成功。

   反例：满员时反复微调字数重试多次——每次都被同一原子校验拒绝，一条都没写成；应第一批就带删除项或落草稿待下轮。

   **下轮执行归档整理的完整顺序**（草稿已落持久文件时）：① 按类筛条目——已完成工作记录整条删，冗长条目压缩为「指针+核心」（全文已在 hindsight），带门禁/红线性质的条目只压缩不删；② 删前逐条 recall 验证目标条目确已归档（删前安全门：hindsight 里没有的不删）；③ 单个 `memory` 批次原子提交，批内必含净缩减项；④ 删后对归档项召回抽查，个别排序波动用 list 端点终判；⑤ 待办 note 更新为终态（「已完成+前后参数」），防下轮凭旧 note 重复执行。压缩取舍判据：保留改变下一步行动的锚（入口 id/路径/skill 名/命令），丢叙事细节。

反例：临时选择被固化成长期开关偏好，后来导致“偏好漂移”。它应保留为带时间和条件的候选，不能未经重复验证就巩固。

## 2. 召回后重构 SOP

1. 收到 `hindsight_recall` 结果后，先把问题转译为检索意图：主体、时间、任务阶段和约束；再对照每条记忆的原始条件与当前观测，不把相似度当作事实正确性。
2. 逐条标记 `保留`、`改编` 或 `抛弃`：跨场景通用原则保留；与当前环境冲突的实体、条件和步骤改编；完全失配则输出 `<EMPTY>`。
3. 只使用改编后的产物行动，不直接复制原始召回文本；召回失败时仅放宽意图或过滤一次，仍为空不得凭空补写历史事实。完成标准：每条被采用的记忆都有当前环境对照结论。

可直接复制的自查提示词：

> 将每条召回记忆与当前环境逐项对照：列出“记忆原始条件 vs 当前观测”；分别标记保留、改编或抛弃；只输出改编后的可行动结论；完全失配输出 `<EMPTY>`，不得用常识补齐缺失历史。

反例：机械复读式 AI 不存在中间加工环节，直接把过期步骤当作当前事实。必须先批判、重构，再行动。

## 3. 失效处置 SOP

1. 先降权：将疑似过期或失配条目标记 `memory:stale-suspect`，停止把它当有效证据，并保留备查。
2. 再归档（软退役）：调用 `terminal` 执行下列 PATCH；`{bank_id}` 与 `{memory_id}` 必须替换为已核实标识，不得猜测。
   `curl -X PATCH http://127.0.0.1:8888/v1/default/banks/{bank_id}/memories/{memory_id} -H 'Content-Type: application/json' -d '{"state":"invalidated","reason":"..."}'`
   恢复时将 body 改为 `{"state":"valid","reason":"..."}`。完成标准：返回结果已读回并确认状态符合预期。
3. 标签按语义使用：`memory:provisional` 表示未经复验候选；`memory:stale-suspect` 表示疑似过期/失配；`memory:retracted` 表示用户纠错或事实作废。`memory:retracted` 不替代 PATCH，实际退役仍走 `state=invalidated`。
4. 最后才删除：仅凭证、PII 或确认错误允许删除；删除前先用 `hindsight_retain` 保存事实与删除理由。默认不物理删除，以保留审计、回滚和历史查询能力。完成标准：已说明为何降权、归档或删除，且删除有存档记录。

反例：发现错误记忆就直接物理删除，失去审计和回滚。应先 `invalidated` 软退役；只有凭证、PII 或确认错误才进入删除级别。

## 4. 季度巡检

逐项运行并记录结果：

1. 记得下吗？
   `grep -R "memory:provisional" ~/.hermes/profiles/*/MEMORY.md`
2. 找得对吗？
   `curl -s http://127.0.0.1:8888/openapi.json | grep -E 'TagGroup|memories'`
3. 该忘的忘了吗？
   `grep -R "memory:stale-suspect\|invalidated" ~/.hermes/profiles/_shared/03-evolution-memory`
4. 长本事了吗？
   `sqlite3 ~/.hermes/state.db "select date(started_at),sum(input_tokens+output_tokens),sum(estimated_cost_usd) from sessions group by 1 order by 1 desc limit 4;"`

完成标准：四问均有命令输出或明确记录“未观测”；分别覆盖写入候选、过滤/召回/更新、失效治理，以及准确率与单位成本趋势。

## Related Skills

- `memory-consolidation`：MEMORY.md 与 Hindsight 的边界、批量整理和预算。
- `hindsight-fleet-operations`：多 profile Hindsight 可用性、共享 bank 与 daemon 运维。
- `hindsight-bank-strategy`：bank 隔离、共享模型与 bank_id 选择。
- `cognition-lattice`（references/orchestrator_integration.md §七/§七A）：关键决策的偏差检查与压力升级。
