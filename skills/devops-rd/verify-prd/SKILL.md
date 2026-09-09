---
name: verify-prd
description: 需求/PRD 输入质量验证——进入编码前的前置 fail-fast 检查
version: 1.0.0
platforms: [linux, macos]
metadata:
  hermes:
    tags: [research, prd, verify, fail-fast, quality-gate]
    related_skills: [verify-requirement, code-review, release-plan, worker-completion-independence-verification]
---

# /verify-prd — PRD 输入质量验证

> **对应文章命令**：`/rd:verify-prd`（原文 8 项必查清单）
> **触发**：researcher 接到 PRD / 需求文档 / 业务变更请求时
> **作用**：fail-fast——能在 PRD 阶段暴露的问题，不拖到 requirement；能在 requirement 阶段暴露的问题，不拖到编码

---

## 一、触发场景

当 worker-researcher 收到以下输入时，**必须先跑 verify-prd**：
- 新需求 PRD 文档
- 业务变更请求
- Bug 修复提案
- 跨 board 协同需求

**不触发**：纯查询 / 纯调研（不需要编码的）/ 已有充分验证的任务。

---

## 二、工作流

### 2.1 检查清单（8 项，全部机械可验证）

| # | 检查项 | 判定标准 | 结果标记 |
|---|---|---|---|
| 1 | 图片/截图有文本化说明？ | 所有图片有 alt text 或对应文字描述 | ✅/❌/N/A |
| 2 | 状态码是否明确？ | 业务状态码已定义（含枚举值） | ✅/❌/N/A |
| 3 | 上下游协议是否确认？ | 上游/下游接口文档已确认或已标记 blocked | ✅/❌/N/A |
| 4 | open item 是否会阻塞开发？ | 所有 open item 已分类（blocker / 可后置） | ✅/❌/N/A |
| 5 | 非目标（out-of-scope）是否写清楚？ | 明确哪些场景本需求不涉及 | ✅/❌/N/A |
| 6 | 验收标准是否可验证？ | 每个验收项是可机械验证的 | ✅/❌/N/A |
| 7 | 是否缺少关键字段说明？ | 新增字段/变更字段有明确说明 | ✅/❌/N/A |
| 8 | 是否存在和知识库已有结论冲突的地方？ | 与 `_shared/knowledge/` 现有 KB 无冲突 | ✅/❌/N/A |

### 2.2 输出

跑完 8 项检查后，生成 `verify-prd.md` 报告：

```markdown
# verify-prd 报告 — <任务/需求标题>

## 检查结果汇总

| 检查项 | 结果 | 详情 |
|---|---|---|
| 1. 图片文本化 | ✅ / ❌ | <具体说明> |
| 2. 状态码明确 | ✅ / ❌ | <具体说明> |
| 3. 上下游协议 | ✅ / ❌ | <具体说明> |
| 4. open item 分类 | ✅ / ❌ | <具体说明> |
| 5. 非目标清晰 | ✅ / ❌ | <具体说明> |
| 6. 验收标准可验证 | ✅ / ❌ | <具体说明> |
| 7. 关键字段完整 | ✅ / ❌ | <具体说明> |
| 8. KB 无冲突 | ✅ / ❌ | <具体说明> |

## 阻塞项汇总

<列出所有 ❌ 的项目及原因>

## 建议

<如果 PRD 不合格，给出具体修改建议；如果合格，建议进入下一步 /rd:work 或 /rd:clarify>
```

---

## 三、本 profile 视角适配（worker-researcher 专属）

> **为什么散落到 worker-researcher**：PRD 验证是"调研/分析"的前置质量门，而 researcher 是调研/分析的主力，由它负责 PRD 入口质量最合理。

### researcher 特有的判定标准

- **PRD 是否来自可靠来源**（业务方 / PM / 官方文档 vs. 口口相传）
- **是否已有对应历史 PRD**（避免重复做 / 不一致）
- **需求是否可复现**（能否在现有环境模拟）

### researcher 的工作流差异

```
1. 收到 PRD 输入
2. 跑本 skill 的 8 项检查
3. 输出 verify-prd 报告
4. 报告写入 kb 后 → 通知 orchestrator 下一步路由（work / clarify / analyze）
```

---

## 四、验证清单（自检）

跑完 verify-prd 后自检：

- [ ] 8 项检查全部跑了（非抽样）
- [ ] 每项有明确的 ✅/❌/N/A 标记（非"差不多"）
- [ ] 阻塞项已列出具体原因（非"有问题"模糊说法）
- [ ] 建议明确（"进入 work" / "进入 clarify" / "退回修改"）
- [ ] 报告已写入 `_shared/knowledge/candidate/`（如适用）

---

## 五、关联

- **上游**：`knowledge/ROUTING.md`（识别任务类型）
- **下游**：`/rd:work` / `/rd:clarify` / `/rd:analyze`
- **关联 skill**：`verify-requirement`（下一阶段）/ `code-review`（编码后）
- **关联 ontology**：`_shared/ontology.md §1.4 Finding` 对象模型

---

## 变更历史

| 版本 | 日期 | 变更内容 | 变更人 |
|---|---|---|---|
| 1 | 2026-08-25 | 初版（从 _shared/review-gates.md 抽出 + 文章 8 项检查清单对齐）| orchestrator |