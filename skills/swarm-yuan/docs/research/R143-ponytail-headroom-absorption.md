# R143 Ponytail v5 + Headroom 源码级调研与吸收（2026-11-07）

> **这份文档让谁做什么决定**：给后续吸收轮/审计轮留一份可复核的事实底稿——上游两个 skill 究竟写了什么、本技能已有什么、这次补了什么、为什么其余不补。写给改动本技能的 AI 与代码审查者看。
>
> **触发**：用户指令「深入调研 Headroom 和 Ponytail 2 个 skill 完善 swarm-yuan skill」。
>
> **调研下限**：两仓 `git clone --depth 1` 后逐文件读源码，非 grep 命中级。Ponytail v5.3.3（`DietrichGebert/ponytail`，MIT）；Headroom（`headroomlabs-ai/headroom`，Apache-2.0）主仓 README/SKILL.md/llms.txt。落盘日期 2026-11-07。

## 决定性发现

### 1. Ponytail 的旧基线不是"没吸收"，是吸收的版本停在 v4.9.0

本技能 `references/lazy-generation-methodology.md` 一直引 v4.9.0。上游 v5 是重建，不是小改：审查（`ponytail-review`）从"只找能删的代码"扩成六序审查（correct → safe → holds under load → tested → fast → lean），审计（`ponytail-audit`）新开整仓排名报告，债务台账（`ponytail-debt`）与记分板（`ponytail-gain`）是全新的两个技能。也就是说：**阶梯没变，审查面与记账面全是新的。**

七层阶梯本身不用动——本技能把上游 v5 合并掉的"标准库"与"平台原生"拆成两层（`lazy-generation-methodology.md` §一层 3/层 4），是超集不是落后。

### 2. 本技能内部有一处真矛盾，卡在审查半径

`references/review-methodology.md:66-70` 原写"审查只针对变更文件（diff 中 `+` 行）……不在其他文件提评论"，而 Ponytail 的核心规则之一是"改之前 grep 这个函数的每一个调用方，在共享代码里修一次根因"。两条互斥。

读过上游原文后可以确定这是**抄丢了限定词**：open-code-review 的原句是 "Findings from other files must NOT become the **subject of your comments**"——它限定的是 PR 行级评论的**挂载位置**，不是检索半径。本批按"检索半径=变更影响面、落点=变更行"收敛，两个来源都保住。

### 3. Headroom 是产品接入手册，不是方法论；能拿走的只有记账纪律

Headroom 的 SKILL.md 只有 71 行，内容是"装 `headroom-ai`、调 `compress()`、别这么用"。它真正可迁移的不是压缩算法，是**怎么诚实报数**：

- 反事实量（"省了多少 token"）必须标 `[estimated]` 并给 95% 区间，`HEADROOM_OUTPUT_HOLDOUT=0.1` 留出对照臂后才许转 `measured`；
- 技能正文里直接写禁令："Do not claim a savings percentage; print `tokens_before` and `tokens_after`"；
- 基准带种子可复现（`--seed 20260902`）；
- 明确写"什么时候该跳过"（短对话、散文、已经稠密的负载压不动）。

压缩器本体（SmartCrusher / CodeCompressor / CCR / 代理）是它的产品实现，与本生成器无关，不吸收。

## Ponytail v5 源码结构

| 文件 | 行数 | 作用 |
|---|---:|---|
| `skills/ponytail/SKILL.md` | 53 | 主规则：写作前定范围 → 六层最小完整改动 → 五类永不裁剪 → 三档强度 |
| `skills/ponytail-review/SKILL.md` | 101 | 六序审查 + 三档分流 + 四段式发现 + Verdict/Lean/Not checked |
| `skills/ponytail-audit/SKILL.md` | 103 | 整仓审计，排名，最多 20 条 |
| `skills/ponytail-debt/SKILL.md` | 44 | 扫 `shortcut:` 标记成台账，`no-trigger` 标腐烂风险 |
| `skills/ponytail-gain/SKILL.md` | 52 | 记分板 + 诚实边界（禁止报单仓节省数字） |
| `skills/ponytail-help/SKILL.md` | 76 | 用法 |
| `hooks/ponytail-runtime.js` | ~180 | 20 个宿主的适配层（Claude/Codex/Cursor/Copilot/Qoder/CodeBuddy/Cursor） |
| `hooks/ponytail-instructions.js` | ~130 | 每轮把 SKILL.md 正文按 mode 过滤后重注入 |
| `benchmarks/results/2026-10-07-agentic.md` | 186 | 39 任务 × 5 次 × 三臂的成对基准 |

**一个值得记的设计**：主 SKILL.md 只有 53 行，但靠 `UserPromptSubmit` 每轮重注入整篇正文并按 mode 过滤表行——**文件短、注入面长**。本技能不采用（强制面已由 spec-first-bridge / rules.d / L2-L4 承担），但这个"规则单源 + 注入"的形态说明：skill 体积和规则强度是两件事。

### 基准数字（B 级，官方自述，2026-10-07）

| 相对无技能臂 | Ponytail v4.13 | Ponytail 5 |
|---|--:|--:|
| 代码行数 | −48% | **−53%** [−63..−41] |
| 输出 token | −43% | **−45%** |
| 成本 | −16% | **−26%** |
| 耗时 | −38% | **−41%** |
| 18 项隐藏检查通过 | 95.6% | **96.7%**（无技能臂 95.6%） |
| 风险逻辑带测试 | — | **98%**（无技能臂 68%） |

方法学（引数字必须连同口径）：成对实验臂逐任务交替；每任务 5 次取中位数 → 逐任务比值 → 几何均值，报 95% bootstrap 区间与符号检验；每个单元隔离宿主 `CLAUDE.md`、仓库上下文与自动记忆，只加载被测插件；**全程禁用 Bash**（测"写出什么"，不测"能不能调试"）；21 项非隐藏检查任务的完成度另由盲评判官判定并自检。

上游自己记过的教训（issue #126）：早期 −80~94% 的宣传数字是会话基线伪影，已公开修正。本技能旧文引用 v4.9 的 −54%/−22%/−20%/−27% 与 404→23 行例子，属于被否定的那一代口径，本批已刷新。

## Headroom 源码结构与边界

| 面 | 内容 |
|---|---|
| `skills/headroom/SKILL.md`（71 行） | 接入手册：何时用、Python/TS 两路、零密钥自证命令、三条 Do not |
| `README.md`（36KB） | 产品能力：三档压缩器、CCR 可逆、代理、MCP、跨 agent 记忆 |
| `llms.txt` | 文档索引（"只能取一个 URL 就取这个"） |
| 实测 | 四个场景输入 token −21%/−57%/−42%/−30%；压缩延迟 p50 0.21ms@10K |

三个"该跳过"的诚实边界：短对话与散文压不动、负载已稠密压不动、provider 自带 compaction 且不需要可逆时不必上。

## 对账：已有 / 缺口 / 判定

| # | 主题 | 源 | 本次落地前 | 判定 |
|---|---|---|---|---|
| G1 | `shortcut:` 标记 + 债务台账 | P | 全仓零命中（只有 TODO/FIXME→TECH_DEBT warn 与决策侧 `audit-closure`） | **补** |
| G2 | 审查搜索面含调用方 | P | 反向规则（"只针对变更文件"） | **修矛盾** |
| G3 | 三档分级 + 四段式 + `Not checked` | P | 有 High/Medium/Low，`Low` 静默丢弃 | **补** |
| G4 | 回复收尾披露跳过/未查 | P | 仅回归报告有"遗留风险" | **补** |
| G5 | 基准数字与版本引用 | P | 引 v4.9 旧数 | **纠错** |
| G6 | `estimated`/`measured` 两态 | H | 有"估算给区间"、"压缩率是估算"，无两态标签与转实测路径 | **补** |
| G7 | 零密钥自证命令 | H | 已有 `self-check --check-only`、诚实降级 | 已覆盖，不重复 |
| G8 | 压缩器/CCR/代理 | H | 上下文预算族已有（`context-engineering-layering`） | 不吸收（产品功能） |
| G9 | 强度档 lite/full/ultra | P | `task-methodology-router` 已有仪式复杂度档 | 不吸收（冗余） |
| G10 | hook 每轮重注入 | P | 强制面已由 spec-first-bridge / rules.d / L2-L4 承担 | 不吸收（形态不同） |
| G11 | 记分板 `ponytail-gain` | P | —— | 不吸收（诚实边界已被 G6 覆盖） |

## 本批落地

1. **审查面收敛**：`review-methodology.md` 的 Strict Focus 节改为"检索半径=变更影响面 × 落点=变更行"，跨文件发现与 diff 内发现同权。依据：上游跨 diff 检出 100%（无技能臂 78%）。
2. **去静默丢弃**：删掉两处 `静默丢弃`（严重度表 `Low` 与 AUTO-FIX/ASK 表"可能是误报"），改为"无具体案例即不成立"+ 三档（Must/Should/Nice）+ 四段式 + `Not checked` 收口。
3. **捷径台账**：`assets/gates/architecture/adr.sh` 新增 §5 扫 `shortcut:` 标记，`no-trigger`（缺"何时升级"）warn。挂既有 `check_adr`（enforce=warn），**门禁数仍 59**。fixture `tests/gate-fixtures/adr/compliant-shortcut/` 断言"3 命中 / 1 no-trigger"，已做变异检查（把判据改恒假后断言变红）。
4. **下沉到目标技能**：`template-spec.md` 的 dev-guide §7 拼装原则与节点表 ⑤ 行补 `shortcut: <上限>, <何时升级>` 约定。
5. **两态估算**：`rsi-evidence-methodology.md` §四 补 `estimated`/`measured` 两态表与三条纪律。
6. **数字纠错**：`lazy-generation-methodology.md` 版本 v4.9.0→v5.3.3，基准数字换当前口径并补方法学。
7. **回复披露**：`controlled-language-methodology.md` 补"每条回复收尾给跳过/未查 + 风险"。

## 已知限制

- **BSD awk 中文 locale 假红（环境坑，2026-11-07 实测）**：`build-compendium.sh` 的 awk 在 UTF-8 locale 非交互 shell 下把 9 个不同的中文卷标题判成互相相等，`--check` 假报卷六陈旧（提取出 4692 行垃圾）、`--regen` 自校验失败拒落盘。`LC_ALL=C` 下逐字节正确（Python 真值对照确认 main 本无陈旧）。非交互 shell 跑该脚本须加 `LC_ALL=C`。脚本本体未改（改动属跨平台铁律域，值得单独一批处理）。
- **`shortcut:` 扫描不含 `.sh`**：门禁源自身是 shell 且必须字面写出该模式串，纳入扫描会让本技能自伤。shell 项目不入台账，已知取舍。
- **生成实例滞后**：`simharness/skills/aipaydev-dev/` 是本生成器早前产出的目标技能快照（116 文件入库，`.swarm-yuan-version` 记版本）。本批改的是生成器模板与参考档，**未重生成该实例**——它按设计在下次 `generate-skill.sh --upgrade` 时跟进，本批不碰（避免与 simharness 活体场景冲突）。
- **上游 `ponytail:` 旧标记不识别**：上游债务技能兼容旧写法（`(shortcut|ponytail):`），本技能只认 `shortcut:`——本技能此前无 `ponytail:` 用法，无迁移需求。

## 后续可评估（未实施，触发条件写明）

- **审查四段式进 ocr 5 维审查点**：本轮只改文档口径，`--review` 门禁的 ocr 审查点未同步扩成四段式。触发：目标技能侧出现"审查意见缺后果段被误放行"的真实案例。
- **`ponytail-audit` 型整仓排名报告**：本技能有 `--all` 全序列门禁与 `review-methodology` 的分级，但没有"整仓一次性排名 ≤20 条"的产出形态。触发：用户要求整仓体检而非增量审查时。

## 来源

- Ponytail：https://github.com/DietrichGebert/ponytail（v5.3.3，MIT；`skills/ponytail*/SKILL.md`、`hooks/ponytail-instructions.js`、`benchmarks/results/2026-10-07-agentic.md`）
- Headroom：https://github.com/headroomlabs-ai/headroom（Apache-2.0；`skills/headroom/SKILL.md`、`README.md`、`llms.txt`）
- 本机核对命令：`git clone --depth 1 <repo>` 后 `wc -l`、逐文件 Read；证据分级：仓库元数据 A（本机实测）/ 性能数字 B（上游自述基准）
