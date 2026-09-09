---
id: KB-KNOWLEDGE-CANDIDATE-README-001
type: knowledge-candidate-readme
domain: hermes-cluster
status: OFFICIAL
sourceType: official
owner: orchestrator
version: 1
updatedAt: 2026-08-25
confidence: high
stability: stable
evidence:
  - doc: workspace/research/taobao-rd-harness/analysis-report.md §四
  - human: 图爸（决策 B+A+B）
tags:
  - candidate-knowledge
  - knowledge-base
anchors:
  - KNOWLEDGE_LAYER:candidate
  - KNOWLEDGE_FLOW:personal→candidate→official
---

# 候选知识库（candidate/）使用规则

> 用途：暂存"未经 owner 确认的稳定知识"，避免两极分化——有价值的经验留在聊天记录下次找不到，或未确认的推断直接进入正式 KB 误导后续 AI。
> 状态：active（2026-08-25 从 `_shared/decisions/` 升级而来）

---

## 一、什么是 candidate 知识

candidate 知识具有以下特征：

1. **有明确证据**（code / doc / human observation）但**未经过 owner review 确认**
2. **来源上下文明确**（避免来源丢失导致复用错位）
3. **confidence + stability 已标注**（让后续 AI 知道可信度）
4. **可追溯**（任何 candidate 可回溯到产出它的 kanban task 或 session）

典型例子：
- 某次需求分析出的"这个状态字段的实际含义"（推断，待代码核对）
- 某次事故复盘出的"这个异常日志的判断模式"（经验，待 owner 确认）
- 某次调研出的"这个开源项目的关键限制"（调研，待交叉验证）

## 二、candidate → official 转正路径

```
1. candidate/ 写一条新知识（含 YAML front matter）
                ↓
2. 通知 owner（由 profile owner 或 orchestrator）做 review
                ↓
3. owner 确认后，编辑 YAML front matter：
   - status: CANDIDATE → OFFICIAL
   - confidence: low/medium → high（如果 review 通过）
   - evidence: 补 human review 记录
                ↓
4. 移到 main/ 或 applications/ 对应目录
                ↓
5. 在原 candidate/ 留 redirect stub（如 "moved to main/xxx.md"）
```

## 三、与原有 `_shared/decisions/` 的关系

> ⚠️ **2026-08-25 升级路径**：原 `_shared/decisions/` 已迁移到本目录（含 3 条核心 ADR）。
> 原目录保留为 `_legacy-decisions/`（带 redirect），后续如有新决策直接写在本目录。

迁移清单：

| 原文件 | 新位置 | 状态转换 |
|---|---|---|
| `decisions/README.md` | `_shared/knowledge/candidate/README.md`（本文） | ADR 制度说明 → candidate 使用规则 |
| `decisions/2026-08-13-deepseek-harness-fusion.md` | `_shared/knowledge/candidate/2026-08-13-deepseek-harness-fusion.md` | accepted → OFFICIAL |
| `decisions/2026-08-24-pi-prepare-next-turn-observation.md` | `_shared/knowledge/candidate/2026-08-24-pi-prepare-next-turn-observation.md` | observation → CANDIDATE（保持观察项） |
| `decisions/matrix-peers.md` | `_shared/knowledge/candidate/matrix-peers.md` | 台账 → OFFICIAL |

`_shared/decisions/_legacy-decisions/` 保留只读副本（防破链）。

## 四、YAML Front Matter 字段（强约束）

任何 candidate 文档必须含以下字段：

```yaml
id: KB-CANDIDATE-<DOMAIN>-<SEQ>     # 唯一编号
type: knowledge-candidate           # 类型（区分 knowledge / decision / finding / report / artifact）
domain: <业务域>                     # hermes-cluster / [已移除] / [已移除] / hack / ...
status: CANDIDATE                    # DRAFT / CANDIDATE / OFFICIAL / DEPRECATED
sourceType: ai-assisted             # official / ai-assisted / personal
owner: <profile 名 或 人名>
version: <整数>
updatedAt: YYYY-MM-DD
confidence: high | medium | low
stability: stable | evolving | volatile
evidence:                           # 至少 1 条
  - code: <代码路径>
  - doc: <文档链接>
  - human: <确认人+时间>
tags: [<标签列表>]
anchors: [<锚点列表，供 ROUTING.md 关联>]
```

## 五、写入规则

1. **禁止直接写 OFFICIAL**——必经 CANDIDATE → owner review → OFFICIAL 流转
2. **每个候选必须 evidence ≥1 条**——无证据的推断禁止入库
3. **confidence 必填**——owner review 时由 review 决定升级为 high
4. **stability 必填**——stable（不变）/ evolving（演进）/ evolving（快变）
5. **更新时改 version + updatedAt**——保留历史可在 git diff 看到
6. **废弃时改 status=DEPRECATED**——保留正文，加 deprecation reason

## 六、与知识库其他层的关系

```
personal/  → candidate/  → main/ 或 applications/  → 引用 → 变化后更新/deprecated
   ↑                                                  ↑
   └────────────── 个人经验回流 ←─────────────────────┘
```

- personal/ → candidate/：当个人经验被多次复用或 owner review 时
- candidate/ → main/：跨 profile / 跨 board 的通用知识
- candidate/ → applications/：单 profile / 单应用的知识
- 引用后更新：业务/代码变化后，编辑 OFFICIAL 知识而不是覆盖

## 变更历史

| 版本 | 日期 | 变更内容 | 变更人 |
|---|---|---|---|
| 1 | 2026-08-25 | 初版（升级自 `_shared/decisions/README.md`，扩展为 candidate 使用规则） | orchestrator |