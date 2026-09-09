---
name: rd-process-export
description: RD 过程产物导出——把 kanban 重型任务自动导出为 Markdown 套件（rd/archive/{task_id}/）
version: 1.0.0
platforms: [linux, macos]
metadata:
  hermes:
    tags: [rd, export, kanban, artifact, markdown]
    related_skills: [rd-work, rd-validate, code-review, release-plan]
---

# /rd:process-export — RD 过程产物导出

> **对应文章理念**：`rd/requirements/{id}/` 文件化产物——"开发可以中断，研发上下文不能丢"
> **触发**：kanban 重型任务 done 后（满足导出门槛）
> **作用**：把 kanban 任务的过程产物自动导出为 Markdown 套件，让任何 Coding Agent 能接续

---

## 一、触发门槛（决策点 B：仅重型多 board 任务触发）

满足以下**任一**条件才导出：
- 工具调用 ≥ 6 次
- 文件写入 ≥ 3 个
- 涉及跨 ≥ 3 个 board 的协同任务
- `metadata.important=True`（显式标记）

**默认不导出**：避免存储爆炸（本机 53 个 done 任务若全量导出会膨胀）。

---

## 二、导出内容

每个导出任务生成 5 个 Markdown 文件：

```
rd/archive/{task_id}/
├── requirement.md          # 应用级开发契约（从 kanban body 提取）
├── analysis.md             # 需求分析（从 metadata.findings 提取）
├── implementation-check.md # 实现校验（从验证清单 + diff 对账）
├── continue-prompt.md      # 新会话接续提示（从当前状态生成）
└── knowledge-backfill.md   # 知识回补（从 metadata.decisions + findings 提取）
```

### 2.1 requirement.md

从 kanban body 提取：
- 任务标题
- 验收标准（frozen: true）
- 影响范围
- 依赖关系（parents）

### 2.2 analysis.md

从 metadata.findings 提取：
- 每条 finding 的 category/description/severity/source
- 按 severity 排序（CRITICAL > HIGH > MEDIUM > LOW > INFO）

### 2.3 implementation-check.md

从验证清单提取：
- 每个验收项的 done/partial/todo/changed/blocked 状态
- 对应的代码证据（file:line）

### 2.4 continue-prompt.md

生成新会话接续提示：
```markdown
# 接续提示 — {task_title}

## 当前状态
- 已完成：X/Y 项
- 剩余：Z 项
- 阻塞：W 项

## 关键文件
- <列出所有变更文件>

## 下一步
<具体需要做什么>

## 上下文
<关键决策 + 当前理解>
```

### 2.5 knowledge-backfill.md

从 metadata.decisions + findings 提取可回补知识：
- 每条 decision 的 topic/choice/rationale
- 每条 finding 的可复用模式
- 建议写入 `_shared/knowledge/candidate/` 的条目

---

## 三、使用方式

### 3.1 手动触发

```bash
# 在 kanban_complete 后手动导出
python3 ~/.hermes/bin/rd-export.py --task-id t_xxx --output rd/archive/t_xxx/
```

### 3.2 自动触发（推荐）

在 `kanban_complete` 钩子里检查触发门槛，满足则自动导出。

---

## 四、验证清单

- [ ] 已检查触发门槛（≥6 工具调用 / ≥3 文件写入 / 跨 ≥3 board / metadata.important=True）
- [ ] 5 个 Markdown 文件已生成
- [ ] 每个文件有具体内容（非空壳）
- [ ] continue-prompt.md 可被新会话直接读取
- [ ] knowledge-backfill.md 有具体回补建议

---

## 五、关联

- **上游**：`kanban_complete`（重型任务 done）
- **下游**：`_shared/knowledge/candidate/`（知识回补）
- **关联 skill**：`rd-validate`（对账）/ `code-review`（质量门）
- **关联 ontology**：`_shared/ontology.md §1.2 Artifact` 对象模型

---

## 变更历史

| 版本 | 日期 | 变更内容 | 变更人 |
|---|---|---|---|
| 1 | 2026-08-25 | 初版 | orchestrator |