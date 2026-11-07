> **何时读我**：做反借口/假设前置/Prove-It 自证/自治硬停判断时，或写目标技能描述（触发词表）、设计质量底线守卫、做干净上下文对抗评审时。Addy Osmani agent-skills 吸收——反借口表/假设清单/Prove-It 五步/自治三类硬停/Composition 协议/三档评测/降标守卫/doubt 协议。

# agent-skills 工程纪律方法论（反借口表 / 假设前置 / Prove-It / 自治硬停）

> 来源：[addyosmani/agent-skills](https://github.com/addyosmani/agent-skills)（Addy Osmani，Google 工程总监，83.6K star，MIT，HEAD df1edb2 / plugin v0.6.7，2026-08-14 源码实测）。24 技能 + 8 斜杠命令 + 4 专家角色，内容主体为纯 Markdown。
> 纪律：只引用方法论模式与一手措辞，不调上游 CLI（其发布渠道是 Claude Code 插件市场 / `npx skills add`，与 swarm-yuan 安装目标重叠但机制独立）；不复制技能全文（上游可浅克隆到 `swarm-yuan/research/` 供 AI 阅读，gitignored 不入 git）。
> 整合纪律：吸收优先于新增门禁，不新增 `check_*`，门禁数保持 55；非运行时纯方法论吸收，不进 13/5 运行时计数。
> 适用场景：目标技能 的 **SKILL.md meta 段写作**（反借口表/假设前置/描述纪律）、**bug 修复流程**（Prove-It 五步）、**自治执行暂停**（三类硬停）、**角色组合**（Composition 协议）。填充规范落点见 `template-spec.md` §1.2。

---

## 一、SKILL.md 写作纪律（skill-anatomy 硬规则）

上游 24 个技能全部遵守的模板纪律（`docs/skill-anatomy.md`），swarm-yuan 生成目标技能 SKILL.md 时对齐：

| 规则 | 原文依据 | swarm-yuan 对齐点 |
|------|---------|------------------|
| description = 第三人称动词开头 + 2-4 个 "Use when" 触发短句 | `Creates specs before coding. Use when...` | template-spec §1 填充规则已有"pushy"要求，补句式规范 |
| **description 禁含流程步骤** | "if the description contains process steps, the agent may follow the summary instead of reading the full skill"——agent 会照摘要跳过正文 | 新增：描述只写 what+when，流程写进正文 |
| SKILL.md ≤ 500 行 | 最大技能恰好 499 行，上限被认真执行 | swarm-yuan 生成物拆六段式（SKILL.md 只做 meta），天然满足 |
| Verification checklist 每项可举证 | "Every checkbox should be verifiable with evidence (test output, build result, screenshot)" | 完成检查表条目须能挂证据（与 MEA verify_evidence 铁律衔接） |
| 步骤写具体动作不写空话 | "Good: Run `npm test` and verify all tests pass / Bad: Make sure the tests work" | workflow 节点 10 要素已含，可复用于 meta 命令速查 |

## 二、反借口表（Rationalizations）——本仓库最有辨识度的设计

### 2.1 机制

两列表格，**第一人称借口引语 + 不留情面的量化反驳**。上游 25 技能中 24 个携带（共 169 条，中位 6 条、最少 4、最多 11），嵌在 `## Red Flags` 之前、Process 与 Verification 之间——**每当 agent 想跳步，借口就在上下文里被当场反驳**，不需要外置纪律文档。

**机检现状与加严**：上游 `scripts/lib/skill-lint.js:75-81` 把 `## Common Rationalizations` 列入 `REQUIRED_SECTIONS`，缺失即 CI 错误；但只断言这一行存在，**空章节、两行表、无锚点的空话都能过**。swarm-yuan 的 `check_rationalization`（N02）加严三条：段存在且位于红旗段之前 / 数据行 ≥ max(4, 核心步骤数一半) / 每行 Reality 含可核锚点（门禁名、命令、`file:line`、`tests/` 路径）之一。

**生成配方**（skill-anatomy 写作原则第 4 条）：**Anti-rationalization——每个值得跳过的步骤都必须在表里有对应反驳**。借口条目不是自由发挥，而是从流程步骤反推：目标技能的每个门禁/precheck 步骤问一句"agent 会想什么借口跳过它"，逐条配对。

### 2.2 精选条目（原文照录，按类型分组）

**跳过验证类：**

| 借口 | Reality |
|------|---------|
| "This is simple, I don't need a spec" | Simple tasks don't need *long* specs, but they still need acceptance criteria. A two-line spec is fine. |
| "I'll write tests after the code works" | You won't. And tests written after the fact test implementation, not behavior. |
| "I tested it manually" | Manual testing doesn't persist. Tomorrow's change might break it with no way to know. |
| "I know what the bug is, I'll just fix it" | You might be right 70% of the time. The other 30% costs hours. Reproduce first. |
| "It works on my machine" | Environments differ. Check CI, check config, check dependencies. |
| "This is a flaky test, ignore it" | Flaky tests mask real bugs. Fix the flakiness or understand why it's intermittent. |
| "AI-generated code is probably fine" | AI code needs more scrutiny, not less. It's confident and plausible, even when wrong. |

**推迟工作类：**

| 借口 | Reality |
|------|---------|
| "I'll write the spec after I code it" | That's documentation, not specification. The spec's value is in forcing clarity *before* code. |
| "The spec will slow us down" | A 15-minute spec prevents hours of rework. Waterfall in 15 minutes beats debugging in 15 hours. |
| "The user knows what they want" | Even clear requests have implicit assumptions. The spec surfaces those assumptions. |

**表演性勤奋类（反证据注水，与 MEA 审计链直接共振）：**

| 借口 | Reality |
|------|---------|
| "Let me run the tests again just to be extra sure" | After a clean test run, repeating the same command adds nothing unless the code has changed since. |
| "It's just a version bump" | A bump is a behavior change you didn't write. Read the changelog; semver doesn't guarantee no breakage. |
| "The refactor makes it cleaner" | Relocating complexity isn't reducing it. If the reader still holds the same number of concepts, the structure didn't improve. |

**LLM 时代特色：**

| 借口 | Reality |
|------|---------|
| "It's just LLM output, it's only text" | That "text" can be a SQL statement, a script tag, or a shell command. Treat it like any untrusted input. |

### 2.3 swarm-yuan 落地

目标技能 SKILL.md meta 段新增标准节「常见借口与纠正」：从该技能的门禁步骤反推 5-8 条（生成配方逐条配对），素材从 §2.2 按类型选用+项目特化。填充规范见 `template-spec.md` §1.2。

## 三、假设前置（ASSUMPTIONS I'M MAKING）

写 spec 前先显式列出全部假设，给用户一个纠正窗口——**假设是最危险的需求误解形式，因为它无声**。原文模板：

```
ASSUMPTIONS I'M MAKING:
1. [assumption about requirements] ← 需求假设（如"这是 Web 应用而非原生移动端"）
2. [assumption about architecture] ← 架构假设（如"认证用 session 而非 JWT"）
3. [assumption about scope] ← 范围假设（如"只支持现代浏览器"）
→ Correct me now or I'll proceed with these.
```

三个维度固定（requirements / architecture / scope），结尾箭头句是**固定交互协议**——不要默默填平歧义需求。配套「Manage Confusion Actively」四步：STOP → 命名困惑 → 呈现取舍或提问 → 等待解决（坏例：默默选一种解释并祈祷它是对的；好例："spec 里是 X 但现有代码是 Y，哪个优先？"）。

**落地**：目标技能 SKILL.md meta 段「假设清单」节 + spec 流程开工前先出假设清单（见 template-spec §1.2）。

## 四、Prove-It Pattern（bug 修复五步）+ Beyoncé Rule

**核心原则原文**："When a bug is reported, **do not start by trying to fix it.** Start by writing a test that reproduces it."

```
Bug report arrives
 → Write a test that demonstrates the bug
 → Test FAILS（bug 确认存在——这一步失败即证据）
 → Implement the fix
 → Test PASSES（修复被证明有效）
 → Run full test suite（无回归）
```

- 复现测试同时是回归守卫：修好后再坏会被同一个测试抓住。
- **Beyoncé Rule**（原文）："If you liked it, you should have put a test on it. Infrastructure changes, refactoring, and migrations are not responsible for catching your bugs — your tests are."
- 前置纪律「Discover the Stack First」：绝不假设 `npm test` 之类的默认——Gradle/Cargo/pytest 项目有自己的等价命令。

**落地**：目标技能 fix 类任务的 workflow 硬步骤（任务类型路由 fix 已有门禁集，此为流程叙事层）；与 MEA verify_evidence 衔接——复现测试的失败输出就是 gate-run 证据。

## 五、自治模式三类硬停（/build auto 暂停协议）

自治执行（批准一次计划后逐任务推进）必须在这三类情况**停下交还控制权，不得硬闯**（build.toml 原文）：

1. **技术硬停**：测试无法转绿或构建破坏且无显见修复（→ 转 debugging 流程）
2. **歧义硬停**：spec 歧义，或任务需要 spec 未覆盖的决策
3. **风险硬停**：高风险/不可逆操作——auth/权限变更、破坏性数据迁移、支付、删除、部署、任何涉密、**任何 `git revert` 撤销不了的事**（→ 显式 sign-off）

配套纪律：
- **hedged response 不算批准**："looks reasonable" / "I guess" ≠ approved（视为未批准，重问）
- 开工前 `git status --porcelain` 检查脏工作区——防无关改动被吸收进 per-task commit 破坏回滚保证
- 每任务一 commit、只 stage 该任务触碰的文件（never `git add -A` blindly）
- 定位诚实："autonomous mode is not faster per task — it only removes the human stepping between tasks"

**落地**：governance-agents.md action-executor 自治暂停协议（见该文档）；与 state-machine 阶段 guard 咬合。

## 六、Composition 协议（角色互调禁止）

三层架构：**Skill = how**（带步骤与退出标准的 workflow）/ **Persona = who**（带视角与输出格式的角色）/ **Command = when**（用户入口，编排角色与技能）。

每个角色 prompt 末尾必须带 Composition 生成期必读文件（自描述协议）：

```text
- Invoke directly when: <用户直接要求的场景>
- Invoke via: <哪些命令/编排会调起本角色>
- Do not invoke from another persona. <若想委派其他角色，作为建议写进报告——编排权归命令层>
```

铁律："Personas do not call other personas."（平台禁止 subagent 嵌套 + 设计共识双重保证）。反面案例（docs/agents.md）：**meta-orchestrator 纯路由层是反模式**——无领域价值的纯转发层增加两次转述损耗（信息丢失 + 双倍 token）。

**落地**：governance-agents.md 四权角色补 Composition 声明；swarm-yuan 的任务路由（task-methodology-router）保持单层，不加 meta-orchestrator。

## 七、三档技能评测体系（N01 的直接来源）

上游 2026-08 后把"技能写得对不对"拆成三层可执行检查，`evals/README.md:14-22` 原文目标："that they **trigger** when they should, **stay distinct** from each other, and **change agent behavior** the way each skill promises."

| 档 | 查什么 | 何时跑 | 成本 | 确定性 |
|---|---|---|---|---|
| 1 结构 | frontmatter、命名、必需章节、行预算、`references/` 链接、命令齐平、artifact 路径、manifest 版本 | CI | 免费 | 确定性 |
| 2 触发与路由 | 正例 prompt 把本技能排进 top-k；反例不排第一；两两描述不近似碰撞 | CI（`--min-rank1 95`） | 免费 | 确定性（词法近似） |
| 3 行为 | agent 按技能执行后是否满足 `expectations[]` | 按需 | token | 随机 |

**Tier 2 是唯一被 swarm-yuan 直接移植的一档**（N01）。实现要点（`scripts/run-evals.js:59-60,137-190`）：

- 语料 = 技能名 token（权重 2×）+ description token（1×）；轻量词干化（`-ing/-ed/-ation/-ification` 等）把 "conflicts/conflict" "specification/specify" 归并；停用词表 + 缩写别名表（`docs→document`、`auth→authenticate`）显式登记，**不在描述里堆缩写词作弊**。
- 打分 = TF-IDF 余弦；正例须排进 `top_k`（默认 3），反例不得排第一。
- **负例必须声明 `owner`**：`evals/README.md:111` 说明，不声明 owner 的负例可能"vacuous pass"（prompt 与任何技能都不匹配，本技能自然不排第一）。声明后断言 owner **压过**本技能，负例即构成成对路由测试。
- 碰撞阈值：两两描述余弦 ≥0.75 报错、≥0.5 警告。
- **rank-1 棘轮**：CI 用 `--min-rank1 95`，低于下限失败；`evals/README.md:121` 原文 "never lower it to make a regression pass"。
- 失败处置方向是**改描述，不是改 prompt**（`:123`）："When these evals surface a description-vocabulary gap, fix the description, not the prompt."

**实测到的杠杆量级**（同仓 README 自记，`evals/README.md:65`）：给 code-review 描述加一句"即使 diff 是粘贴的也适用"，四种评审措辞的触发率 7/27→21/27，相邻九个不该触发的 prompt 保持 0/27。这说明描述词表是触发率的第一杠杆。

**Tier 3 的移植形态（2026-11-03，`scripts/skill-behavioral-eval.sh`）**：只移植**执行骨架**，判分换成**确定性动作断言**——用目标仓真实任务提示跑宿主 CLI（`claude -p` / `codex exec` / 自定义 `-p`），抓 stream-json trace，断言"该出现的动作出现、不该出现的动作没出现"（正则匹配工具调用与目标文件），不引入 LLM judge。理由：上游自记同一用例 6/6、1/6、2/7 都出现过，随机判分不能做门禁。三条纪律：opt-in（不进 `precheck` 默认序列，按需烧 token）、`--dry-run` 先看计划、runner 不可用 exit 2 且明说"未运行≠通过"（显式 `--runner` 是权威，找不到不回落到别的宿主）。

## 八、降标守卫 floor guard（N04 的直接来源）

`constraint-driven-development` 的核心不是设阈值，而是**只在 diff 范围内报告"把底线往下挪"的动作**（`references/floor-guard.md`）。五类：

| 类别 | 检测对象 |
|---|---|
| 阈值下调 | 约束文件里最小值/覆盖率/上限被改小 |
| 测试变松 | 新增 `.skip`/`xit`/`@pytest.mark.skip`、删除测试文件、删除测试文件里仍存在那行的断言 |
| 静默检查器 | 新增 `@ts-ignore`/`eslint-disable`/`# noqa`/`nosemgrep`/`istanbul ignore` 等抑制注释 |
| 未完成工作 | 新增桩（`not implemented`）、空 catch、`TODO`、`pass # stub` |
| 新增例外 | 约束文件里新增例外行 |

合同条款（`floor-guard.md` 的 Contract 段）：

- **输入**：merge base 到工作树的 diff，**含新增与删除行 + 未跟踪文件**。只读 `git diff` 会漏新文件。
- **退出码**：0 干净、1 有降标（阻断）、2 守卫无法运行（无 merge base / 非 git 仓）。**"Never let a `2` read as a `0`."**
- **只报规则与位置，不报命中的敏感原值**；脱敏不是可选项。
- **"Tightening is silent, loosening is loud."** 收紧不报，放宽才响。
- 解析细节：`---`/`+++` 只在 `diff` 行与第一个 `@@` 之间是文件头，hunk 内每行都是内容——否则新增的 `++i` 会被误认成文件头。

**落地**：`scripts/floor-guard.sh` + `check_floor_guard`（N04），接入 ⑧合入前；判定库与阈值口径留在 conf，不写死。

## 九、doubt 协议与 interview-me 判据（干净上下文对抗评审）

### 9.1 doubt-driven development 五步

原文定位（`skills/doubt-driven-development/SKILL.md:10`）："the discipline of materializing a fresh-context reviewer — biased to **disprove**, not approve — before any non-trivial output stands."

1. **CLAIM**：2-3 行写出决策与"为什么重要"。判据："If you can't write the claim that compactly, you have a vibe, not a decision."
2. **EXTRACT**：只交最小可评审单元（代码给 diff 或函数，决策给 3-5 句提案加约束）。原则："Strip your reasoning"——交结论只会拿回对结论的确认；但"**Strip reasoning, not evidence**"。
3. **DOUBT**：对抗式提示词，六类检查项（未言明的假设/未处理的边界/隐藏耦合或共享状态/契约可能被违反的方式/可能破坏的既有约定/异常输入下的失效模式），并明令 "Do NOT validate. Do NOT summarize."
   - **最关键一条**（`:108`）："**Pass ARTIFACT + CONTRACT only. Do NOT pass the CLAIM.**" 把结论交给评审者，只会得到对结论的认同。
   - 干净上下文 = 主会话 spawn 子代理/persona（"start with isolated context by design"），不是新 session；子代理无法再 spawn 时降级为自我审问，且必须标注 degraded。
   - 对抗式提示词要**原样传入并覆盖 persona 默认输出形状**（persona 常带"What's done well，至少一条"这类平衡要求，与 issues-only 冲突）。
4. **RECONCILE**：评审输出是数据不是判决。分类优先级：契约误读 → 有效且可行动 → 有效取舍 → 噪音。原文明令："Don't defer just because it's 'fresh.'"
5. **STOP**：满足任一即停——只剩琐碎/已考虑项、完成 3 轮、用户说 ship。**3 轮上限不得抬高**；"3 轮明显不够"意味着工件太大，回到第 2 步拆解。

**可检测失败信号**（`:217`）："Doubt theater — across 2 or more cycles where the reviewer surfaced substantive findings, zero findings were classified as actionable. You are validating, not doubting." 这条把"假怀疑"从感觉变成了可数谓词。

### 9.2 interview-me 的 95% 操作化

不是"感觉懂了"，而是一个可判定的测试（`skills/interview-me/SKILL.md:132-140`）：

> "You're done when you can answer yes to this: *Can I predict the user's reaction to the next three questions I would ask?*"

配套：一次一个问题 + `GUESS:` 行附自己的假设（让反应比生成快、且自己可被证伪）；四个缺项判据 who/why/success/binding constraint；"want vs should want" 探测（最佳实践话术/从众/should probably/把 buzzword 当目标）；收口用固定六行（Outcome/User/Why now/Success/Constraint/Out of scope）且只接受显式 yes——"whatever you think is best" 意味着用户在委派、他自己也没有 95% 把握，须换成两个具体选项重问。

**落地**：①②之间插入的"决策前沿轮次"协议（N08）取它的"每问附推荐答案"与"只接受显式确认"，不取"一次一问"（Matt 已改为按依赖分层整前沿轮次，见 mattpocock-skills-methodology）。

## 十、已登记未实施

| 候选 | 评估 | 决定 |
|------|------|------|
| 五轴审查全量引入（Correctness/Readability/Architecture/Security/Performance） | 与 review-methodology 五权审查高度同构；真增量是「概念计数」判据（"Count the concepts a reader must hold—if the count unchanged, it isn't cleaner"）+ 审查意见必须附结构处方 + 发现分级前缀（Critical/Nit/Optional/FYI 防止全部被当必修） | 登记，条件=review-methodology 补强时合并吸收（避免与 codex rubric 双轨） |
| 变更尺寸双阈值（diff ~100 好/~300 可接受/~1000 拆 + 单文件总行数 1000 预警 + 四种拆分策略） | check_pr_quality 已有尺寸维度？若有则补阈值口径 | 登记，条件=check_pr_quality 调优时对齐 |
| 路由 eval 体系（每技能 positive/negative 触发用例 + description 余弦相似度碰撞检测 >0.75 拒绝 + rank-1 ratchet） | **已实施（N01，2026-11-03）**：`scripts/eval-routing.sh` + `check_skill_routing` + `assets/evals/cases.tsv`；零依赖 bash+awk 复刻，用 TSV 不用 JSON（不引入 jq/node）。原登记条件"需 embedding 基建"被上游证伪——TF-IDF 词法近似即可捕获两类主要失效（描述缺词、描述过宽）。 | 已落地，阈值实测后按结果调 |
| /ship 并行 fan-out 编排 | swarm-yuan 是 bash 生成器，无并行 subagent 基建 | 不做 |
| spec 六区极简模板 | swarm-yuan §1-23 深度规格是差异化优势，不换 | 不做 |

## 十一、来源溯源

- 仓库：addyosmani/agent-skills（MIT）；首轮吸收基线 HEAD `df1edb2`（2026-08-14，24 技能）；**本轮刷新基线 HEAD `301b02b`（2026-11-01，25 技能，plugin v0.6.15）**
- 一手材料（2026-11-03 浅克隆实读）：`docs/skill-anatomy.md`（模板纪律）/ `scripts/lib/skill-lint.js`（结构门禁实现）/ `scripts/run-evals.js`（Tier 2 词法路由实现）/ `evals/README.md`（三档口径与实测记录）/ `skills/doubt-driven-development/SKILL.md` / `skills/interview-me/SKILL.md` / `skills/constraint-driven-development/references/floor-guard.md` / `commands/build.toml` / `agents/` 四个 persona / `docs/agents.md`
- 关键数字复核（2026-11-03 实测）：25 个 SKILL.md 合计 7,335 行，最大 400 行，无超过 500 行；Rationalizations 24/25 覆盖、169 条、中位 6；description 上限 1024 字符；本地 `references/` 仅 3 个技能（763 行），根 `references/` 7 份共享清单（1,412 行）

## 十二、验证只认真实退出码（ruflo v3.64/v3.65）

> 来源 ruvnet/ruflo v3.64.0 "verified-outcome learning loop"（ADR-502）与 v3.65.0 防作弊学习；与本仓实录坑（npm test 管道吞 exit code、`X && echo ok` 不构成验证）同构收口。

- **回合/任务的验证结论唯一裁决=验证命令的退出状态**：test/build/typecheck/lint 在该回合最后一次编辑之后真实运行且退出码为凭；`|| true`、管道吞码、`;` 链不算验证——形态上是验证，语义上什么都没证明。审查「已验证」宣称时核验证命令的构造：出口码是否被改写、是否在管道非末位、失败是否仍可达 0。
- **模型自述永不采信**：模型说"测试通过了"不是验证——必须有命令、退出码与输出锚点（本仓结论无锚点不成立红线同源）。
- **tainted 防作弊**：改过测试本身、改过验证器配置、收窄检查范围的回合，其"绿灯"标 tainted 不进经验池/不作为完成依据；可选在干净 worktree 轮换重验。修复任务的证据面尤其核对——修测试来让测试通过=把验证器变成同谋。
- **未验证如实计数**：未验证结局存中性（reward 0）不冒充成功也不诬为失败——"未跑"与"跑了没过"是两种事实。与本仓「未跑即不通过与操作语义分区判定」（review-methodology）互为镜像：一个治虚报通过、一个治虚报失败。
- **doctor 报告结果是否真到达消费端**：验证产物写了≠下游读到了——验证链贯通性本身要可诊断。

## 骨架级模式两条

> 来源 openspec `f2812f6` / graphify `3454890`

- **破坏性操作「atomic rename 认领」后再读、比对确认才删**：竞态写入要么被比对还原、要么成新文件永不被删。
- **导出/重生成必须幂等**：同内容不写盘，孤儿产物末尾统一清扫→避免 diff 噪音淹没真实改动。
