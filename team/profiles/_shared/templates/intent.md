# intent.md — 意图文档模板

> 来源：Anthropic《AI Native SDLC Playbook》Plan 阶段产物（2026-08-27 第二轮融合 GAP-1）
> 用途：研发类重型任务的第一张卡固定产出本文件；下游 Design/Build 卡 body 必须引用其路径
> 写作口径：给"无背景的执行者"读——AI 和人都能据此判断"做什么、不做什么、做到什么程度算成"

---

## YAML Front Matter（写入前自检）

```yaml
type: intent
task_id: <kanban 任务 id>          # 产出本文件的卡
created_by: <profile 名>
created_at: <ISO 时间>
markings: [TLP:GREEN]               # 引用 marked 上游则继承（合取 AND）
```

## 正文字段（四必填 + 一选填）

### 1. 要解决什么（What）
一段话讲清问题。禁止直接贴需求原话——必须经提问澄清后的重述。

### 2. 给谁解决（Who）
用户/受影响系统/干系人。[已移除] 域此处写孩子当前年龄（动态算）而非静态标签。

### 3. 成功标准（Success Criteria）
可机械验证的验收条件。写法与 kanban body 的 acceptance_criteria（frozen）一致；此处是其事实源。

### 4. 明确不做（Scope-Out）⚠️ 必填
本次交付**不含**什么。这一节是防止"AI 一动手改几十个文件"的第一道闸。
示例：`- 不改部署脚本；不动 shared/ 下任何文件；不做性能优化`

### 5. 约束（Constraints，选填）
时间/预算/权限/技术栈边界（如"仅限 Python 标准库"）。

---

## 写入前自检清单

- [ ] 四必填字段齐备，Scope-Out 至少 1 条
- [ ] 成功标准可机械验证（有命令/文件存在性/覆盖率等判定手段）
- [ ] 已重述而非照抄需求原话
- [ ] markings 已按 marking-rules.md 传播规则标注
