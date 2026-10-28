---
name: os2-analysis-ledger
description: "OS2 分析台账（OpenSecurity 2.0 融合）：hack 卡 workspace 的 ledger.md 结构化台账——观测记录 + 结论三件套（证据等级+已验证范围+未测清单）+ 未测条件表（含预计成本列，状态挂实验或降权二选一）+ 方向表（方向/依赖前提/最廉价证伪探针/状态/投入/产出）+ 变更日志，5 节结构逐字对照上游 LEDGER_TEMPLATE。反公理固化：禁裸写'永远/完备/不可能'。fresh-eyes 独立评审触发条件（方向表空或全死）。hack 四 profile 通用。"
version: 1.0.0
metadata:
  source: OpenSecurity 2.0 (tag 2.0, Apache-2.0) 融合 2026-10-17
  hermes:
    tags: [hack-team, ledger, conclusion-triple, fresh-eyes, anti-axiom, fusion]
    related_skills: [os2-reflection-protocol, os2-execution-discipline, pentest-methodology-fusion]
---

# OS2 分析台账（Analysis Ledger）

> 忠实转译自 OpenSecurity 2.0 `.opencode/agents-rules/execution-discipline.md`「认知纪律/台账」节 + `.opencode/agents/fresh-eyes.md`（触发条件互引）。
> 源码快照：`/Users/YOURNAME/workspace/research/opensecurity-2.0-20261017/src/.opencode/agents-rules/execution-discipline.md`
> 台账位置：hack 卡 workspace `$HERMES_KANBAN_WORKSPACE/ledger.md`（任务开始时创建；判方向/下结论前先更新台账）。

## ledger.md 模板

沿用以下结构（节名/表头逐字对照上游权威模板 LEDGER_TEMPLATE——`src/.opencode/plugins/lib/task-session-persistence.ts:17-33`，节名与字段词表由 `cognition.ts` sections/fields 常量定义，5 节顺序一致）：

```markdown
# 分析台账 ledger.md
> 结论与未测条件的唯一记录处；按待复核记录对待（非免检结论）。下结论前先更新本文件。

## 观测记录
- （实验/命令 + 关键输出摘要）

## 结论台账（结论三件套）

| # | 结论 | 证据等级 | 已验证范围 | 未测清单 | 更新于（时间） |
|---|---|---|---|---|---|
| 1 | （一句话结论） | observed/inferred/assumption/unverified | （哪些条件下验证过） | （哪些条件未测） | MM-DD |

## 未测条件（维度）

| 维度 | 具体条件 | 为什么没测 | 预计成本 | 状态 |
|---|---|---|---|---|
| （对象/时机/状态/顺序/通道/生命周期） | | （受阻点） | （分钟/小时级估算，候选检验项排序依据） | 未测/已降权 |

> 状态仅允许：待跑（挂实验与限额）/ 已降权（挂理由）。禁止"无判定渠道/？"——每条未决疑虑必须挂实验或降权，二选一。

## 方向表（每行一个方向；反思盘点按此表进行）

| # | 方向 | 依赖前提 | 最廉价证伪探针 | 状态 | 投入 | 产出 |
|---|---|---|---|---|---|---|
| 1 | （一句话描述在追什么） | （未验证假设） | （三要素写全） | 活跃/待证伪/死/降权 | 批次 × 时长 | 结论条目编号或"空" |

## 变更日志
- （时间 + 改动了什么）
```

> 与上游的两处标注差异：① 方向表保留 `#` 列（Hermes 侧结论引用旧条目编号需要，上游无此列）；② 未测条件表状态枚举在「待跑/已降权」之外保留「已测」出路（上游自身两处不一致：execution-discipline.md:96 文字侧为「未测→已测」，代码模板侧为「待跑/已降权」，本表取并集 未测/已测/已降权）。

填写纪律：

- **结论三件套**：结论必须带【证据等级（observed/inferred/assumption/unverified 四值枚举）+ 已验证范围 + 未测清单】三列齐全；禁止裸写"永远/所有情况/完备/恒真/不可能/已排除"，缺未测清单不得作为推理前提。
- **「未测条件（维度）」表每批实验后追加行**（"为什么没测"写清受阻点）；条件被实验覆盖后把「状态」改为已测。
- **实验预登记**：跑之前先写预期结果；每批实验后把"从未被当过变量的条件"补进未测清单，并挑选一个到多个立刻实验。挑选标准只有一条：**万一它的结果与预期不一样，能不能推翻现在的结论？** 能，就优先跑（即使预期它会失败）。
- 「更新于」用 MM-DD。

## 反公理固化纪律

目的：防止未验证的普遍结论（"永远/完备/不可能"）被当成公理、把一个维度从问题空间里静默删掉——这些行为是卡壳的头号原因。

- 下任何普遍/否定结论前，未测清单必须有内容；空未测清单的普遍结论按违规处理。
- 结论被推翻时：不删旧条目，在结论台账加新条目引用旧条目编号并标注推翻。（此句为 Hermes 适配新增，无上游出处）
- 禁止把台账死路结论当背景事实引用（fresh-eyes 评审输入契约同样如此）。

## fresh-eyes 独立评审触发条件

**方向表空（无可试方向）或全死（所有方向状态=死）→ 派独立评审重灌方向池。**

- 派发契约：目标 + 原始材料绝对路径 + 分析台账（ledger.md）全文；台账中的死路结论按**待复核**对待（不作为背景事实）。
- 评审者要求：未参与主分析（无既有结论）；Hermes 侧用 delegate_task 派无历史上下文的子代理，或 kanban_create 兄弟卡给未参与的 profile。
- 评审者三节强制审计（全文见上游快照 `.opencode/agents/fresh-eyes.md`）：
  1. **前提清单**——主分析结论链依赖的每条前提（含隐含前提），"从未被当过变量"的优先输出
  2. **归属与持有者矩阵**——行为体 × 持有物 × 宿主形态，"谁以自己的身份试过 X"无答案的格子即候选检验项
  3. **死路重审**——每条死结论核探针三要素（携带物/宿主形态/提交路径），不全 = 未死，建议重测
- 评审输出候选检验项（检验什么/怎么跑三要素写全/预期结果与判读），排序：能推翻当前最大投入方向前提的优先，分钟级优先。
- 消费义务：返回的每条候选检验项要么执行、要么记降权+理由，禁止只写台账不办。
- 评审者禁止事项：不评价主分析对错、不把调用方结论写进报告、不修改主分析文件、不把台账死路结论当背景事实。
- 评审报告落 `$HERMES_KANBAN_WORKSPACE/fresh-eyes-<时间戳>.md`。

## 与其他 skill 的联动

| Skill | 联动 |
|---|---|
| `os2-reflection-protocol` | A/B/C/D 判定全部留痕到本台账；方向表是反思协议 §1 的载体 |
| `os2-execution-discipline` | 工具输出有效性判定产生的结论按三件套入台账 |
| `pentest-methodology-fusion` | confirmed finding 从台账结论条目提炼，走彼处 confirmation protocol |
| `hindsight_retain` | 技法级结论（跨题复用）确认后存记忆库，标题含技法名+英文标识符 |
