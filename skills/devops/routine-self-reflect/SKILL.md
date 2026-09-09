---
name: routine-self-reflect
description: "任务后自动反思+经验提取(redact)写 hindsight，闭合反思写入闭环。"
version: 1.0.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags: [reflection, hindsight, experience-capture, redact, self-improvement]
    related_skills: [memory-consolidation, cognition-lattice, harness-entropy-management]
---

# Routine Self-Reflect

重型任务完成前（`kanban_complete` 之前）自动触发的一次结构化反思 + 经验提取闭环：
反思 → 抽出可复用的 1-3 条经验 + LearningCandidate → **redact** → 写入 hindsight（`hindsight_retain`）。
灵感来自 OpenHuman 的 `learning/reflection.rs`（Post-turn Reflection Hook）+ `experience/capture.rs`（Experience Capture Hook，含 `redact_text`）。

不替代 `hindsight_recall/retain` 本身（它们是语义长时记忆检索/写入工具）。本 skill 管的是
**"什么时候写、写什么格式、写之前怎么脱敏"** 这个触发模板与护栏 —— 即缺失的"自动反思写入闭环"。

## Trigger（触发条件）

满足**全部**以下两点才启动本 skill：

1. **重型任务**（满足任一）：
   - 工具调用 **≥6** 次，或
   - 文件写入 **≥3** 个，或
   - 任务类型属于 **研究 / 编码 / 安全 / 部署**；
2. **时机**：在 `kanban_complete` **之前**（收尾阶段，把经验作为 handoff 的一部分沉淀）。

> 轻量任务（工具调用 ≤2 且 文件写入 =0，纯问答/路由）不触发——按"前线部署协议"的轻量留痕即可，无需反思闭环。

## 反思结构（必产四键）

调用一次反思（路由 `hint:reasoning`，temperature **0.3**），产出以下结构化 JSON，每键一句话，不写散文：

```json
{
  "observations":      "<WHAT 成功/失败：本次最终达成什么？哪里卡住或返工？>",
  "patterns":          "<哪步可复用：一个具体步骤/命令/判断，下次同类任务能直接抄>",
  "user_preferences":  "<学到什么用户偏好/纠正：本次用户明确或隐含的口味、约束、禁忌>",
  "veto_corrections":  "<哪步踩坑：哪个假设错了、哪个工具行为出乎意料、哪个边界没料到；下次如何不同>"
}
```

填完再决定要不要 redact+写入。空键可省略，但 **`veto_corrections` 尽量填**——踩坑是最有价值的经验（等价于 OpenHuman `FacetClass::Veto`）。

## 经验提取 → hindsight_retain

只把**非显然、可复用**的部分提炼为 **1-3 条** `hindsight_retain` 条目。
流水账、众所周知的事实、一次性调试细节不要写。`context` 必须标注来源任务（便于回溯）。

```python
# 每条：content=经验正文（已 redact），context=短标签（含来源任务），tags=[领域标签]
hindsight_retain(
    content="<redacted 经验正文：下次遇到 <X> 直接 <Y>>",
    context="<场景一句话：如 'kanban db 只读检索 (task t_e503bc41)'>",
    occurred_at="<ISO 日期，若经验锚定某次事件；通用经验可省略>",
    tags=["<domain>", "<kind:pitfall|procedure|conclusion>"]
)
```

提炼原则：
- **procedure 类**：写成"遇到 <触发信号> → 执行 <确切动作/命令>"，让下次 recall 能直接套用。
- **pitfall 类**：写成"别做 <X>，因为 <Y 后果>"，可被后续同类任务当红灯。
- **conclusion 类**：非显然的因果/机制结论，附证据来源（file:line / task_id）。

### LearningCandidate 提取（单独 retain）

对**成功多工具链**（跨 ≥3 个工具/步骤才跑通的一条路径）或**重复失败模式**（同一坑返工 ≥2 次）——
单独 `hindsight_retain` 一条 `LearningCandidate`，`tags` 标 `LearningCandidate`，便于后续聚合为 skill：

```python
hindsight_retain(
    content="<LearningCandidate：<触发场景> → <成功路径 / 应避免的失败模式>>",
    context="<场景标签 (task <id>)>",
    tags=["LearningCandidate", "<domain>"]
)
```

> 这是 OpenHuman `heuristics.rs:117 record_turn` + `FacetClass::Veto`（`heuristics.rs:273`）的等价物：把"值得学"的信号显式落盘，供 `skill-library-maintenance` 后续扫描聚合。

## Redact 规则（写入 hindsight 前强制）

**写任何东西进 hindsight 之前，必须先 redact。** 这是硬纪律，不遵守 = 泄漏。

引用锚点：
- **SOUL 红线**：`Never write secrets, tokens, credit card numbers, or other secrets — ever.`
- **output-contract.md §3 安全与隐私**：diff/输出中无硬编码 secret / API key / token；不暴露完整 session_id / 绝对路径；[已移除] 域额外不写孩子 PII。
- **config 机控**：`security.redact_secrets: true` + `privacy.redact_pii: true`（profile config.yaml，机器强制）。

redact 清单（写入前逐条过）+ 正则模式（参照 OpenHuman `redact_text` 的 secret 模式匹配逻辑）：

| 类别 | 正则 / 模式 | 替换 |
|---|---|---|
| API key / token | `sk-[A-Za-z0-9]{20,}`、`ghp_[A-Za-z0-9]{36}`、`AKIA[0-9A-Z]{16}`、`xox[baprs]-[A-Za-z0-9-]+`、`Bearer\s+[A-Za-z0-9._\-]+` | `<REDACTED_TOKEN>` |
| 密码 / 私钥 | `password\s*=\s*\S+`、PEM 块 `-----BEGIN [A-Z ]*PRIVATE KEY-----` | `<REDACTED_SECRET>` |
| 绝对路径含 home | `/Users/<user>/...`、`/home/<user>/...`、`C:\\Users\\<user>\\...` | `~/<path>` 或 `<REDACTED_PATH>` |
| PII | `[\w.+-]+@[\w-]+\.[\w.-]+`（邮箱）、`1[3-9]\d{9}`（手机号）、真实姓名/住址 | `<REDACTED_PII>` |
| 完整 session | 长 UUID / run_id 完整串 | 截断前缀或 `<REDACTED_SESSION>` |

> 经验本身可保留"方法/命令结构"，但把具体凭据、内部路径、个人身份信息全部脱敏。
> 宁可多脱敏，不可少脱敏。

## 频率护栏（避免噪声）

不是每个任务都写 hindsight——那会变成噪声淹没真正有用的经验。

**仅在以下至少一条成立时写入：**
- ✅ 有**非显然结论**（推翻了之前的假设 / 发现了反直觉的因果）
- ✅ 有**踩坑**（工具行为出乎意料、边界没料到、返工 >1 次）
- ✅ 发现**可复用的具体步骤**（确切命令 / 判断规则，下次能直接抄）

**跳过（不写）的情况：**
- ❌ 任务只是常规执行，没有新认知
- ❌ 结论众所周知（"python 要用 venv" 这种不写）
- ❌ 纯一次性调试、无推广价值

建议：单任务主反思 ≤3 条 retain + 至多 1 条 LearningCandidate；cron 周复盘对本周卡片批量筛。

## Pitfalls

- **忘了 redact 就 retain**：hindsight 是长时记忆，写进去的密钥/PII 会被后续 recall 反复带出。写入前必过 redact 清单 + 正则。
- **写流水账**："今天完成了 X" 无复用价值。只写"下次遇到 X 该做 Y / 别做 Z"。
- **只写成功不写踩坑**：踩坑是最高价值的经验（下次当红灯）。`veto_corrections` 必填。
- **每个微任务都写**：噪声化 hindsight，降低后续 recall 信噪比。守频率护栏 + Trigger 重型门槛。
- **context tag 太泛**：`context="task"` 没用。写"kanban db 只读检索 (task t_e503bc41)"这种可检索的场景标签。
- **把本 skill 当新记忆系统**：它只是 hindsight_retain 的触发模板，不要新建平行存储。

## Verification

写入后验证闭环真的闭合：
1. `hindsight_recall(query="<你刚写的 context 标签>")` 能召回刚 retain 的条目 → 写入成功。
2. 回读召回内容确认**不含**任何密钥/token/PII/绝对路径（redact + 正则生效）。
3. 若用 cron 周期触发，确认本次 retain 的 tags 与既有经验不重复（去重，不刷屏）。

> 闭合定义：重型任务收尾前触发 → 填四键反思 → redact 过清单+正则 → hindsight_retain（含 LearningCandidate）→ recall 能召回且已脱敏。
