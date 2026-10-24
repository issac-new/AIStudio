> **何时读我**：做反借口/假设前置/Prove-It 自证/自治硬停判断时。Addy Osmani agent-skills 吸收——反借口表/假设清单/Prove-It 五步/自治三类硬停/Composition 协议。

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

两列表格，**第一人称借口引语 + 不留情面的量化反驳**。上游 24 技能中 22 个携带（共 153 条，平均每技能 7 条），嵌在技能正文 Process 与 Verification 之间——**每当 agent 想跳步，借口就在上下文里被当场反驳**，不需要外置纪律文档。

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

## 七、已登记未实施

| 候选 | 评估 | 决定 |
|------|------|------|
| 五轴审查全量引入（Correctness/Readability/Architecture/Security/Performance） | 与 review-methodology 五权审查高度同构；真增量是「概念计数」判据（"Count the concepts a reader must hold—if the count unchanged, it isn't cleaner"）+ 审查意见必须附结构处方 + 发现分级前缀（Critical/Nit/Optional/FYI 防止全部被当必修） | 登记，条件=review-methodology 补强时合并吸收（避免与 codex rubric 双轨） |
| 变更尺寸双阈值（diff ~100 好/~300 可接受/~1000 拆 + 单文件总行数 1000 预警 + 四种拆分策略） | check_pr_quality 已有尺寸维度？若有则补阈值口径 | 登记，条件=check_pr_quality 调优时对齐 |
| 路由 eval 体系（每技能 positive/negative 触发用例 + description 余弦相似度碰撞检测 >0.75 拒绝 + rank-1 ratchet） | 真空白（生成的技能会不会被正确触发无人管），但需 embedding 基建 | 登记，条件=出现"生成技能不被路由命中"的真实案例时立项（可先做纯文本相似度碰撞检测，零依赖） |
| /ship 并行 fan-out 编排 | swarm-yuan 是 bash 生成器，无并行 subagent 基建 | 不做 |
| spec 六区极简模板 | swarm-yuan §1-23 深度规格是差异化优势，不换 | 不做 |

## 八、来源溯源

- 仓库：addyosmani/agent-skills（MIT，HEAD df1edb2，2026-08-14；24 技能 7208 行 SKILL.md，最大 499 行）
- 一手材料（2026-08-16 浅克隆实测）：`docs/skill-anatomy.md`（模板纪律）/ `skills/spec-driven-development` 等 24 个 SKILL.md（Rationalizations 22/24 覆盖）/ `commands/build.toml`（三类硬停）/ `agents/`（Composition 生成期必读文件）/ `docs/agents.md`（三层架构与反模式）
- 关键数字复核：153 条借口条目（22 技能平均 7 条）；description 上限 1024 字符；技能行数 178-499

## 骨架级模式两条

> 来源 openspec `f2812f6` / graphify `3454890`

- **破坏性操作「atomic rename 认领」后再读、比对确认才删**：竞态写入要么被比对还原、要么成新文件永不被删。
- **导出/重生成必须幂等**：同内容不写盘，孤儿产物末尾统一清扫→避免 diff 噪音淹没真实改动。
