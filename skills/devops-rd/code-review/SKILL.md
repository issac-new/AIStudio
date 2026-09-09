---
name: code-review
description: 编码后质量检查——基于 review-gates.md Diamond 7 门的机械验证（硬门 1/3/4/7）
version: 1.0.0
platforms: [linux, macos]
metadata:
  hermes:
    tags: [coding, review, quality-gate, diamond, verification]
    related_skills: [verify-requirement, release-plan, worker-completion-independence-verification]
---

# /code-review — 编码后质量检查

> **对应文章命令**：`/rd:code-review`（原文"发布前代码质量和方案一致性确认"）
> **触发**：coder 完成编码后、kanban_request_review 前
> **作用**：fail-fast——编码后发现问题，不拖到发布

---

## 一、触发场景

当 worker-coder 完成编码后，**必须先跑 code-review**：
- 新功能实现完成
- Bug 修复完成
- 重构完成
- 跨 board 编码任务完成

**不触发**：纯文档修改 / 一次性脚本 / 配置调整。

---

## 二、工作流

## 第 0 门：意图对齐（Intent Alignment，2026-08-27 增补，来源 AI Native SDLC Playbook Deploy 阶段）

> 先对意图，再看代码。功能写得再漂亮，跑偏了也是打回。

- [ ] 读任务卡 body 的 acceptance_criteria（即 intent 等价物；有 `_shared/templates/intent.md` 产物的优先读 intent.md）
- [ ] 逐条判定本次 diff：**覆盖 / 部分覆盖 / 超出**（超出=做了没要求的事，等同打回信号）
- [ ] 有 spec.md 的任务：对照 spec 的 Behavior/Blast Radius 节验证功能未跑偏
- [ ] 判定行必须出现在审查输出：`Gate0: intent 对齐 = 覆盖 N/N，超出 X 处`
- [ ] 任何一条 acceptance 未覆盖，或存在超出项 → 打回（不进入后续 1-7 门）

### 2.1 Diamond 7 道质量门（基于 `_shared/review-gates.md §一`，2026-08-25 修正）

> ⚠️ **修正**：原写"6 门/硬门 1/2/3/4"有误。实际为 **7 门**，硬门是 **1/3/4/7**。

| 门 | 名称 | 检查项 | 判定标准 | 硬门 |
|---|---|---|---|---|
| 1 | **Eligibility** | 代码是否符合任务范围？ | 只动了任务范围内文件，无顺手重构 | ✅ |
| 2 | **Consistency** | 代码是否与 requirement 一致？ | 每个 requirement 项有对应实现 | ❌ |
| 3 | **Privacy** | 是否有 secret / PII 泄漏？ | diff 无硬编码 secret / token / PII | ✅ |
| 4 | **Asset** | 产物是否完整？ | 代码 + 测试 + 文档 + 配置完整 | ✅ |
| 5 | **Candidate-promotion** | 是否可被复用？ | 代码有清晰的接口和文档 | ❌ |
| 6 | **Repair-prompt** | 是否可修复？ | 问题有明确的修复路径 | ❌ |
| 7 | **Blind Analysis** | 是否先盲推期望再对照证据？ | 先独立分析再对比，避免锚定 | ✅ |

> **硬门（✅）**：门 1/3/4/7 必须通过才能进入下一步；软门（❌）允许有例外但需说明理由。

### 2.1b 双轴内容审查（Standards + Spec，融合自 mattpocock/skills code-review，2026-09-02）

> 7 门是**门禁**（过/不过），双轴是**内容审查**（发现质量问题）。门禁通过后，对 diff 追加两轴并行审查：
>
> - **Standards 轴**：代码是否符合 repo 文档化规范 + Fowler smell 基线（Mysterious Name / Duplicated Code / Feature Envy / Data Clumps / Primitive Obsession / Repeated Switches / Shotgun Surgery / Divergent Change / Speculative Generality / Message Chains / Middle Man / Refused Bequest）。repo 规范覆盖基线；smell 永远是 judgement call 非硬违规
> - **Spec 轴**：diff 是否忠实实现任务 body 的 acceptance criteria——缺漏 / scope creep / 看似实现但实现存疑，每条引用验收标准原文
>
> 两轴各自独立运行（delegate_task 并行子代理，或两轮独立上下文），结果分区呈现 `## Standards` / `## Spec`，**不合并不跨轴排序**——分区呈现正是为了防止一轴掩盖另一轴。方法详见 `software-development/code-review-two-axis` skill。

### 2.1c 论证谬误检查门 + 先判据后结论格式互证（2026-09-08 增补，知识底座融合 C1/C9）

> 两项都是评审输出的**内容审查**（发现质量问题，非门禁），结果并入双轴产出区呈现。

**论证谬误快筛**——对 review 意见、worker 抗辩、多模型合成结论各过三条：
- [ ] **诉诸权威**：结论是否仅靠「某权威/某文档这么说」支撑而无实测证据？
- [ ] **滑坡**：是否从单点问题推出无中介的灾难链（「不改 X 必然导致 Y 崩」）？
- [ ] **假两难**：是否把方案空间压缩成二选一，遗漏了第三路径？
>
> 来源: synthesis-fusion-plan.md C1 / philosophy-logic-report.md §2.2 S12/S13/S14（Copi《逻辑学导论》谬误识别清单 formal+informal，15 版 70 年迭代三源一致；只取检查框架，不引入逻辑学内容）

**先判据后结论（格式互证）**——报告中每个 ❌/打回判定，必须先列判定要点（判据）再给结论；只有结论没有判据的条目退回重写。与 `codex-guardian-review` 的「先判据后结论」输出格式互证。
>
> 来源: synthesis-fusion-plan.md C9 / physics-3books-report.md ⑥（机工社官方编排特色 3「关键点及全部解答的详细步骤」原文，cmpedu.com/books/book/59932.htm，查询 2026-09-07）

### 2.2 具体检查命令

```bash
# 门 1: Eligibility（只动任务范围内文件）
git diff --name-only | sort

# 门 2: Consistency（requirement 对照）
grep -E "TODO|FIXME|XXX" <changed_files>

# 门 3: Privacy（secret 泄漏）
git diff | grep -iE "api_key|token|password|secret|\.env"

# 门 4: Asset（产物完整性）
ls -la <changed_files>

# 门 7: Blind Analysis（先盲推期望再对照实际）
# 不看 worker diff，先按任务 body 写出期望的文件清单/行为，再与 git diff 对比
git diff --name-only | sort > /tmp/actual_files.txt
# 与期望清单 diff，标记差异并解释：是 worker 偏离预期，还是预期本身有误？
```

### 2.3 输出

生成 `code-review.md` 报告：

```markdown
# code-review 报告 — <任务标题>

## Diamond 7 门检查结果

| 门 | 名称 | 结果 | 详情 |
|---|---|---|---|
| 1 | Eligibility | ✅ / ❌ | <具体说明> |
| 2 | Consistency | ✅ / ❌ | <具体说明> |
| 3 | Privacy | ✅ / ❌ | <具体说明> |
| 4 | Asset | ✅ / ❌ | <具体说明> |
| 5 | Candidate-promotion | ✅ / ❌ | <具体说明> |
| 6 | Repair-prompt | ✅ / ❌ | <具体说明> |
| 7 | Blind Analysis | ✅ / ❌ | <期望 vs 实际差异> |

## 具体问题

<列出所有 ❌ 的项目及原因>

## 修复建议

<每个问题的具体修复路径>

## 是否可进入下一步

- [ ] 硬门（1/3/4/7）全部通过 → 可进入 kanban_request_review
- [ ] 软门（2/5/6）有例外 → 需在 kanban_comment 说明理由
```

---

## 三、本 profile 视角适配（worker-coder 专属）

> **为什么散落到 worker-coder**：code-review 是编码后的质量门，coder 是编码主力，由它负责编码出口质量最合理。

### coder 特有的判定标准

- **测试覆盖率**（是否有足够的单测 / 集成测试）
- **代码风格一致性**（是否符合项目现有风格）
- **性能影响**（是否有明显的性能退化）

### coder 的工作流差异

```
1. 编码完成
2. 跑本 skill 的 Diamond 7 门检查
3. 输出 code-review 报告
4. 硬门全部通过 → kanban_request_review
5. 硬门有 ❌ → 修复后重跑
```

---

## 四、验证清单（自检）

跑完 code-review 后自检：

- [ ] Diamond 7 门全部跑了（非抽样）
- [ ] 硬门（1/3/4/7）全部通过（如有 ❌ 需修复）
- [ ] 软门（2/5/6）有例外时已在 kanban_comment 说明
- [ ] 每个问题有具体的修复路径（非"需要改"模糊说法）
- [ ] 报告已写入 `_shared/knowledge/candidate/`（如适用）

---

## 五、关联

- **上游**：`verify-requirement`（编码前）/ `/rd:apply`（编码）
- **下游**：`kanban_request_review` → `release-plan`（发布前）
- **关联 skill**：`worker-completion-independence-verification`（不信任自报）
- **关联 ontology**：`_shared/ontology.md §1.2 Artifact` 对象模型

---

## 变更历史

| 版本 | 日期 | 变更内容 | 变更人 |
|---|---|---|---|
| 1 | 2026-08-25 | 初版（从 _shared/review-gates.md Diamond 6 门抽出）| orchestrator |
| 2 | 2026-08-25 | 修正门编号：6 门→7 门，硬门 1/2/3/4→1/3/4/7（补 Blind Analysis），同步 description/报告模板/自检清单 | orchestrator |
| 2.1 | 2026-09-02 | 增补 §2.1b 双轴内容审查（Standards+Spec，融合自 mattpocock/skills code-review） | orchestrator |
| 2.2 | 2026-09-08 | 增补 §2.1c 论证谬误检查门（C1）+先判据后结论格式互证（C9），知识底座融合 P0 批 | worker-coder |
