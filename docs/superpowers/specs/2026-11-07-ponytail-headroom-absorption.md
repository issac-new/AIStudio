# 2026-11-07 Ponytail v5 + Headroom 吸收（审查面收敛 / 捷径台账 / 两态估算）

## 变更

Ponytail（DietrichGebert/ponytail，MIT）与 Headroom（headroomlabs-ai/headroom，Apache-2.0）源码级调研后的落地批。**不新增门禁、不新增参考文档、不上调双预算**：门禁数 59、`FACT_ARTIFACT_BYTES_BUDGET=618496`、`FACT_SKILLMD_BYTES_BUDGET=11392` 均不变。

### 1. 审查面矛盾收敛（P0，行为修订）

`references/review-methodology.md` 现同时承载两条互斥规则：

- 「严格聚焦规则」（`:66`）："Findings from other files must NOT become the subject of your comments … your task is limited to the current diffs" → 读作"只看 diff"。
- 上游 Ponytail v5（`skills/ponytail/SKILL.md:24`）："Bug fix: before you edit, grep every caller of the function you touch, then fix the root cause once in the shared code" → 要求查调用方。

**收敛口径：搜索面 ≠ 落点面。** open-code-review 那条原文限定的是"评论的**主体**（subject）"，即 PR 行级评论只能挂在变更行——它约束的是报告落点，不是检索半径。改为：

- 检索半径＝变更影响面：被改函数的调用方、被改签名的消费者、测试、夹具、配置、导出面一律入查。
- 报告落点＝变更行：每条发现锚在触发的 diff 行，跨文件证据以 `file:line` 引在正文里，不另开评论。
- 跨文件发现的定级与 diff 内发现同权，不得因"在别的文件"降级或丢弃。

依据：Ponytail v5 基准（`benchmarks/results/2026-10-07-agentic.md`）实测跨 diff 问题检出 100%（无技能臂 78%）；漏查调用方是本仓既有缺陷类型（改 A 漏改 B）。

### 2. 发现分级去静默丢弃（P0，行为修订）

`references/review-methodology.md:58-64` 的严重度表有 `| Low | 可能误报 | 静默丢弃 |`，`:42-49` 的 AUTO-FIX/ASK 表有 `| 可能是误报 | 丢弃（silent discard） |`。静默丢弃隐去不确定性，与本仓「fail-soft 不造假：不猜数、缺席可查」反向。

改为 Ponytail v5 的口径：

- **无具体案例即不成立**：每条发现须能说出"这个输入/这个场景→这个错误结果"。说不出就不是发现，不必降级为 Low 再丢弃。
- 成立的三档：**Must fix**（bug/安全/数据丢失/预期负载下崩塌）/ **Should fix**（高风险无测试、真实变慢、重复、职责混杂、该不存在的代码）/ **Nice to have**（小提速、更短写法）。
- 每条发现四段：**What this is**（这段代码在做什么）/ **Problem**（具体怎么错）/ **Fix**（最小修法）/ **If we skip it**（不修的后果）。
- 收口行：`Verdict:` + `Lean: -N 行可达` + **`Not checked:`**（哪些面没查或查不了，一行）。

`Not checked` 是本批新增的强制收口项——现有文档只有回归报告专项写了"遗留风险"（`controlled-language-methodology.md:57`），审查意见没有对应物。

### 3. 捷径标记 `shortcut:` 与债务台账（P1，新增机制，零门禁增量）

每条有意为之的简化留一条代码注释：

```
shortcut: <上限>, <何时升级>
```

机检挂进**既有** `check_adr`（`assets/gates/architecture/adr.sh` §5，enforce=warn），不新增 `check_*` 函数：

- 扫描面：`_scan_src`，扩展名 `ts,js,tsx,jsx,py,go,rs,java,cs,php,rb,kt,swift`（**不含 `sh`**——门禁源自身是 shell，字面命中会自伤，见决策记录）。
- 命中条件含注释前缀：`(^|[[:space:]])(#|//|/\*)[[:space:]]*shortcut:`——只有注释里的标记入账，正文提到该约定不算。
- **no-trigger 判据**：标记体无逗号（`,` 或 `，`）＝缺升级触发条件＝会静默腐烂，单独计数。
- 输出：`已登记 N 处；其中 M 处 no-trigger（会静默腐烂）`。有标记不罚（登记过的妥协不是污点），缺触发条件才 warn。

口径来源：上游 `/ponytail-debt`（`skills/ponytail-debt/SKILL.md`）——"捷径不是污点，未记账的捷径才是"。本仓 `decision-governance.md:156` 已登记 gstack 变体 `gstack-shortcut(dec-<id>)`（挂在决策记录上），本批补的是**代码级**标记与机械台账，两者互补不重复。

目标技能侧同步：`references/template-spec.md` ⑤编码节点写入该约定，`--adr` 一节补检查语义。

### 4. `[estimated]` 两态估算（P2，Headroom）

`references/rsi-evidence-methodology.md` 新增一条：反事实量（"省了多少 token / 少了多少行"）不得以点值断言，须二态标注——

- `estimated`：给区间（95% CI）并显式标 `[estimated]`；
- `measured`：留出对照臂（holdout）后才有资格；对照臂比例、样本量、判据一并披露。

依据：Headroom 输出侧自报即此形态（`README.md`：`Reduction: 31.7% (95% CI 27.7% … 35.7%) [estimated]`，`HEADROOM_OUTPUT_HOLDOUT=0.1` 才转 `measured`）。与既有「估算给区间不给点值」（`codex-security-methodology.md:244`）、「压缩率是估算非计量断言」（`context-engineering-layering.md:187`）同族，本批补的是**两态标签与转实测路径**。

### 5. 基准数字与版本刷新（P1，纠错）

`references/lazy-generation-methodology.md` 引用 v4.9.0 的旧数（LOC −54%、token −22%、成本 −20%、耗时 −27%、日期选择器 404→23 行）。上游当前（v5.3.3，基准 2026-10-07）为 **LOC −53% / token −45% / 成本 −26% / 耗时 −41%**，日期选择器 **335→10 行**。同档 `:39` 已记录"基线伪影"教训，却继续沿用同族的单例数字——本批一并刷新，并补该基准的方法学（成对实验臂交替、每任务 5 次取中位数、几何均值、95% bootstrap 区间、符号检验、18 项隐藏检查、盲评判官自检、隔离宿主 CLAUDE.md 与仓库上下文）。

### 6. 回复收尾披露（P2）

`references/controlled-language-methodology.md` 补一条通用收口：每条面向人的回复末尾给一两行"本次跳过/未查的事实 + 用户必须知道的风险"。现有只有回归报告专项，其余回复面没有。

## 决策记录

- **为什么改既有文档而不新增参考档**：`FACT_GATES_BUDGET=59` 冻结、`FACT_ARTIFACT_BYTES_BUDGET` 已有 33 次例外登记。Ponytail v4.9 的阶梯（`lazy-generation-methodology.md:13-21`）比上游 v5 更细（把上游合并的标准库/平台拆成两层），是超集不是落后——**阶梯不动**，只补 v5 新增的三个面（审查、台账、两态估算）。
- **Headroom 只取两条纪律，不吸收其产品面**：其 SKILL.md（71 行）是 `headroom-ai` 接入手册（`compress()`、代理、CCR、MCP），属目标项目可选组件，不是生成器方法论。上下文预算族本仓已有（`context-engineering-layering.md` 三漏与输出经济学）。另：零密钥自证命令本仓已有对等物（`self-check.sh --check-only`、诚实降级），不重复吸收。
- **shortcut 检查挂 `check_adr` 而不新开 gate**：`check_adr` §4 已管 TODO/FIXME→技术债登记，语义相邻（延后记账），扩该面不改门禁数。用户裁决选此项而非"新增独立 advisory 门禁"（后者须等额删一个门禁）。
- **扫描面不含 `.sh`**：门禁源自身是 shell 且必须字面写出 `shortcut:` 模式串；把 `sh` 纳入扫描会让本技能自伤。代价＝shell 项目不入台账，已知限制，在文档与 R143 里如实登记。
- **不吸收 Ponytail 的 lite/full/ultra 强度档**：`task-methodology-router` 已有仪式复杂度档位（任务类型→门禁聚焦+方法论分派），再叠一套强度档是冗余，违"多份并存→合一收敛"。不吸收 `ponytail-gain` 记分板：其"禁止报单仓节省数字"的诚实边界已被本批 §4 两态估算覆盖。
- **不吸收 Ponytail hook 重注入机制**：该机制解决的是"技能不常驻"问题（每轮 UserPromptSubmit 重注入 SKILL 正文并按 mode 过滤）。本仓宿主侧已由 spec-first-bridge / rules.d / L2-L4 强制面承担，形态不同。

## 验证（2026-11-07 实测）

- `bash tests/run-gate-fixture.sh adr`：**3/3 PASS**（violating 退出 1 / compliant 退出 0 / compliant-shortcut 退出 0，两条 expect-output 断言全命中）。
- **变异检查已做**：把 `gates-warn.sh` 的 no-trigger 判据改成恒假后重跑，`compliant-shortcut` 断言变红（PASS 2 / FAIL 1）；还原后复跑回 3/3 绿——断言钉住了行为，不是空跑。
- `scripts/self-check.sh --check-only` ✓：门禁 59 ≤ 预算 59、变量 204 ≤ 预算 210、上下文表面 199522B ≤ 199680B、UNIVERSAL_FILES ≈605542B ≤ 618496B——**双预算零上调**。
- `scripts/registry-render.sh --check` ✓（域源↔生成视图逐字节一致；dist.tsv 四档字节锚刷新后再检通过）。
- `scripts/build-compendium.sh`：`LC_ALL=C` 下 `--regen` 重灌后 `--check` 全绿（卷一因本批改 README 而重灌，卷二~卷六逐字节不变）。
- `tests/test-doc-numbers.sh`：254 项断言 0 失败。
- `node scripts/verify-release-manifest.mjs` ✓ 四模块对账全绿（yuan-skill=v2.99.4）。
- `assets/precheck.sh --all` 在本仓（AIStudio 根）跑出 2 个 fail（`gate_sensitive_dirs_missing` / `gate_security_scan_dirs_missing`）——**main 上同款红（pre-existing，占位 conf 目录不存在所致），非本批引入**；本批触及的门禁面（adr）fixture 全绿。
- 未跑项：全量 gate-fixture 扫描（用户中止，adr 组已单独覆盖）；`l2-kit-parity` 未跑（本批未触及 `.swarm-yuan/hooks/`）。

### 环境坑（本轮新发现，已在 R143 登记）

BSD awk 对中文串的 `==` 比较在 UTF-8 locale 的非交互 shell 下失配（9 个卷标题全部误判相等），`build-compendium.sh --check/--regen` 因此假红/自校验失败；`LC_ALL=C` 下行为正确（与 Python 真值一致）。非交互 shell 跑汇编检查须 `LC_ALL=C` 前缀。

## 设计文档影响

- DESIGN_SYNC: none（理由：本批未触及注册表 DESIGN_DOCS 四个整合正本——docs/DESIGN.md 与三份 workbench 设计台账；变更面全部落在 skills/swarm-yuan/ 技能本体。技能自身的设计文档 skills/swarm-yuan/README.md 能力表「懒生成」行已随批进位（v5.3.3 来源＋捷径台账机检面＋门禁数不变声明），CHANGELOG.md 记 v2.99.4（release:check 严格口径），调研档落 docs/research/R143-ponytail-headroom-absorption.md（仓库档案，不入分发包，不占 604KiB 预算）——三者均非 DESIGN_DOCS 注册面。）
