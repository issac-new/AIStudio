# SkillProposal: soul-protocol-block-insertion [patch]

> **落地状态**: ✅ 已落地 2026-08-25：patch 入 devops/soul-protocol-block-insertion v1.1.0——新增 Point A-bis（侦察摘要模板 + 机械校验 + 审计探针，基线执行率 13%）


> 产出： platform-skill-miner · 2026-08-25 · 基线挖掘 t_f4fd26da
> markings: [TLP:GREEN, EYES-ONLY:platform]

## 触发条件

对 `devops/soul-protocol-block-insertion` 的 patch 提议：该 skill 当前覆盖「把前线侦察步骤插入 SOUL.md」，但缺失**侦察结果的留痕机械执行点**——导致不同 worker 的侦察摘要格式不一、字段不齐、甚至侦察做了但没写 kanban_comment。本 patch 补充「## 前线侦察摘要 comment 模板 + 机械校验」段。

## 证据链

扫描窗口内「前线侦察摘要」comment 出现 7 次、跨 3 board，但格式与完整度参差：

| # | task_id | board | 观察 |
|---|---------|-------|------|
| 1 | t_25432cc9 | swarm | worker-coder 写侦察摘要（含现有能力基线+patch 目标文件实测行数）——**高质量范例**，但字段结构为即兴发挥 |
| 2 | t_70e1ff4c | swarm | orchestrator 写侦察摘要，且**诊断修正**：「6大问题中部分诊断过重——5/6 教师 SOUL.md 已有范式段」——侦察防止了过度修复，价值实证 |
| 3 | t_5c0dfbe8 | swarm | 同一任务出现 **3 个不同 author 的侦察摘要**（orchestrator / worker / 落地执行），格式各异、字段重叠——缺统一模板 |
| 4 | t_66d1140b | platform | platform-ontology-curator 侦察含**认知自检**（确认偏误/可用性启发/锚定逐条过）+ 实测 schema 断言（tasks 无 metadata 列）——高质量范例 |
| 5 | t_10e53b4b | [已移除] | [已移除] 侦察含**风险与约束**（不替代心理治疗、与 [已移除] 互补不重复）——领域特化字段 |
| 6 | t_6e88710d | [已移除] | [已移除] 侦察含**教材备课参考**（人教版美术一上 20 课清单）——领域特化字段 |
| 7 | t_944ea2b0 | [已移除] | [已移除] 侦察含 **🔴 关键情报：年龄修正**（任务卡写 5.5 岁但 child-profile.md 已修正为 6.5 岁）——侦察发现任务书本身过时，防止了按错误参数设计 |

**频率**: 7 / 53（跨 swarm/platform/[已移除] 三 board，多 profile：worker-coder/orchestrator/platform-ontology-curator/[已移除]/[已移除]）

**对照证据（缺失侧）**: t_a257ada7 解剖④实测——R3 staged-action-proposal 前置规则执行率仅 ~10%（46 任务/50 run 中仅 5 条 comment 含该标记），说明协议类规则若无机械执行点+模板，落地率极差。前线侦察摘要执行率（7/53≈13%）处于同一量级，印证「有协议无模板=低执行率」。

## 四段式内容（patch 到 soul-protocol-block-insertion 的新增段）

### 1. 触发条件 → 具体信号

- 已向 SOUL.md 插入前线侦察步骤后，需要保证侦察**结果**落到 kanban_comment 而非只在 worker 脑中
- 审计发现侦察摘要 comment 格式不一/字段缺失/多 author 重复侦察同一任务时
- 新 profile 入网配置前线侦察协议时（与 ontology-contract-injector 协同）

### 2. 标准步骤（patch 新增内容）

1. **统一 comment 模板**（插入 SOUL 的同时把模板写入）：
   ```markdown
   ## 前线侦察摘要
   **任务目标**: <一句话复述>
   **上游交接物**: <parent task 的 artifacts/findings，或"无">
   **本地现状**: <实测文件/schema/行数，禁自述>
   **历史经验**: <session_search/hindsight 结果>
   **适用 skill**: <已加载 skill 名>
   **关键情报**: <任务书与现实的出入，如年龄修正/诊断过重>  # 可选但高价值
   **风险与约束**: <边界声明>
   **执行计划**: <编号步骤>
   ```
2. **机械校验点**（写进 SOUL 执行检查清单）：
   - 开工后第一个 kanban_comment 必须含 `## 前线侦察摘要` 标题
   - 摘要至少含 8 字段中的 5 个
   - 「本地现状」字段必须含至少 1 个实测值（行数/schema/文件大小），禁纯定性描述
3. **多 author 场景纪律**：后续 author 的侦察摘要必须引用前者（`在 <author> 侦察基础上补充/修正`），禁平行重开
4. **审计探针**（季度回归用）：
   ```bash
   sqlite3 "file:~/.hermes/kanban/boards/<board>/kanban.db?immutable=1" \
     "SELECT count(DISTINCT task_id) FROM task_comments WHERE body LIKE '%前线侦察摘要%';"
   # 对照同期 done 任务数得执行率
   ```

### 3. 陷阱

- **模板过严会杀死领域特化字段**：[已移除] 的「教材参考」「年龄修正」、platform 的「认知自检」都是模板外的高价值字段——模板是最小集不是全集，明确写「字段可增不可减（少于 5 个核心字段才算违规）」
- **侦察摘要不等于侦察行为**：t_a257ada7 证明无机械校验的协议执行率 ~10%——但即使写了 comment 也要抽查「本地现状」是否真为实测（防「自述式侦察」）
- **不要追溯性补写**：侦察摘要的时间价值在「开工前」，事后补写的摘要无防错功能（t_944ea2b0 的年龄修正只有在设计前发现才有意义）

### 4. 验证（如何机械验证 patch 生效）

- 抽查新完成任务：首个 comment 含 `## 前线侦察摘要` 且 ≥5 核心字段
- 执行率从基线 13%（7/53）在下个扫描窗口可测量提升
- 至少 1 个「关键情报」类修正被摘要捕获（证明摘要不是形式主义）

## 与既有 skill 关系

- **patch `devops/soul-protocol-block-insertion`**：在其「Insertion 内容清单」新增「前线侦察摘要 comment 模板段」，在其「验证」段新增执行率审计探针
- 与 `ontology-contract-injector` 协同：新 profile 入网时两者应同批注入
- 与 `prompt-rule-enforcement` 互补：后者解决「规则被遗忘」的三层强化，本 patch 解决「规则无统一输出格式」

## 预期收益

- 统一 7+ profile 的侦察输出格式，使下游（orchestrator 验收/审计/skill-miner 挖掘）可机械解析
- 把「关键情报」字段制度化：t_944ea2b0（年龄修正）、t_70e1ff4c（诊断过重修正）类高价值发现从偶发变成可预期
- 为执行率回归提供可测量基线（当前 13%）
