# 输出与验收契约（L2 合并版）

> 本文件由 F6 结构归并产生（2026-08-25），合并以下来源：
> `output-contract.md`（主体）+ `verification-checklist.md`（§二验证清单）+ `dod-checklist.md`（`workspace/AGENTS.md` 项目级 DoD 引用）+ `task-contract-guard.md` 契约守卫段
> 层级定位：L2 输出与验收——kanban_complete 前的输出契约、验证清单、完成定义与任务契约守卫。
> 原则：不改语义，只做结构化归并；原各文件的来源标注保留在对应章节内。

---

## 一、输出契约（原 output-contract.md）

> **无评论不完成（真实事故驱动）**：`kanban_complete` 前必须先发 `kanban_comment`，
> 包含四段——`## 变更`（changed_files 绝对路径）、`## 验证`（真实命令+真实输出摘要+环境版本）、
> `## 实现方式`（含 ACP session_id 若有）、`## 决策与 follow-up`。
> 评论中引用的任务 ID/卡片/文件，引用前必须验证其存在（`kanban_show` / `ls`）——
> 幻觉引用会触发看板守卫并打回完成。看板历史上 51% 的完成任务零交接评论，
> 下游和根协调者只能拿到 result 摘要、被迫翻工作区。

### 1.1 标准模板

```python
# 结构化 handoff 先进评论（供 reviewer/tester 直接读）
kanban_comment(body=(
    "## 变更\n- changed_files: [src/x.py, tests/test_x.py]\n"
    "## 验证\n- tests: 8 passed / 0 failed (pytest 7.4, python 3.11)\n"
    "## 实现方式\n- ACP session: ses_xxx（3 轮迭代）\n"
    "## 决策与 follow-up\n- 选 A 方案而非 B，理由：…；follow-up：浮点用例"
), task_id="<本任务id>")

# 再完成
kanban_complete(
    summary="实现了模块A核心功能，8 个单元测试全绿，已请 reviewer 审查。",
    metadata={
        "files_changed": ["src/x.py", "tests/test_x.py"],
        "tests_written": 8, "tests_passed": 8,
        "language": "python", "framework": "pytest",
        "acp_sessions": [session_id],
        "verification": {  # Shadow 模式（2026-08-21 起，覆盖率≥80%后转强制）
            "syntax": "pass|skip|n/a",
            "test": "pass|skip|n/a",
            "lint": "pass|skip|n/a",
            "build": "pass|skip|n/a",
            "evidence_strength": "present|wired|exercised",
            "observability_gates": "ready|partial|n/a"
        },
    },
    created_cards=[],   # 若你派生了子任务，填 kanban_create 返回的 id
)
```

### 1.2 Intervention 字段（治理动作类任务追加）

当任务本身是**治理干预**（规则补齐/skill 演进/流程修复）时，在 kanban_comment 追加 4 字段（详见 `_shared/03-evolution-memory/review-gates.md` 干预台账章）：

```python
kanban_comment(body=(
    "## Intervention\n"
    "- intervention: 补齐 22 个 SOUL.md 的 verification-checklist 引用\n"
    "- outcome: improving\n"           # pending|improving|unchanged|regressing|outcome-supported
    "- evidenceRef: research/soul-rules-audit-20260821.txt\n"
    "- owner: orchestrator"
), task_id="<本任务id>")
```

### 1.3 Decision 字段（G3，重大技术/架构决策追加）

当任务产出包含**重大决策**（技术选型/架构决策/优先级判定）时，在 kanban_comment 追加 Decision 结构化模板（对应 ontology.md 的 Decision 对象，同一性标准 = decided_by+topic+decided_at 三元组）：

```python
kanban_comment(body=(
    "## Decision\n"
    "- topic: 任务卡执行引擎选型\n"
    "- choice: 方案 A（kanban + dispatcher）\n"
    "- alternatives: [方案 B（纯 delegate_task）, 方案 C（消息队列）]\n"
    "- rationale: 已有 kanban 基础设施 + 状态机完整；B 缺持久化；C 过重\n"
    "- decided_by: orchestrator\n"
    "- decided_at: 2026-08-21T21:00:00+08:00\n"
    "- based_on: [research/xxx-comparison.md（已 ls 验证存在）]"
), task_id="<本任务id>")
```

**强制规则**：`based_on` 引用的文件必须先 `ls` 验证存在（蓝军门 4）；决策改向用 `supersedes: <旧 Decision 的 topic+decided_at>` 表达，不删除旧决策。

### 1.4 统一报告契约（Better Harness 融合 P2-2）

> 来源：QoderAI Better Harness `templates/reporting/report-structure.md:17-24`（5 节骨架），**Hermes 本地化改造版**——源骨架为 Project Overview/Harness Dimensions/Issue Findings/Next Recommendations/Notes And Method，此处按 Hermes 报告受众重排为 Executive Summary/Findings/Recommendations/Methodology/Appendix
> 适用：所有报告类产出（调研报告/审计报告/评审报告/融合方案）

#### 报告 5 节骨架

```markdown
# <标题>

## 1. Executive Summary
（≤200 字核心结论，一眼看完）

## 2. Findings
（按 severity 排序：critical → major → minor；每条带 evidence + owner + 边界）

## 3. Recommendations
（每条带 track 标签 bootstrap|optimize + 验收标准 + 优先级 P0/P1/P2）

## 4. Methodology
（数据来源 + 工具调用次数 + 时间窗口 + 复现命令）

## 5. Appendix
（file:line 索引 / SQL 查询 / 原始数据 / 参考文档链接）
```

#### 风格层（参照 templates/style/）

按报告受众选择风格（风格 id 不出现在可见文本）：

| 风格 | 适用场景 | 特点 |
|---|---|---|
| `engineering-diagnosis` | 技术审计/故障分析 | 重证据链、file:line、复现步骤 |
| `executive-dashboard` | 管理层汇报 | 重结论、趋势图、ROI |
| `audit-scorecard` | 合规审计 | 重评分、达标/不达标、整改清单 |
| `transformation-playbook` | 融合/迁移方案 | 重路线图、分阶段、风险评估 |

#### 报告质量门

- [ ] Executive Summary ≤200 字，能独立成立
- [ ] 每条 Finding 有 evidence（file:line 或命令输出）
- [ ] 每条 Recommendation 有验收标准（怎么算"做完了"）
- [ ] Methodology 可复现（给出具体命令）
- [ ] Appendix 有完整索引（非"详见上文"）
- [ ] **重型多轮任务必含「已验证行为 / 未验证遗留」两节**（HoH 融合 A+E 双状态，2026-09-04）：多轮推进的重型任务（hack 攻击面验证、[已移除] 签核链、跨阶段编码）合并报告必须显式区分「已验证行为（Verified，附验证证据锚点）」与「未验证遗留（Gap，附未验证原因）」——下游任务依据此节规划，不用靠猜重建哪些结论可信

### 1.5 技能路由决策（HarnessEval 融合 P0-5）

> 来源：MirroS HarnessEval `pipeline/planner.py:159-171`（selected_skills + skipped_skills schema）+ `protocols.py:62-69`（SKILL_SPECS 反例约束）
> 适用：`kanban_create` 时记录技能路由决策，确保"为什么启用/跳过某 skill"可追溯

#### kanban_create 模板新增段

```markdown
## 技能路由决策
- 启用 skill: [已移除]
  - reason: 家长需要完整教案/活动方案
  - parameters: {subject: "chinese", grade: "1"}
  - 反例约束: 不适用于简单知识问答（仅完整教案场景）
- 跳过 skill: mom-feedback-coaching
  - reason: 本次任务不涉及家长反馈话术
- 执行 profile: [已移除]
```

#### 四要素

| 要素 | 必填 | 说明 |
|---|---|---|
| `skill` | 是 | 技能名称（与 skills/ 目录下的目录名一致） |
| `reason` | 是 | 启用/跳过的具体理由（case-grounded） |
| `parameters` | 否 | 技能参数（如有） |
| `反例约束` | 否 | 什么情况下**不**应使用该技能（防误路由） |

#### 评测无关性保证

技能路由决策**只依赖任务内容，不依赖将被分配的 worker**。orchestrator 在 kanban_create 时完成路由决策，worker 执行时按决策加载 skill。

### 1.6 review-required 路径

> 注意：需要 reviewer 把关的代码变更，**优先 `kanban_block(reason="review-required: …")`** 而非直接
> `kanban_complete`（平台协议有此条）。除非任务卡明确说"无需审查"，否则走 review-required。

---

## 二、验证清单（原 verification-checklist.md）

> ACP 委托编码后必须逐项过完才能 `kanban_complete`。不信任 agent 输出，要亲自查证。

### 2.1 核心检查项（不可省略）

1. **文件存在**：`ls <文件路径>` 确认 changed_files 每条都真实存在（不是空字符串、不是路径幻觉）
2. **语法检查**：Python → `python -m py_compile <file>` / TS → `tsc --noEmit` / Shell → `bash -n`
3. **类型检查**：mypy / pyright（如果项目有 type hints）
4. **单元测试**：`pytest -v` 或对应框架，全绿才能算完
5. **linter**：`ruff check` / `eslint` / 项目规定的 linter
6. **构建**：`npm run build` / `make build` / 项目规定的 build 命令
7. **ACP session_id 验证**：如果用了 acp_send，session_id 必须真实（从 acp_sessions 输出取）

### 2.2 代码审查纪律项（不可省略）

8. **没有越界改动** — `git status` / `git diff`，确认只动了任务范围内文件，无顺手重构
9. **无密钥泄漏** — diff 里没有硬编码 secret、没有把 `.env` 加进去
10. **符合验收标准** — 逐条对照 body 里的验收项打勾

### 2.3 领域特定检查项

- **代码类 worker**：必须跑完整 test suite，不接受"我改了 X 但没跑测试"
- **[已移除] 类**：必须跑 [已移除] 脚本 + 核验 S 参数曲线/眼图/PDN 阻抗在物理上合理
- **Hack 类**：必须交叉校验 3 源（ASN+DNS+证书），至少 3 个独立来源确认
- **研究类**：必须三角验证 + 标注时效 + 列取舍依据
- **[已移除] 类**：必须验证教案是否符合年龄段（参考 child-profile.md）

### 2.4 反模式

- ❌ "我看了 agent 输出，觉得没问题" → 没跑就是没跑
- ❌ "测试在另一个 PR 跑了" → 不在本任务就是没跑
- ❌ "看起来对" → 没有 `ls` / `python -m py_compile` / 测试输出 = 没验证
- ❌ 跳过 linter / build step 节省时间 → 历史教训：省 1 分钟炸 1 小时

### 2.5 扩展：证据强度评分上限表（Better Harness 融合 P1-5）

> 来源：QoderAI Better Harness `models/agent-work-loop.md:110-124`
> 原则：**配置存在 ≠ 被使用 ≠ 改善结果**

kanban_complete 前，对当前任务的验证证据强度自评：

| 最高证据 | 绝对分数上限 | 判定标准 | 自检问题 |
|---|---|---|---|
| Missing / Unobserved / N/A | 59 | 机制不存在或未观测 | 我是否真的跑了验证，还是"假设它会工作"？ |
| Present | 74 | 机制存在但未接线 | 工具/脚本存在，但我真的用了吗？ |
| Wired | 84 | 机制已接线可用 | 验证步骤是否已集成到工作流？ |
| Exercised | 94 | 机制被使用且留有结果 | 本次任务是否实际执行了验证？ |
| Outcome-supported | 100 | 可比后续结果支持效果 | 之前的验证是否带来了可量化的改进？ |

**自评 ≤74 分 → 不应 kanban_complete，先补齐证据。**

### 2.6 扩展：可观测性六门（Better Harness 融合 P1-5）

> 来源：QoderAI Better Harness `models/agent-work-loop.md:394-408`
> 适用：变更验证维度的深度检查

验证一个变更是否"可观测"，需过六门：

| 门 | 判定 | 检查项 |
|---|---|---|
| **Discoverable** | 可发现 | 变更是否能被找到？（git log / kanban 记录 / 文件路径） |
| **Runnable** | 可运行 | 验证命令是否可执行？（pytest / linter / build 能跑） |
| **Readable** | 可读 | 验证结果是否人类可读？（非二进制乱码/非空输出） |
| **Correlatable** | 可关联 | 验证结果能否关联到具体变更？（哪个 commit 触发了哪个测试） |
| **Verifiable** | 可验证 | 验证结果是否有预期标准？（全绿 = pass，有失败 = fail） |
| **Safe-reversible** | 安全可逆 | 变更是否可回滚？（git revert / 配置回退 / 无破坏性副作用） |

**判级**：
- **Ready**：六门全过
- **Partial**：缺 1-2 门（标注缺哪门）
- **Blocked**：缺 3+ 门（需补齐后才能 complete）
- **N/A**：纯查询/问答任务（无变更）

### 2.7 扩展：修复链完整性（Better Harness 融合 P1-5）

> 来源：QoderAI Better Harness `models/agent-work-loop.md:360-369`
> 铁律：**"A retry pass without diagnosis is not repair evidence"**

发现 bug/测试失败时，修复必须走完整链：

```
failure → reproduction → diagnosis → bounded repair → validate-again
```

- **failure**：记录失败现象（测试输出/错误日志）
- **reproduction**：确认可复现（非偶发/非环境问题）
- **diagnosis**：定位根因（不是"试试改这里"而是"因为 X 导致 Y"）
- **bounded repair**：最小修复（只改必要部分，不顺手重构）
- **validate-again**：修复后复验（重跑测试确认通过）

**跳过任何一步 → 修复证据无效。**

---

## 三、完成定义清单（原 dod-checklist.md）

> 来源：Hermes × Better Harness 融合 P1-2；与 workspace 根目录 `AGENTS.md` 互补
> 适用：所有 worker 在 `kanban_complete` 前逐项自检
> 版本：v1.0（2026-08-21）

### 3.1 核心原则

**"看起来完成" ≠ "真实完成"**。kanban_complete 前必须逐项打勾，不接受"我觉得没问题"。

参照 Better Harness 证据强度分级：**配置存在 ≠ 被使用 ≠ 改善结果**。

### 3.2 第一层：通用项（所有任务必须过）

#### 1. 产出物真实性
- [ ] `ls <每个 changed_file>` 确认文件真实存在（非空、非路径幻觉）
- [ ] 文件内容非空且非占位符（无 TODO/FIXME 遗留，除非显式声明）

#### 2. 范围边界
- [ ] `git status` / `git diff` 确认只动了任务范围内文件
- [ ] 无顺手重构、无关格式化、drive-by 修改
- [ ] 如任务要求"只调研不开发"，确认没有写实现代码

#### 3. 安全与隐私
- [ ] diff 中无硬编码 secret / API key / token
- [ ] 未将 `.env` / 凭据文件加入版本控制
- [ ] 未在输出中暴露完整 session_id / 绝对路径（[已移除] 域额外：无孩子 PII）

#### 4. 验收标准对齐
- [ ] 逐条对照 kanban body 的验收项打勾（不接受"大致符合"）
- [ ] 如验收项不清晰，先 `kanban_comment` 澄清，而非自行解释

### 3.3 第二层：领域特定项

#### 编码类新增（2026-08-22，融合自 AI-Native SDLC Playbook L1254/L1262）

- [ ] **bug 修复任务失败测试先行**：先写复现测试 → 确认按预期原因失败 → 提交该测试 → 才修绿。"先于修复存在且 agent 改不动的测试才是 bug 已除的证明"
- [ ] **验证证据不可自削弱**：修复任务中如需改动测试/验证文件，必须在 plan.md 或 kanban_comment 声明理由——"修代码的 agent 不得能削弱对该代码的检查"（单人集群以声明义务等效 hook 拦截）

#### 重型任务开工项（2026-08-22，B1 丙案）

- [ ] **事故/返工类任务**：完成前产物中必须含回流卡 id（`[incident-reflux]` 前缀，parents 指向事故卡）——postmortem 不回流 = Loop 未闭合，不予验收（2026-08-27，来源 Playbook Maintain）
- [ ] 重型任务（triage=True）worker 开工时在工作区落 `plan.md`，四节结构：**Files that change / Order of work / Risks / Proof**（来源 Playbook L820-850）。实现偏离计划时同 commit 更新 plan.md；完成时 Proof 节并入 kanban_comment 验证段

#### 编码类（worker-coder / ops-devops / [已移除]）
- [ ] 语法检查通过（`python -m py_compile` / `tsc --noEmit` / `bash -n`）
- [ ] 类型检查通过（如项目有 type hints）
- [ ] 单元测试全绿（`pytest -v` 或对应框架）
- [ ] linter 通过（`ruff check` / `eslint`）
- [ ] 构建成功（`npm run build` / `make build`）
- [ ] ACP session_id 真实（从 `acp_sessions` 输出取）

#### 研究/调研类（worker-researcher / product-researcher）
- [ ] 每个关键数字/结论有 file:line 或 URL 锚点
- [ ] 无编造数据（不输出"看起来合理"但无来源的数字）
- [ ] 关键结论至少 2 个独立来源确认
- [ ] 数据获取时间 + 数据时间窗口已标注

#### 安全/渗透类（hack 团队）
- [ ] 关键发现至少 3 个独立来源交叉确认（ASN + DNS + 证书透明度）
- [ ] severity 有依据（critical/major/minor 分级明确）
- [ ] 复现步骤可执行（提供验证命令）
- [ ] 测试边界显式声明

#### 教学/内容类（[已移除] 团队）
- [ ] 年龄适配已验证（参考 `child-profile.md` 动态计算）
- [ ] 反馈话术符合关系导向（禁"你不笨"→ 转"需要练习"）
- [ ] 过程性反馈具体可观察（非泛泛表扬）
- [ ] 妈妈可直接使用（务实、去学院腔）

#### 运维/事件类（ops 团队）
- [ ] 回滚预案明确（可逆性分级：容易/可逆/不可逆）
- [ ] 影响面评估完成（blast radius 明确）
- [ ] 监控/告警已确认覆盖
- [ ] runbook/playbook 已同步更新

#### 5. 资产盘点（Asset Review 三分法，FDE 融合 P1-B，2026-08-25）

重型任务（triage 或文件写入 ≥3）kanban_complete 前，对产出做一次三分盘点，结论写进 kanban_comment：

- [ ] **任务专属**：一次性脚本/临时页面/客户(任务)特定适配 → 留在 worktree，无需动作
- [ ] **可复用模式**：某操作序列在本任务第 N 次出现（N≥2 即可标记）→ 在 comment 里标注 `reusable_pattern: <一句话描述>`，供 platform-skill-miner 周度挖掘（frequency≥3 成提案）
- [ ] **通用规则**：发现现有 _shared 规则缺失/错误 → kanban_comment 提议，由 orchestrator 裁决后 patch，worker 不直接改 _shared

轻量任务（工具调用 ≤2 且无文件写入）豁免。

#### 6. 失败模式标签（kanban_block / kanban_request_changes 时，FDE 融合 P1-C，2026-08-25）

任务非成功收尾时，`kanban_block` / `kanban_request_changes` 的 reason 必须以四类标签之一开头，供月度失败模式统计反哺 routing 与 skill 修补：

| 标签 | 含义 | 示例 |
|---|---|---|
| `[context-gap]` | 上下文/信息缺失（语义层空白、缺凭据、上游交接不足） | `[context-gap] 缺少生产 DB 只读账号` |
| `[tool-failure]` | 工具/环境失败（网络、安装失败、外部服务 5xx） | `[tool-failure] npm registry 403` |
| `[routing-error]` | 路由/分派错误（任务派错 profile、缺前置依赖卡） | `[routing-error] 需要 [已移除] 领域知识但派给了 worker-coder` |
| `[capability-gap]` | 能力缺口（没有对应 skill/工具，任务本身可做但集群暂不具备） | `[capability-gap] 无 PDF 扫描件 OCR 能力` |

标签后接一两句具体说明。轻量任务豁免。orchestrator 月度汇总四类分布 → 分布异常时修 routing 规则或补 skill。

**打标范围扩展（提案3, 2026-09-07）**：除 block/request_changes 外，以下失败收尾路径同样适用——worker 收尾契约中 `outcome!=completed` 的 run（crashed/timed_out/gave_up 自知时）、orchestrator 验收打回（`[REJECT:<FM模式>]` 双标签：四标签之一 + FM 编号）。**验收抽查**：orchestrator 抽查新失败 run 的打标情况，覆盖率进 `acceptance_routing_metrics.py` 月报（首月目标 ≥30%，现状 0%）。打标的控制论意义：失败不打标=无记忆随机控制（金书§1.4-1.5，已证伪状态不被排除→同类失败必然复发）。

### 3.4 第三层：交接质量项

- [ ] `kanban_complete` 的 `summary` 是人类可读的 1-3 句（非"完成了任务"）
- [ ] `metadata` 包含 `changed_files` 列表（绝对路径）
- [ ] 如有后续工作，已 `kanban_create` 子任务（而非自己 scope-creep）
- [ ] 如有产物文件，已列入 `artifacts=[...]`（而非只放 metadata）

### 3.5 证据强度自评（参照 Better Harness 评分上限表）

kanban_complete 前自评当前任务的证据强度（表同 §2.5，此处不重复）。

**自评 ≤74 分 → 不应 kanban_complete，先补齐证据。**

### 3.6 反模式（常见"假完成"信号）

- ❌ "我看了 agent 输出，觉得没问题" → 没跑就是没跑
- ❌ "测试在另一个 PR 跑了" → 不在本任务就是没跑
- ❌ "看起来对" → 没有 `ls` / `py_compile` / 测试输出 = 没验证
- ❌ 跳过 linter / build 节省时间 → 历史教训：省 1 分钟炸 1 小时
- ❌ "大致完成了" → 验收标准逐条打勾，不接受模糊

---

## 四、任务契约守卫协议（原 task-contract-guard.md 契约守卫段）

> 来源：LongHorizon-Harness（arXiv:2608.01964，AMAP-ML，MIT）MEA 循环融合，2026-08-16。
> 源码验证：`manager.py` / `prompt_texts.py` / `auditor_agent.py` / `claude_permissions.py`。
> 定位：**任务卡与验收的语义层防线**——防止"任务被改写成更容易完成的替代目标"与"看起来完成了"。
> 适用范围：所有 team 的重型任务（kanban_create 时写契约；kanban_complete 前跑反查）。

### 4.0 一页速览

```
写卡时（orchestrator）: 12 项契约 checklist → 任务卡 body
执行时（worker）:       状态标记 completed/pending/blocked/untrusted + 证据引用
验收时（reviewer）:     三行控制头 + 验收约束反查 + 工作区快照 diff
完成门:                三行控制头全部合格才允许 kanban_complete
```

### 4.1 任务契约 12 项 Checklist（kanban_create 时）

把原始用户请求落成**真实可执行、可验证的目标状态**。契约是跨轮稳定的语义锚点，不是执行计划，更不允许把任务改写成更容易完成的替代目标（"简化版""只做前端""先做个 demo"都是契约违规）。

| # | 项 | 必须写清 |
|---|---|------|
| 1 | 目标解释校准 | 原始请求的精确对象/文件名/字段/账户/路径/时间/格式/应用位置/用户角色/素材来源/交付物形态，逐项保留 |
| 2 | 已验证环境事实 | 第 1 轮的桌面/文件/网页/应用/服务事实标"待验证"，只有审计者或直接环境证据确认后才可写"已验证" |
| 3 | 待验证假设列表 | 保持显式列表，未确认前标"待验证"，禁止把假设混入事实 |
| 4 | 最终成功状态 | 用户/目标应用/下游流程会**真实消费**的状态形态 |
| 5 | 验收约束 | 逐条写：原题依据、必须成立的条件、验证方式、阻断条件。计划/模型猜测/更容易的替代目标**不是**验收约束 |
| 6 | 状态载体 | 完成落在哪个真实载体：保存的应用状态/数据库/工程文件/导出文件/服务状态/目标文件 |
| 7 | 权威输入闭包 | 任务给定文件/邮件/网页/用户回答等关键输入的明确来源；缺失→澄清或 blocker，禁止发明相似输入/默认值/替代素材 |
| 8 | 状态产生流程 | 关键状态由真实应用操作/官方 API/正常文件编辑/用户确认产生；禁止伪造完成标记、手写替代文件 |
| 9 | 提交/持久化边界 | Save/Submit/Export/Send/Finish 类任务，"字段已填/预览正确/草稿 ready/文件已打开"≠完成；必须确认真实持久化 |
| 10 | 候选污染边界 | 存在旧文件/错误导出/草稿/多 tab 等候选时，必须证明被消费的是正确候选；错误候选需真实流程清理/覆盖/失效 |
| 11 | 可接受证据 | 什么算证据（测试输出/构建退出码/file:line/数据库行/真实应用截图） |
| 12 | 不可接受捷径 | 明令禁止的路径（例：直接 patch 状态、伪造日志、手写"完成"文件、绕过应用工作流） |

**限制词入约束**：原始请求中的"不要改变/保持不变/只使用/必须保存/同一目录/精确文件名/不要遗漏/不要多做/其它部分不变"必须进入验收约束；放宽只能放宽实际修饰的部分，不能吞掉另一个独立硬约束。

**第一轮纪律**：契约初版可根据请求写目标假设，但环境事实必须标"待验证"。

### 4.2 最终状态语义守卫 5 条（验收时）

1. **最终状态载体**：完成必须落在用户/目标应用/下游流程会真实消费的状态载体上（保存的应用状态、profile/session、数据库、工程文件、导出文件、服务状态、目标文件）。自然语言声明、过程截图、临时日志、手写替代文件**不能**替代最终状态。
2. **权威输入闭包**：关键输入必须来自真实环境或明确来源。缺失/冲突/不足→澄清、恢复或报 blocker；不能发明相似输入、默认值、替代素材。
3. **状态产生流程**：关键状态由真实应用操作、官方 API/CLI、正常文件编辑、服务配置或用户确认产生；不能伪造应用完成标记、直接 patch 只有应用流程才应产生的状态。
4. **提交/持久化边界**：涉及 Save/Submit/Apply/Export/Send/Finish、创建记录、配置生效或文件写出的任务，不能停在"字段已填、预览正确、草稿 ready、文件已打开"；必须确认真实持久化发生。
5. **候选污染**：存在旧文件、错误导出、草稿、旧记录、多个 tab/origin/session、相似路径或多个候选产物时，必须确认最终被消费的是正确候选；错误候选应被真实流程清理、覆盖、撤回、失效，或证明不会被消费。

### 4.3 验收约束反查协议（reviewer 完成门）

> 核心立场：**不默认任务契约正确**。审计前先从原始任务独立重建并挑战验收约束。

reviewer 输出必须包含 `验收约束反查:` 段，含：

1. `契约结论:` aligned / needs_revision / invalid / unknown —— 只有 aligned 允许 complete
2. `原题约束清单:` 至少覆盖最终消费者/状态载体、权威输入、候选选择、字段值、文件/路径/附件、保存/提交/持久化、格式/样式/精确文本/单位/精度、不能改变/不能遗漏/不能多做、非目标保持、禁止捷径
3. `契约覆盖检查:` 指出遗漏、弱化、写歪或矛盾
4. `逐项反查:` 每条约束写：约束内容、原题依据、是否 blocking、独立证据、verified / unknown / violated / not_applicable。**契约自述和 worker 自述不是独立证据**
5. `阻断约束:` 列出所有 blocking 且 unknown/violated 的约束，没有则写"无"
6. `可能评分风险:`、`过窄或错误解释:`、`建议契约修订:`

裁决规则（机械）：
- 任何 blocking unknown → 契约结论 unknown
- 任何 blocking violated → needs_revision 或 invalid
- 存在阻断约束或契约结论 ≠ aligned → 即使局部子任务成功也必须输出 incomplete

### 4.4 证据时间范围规则（防审计膨胀）

> 目的：审计要严，但**严在正确的时间维度上**，不能把审计变成不可能任务。

| 规则 | 内容 |
|---|---|
| 约束分三类 | 持久化最终状态约束 / 可观察过程约束 / 安全合规来源约束，分别校准证据范围 |
| 不得加强措辞 | "最终不要留下额外文件"不能被加强成"必须证明历史上从未发生任何临时动作" |
| 缺轨迹≠篡改 | 缺少 worker 完整命令记录**本身不是**篡改证据，不能单独导致 integrity suspect；只有正面矛盾、来源冲突、伪造证据、意外产物或禁用动作的直接证据才用 suspect/violation |
| 不可观察的历史否定 | 默认非阻断残余风险；只有原题明确要求该过程保证或契约执行前安排了权威监控时才可设 blocking |
| 禁追溯性重复执行 | 不得仅为证明"历史上未发生"而要求重复执行；过程证据重要→建议前置监控，否则独立验证当前持久化状态 |
| 审计者自加要求无效 | reviewer/manager 自行增加、但无法从原题推出的谨慎要求，不能制造新的 blocking 条件 |

### 4.5 三行控制头协议（reviewer 输出格式）

reviewer 验收报告**前三行必须严格是**（缺头=harness 拒绝解析，不接受正文补救）：

```
状态: complete | incomplete | blocked
完整性: clean | suspect | violation
契约审计: aligned | unknown | needs_revision | invalid
```

裁决矩阵（机械，无 LLM 判断）：
- `状态: complete` 且 `完整性: clean` 且 `契约审计: aligned` → 允许 kanban_complete
- `完整性: violation` 或 `契约审计 ≠ aligned` 时报 complete → **强制降级 incomplete**（`auditor_agent.py:279` 同款逻辑）
- 缺前三行控制头 → harness 注入合成报告（`_invalid_control_header_report`，控制头为 blocked/suspect/unknown），按 unknown 处理
- `状态: blocked` → `kanban_block(kind="needs_input")`
- `状态: blocked` 且原因是能力不足 → `kanban_block(kind="capability")`

### 4.5b 轮次预算规则（manager/orchestrator）

只剩 1 轮（或 1 次机会）时：
- 禁止安排纯前置子任务（"先做个准备步骤，正事下轮再说"）
- 必须路由当前可完成的**最完整可执行子任务**
- 无法诚实完成时用 ask / blocked，禁止为了用完预算而编排凑数轮次

### 4.5c GUI/CLI 路由判据（orchestrator）

| 判据 | 路由 |
|---|---|
| 真实屏幕/窗口/页面/鼠标键盘/可见状态变化 | GUI executor（computer_use） |
| shell/文件/代码/测试/日志/数据/服务/非视觉诊断 | CLI executor（terminal/code） |
| **工具不是路由边界** | 判断依据是"状态变化的类型"，不是"哪个工具顺手" |

GUI 失败且指向服务/数据/代码/profile/日志/回调约束 → 下一轮优先 CLI 诊断/修复前置。

### 4.6 Hermes 集成映射

| 集成点 | 用法 |
|---|---|
| `kanban_create` | 重型任务 body 按 §4.1、§4.2 写契约（可引用本文件而不全文粘贴） |
| worker 执行中 | `Current task state:` 段维护 completed/pending/blocked/untrusted 四态 + 证据引用（file:line / 测试输出 / kanban comment id） |
| `kanban_complete` 前 | reviewer 按 §4.3 跑反查 + 按 §4.5 出三行控制头 |
| `adversarial-review-lens` | lens 输出加挂三行控制头 + 反查段 |
| `pua-harness-governance` | 四权分离中"评分权"的证据标准 = §4.2 守卫 |
| `workspace_audit.py` | 审查任务跑快照 diff，机械检测 added/changed/deleted/type_changed |
| `delegation-brief-format` | 七要素模板升级：`## 任务` 段 = 12 项契约的 6 项核心精简版 |

### 4.7 源码出处（溯源）

| 机制 | 文件:行 |
|---|---|
| 契约规则正文 | lh_harness/prompt_texts.py TASK_CONTRACT_RULES（en/zh 全文） |
| 最终状态守卫 | lh_harness/prompt_texts.py FINAL_STATE_SEMANTIC_GUARD |
| 反查协议 | lh_harness/prompt_texts.py AUDITOR_CONTRACT_BACKCHECK |
| 三行控制头解析 | lh_harness/auditor_agent.py:22-44 正则 + :279 强制降级 |
| 轮次预算规则 | lh_harness/role_prompts.py build_role_manager_prompt |
| GUI/CLI 路由判据 | lh_harness/prompt_texts.py MANAGER_INSTRUCTIONS 第4条 |
| 工作区快照 diff | lh_harness/adapters/claude_permissions.py:120-195 |

---

## SOUL 内单行引用

```
输出与验收契约（详见 _shared/03-evolution-memory/output-contract.md）：kanban_complete 前必先 kanban_comment（四段），验证清单 7 项 + 证据强度自评（≤74 分不 complete）+ 完成定义三层 + 任务契约守卫。
```


---

## 附录：绘图规则（原 chart-rules.md，2026-08-25 F6 并入）

> 本文件是所有 Hermes agent profile 的共享绘图工具规则。
> 修改本文件全集群自动生效（每个 SOUL.md 末尾引用 `output-contract.md`）。

---

## 🟡 提示性纪律：绘图工具优先级（依赖 worker 自律；无工具层 fail-closed）

### 1. 交互式 / Web 图表（首选）

| 优先级 | 工具 | 适用场景 | 输出格式 |
|--------|------|----------|----------|
| **P0** | **ECharts** | 柱状图/折线图/饼图/散点图/地图/关系图/树图/仪表盘/富交互图表 | HTML（含 echarts.min.js CDN） |
| **P0** | **AntV** | 关系图(G6)/地理图(L7)/矩形树图/桑基图/图分析 | HTML（含 antv CDN） |
| P1 | Vega/Vega-Lite | 声明式数据可视化（markdown-viewer skill 已内置） | Markdown 嵌入 |
| P2 | Mermaid | 流程图/时序图/类图/Gantt/简单架构图 | Markdown 代码块 |
| P2 | PlantUML | UML 类图/组件图/部署图（markdown-viewer skill 已内置） | Markdown 嵌入 |

### 2. 静态 / 文档图表

| 优先级 | 工具 | 适用场景 | 输出格式 |
|--------|------|----------|----------|
| P1 | matplotlib + seaborn | 科学论文/学术论文/统计图（需精确控制 LaTeX 标注） | PNG/PDF/SVG |
| P1 | graphviz | 依赖图/调用图/AST/DAG（命令行 dot） | PNG/SVG |
| P2 | d2lang | 声明式架构图（比 graphviz 更简洁） | PNG/SVG |

### 3. 决策流程

```
用户要求绘图
    ├─ 交互式/Web 场景？
    │   ├─ 关系图/图分析/地理图 → AntV (G6/L7)
    │   ├─ 标准数据图表 → ECharts
    │   └─ 声明式/Markdown 内嵌 → Vega-Lite
    ├─ UML/架构图？
    │   ├─ 简单流程 → Mermaid
    │   └─ 正式 UML → PlantUML
    └─ 科学/静态？
        ├─ 统计/论文 → matplotlib + seaborn
        └─ 依赖/DAG → graphviz
```

### 4. 规则

1. **默认首选 ECharts 和 AntV**——除非场景明确需要 UML/科学论文/声明式 Markdown。
2. **ECharts 模板**：生成独立 HTML 文件，内含 `<script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"></script>`，`<div id="chart">` + `echarts.init()`。文件存到 `workspace/` 或 `/tmp/`。
3. **AntV 模板**：G6 用 `https://gw.alipayobjects.com/os/lib/antv/g6/4.x/dist/g6.min.js`，L7 用对应 CDN。
4. **不生成 base64 内联图片**——输出 HTML 文件路径，用户用浏览器打开。
5. **数据驱动**：图表数据从真实工具调用获取（terminal/read_file/search_files），不编造数据。
6. **中文优先**：图表标题/轴标签/图例默认中文（除非用户明确要求英文）。

---

## 🟡 提示性纪律：A4 页面适配与视觉布局（依赖 worker 自律；无工具层 fail-closed）

### 5. A4 画布约束

所有图表**必须适配 A4 纸面**（210mm × 297mm），确保打印 / PDF 导出时不溢出、不裁切、不空洞。

| 参数 | 值 | 说明 |
|------|-----|------|
| **A4 横向画布** | 1123px × 794px | @96dpi，含 10mm 安全边距 |
| **A4 纵向画布** | 794px × 1123px | @96dpi，含 10mm 安全边距 |
| **安全内容区** | 1054px × 724px（横向）/ 724px × 1054px（纵向） | 四边各留 35px (≈10mm) |
| **最小字号** | 11px | 任何文字不得低于此值 |
| **标题字号** | 16-20px | 主标题 18-20px，副标题 14-16px |
| **正文字号** | 12-13px | 轴标签/图例/数据标签 |
| **最小元素间距** | 8px | 元素之间不重叠、不挤压 |

### 6. 尺寸选择决策

```
数据系列数 / 图表类型 → 选择画布方向
    ├─ ≤3 系列 + 柱状/饼图 → A4 纵向（高度 > 宽度）
    ├─ ≥4 系列 或 时间序列 → A4 横向（宽度 > 高度）
    ├─ 关系图/网络图 → A4 横向（充分利用宽度）
    ├─ 单一 KPI / 指标卡 → A4 纵向，占 1/2 或 1/3 页
    └─ 多图组合仪表盘 → A4 横向，grid 布局
```

### 7. 布局设计规则

1. **画布尺寸固定**：HTML 容器 `width: 1123px; height: 794px;`（横向）或 `794px × 1123px`（纵向），不使用 `width: 100%`。ECharts `init` 时传入固定尺寸。
2. **安全边距**：容器内 `padding: 35px`，图表实际绘制区 = 安全内容区。
3. **字号自适应**：根据数据密度调整字号，但不得低于 11px 下限。
   - 数据点 ≤20：轴标签 13px，数据标签 12px
   - 数据点 21-50：轴标签 12px，数据标签 11px
   - 数据点 >50：隐藏数据标签，轴标签 11px，开启 `dataZoom` 缩放
4. **图例位置**：图例放右侧或底部，宽度 ≤150px，不挤压主图区。
5. **多图组合**：用 CSS Grid（非 flex）布局，每个子图固定宽高，间距 12px。
6. **颜色对比度**：文字与背景对比度 ≥4.5:1（WCAG AA）。深色背景用浅色文字。
7. **避免空旷**：图表如果数据少导致大片空白，缩小画布或增加注释/说明文字填充。
8. **避免拥挤**：图表如果数据多导致重叠，增大画布或拆分为多个子图。

### 8. ECharts A4 模板

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>图表标题</title>
<script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"></script>
<style>
  @page { size: A4; margin: 10mm; }
  body { margin: 0; padding: 0; font-family: "PingFang SC", "Microsoft YaHei", sans-serif; }
  .page { width: 1123px; height: 794px; padding: 35px; box-sizing: border-box; }
  .title { font-size: 20px; font-weight: bold; margin-bottom: 8px; text-align: center; }
  .subtitle { font-size: 14px; color: #666; margin-bottom: 16px; text-align: center; }
  #chart { width: 1054px; height: 654px; }
  .footer { font-size: 11px; color: #999; margin-top: 8px; text-align: right; }
</style>
</head>
<body>
<div class="page">
  <div class="title">图表标题</div>
  <div class="subtitle">副标题 / 数据来源说明</div>
  <div id="chart"></div>
  <div class="footer">生成时间：2026-08-03 | 数据来源：xxx</div>
</div>
<script>
  const chart = echarts.init(document.getElementById('chart'), null, {
    width: 1054, height: 654
  });
  const option = {
    textStyle: { fontFamily: "PingFang SC", fontSize: 12 },
    title: { show: false },  // 标题已在 HTML 中
    grid: { left: 60, right: 30, top: 20, bottom: 40 },
    xAxis: { axisLabel: { fontSize: 12 } },
    yAxis: { axisLabel: { fontSize: 12 } },
    legend: { right: 10, top: 'middle', width: 120, textStyle: { fontSize: 12 } },
    tooltip: { trigger: 'axis', textStyle: { fontSize: 12 } },
    series: [
      // 数据从真实工具调用获取，不编造
    ]
  };
  chart.setOption(option);
</script>
</body>
</html>
```
