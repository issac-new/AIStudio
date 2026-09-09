---
name: verify-requirement
description: 应用级 requirement 开发契约验证——编码前的 fail-fast 检查
version: 1.0.0
platforms: [linux, macos]
metadata:
  hermes:
    tags: [coding, requirement, verify, fail-fast, quality-gate]
    related_skills: [verify-prd, code-review, release-plan, worker-completion-independence-verification]
---

# /verify-requirement — 应用级 requirement 开发契约验证

> **对应文章命令**：`/rd:verify-requirement`（原文"编码前开发契约确认"）
> **触发**：coder 接到应用级 requirement（kanban body 或 Markdown 文件）准备开始编码时
> **作用**：fail-fast——能在 requirement 阶段暴露的问题，不拖到编码

---

## 一、触发场景

当 worker-coder 收到以下输入时，**必须先跑 verify-requirement**：
- kanban 任务 body 含编码要求
- 应用级 `requirement.md` 文件
- 修复任务的 issue 描述
- 跨 board 编码子任务

**不触发**：纯代码阅读 / 一次性脚本 / 不需要测试的小修改。

---

## 二、工作流

### 2.1 检查清单（10 项，全部机械可验证）

| # | 检查项 | 判定标准 | 结果标记 |
|---|---|---|---|
| 1 | 当前应用的目标是什么？ | requirement.md 里有明确的目标描述 | ✅/❌/N/A |
| 2 | 非目标（out-of-scope）是什么？ | 明确哪些场景不涉及 | ✅/❌/N/A |
| 3 | 影响哪些接口/消息/状态/字段/规则？ | 明确列出影响的 ontology 对象 | ✅/❌/N/A |
| 4 | 应该读哪些知识文件？ | 明确列出 applications/<app>/ 下的知识入口 | ✅/❌/N/A |
| 5 | 应该看哪些代码入口？ | 明确列出代码仓库路径/模块/函数 | ✅/❌/N/A |
| 6 | 哪些校验要前置？ | 明确哪些逻辑必须在编码前验证 | ✅/❌/N/A |
| 7 | 哪些逻辑是异步？ | 明确异步逻辑的边界和触发条件 | ✅/❌/N/A |
| 8 | 哪些能力要兼容历史？ | 明确历史兼容逻辑和演进路径 | ✅/❌/N/A |
| 9 | 哪些问题仍然 blocked？ | 明确所有 blocked 项及原因 | ✅/❌/N/A |
| 10 | 验收标准是否可执行？ | 每个验收项是可机械验证的 | ✅/❌/N/A |

### 2.2 ontology 字段对照

> **本 profile 特有的机械校验**：对照 `_shared/ontology.md` 确认字段名无误。

```bash
# 检查 requirement 中提到的字段是否在 ontology 中定义
grep -r "<field_name>" ~/.hermes/profiles/_shared/ontology.md

# 检查 marking 是否在允许列表
# TLP:CLEAR / TLP:GREEN / TLP:AMBER / TLP:RED / PII / EYES-ONLY
```

### 2.3 输出

生成 `verify-requirement.md` 报告：

```markdown
# verify-requirement 报告 — <任务标题>

## 检查结果汇总

| 检查项 | 结果 | 详情 |
|---|---|---|
| 1. 目标明确 | ✅ / ❌ | <具体说明> |
| 2. 非目标清晰 | ✅ / ❌ | <具体说明> |
| 3. 影响范围明确 | ✅ / ❌ | <具体说明> |
| 4. 知识入口明确 | ✅ / ❌ | <具体说明> |
| 5. 代码入口明确 | ✅ / ❌ | <具体说明> |
| 6. 前置校验明确 | ✅ / ❌ | <具体说明> |
| 7. 异步边界明确 | ✅ / ❌ | <具体说明> |
| 8. 历史兼容明确 | ✅ / ❌ | <具体说明> |
| 9. blocked 项清晰 | ✅ / ❌ | <具体说明> |
| 10. 验收标准可执行 | ✅ / ❌ | <具体说明> |

## ontology 字段对照

| 字段 | ontology 定义 | 本任务使用 | 匹配 |
|---|---|---|---|
| <field> | <ontology 定义> | <实际使用> | ✅/❌ |

## 阻塞项汇总

<列出所有 ❌ 的项目及原因>

## 建议

<如果 requirement 不合格，给出具体修改建议；如果合格，建议进入编码阶段>
```

---

## 三、本 profile 视角适配（worker-coder 专属）

> **为什么散落到 worker-coder**：requirement 验证是"编码"的前置质量门，而 coder 是编码主力，由它负责编码入口质量最合理。

### coder 特有的判定标准

- **代码入口是否可达**（路径是否存在 / 是否可读）
- **测试覆盖要求**（是否有单测 / 集成测试要求）
- **历史兼容路径**（是否需要保持向后兼容）

### coder 的工作流差异

```
1. 收到 requirement.md / kanban body
2. 跑本 skill 的 10 项检查 + ontology 字段对照
3. 输出 verify-requirement 报告
4. 报告写入 kb 后 → 开始编码 → 编码完成跑 code-review
```

---

## 四、验证清单（自检）

跑完 verify-requirement 后自检：

- [ ] 10 项检查全部跑了（非抽样）
- [ ] ontology 字段对照完成（每个字段有匹配结果）
- [ ] 每项有明确的 ✅/❌/N/A 标记（非"差不多"）
- [ ] 阻塞项已列出具体原因（非"有问题"模糊说法）
- [ ] 建议明确（"开始编码" / "退回修改" / "需要 clarification"）
- [ ] 报告已写入 `_shared/knowledge/candidate/`（如适用）

---

## 五、关联

- **上游**：`/rd:work` / `/rd:clarify` / `/rd:analyze` / `verify-prd`
- **下游**：`/rd:apply`（编码）→ `/rd:validate`（对账）→ `code-review`
- **关联 skill**：`code-review`（编码后）/ `release-plan`（发布前）
- **关联 ontology**：`_shared/ontology.md §1.1 Task` 对象模型

---

## 变更历史

| 版本 | 日期 | 变更内容 | 变更人 |
|---|---|---|---|
| 1 | 2026-08-25 | 初版（从 _shared/output-contract.md 验收标准冻结 + 文章 10 项检查清单对齐）| orchestrator |