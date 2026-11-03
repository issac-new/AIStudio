> **何时读我**：设计目标技能的验证产物（N05）、判断并行探查该用 swarm 还是 arena（N06）、写原则卡或审查「证据强度」时。pstack 全量吸收档——verify skill 五段/arena 与 swarm 的分工/blast-radius 五级证据/原则卡引用契约/决策日志/overnight 契约。

# pstack 方法论（验证即生成物 / 双并行范式 / 证据强度阶梯）

> 来源：[cursor/plugins · pstack](https://github.com/cursor/plugins/tree/main/pstack)（Lauren Tan / poteto，MIT，HEAD `ae5650f` 2026-10-31，plugin v0.15.36，2026-11-03 源码级实读）。58 个技能目录（23 playbook + 24 principle + 11 工具技能）、SKILL.md 中位 29 行、最长 163 行。
> 证据分级：本档全部条目为 **A 级（本机浅克隆实读原文）**。
> 整合纪律：只吸收机制不移植体量；pstack 是面向所有任务的通用工作流产品，swarm-yuan 是生成器，重叠面在"怎么证明做对了"，不在"覆盖多少开发场景"。

---

## 一、三层结构：薄路由 + 剧本 + 原则卡

`poteto-mode` 150 行只做三件事：匹配剧本 → 把剧本步骤逐字抄进 todo → 写明跳过原因。流程细节下沉到 23 个 playbook，判断准则下沉到 24 张原则卡。**路由器不承载知识，只承载分派与留痕**。

对 swarm-yuan 的用法：目标技能 SKILL.md 保持薄（N13 的体积预算就是这个判断的量化），流程细节留在 workflow.md 与 references/，原则抽成 `principles/p-*.md`（N10）。

**跳过必须留痕**（`skills/poteto-mode/SKILL.md:124`）：

> "A step you choose not to do stays in the list with a one-line `skip: <reason>`."

这条治的是"生成到一半悄悄少做一步"——未知跳过与有意跳过在产出上不可区分，留一行理由即可区分。

## 二、验证即生成物（N05 的直接来源）

pstack 不只要求"跑测试"，而是**为项目生成一个可复跑的验证技能**，目标是让下一个从未见过该应用的 agent 冷读即可执行（`skills/create-verification-skill/SKILL.md:9`）：

> "You write the generator's output for the next agent, not for a human: it will be read cold, mid-task, by an agent that has never seen the app."

固定五段（`:27-32`），每段都有一句判据：

| 段 | 判据原文 |
|---|---|
| Launch | "Ready means usable, not just that a process answers." |
| Doctor | "An agent runs this first whenever anything looks off."（一条只读健康检查：进程/版本/端口归属/鉴权） |
| Drive | "Prefer stable handles (ARIA labels, data attributes, prompt strings, route paths) over coordinates and tab order." |
| Evidence | "exercise the real user path, not internal setters or test-only endpoints ... verify side effects alongside what's visible" |
| Cleanup | "Never kill by process name; kill what you started."（且证据必须活过清理） |

前置条件与断言不写在 SKILL.md 顶层，而在**功能地图**里，每个功能文件固定四个 H2（`:36`）：`Sub-features`（短 ID + 一行行为）/ `How to get to it (user POV)` / `Driving it with <harness>`（以 `Preconditions:` 开头，逐条"用户动作 → 精确命令 → 可观察结果"）/ `Gotchas`。

两条硬规则：

- **「从未执行过的生成物是草稿」**（`:40`）："A generated skill that was never executed is a draft, not a deliverable." 生成器交付前必须自己完整跑一遍（启动→doctor→驱动一个功能→抓证据→清理），并确认**清理后证据还在**。
- **「不许为了通过而弱化旅程」**（`:36`）："Never weaken the journey to make it pass."

形式化路线（`create-formal-verification-skill`）把"能失败"写成质量判据（`:24`）：

> "**Able to fail.** A check that you have never seen fail proves nothing. Show each property failing on a broken variant of the code it guards, such as a removed check or a reordered step."

并把工具选择写成路由而不是预设（`:19`）：顺序/交错类问题 → 模型检查器（TLA+ 是任何语言的默认）；代码级不变量 → 能跑在代码上的验证器；两者都没有 → 用生成输入测真实代码，**不要用手写模型代替真代码**。

**落地（N05）**：目标技能产物增 `verify-<project>/SKILL.md` + `features/`；生成步骤把"自己跑一遍 + 证明能失败"写成硬判据，而非建议。

## 三、swarm 与 arena 是两种东西（N06 的直接来源）

| | swarm | arena |
|---|---|---|
| 治什么 | **覆盖**（切片）与**同题竞速** | **同题多候选择优** |
| 阶段 | Frame → Fan out → Aggregate → Report | Frame → Fan out → Cross-judge → Pick → Graft → Verify |
| 汇总 | 单一合并报告 | 选一个底稿 + 嫁接落选者优点 |
| 何时用 | 探查清单/调用链/边集 | 设计方向、接口形态 |

共用四条硬规则：

1. **brief 自包含**（`skills/swarm/SKILL.md:31`）："Every brief stands alone. Include the goal, scope, exact slice or race arm, how to verify, and what to report." 因为 worker 看不到兄弟。
2. **竞速先声明选择规则**（`:21`）："For a race or mixed shape, declare `first pass`, `rank all`, or `best-of` before spawning." 不许事后改规则。
3. **缺口不等于通过**（`:37`）："Drop a result that does not record the SHAs and method its brief names, and respawn that worker once. After a second miss, record a gap. A gap does not count as a pass." 同一个 worker 最多重试一次。
4. **arena 的 judge 不能来自父会话的模型家族**（`skills/arena/SKILL.md:26-28`）；找不到另一家族就明说跳过，"不许假装评审过"。

arena 的 rubric 是**选底人的工具，候选看不到**（`:16`）："Derive the rubric, 3-6 concrete gradeable criteria for what success looks like on *this* task. It is the picker's tool in Phase D. Candidates only see the task." 理由是候选看得到 rubric 就会对着它表演。

选底标准不是"哪个最好看"（`:34`）："Pick the base a future maintainer can extend most easily without breaking invariants."

**pstack 自己写的误用警告**（`docs/guide/10-recipes-and-pitfalls.md:174`）：用 arena 做覆盖会漏，用 swarm 做设计择优会平庸。

## 四、blast-radius 的五级证据强度阶梯

每个"这个改动为什么安全"的事实，按阶梯尽量往下走，并说明停在哪一级（`skills/blast-radius/SKILL.md:21-28`）：

1. 你说的（"Worthless on its own."）
2. 你指到了行（真实 `file:line` 或库源码）
3. 你证明坏情况到不了（逐步走一遍失败路径）
4. 你跑了（调用真实代码、错了就大声失败的脚本或测试）
5. 你在运行中的应用里复现了

方法上最反直觉的一条（`:34`）：**"Find the one fact it's safe because of."** 大多数看起来危险的改动只因为一个事实而安全；证明这一个事实，大部分风险同时解除。

以及对自己的文字不信任（`:17`）："A blast-radius writeup that sounds right is worthless. It reads as convincing whether or not it's true."

**落地（N02/N04 的判据依据）**：审查意见的"证据"一栏按这五级自评；门禁只接受第 2 级及以上（`file:line`／脚本／运行复现），"我认为"不计。

## 五、原则卡与引用契约（N10 的直接来源）

24 张卡，每张 7-21 行，**没有一条包含脚本或断言**——可执行的强制发生在别处（路由器触发点、验证技能脚本）。卡的可迁移价值在**引用契约**（`skills/poteto-mode/SKILL.md:15`）：

> "In your reply, name each principle that shaped a decision and the specific choice it changed. Cite only principles whose leaf SKILL.md you read this session."

以及审计侧（`docs/guide/08-principles.md:27`）："A principle citation with no decision behind it means the agent named the rule without applying it."

即：**引用必须绑定到"改变了哪个决定"，且只许引用本轮读过的卡**——这把"是否遵守"变成了对回复文本的检查，不需要读 agent 的内心。

三条最硬的原文：

- **attack-the-premise**（`skills/principle-attack-the-premise/SKILL.md:9,14,19`）："When two or more fixes that share one premise have failed the same gate, suspect the premise, not the fixes." / "Write the premise down. The premise is the one sentence that every failed fix assumed." / "Stop: Do not start the next fix before the premise is written down and tested."
- **fix-root-causes**（`principle-fix-root-causes/SKILL.md:17,20`）：先问"触发症状的状态本身合法吗"——状态可能合法则出错代码是根因，状态本不该存在则加 guard 只是藏 bug；"If a workaround needs a paragraph-long comment to justify it, the code is wrong."
- **explain-the-number**（`principle-explain-the-number/SKILL.md:9-16`）：报任何数字前先说清"什么限制了它、它可能测的其实是什么"。

## 六、决策日志与 overnight 契约

决策日志是 append-only 六列 TSV：`ts / phase / decision / why / evidence / result`，一轮一行，证据只放指针不放散文（`skills/show-me-your-work/SKILL.md:16-22`）。

夜间长跑契约五个成分（`docs/guide/07-overnight.md:23-27`）：完成谓词、隔离 worktree、预授权提交范围、`/loop` 唤醒、逃生舱（"真死路就停下写原因，胜过八小时创意性重解释目标"）。三条纪律：

- **时长不是完成条件**（`:120`）："a duration is not a finish condition."
- **完成谓词永不悄悄放宽**（`:56`）："the finish condition never quietly relaxes to declare victory."
- **没帮助的改动丢弃**，不留在分支上"也许有用"；平台期是转向信号不是停止信号。

收尾要做两件事：对着 transcript 审计日志；由**另一个模型家族**的 agent 复审轨迹，回复末尾必须有 `Attention` 段列出该看哪里（`:67-74`）。

## 七、技能体积与披露（N13 的量级参照）

58 个 SKILL.md：平均 41.2 行、中位 29、最长 163（`poteto-help` 索引）与 150（`poteto-mode` 路由）。**最长的两个都是索引/路由，不是流程本体。**

四层披露：description（常驻）→ SKILL.md 正文（按需全文）→ `references/`（条件满足时读）→ `scripts/`（执行不耗上下文）。`poteto-mode` 还有第五层：23 个 playbook，SKILL.md 只给一行索引，正文按需打开逐字复制步骤。

依赖声明靠三种约定而非机器可读字段：相对路径链接、点名 + 说明何时适用（全仓 110 处跨技能引用）、人工校验。**没有一个 CI 脚本执行"引用的文件存在"这条规则**——这是它的可改进点，不是可抄点。

## 八、反面证据：四张原则卡是残片

实读发现 `guard-the-context-window`（正文到第 12 行即止，description 承诺的"route bulk to subagents"未展开）、`exhaust-the-design-space`、`encode-lessons-in-structure`、`migrate-callers-then-delete-legacy-apis` 四张卡的正文在拆分/发布过程中被截断，**仓库没有任何校验能发现**——`authoring-a-skill` 第 2 步只校验 frontmatter 有 name/description、引用文件存在、链接可解析，不校验正文完整性。

这是本档最重要的一条教训：**原则卡这种组织方式必须配结构校验才能用**。故 N10 引入原则卡的同时，把「每张卡 ≥12 行且含 Why/Pattern/自检三要素」写进 `check_skill_budget`（决策 D8）。

## 九、明确不吸收的三点

| 不吸收 | 理由 |
|---|---|
| 「不做 planning 技能」的立场 | pstack 的前提是"代码本身就是规格"；swarm-yuan 的产物恰恰是先设计再生成的技能规范。保留 spec 环节，只借"用原型回答开放问题"来减少纯文字推演。 |
| 58 技能 + 23 playbook 的体量 | 面向所有任务的通用产品与面向生成质量的生成器，规模预算不同；且它自己的 4 张残片已证明语料规模超过维护能力。 |
| 人格化评审 bot（`comment-sicko` 写死开场白与"只保留五类注释"） | 人格化能让风格稳定，但会与目标仓既有规范冲突；吸收其"保留清单 + 不确定就删"的判据，不吸收人格。 |


## 十一、落到九节点的三条细则（①④⑦）

### 11.1 ① 需求理解：决策前沿 + 拒答库

- **决策前沿**：一轮问完当前"前置已落定"的全部问题，逐题编号并附推荐答案，用户可按号回答；事实归子代理（环境可查的不许问人，后台查只阻塞它的下游问题）；收口判据是"能否预测用户对接下来三个问题的反应"，不是"感觉懂了"。
- **拒答库**：先读 `.swarm-yuan/out-of-scope/` 全部文件，按**概念相似度**匹配（不是关键词），命中则呈现旧决定并要求三选一（确认拒绝 / 推翻 / 判定为不同概念）。
- 与既有三级决策分类（Mechanical/Taste/UserChallenge）的分工：那一层管"哪类决策要不要停"，这一层管"停下来之后问什么、按什么顺序问"。

### 11.2 ④ plan：决策四区

| 区 | 含义 | 判据 |
|---|---|---|
| 已决 | 已与用户确认，不再讨论 | 来自 spec 决策记录 |
| 前沿 | 未被阻塞、现在能做，做完能解除别的条目 | 可精确陈述 + 无阻塞 |
| 待明确 | 在范围内但还陈述不清 | **必须写明卡在哪个未决问题**，不许只写"待定" |
| 界外 | 显式不做 | 对应 spec 非目标；换说法也不重新进来 |

前沿优先从 `relations.jsonl` 边集算，不凭感觉——这是本仓相对上游"agent 判断前沿"的增强点。

### 11.3 ⑦ 审查：三条

- **证据强度自评**：每条结论标等级（你说的话 < file:line < 走一遍证明坏情况到不了 < 跑脚本 < 运行中复现），门禁只接受第 2 级及以上；"这段代码看着没问题"不构成证据。
- **拒答落账**：以"不做"结案且理由耐久的，落 `.swarm-yuan/out-of-scope/<概念>.md`；"已实现所以关闭"禁入库。
- **原则引用**：交付写「原则引用：<卡名> → 改变了 <具体决定>」；只写卡名指不出改变了什么，视为没应用。

## 十二、目标技能第七类产物

三件产物的模板随技能分发在 `assets/`，产物落技能根：

| 产物 | 模板 | 何时产出 | 机器检查 |
|---|---|---|---|
| `verify-<project>/SKILL.md` + `features/` | `assets/verify-skill-template.md` | 项目有可运行形态；生成器**须自跑一遍并证明它能失败**，否则未完成 | `--verify-completeness` 核对存在 |
| `.swarm-yuan/out-of-scope/<概念>.md` | `assets/out-of-scope-template.md` | 以"不做"结案且理由耐久 | ①节点按概念相似度消费 |
| `principles/p-<名>.md` | `assets/principles-template.md` | 需被引用的稳定判断（4-6 张起） | `check_skill_docs` 断言 ≥12 行且四段齐全（防残片） |

三件产物落技能根的新子目录，**不进 `references/`**——`SKILL_SIDECAR_MAX` 只管方法论档，避免把产物混进方法论文档的预算面。

## 十、来源溯源

- 仓库：cursor/plugins · pstack（MIT，plugin v0.15.36，HEAD `ae5650f` 2026-10-31）
- 一手材料（2026-11-03 浅克隆实读）：`skills/poteto-mode/SKILL.md`（150 行路由）/ `skills/swarm|arena/SKILL.md` / `skills/create-verification-skill/SKILL.md` + `references/feature-map-example/` / `skills/principle-*/SKILL.md`（24 张）/ `skills/blast-radius/SKILL.md` / `docs/guide/07-overnight.md` / `docs/guide/08-principles.md` / `README.md`（反 planning 立场）。
- 未覆盖：`triage`/`code-review` 等工具技能的完整实现、`statechart` 的 TLA+ 管线、`automations/benny` 的自动化协议，本次只读到接口层。
