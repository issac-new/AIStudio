# spec.md — 规格（施工图）文档模板

> 来源：Anthropic《AI Native SDLC Playbook》Design 阶段产物（2026-08-27 第二轮融合 GAP-1）
> 用途：Design 阶段产出；生成前必读同任务 intent.md；Build/Test/Review 阶段对照本文件判定"功能有没有跑偏"
> 与 intent 的分工：intent 说"要什么/不做什么"，spec 说"具体怎么做、动哪里、守什么规则"

---

## YAML Front Matter（写入前自检）

```yaml
type: spec
task_id: <kanban 任务 id>
intent_ref: <intent.md 绝对路径>     # 必填：本 spec 的意图源头
created_by: <profile 名>
created_at: <ISO 时间>
markings: [继承自 intent]
```

## 正文字段（五必填）

### 1. 功能如何工作（Behavior）
输入→处理→输出。接口/交互形态、边界条件（如超时、空输入）在此定。

### 2. 数据怎样流动（Data Flow）
数据从哪来、经过什么变换、落到哪。涉及的对象一律引用 `ontology.md` 的 object type（Task/Artifact/…）；带 markings 的数据须声明传播路径。

### 3. 会改动哪些系统（Blast Radius）
逐系统列出改动点 + 影响面。对照 `ontology.md` 附录「稳定单元注册表」——命中注册表的必须声明 impacted 下游。

### 4. 必须遵守的规则（Rules）
引用既有契约而非重写：action-risk.md（可逆性/黑名单）、marking-rules.md（如涉密数据）、域契约（如 [已移除] 的话术纪律）。只写本项目特有的新增规则。

### 5. 验证方式（Verification Plan）
本 spec 如何被证伪：测试形态（单测/集成/调研三角验证）、验收命令、证据强度目标（present/wired/exercised）。

---

## 写入前自检清单

- [ ] intent_ref 指向真实存在的 intent.md
- [ ] 五字段齐备；规则节只有引用+新增，无契约复制
- [ ] Blast Radius 已对照稳定单元注册表
- [ ] 验证方式与 intent 的成功标准一一对应
