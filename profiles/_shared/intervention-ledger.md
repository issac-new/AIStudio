# Intervention Ledger 最小子集（Hermes 本地化）

> 来源：QoderAI Better Harness `scripts/harness-analysis/intervention-ledger.mjs:3-32`，Hermes 本地化最小子集
> 适用：跨任务/跨窗口追踪"治理干预"的成效（规则补齐、skill 演进、流程修复）
> 版本：v1.0（2026-08-21，Hermes × Better Harness 融合 P1-3）
> 声明：本文件为 Hermes 本地化最小子集（4 字段），非源 schema 完整复制

---

## 什么是 Intervention

**Intervention** = 一次有意的治理动作，目标是改变某个机制的状态。例如：
- 批量补齐 22 个 SOUL.md 的 verification-checklist 引用
- 新建 `_shared/diamond-quality-gates.md` 规则
- 修复 dispatcher 的 review 工具闲置问题

## 为什么需要 Ledger

没有 Ledger 时，治理动作是"一次性"的——做完就忘，下次审计又从头开始。Ledger 提供**跨窗口连续性**：
- 上次补齐的规则，这次是否还在被引用？
- 上次的修复是否真正改善了指标？
- 哪些 intervention 正在 regressing（退化）？

## 最小子集 Schema（4 字段）

挂到现有 `kanban_comment`，不建新目录：

```yaml
intervention: |
  一句话描述治理动作（如"补齐 22 个 SOUL.md 的 verification-checklist 引用"）
outcome: pending | improving | unchanged | regressing | outcome-supported
evidenceRef: "kanban task id / session id / 审计报告路径"
owner: "profile name（谁负责后续追踪）"
```

### 字段说明

| 字段 | 类型 | 说明 |
|---|---|---|
| `intervention` | string | 治理动作的一句话描述 |
| `outcome` | enum | 5 态结果（见下表） |
| `evidenceRef` | string | 证据引用（kanban task id / session id / 文件路径） |
| `owner` | string | 负责追踪的 profile 名 |

### 5 态结果（与源 schema 一致）

| 状态 | 含义 | 判定标准 |
|---|---|---|
| `pending` | 待观察 | intervention 刚执行，尚未验证效果 |
| `improving` | 改善中 | 指标向好的方向变化（如覆盖率 18% → 55%） |
| `unchanged` | 无变化 | 指标未变（intervention 未产生预期效果） |
| `regressing` | 退化中 | 指标变差（如覆盖率从 100% 跌回 80%） |
| `outcome-supported` | 效果确认 | 有可比后续数据支持改善（如连续 2 次审计覆盖率保持 100%） |

## 使用方式

### 执行 intervention 时

在 `kanban_complete` 的 `metadata` 或 `kanban_comment` 中追加：

```yaml
intervention: "补齐 22 个 SOUL.md 的 verification-checklist 引用"
outcome: pending
evidenceRef: "research/soul-rules-audit-20260821-153127.txt"
owner: "orchestrator"
```

### 后续审计时

重新跑审计脚本，对比前后数据：

- 覆盖率从 18% → 100% → `outcome: improving`
- 下次审计仍为 100% → `outcome: outcome-supported`
- 跌回 80% → `outcome: regressing` → 触发告警

### 追踪规则

- **任何 regression 保留 stop/revert 阻断**：发现 regressing 时，禁止声明"intervention 有效"，必须回滚或修复
- **不聚合声明**：单个 intervention 的 outcome-supported 不等于"整体治理水平提升"（参照 intervention-ledger.mjs:398-403）

## 源 schema 完整字段（备查，非必须）

| 源字段 | Hermes 最小子集 | 说明 |
|---|---|---|
| 9 类资产（memory/repository-knowledge/rule/skill/hook/gate/agent/workflow/eval） | ❌ 不采用 | 初期过度设计 |
| 6 类 cause（harness/repository/model-capability/requirements/external-system/task-complexity） | ❌ 不采用 | 初期过度设计 |
| 5 态结果 | ✅ 采用 | pending/improving/unchanged/regressing/outcome-supported |
| 隐私校验（RAW_FIELD_RE / 绝对路径 / session id 拒绝） | ✅ 采用 | 见 `_shared/mandatory-privacy.md` |
| intervention / outcome / evidenceRef / owner | ✅ 采用 | 最小 4 字段 |

## 首次记录

本次融合 P0 阶段作为第一条 intervention 记录：

```yaml
intervention: "Hermes × Better Harness 融合 P0：SOUL 规则引用审计 + Tier 1/2/3 批量补齐（142 处）"
outcome: improving
evidenceRef: "research/soul-rules-audit-final-20260821-154653.txt"
owner: "orchestrator"
```

---

## SOUL 内单行引用

```
Intervention Ledger（详见 _shared/intervention-ledger.md）：4 字段挂 kanban_comment，5 态结果追踪，regressing 禁止聚合声明。
```
