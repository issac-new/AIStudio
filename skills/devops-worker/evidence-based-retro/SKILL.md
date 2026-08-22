---
name: evidence-based-retro
description: "证据驱动复盘：每条发现必须带 file:line/commit 引用，指不出即丢弃；deferred-work 结构化落盘防丢失。用于 epic/engagement 收尾与 kanban_complete 前审计。"
version: 1.0.0
metadata:
  hermes:
    tags: [devops, retrospective, evidence, deferred-work, bmad-fusion]
    related_skills: [memlog, kanban-engagement-finalization, loop-engineering-gates]
---

# Evidence-Based Retrospective（证据驱动复盘）

> 来源：BMAD-METHOD v6 `retrospective` 技能的证据驱动纪律 + `deferred-work.md` 机制，适配 Hermes kanban engagement 收尾。
> 定位：**完成时防线**——防止复盘变成无证据的感想会，防止被拆目标在复盘中丢失。

## 触发条件 / When to Use

- kanban engagement（多任务协作）收尾时
- epic 级任务链全部完成后
- `kanban_complete` 前的 memlog 审计（finalize 第一步）
- 定期（周/月）对某 board 做质量复盘

## 核心内容

### 1. 证据铁律

> **每条发现必须带 file:line / commit SHA / 命令输出引用；指不出来的发现直接丢弃。**

| 发现类型 | 必备证据 |
|---|---|
| 流程问题 | 具体任务卡 id + 事件时间戳 + memlog 行 |
| 质量问题 | file:line + 测试失败输出 / 构建错误 |
| 协作问题 | kanban comment id / 具体 block 事件 |
| 工具问题 | 真实命令 + 退出码 + stderr 摘录 |

无证据的"感觉式"发现（"感觉协作不太顺"）→ **丢弃**，不进入改进行动。
这与 `report-data-verification` 同源：量化声明必须可验证。

### 2. 复盘流程（五步）

```
1. 收集事实源：memlog(.memlog.md) + kanban events + comments + git log
2. 逐条提取事件，标注证据引用
3. 分类：做得好 / 出问题 / 幸运躲过
4. 每条"出问题"派生改进行动（带 owner + deadline + 验证方式）
5. 无证据条目丢弃并计数（丢弃率本身是一个信号：>30% 说明记录纪律失败）
```

### 3. memlog 审计作为 finalize 第一步

`kanban_complete` 前对多 run 任务：
1. 通读 `.memlog.md` 全文
2. 确认每条 `file-created` / `file-patched` 事件对应的产物真实存在
3. 确认每条 `decision` 已落入产物或显式搁置
4. 未落入的决策 → 转 deferred-work

### 4. Deferred-Work 记录（防被拆目标丢失）

被拆分/搁置的目标必须结构化落盘，三字段：

```markdown
## deferred-work entry
- source_spec: <来源任务卡 id / 文件路径>
- summary: <被搁置目标的一句话描述>
- evidence: <为什么搁置的决策记录引用>
```

落盘位置：
- 任务内：`$HERMES_KANBAN_WORKSPACE/deferred-work.md`
- 跨任务：父任务的 `kanban_comment` + 派生 `kanban_create` 子任务（带 parents）

**复盘时检查**：所有 deferred-work 条目要么已有子任务跟踪，要么显式关闭（带关闭理由）。
"忘了"不是合法终态。

### 5. 复盘报告格式

```markdown
# Retrospective: <engagement/epic 名>
日期 | 参与任务数 | 总 run 数

## 做得好（带证据）
## 出问题（带证据 + 改进行动）
## 幸运躲过（带证据——这次没炸但下次会）
## 丢弃的发现（计数 + 丢弃率）
## deferred-work 状态（open_count / 新增 / 关闭）
```

## 与其他 skill 的联动

- `memlog`：复盘的首要事实源
- `kanban-engagement-finalization`：engagement 收尾流程中嵌入本复盘
- `loop-engineering-gates`：复盘是持续改进门的输入
- `report-data-verification`：证据纪律同源

## 与 Hermes 的集成映射

| 集成点 | 用法 |
|---|---|
| `kanban_complete` 前 | 多 run 任务做 memlog 审计 |
| `kanban_comment` | 复盘报告落父任务评论 |
| `kanban_create` | 改进行动与 deferred-work 派生子任务 |
| cron | 定期 board 级复盘（如每周） |
