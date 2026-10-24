# R5 · 上游组件源码调研：gstack 与 superpowers（offline-cache 本地源码）

> 调研人：R5-上游组件调研员（本地源码）｜ 调研日期：2026-07-20
> 范围：`swarm-yuan/offline-cache/gstack/`（完整源码，重点核读 SKILL.md / DESIGN.md / ETHOS.md / ARCHITECTURE.md / README.md / AGENTS.md / conductor.json / agents/ / autoplan/ / cso/ / design-review/ / review/ / context-save / context-restore / canary / benchmark / learn / investigate / office-hours 等）与 `swarm-yuan/offline-cache/superpowers/`（全目录 4 个文件）。
> 方法：纯本地源码只读分析。所有行号引用基于工作区当前文件状态（2026-07-20）。路径相对仓库根 `/Volumes/nvme2230/lab/Swarm-yuan`。

---

## 〇、版本基线与目录实况（先纠正一个事实性误判）

| 组件 | 本地实况 | 版本 | License |
|---|---|---|---|
| gstack | **完整源码克隆**（70+ 顶层条目，含 40+ 个 skill 目录、`browse/` TypeScript 源码、`test/`、`bin/` 60+ 个工具脚本、`lib/`） | v1.60.1.0（`swarm-yuan/offline-cache/gstack/VERSION:1`） | MIT，Copyright (c) 2026 Garry Tan（`offline-cache/gstack/LICENSE:1-3`） |
| superpowers | **不是核心插件源码，而是 superpowers-marketplace（插件市场目录）仓库**，全目录仅 4 个文件：`LICENSE`、`README.md`、`.claude-plugin/marketplace.json`、`.claude/settings.local.json`（`find` 结果，2026-07-20 核实） | marketplace v1.0.13（`offline-cache/superpowers/.claude-plugin/marketplace.json:7-10`） | MIT，Copyright (c) 2025 Jesse Vincent（`offline-cache/superpowers/LICENSE:1-3`） |

**关键事实**：真正的 superpowers 核心插件（v6.1.1）并未被 vendor 进 offline-cache——marketplace.json 仅以 URL 形式指向 `https://github.com/obra/superpowers.git`（`marketplace.json:12-21`）。这一点对"离线安装"与"吸收度"结论有实质影响（见 §五、§八）。

---

## 一、gstack：设计理念（Ethos / 哲学）

gstack 是 Garry Tan（Y Combinator CEO）开源的"虚拟工程团队"skill 套件——"turns Claude Code into a virtual engineering team — a CEO … an eng manager … a designer … a reviewer … a QA lead … a security officer … a release engineer. Twenty-three specialists and eight power tools, all slash commands, all Markdown, all free, MIT license"（`offline-cache/gstack/README.md:23`；自我定位亦见 `AGENTS.md:3-5`）。

其哲学集中在 `ETHOS.md`（169 行，被自动注入每个 workflow skill 的 preamble，`ETHOS.md:3-5`），三大原则：

1. **Boil the Ocean（煮干海洋）**（`ETHOS.md:34-60`）：AI 时代"完整实现"的边际成本趋零，"不要煮海洋"已从忠告退化为借口。给出人类团队 vs AI 辅助的压缩比表（boilerplate ~100x、测试 ~50x、feature ~30x，bug fix ~20x，架构 ~5x，研究 ~3x，`ETHOS.md:20-27`）。执行口径是"Ocean, lakes first"——海洋是目标，湖泊是路径单位（`ETHOS.md:42-48`）。"Completeness is cheap"：150 行完整方案永远优先于 80 行 90% 方案（`ETHOS.md:50-53`）。
2. **Search Before Building（先搜后建）**（`ETHOS.md:64-112`）：三层知识——Layer 1 久经考验 / Layer 2 新潮流行（警惕狂热）/ Layer 3 第一性原理（最有价值）；最高价值产出是发现"传统做法是错的"的 Eureka moment（`ETHOS.md:97-106`）。
3. **User Sovereignty（用户主权）**（`ETHOS.md:115-148`）："AI models recommend. Users decide." 两个模型一致同意也只是强信号而非授权；正确模式是 generation-verification loop，AI 绝不因自信而跳过验证步（`ETHOS.md:117-139`）。引 Karpathy "Iron Man suit" 与 Simon Willison "agents are merchants of complexity"（`ETHOS.md:126-131`）。

外加一条元原则 **Build for Yourself**（`ETHOS.md:163-168`）：每个功能都因作者自己需要而建。

**关于 DESIGN.md 的事实澄清**：任务预期的"设计原理文档"实际是其**社区网站的设计系统规范**（排版/色彩/动效，工业实用主义美学，amber-500 强调色 + Satoshi/DM Sans/JetBrains Mono），见 `DESIGN.md:1-7`。gstack 真正的架构设计原理写在 `ARCHITECTURE.md`（435 行）。

---

## 二、gstack：核心功能

40+ 个 slash-command skill，按 `AGENTS.md:12-107` 分六类（括号内为本地证据）：

- **计划期审查**：`/office-hours`（六连问产品拷问，`office-hours/SKILL.md:1084-1153`）、`/plan-ceo-review`、`/plan-eng-review`、`/plan-design-review`、`/plan-devex-review`、`/autoplan`（一条命令跑完 CEO→design→eng→DX 四审，`autoplan/SKILL.md:25-35`）、`/design-consultation`、`/spec`。
- **实现+审查**：`/review`（pre-landing PR 审查）、`/codex`（跨模型第二意见）、`/investigate`（根因调试，Iron Law "no fixes without root cause"，`investigate/SKILL.md:63,824`）、`/design-review`、`/qa`、`/qa-only`、`/scrape`、`/skillify`。
- **发布+部署**：`/ship`、`/land-and-deploy`、`/canary`（部署后监控）、`/landing-report`、`/document-release`、`/document-generate`。
- **运维+记忆**：`/context-save`、`/context-restore`、`/learn`、`/retro`、`/health`、`/benchmark`、`/benchmark-models`、`/cso`（OWASP+STRIDE 安全审计）。
- **浏览器+agent 整合**：`/browse`（常驻 Chromium daemon）、`/open-gstack-browser`、`/pair-agent`。
- **安全+范围**：`/careful`、`/freeze`、`/guard`、`/unfreeze`。

顶层入口是一个 **router skill**（`SKILL.md`，602 行，frontmatter `preamble-tier: 1`，`SKILL.md:1-14`），按 40+ 条路由规则把自然语言请求分发到对应 skill，并明确"误触发 skill 比漏触发更便宜"（`SKILL.md:594-599`）。

---

## 三、gstack：架构设计原理

### 3.1 Agent 编排：Markdown skill 即专家 + 模板生成防漂移

- **"The browser is the hard part — everything else is Markdown"**（`ARCHITECTURE.md:7`）。硬基础设施只有一个常驻 Chromium daemon（CLI→localhost HTTP→Bun server→CDP→Chromium，首调 ~3s 后续 ~100-200ms，`ARCHITECTURE.md:11-36`），其余全部是 SKILL.md。
- **SKILL.md 模板生成系统**：所有 SKILL.md 由 `SKILL.md.tmpl` + `gen-skill-docs.ts` 从**源码元数据**自动生成（`ARCHITECTURE.md:249-285`；`SKILL.md:16-17` "AUTO-GENERATED from SKILL.md.tmpl — do not edit directly"）。占位符表 17 项（`{{COMMAND_REFERENCE}}` 来自 `commands.ts`、`{{PREAMBLE}}`、`{{QA_METHODOLOGY}}` 等，`ARCHITECTURE.md:267-283`）。选择"提交生成物而非运行时生成"的三理由：skill 加载时无构建步骤、CI 可用 `--dry-run`+`git diff --exit-code` 抓文档漂移、git blame 可用（`ARCHITECTURE.md:297-303`）。
- **统一 preamble**：每个 skill 开头注入同一段 bash（更新检查、会话计数、配置读取、学习记录加载、遥测），并注入 ETHOS 原则与模型特定行为补丁（`ARCHITECTURE.md:287-295`；`SKILL.md:27-139,455-471`）。
- **命令按副作用分类调度**：READ / WRITE / META 三集合（`ARCHITECTURE.md:315-331`）。
- **autoplan 的自动决策编排**（审查机制的集大成者，`autoplan/SKILL.md`，1852 行）：
  - **6 条决策原则**自动回答中间问题：①Choose completeness ②Boil lakes（blast radius 内全修且 <1 天 CC 工作量自动批准）③Pragmatic ④DRY ⑤Explicit over clever ⑥Bias toward action（`autoplan/SKILL.md:915-924`）；按阶段分配权重（CEO 阶段 P1+P2 主导、Eng 阶段 P5+P3、Design 阶段 P5+P1，`926-929`）。
  - **决策三级分类**：Mechanical（静默自动）/ Taste（自动但终审浮现）/ **User Challenge（两模型一致认为应改变用户既定方向——永不自动决定**，须给出"用户原话/模型建议/理由/我们可能缺失的上下文/若我们错了的代价"五要素，`933-966`）。安全/可行性阻断时措辞升级为紧急但用户仍决策（`962-965`）。
  - **严格串行** CEO→Design→Eng→DX，禁止并行（`969-976`）；"自动决策替代的是判断，不是分析"——每个审查段落仍须全深度执行、禁止把审查段压缩成一行表格（`980-1010`）。
  - **Decision Audit Trail** 落盘每条自动决策（`1567-1575`）+ Phase 0 restore point（`1026-1048`）+ Phase 4 终审门（`1640`）。

### 3.2 状态管理：文件系统即数据库，原子写 + 最小权限

- daemon 状态文件 `.gstack/browse.json`（tmp+rename 原子写，mode 0o600），含 pid/port/token/binaryVersion（`ARCHITECTURE.md:64-72`）。
- 版本自动重启：二进制内嵌 `git rev-parse HEAD`，与运行中 server 的 binaryVersion 不符即杀旧启新，根除"stale binary"类 bug（`ARCHITECTURE.md:78-80`）。
- 随机端口（10000-60000，碰撞重试 5 次）支持 10 个 Conductor workspace 零配置并存（`ARCHITECTURE.md:74-76`）。
- 用户态状态全在 `~/.gstack/`：会话文件（`sessions/$PPID`，2 小时窗口计数，3+ 会话触发 ELI16 模式）、`analytics/skill-usage.jsonl`、`projects/$SLUG/learnings.jsonl`、`checkpoints/`（`SKILL.md:32-35`；`context-save/SKILL.md:875-900`）。
- **context-save/restore**：结构化 checkpoint（frontmatter：status/branch/timestamp/session_duration_s/files_modified + Summary/Decisions/Remaining Work/Notes 四段，`context-save/SKILL.md:907-935`）；标题在 **bash 层**用允许表消毒（仅 `a-z 0-9 - .` 存活），文件名仅追加不覆盖、同秒碰撞加随机后缀（`context-save/SKILL.md:870-897`）——防注入设计明确写在注释里。restore 是独立 skill，支持跨 Conductor workspace 恢复（`AGENTS.md:59-60`）。
- 日志三环形缓冲（各 5 万条，O(1) push，每秒增量刷盘，HTTP 处理永不被磁盘 I/O 阻塞，`ARCHITECTURE.md:232-247`）。

### 3.3 上下文工程

- **Ref 系统**：`snapshot -i` 走 ARIA 树分配 `@e1/@e2` 引用，映射 Playwright Locator（getByRole），**不改 DOM**（规避 CSP/框架 hydration/Shadow DOM 三类破坏，`ARCHITECTURE.md:201-213`）；导航即清空（stale ref 必须响亮失败，`211-213`）；用前 `count()` 探活，~5ms 换快速失败（`215-226`）。
- **错误信息为 AI 而写**：每个错误必须可操作（"Element not found" → "Run `snapshot -i` to see available elements"），`wrapError()` 剥栈加指引（`ARCHITECTURE.md:333-341`）。
- **输出瘦身**：不用 WebSocket/MCP，plain HTTP + plain text"lighter on tokens and easier to debug"（`ARCHITECTURE.md:429-435`）。
- **Unicode 出口消毒**：page 内容的孤立 UTF-16 surrogate 会让 Anthropic API 400，单点在 server egress 的 `sanitizeReplacer` 处理，并立"架构不变量"+测试钉死（`ARCHITECTURE.md:147-160`）。
- **安全上下文分层**（sidebar agent 读敌意网页，提示注入防线 L1-L6）：L1-L3 内容安全（datamarking/隐藏元素剥离/URL blocklist）→ L4 本地 BERT-small ONNX 分类器（22MB int8，无网络）→ L4b Haiku 全文形态分类（LOG_ONLY 0.40 门控省钱）→ **L5 canary token（系统提示注入随机 token，输出中出现即确定性 BLOCK 结束会话）** → L6 双分类器一致才 BLOCK（防 Stack Overflow 指令文本误报）（`ARCHITECTURE.md:162-180`）。`GSTACK_SECURITY_OFF=1` 真 kill switch；攻击日志加盐 sha256+域名，10MB 轮转 5 代（`178`）。

### 3.4 审查机制（/review + /cso，本调研与 swarm-yuan 最相关部分）

**/review（pre-landing 审查，1852 行 + checklist.md + 7 个 specialist 文件）**：

1. **Step 1.5 Scope Drift Detection**：先问"构建的是不是被要求的——不多不少"，对比 TODOS.md/PR 描述/commit message 与 diff stat，输出 CLEAN/DRIFT/REQUIREMENTS MISSING（`review/SKILL.md:856-888`）。
2. **Plan Completion Audit**：发现 plan 文件→提取可执行项（上限 50）→按可验证性分四类 **DIFF-VERIFIABLE / CROSS-REPO / EXTERNAL-STATE / CONTENT-SHAPE**，分别走 diff 对照、兄弟仓库 `[ -f ]` 探测、标 UNVERIFIABLE 并注明人工核查点、validator 探测；诚实规则："代码处理了某交付物 ≠ 交付物本身"，DONE 与 UNVERIFIABLE 之间取后者（`review/SKILL.md:891-984`，诚实规则在 `967`）。
3. **两遍清单**：Pass 1 CRITICAL（SQL/数据安全、竞态、LLM 输出信任边界、Shell 注入、枚举完备性——其中枚举完备性明确"必须读 diff 之外的代码"）+ Pass 2 INFORMATIONAL（`review/checklist.md:7-10,36-66`；`review/SKILL.md:1203-1210`）。另有显式 "DO NOT flag" 抑制清单（`checklist.md:115-118`）。
4. **置信度标定 + Pre-emit 验证门（#1539）**：finding 必须带 1-10 置信度，3-4 压入附录、1-2 仅 P0 才报（`review/SKILL.md:1221-1231`）；**凡不能逐字引用"动机代码行"的 finding 强制降到 4-5 并压出主报告**（"If you cannot quote the motivating line(s), the finding is unverified"），并给出该门消灭的 4 个 FP 类表（`1241-1276`）；还有框架元构造豁免（Django Meta/ORM decorator 等引用元构造即可，`1257-1267`）与**标定学习**（用户确认低置信 finding 为真→记为 learning 反哺后续审查，`1278-1281`）。
5. **Review Army 并行 specialist 编排**（`review/SKILL.md:1285-1461`）：
   - 作用域门控：Testing/Maintainability 常开（diff ≥50 行）；Security（auth 面或后端 >100 行）、Performance、Data Migration、API Contract、Design 按 scope 信号条件触发（`1320-1335`）。
   - **自适应门控（adaptive gating）**：读 `gstack-specialist-stats` 历史命中率——某 specialist 连续 10+ 次派发零发现则标 `[GATE_CANDIDATE]` 自动跳过；Security 与 data-migration 标 `[NEVER_GATE]`（"insurance policy specialists — they should run even when silent"）（`1337-1343`）。
   - 单条消息内并行派发全部 specialist subagent，各自带 checklist+栈上下文+领域历史 learnings，输出逐行 JSON finding（含 fingerprint、可附 test_stub）（`1352-1399`）。
   - 合并：**fingerprint 去重，多 specialist 命中同一 fingerprint → confidence +1 并标 MULTI-SPECIALIST CONFIRMED**；置信门过滤；算 PR Quality Score = max(0, 10-(2·critical+0.5·informational))（`1403-1433`）。
   - **Red Team 条件触发**：diff >200 行或已有 CRITICAL finding 时，再派一个红队 subagent 专攻"已合并发现的盲区"（`1465-1474`）。
6. **Fix-First 处置**：机械修复 AUTO-FIX，合理者可分歧的 ASK，批量一次问（`checklist.md:12-13,20-26`；swarm-yuan 已吸收，见 §六）。

**/cso（安全审计，1285 行 + sections/audit-phases.md）**：

- 14 个 Phase：P0 栈检测（软门非硬门——决定优先级不决定范围，`cso/SKILL.md:839-870`）→ P1 攻击面普查（代码面+基础设施面计数输出，`919-957`）→ P2 秘密考古 / P3 依赖供应链 / P4 CI/CD / P5 基础设施影子面 / P6 Webhook / P7 LLM&AI 安全 / **P8 Skill 供应链（扫描已装 skill 的恶意模式，引 Snyk ToxicSkills 研究"36% 已发布 skill 有安全缺陷、13.4%  outright 恶意"）** / P9 OWASP Top 10 / P10 STRIDE / P11 数据分级（`cso/sections/audit-phases.md:5-229`；P8 见 `134-157`）→ P12 FP 过滤 → P13 报告 → P14 落盘。
- **22 条硬排除 + 12 条判例**控误报（如"用户内容出现在 user-message 位 ≠ prompt injection"、"文档文件不报告，但 SKILL.md 是可执行提示代码，不适用此豁免"，`cso/SKILL.md:972-1011`，SKILL.md 豁免在 `988`）。
- **主动验证 + 变体分析 + 并行独立复核**：finding 标 VERIFIED/UNVERIFIED/TENTATIVE（`1012-1026`）；一个 VERIFIED 即全库搜同模式变体（`1028-1033`）；**每个候选 finding 派独立验证 subagent（只给 file:line 防锚定），低于 8 分即弃**（`1035-1046`）。
- 每条 finding 必须含具体利用场景（"This pattern is insecure" is not a finding，`1050`）+ 趋势追踪。

### 3.5 质量保障体系（对自身 skill 文档的测试）

三级测试：Tier 1 静态校验（解析 SKILL.md 中全部 `$B` 命令对注册表验证，免费 <2s，每次 `bun test` 跑）→ Tier 2 真实 `claude -p` E2E（~$3.85/20min）→ Tier 3 LLM-as-judge 给文档打分（~$0.15）；付费层用 `EVALS=1` 门控——"catch 95% of issues for free, use LLMs only for judgment calls"（`ARCHITECTURE.md:305-313,419-427`）。E2E 观测性全部 try/catch 包裹，"观测写失败永不导致测试失败"（`ARCHITECTURE.md:403`）。

---

## 四、superpowers：offline-cache 实况与能力画像

### 4.1 本地实况（全目录）

`offline-cache/superpowers/` 是 **superpowers-marketplace**（Jesse Vincent/obra 的 Claude Code 插件市场目录仓库），不是核心插件：

- `README.md:1-3`："Superpowers Marketplace — Curated Claude Code plugins for skills, workflows, and productivity tools."
- `.claude-plugin/marketplace.json`：owner Jesse Vincent，version 1.0.13，编目 10 个插件（`marketplace.json:2-10`），全部以 URL source 指向各自 GitHub 仓库：
  - **superpowers（核心）v6.1.1**："Core skills library: TDD, debugging, collaboration patterns, and proven techniques"（`marketplace.json:12-21`）
  - superpowers-chrome v3.0.1（CDP 直连）、elements-of-style v1.0.0（Strunk 1918 写作规范）、episodic-memory v1.4.2（跨会话语义搜索记忆）、superpowers-lab v0.5.0（tmux 自动化等实验）、superpowers-developing-for-claude-code v0.3.1、superpowers-dev（dev 分支）、**claude-session-driver v4.0.0（经 tmux 启动/控制/监控其他 Claude Code 会话作为 worker）**、private-journal-mcp v2.0.1、double-shot-latte v1.2.0（自动判断是否继续工作，消除"Would you like me to continue?"中断）（`marketplace.json:22-112`）。
- 核心插件自述能力：20+ 实战 skills、`/brainstorm`、`/write-plan`、`/execute-plan`、skills-search 发现工具、**SessionStart 上下文注入**（`README.md:26-30`）。
- `.claude/settings.local.json`：本地权限白名单（python3、episodic-memory 搜索、git add/commit/push）。

### 4.2 核心插件（superpowers v6.1.1）能力画像（依据 swarm-yuan 的二手调研记录）

本地无核心插件源码，最权威的就地证据是 swarm-yuan 自己的调研结论：`references/subagent-orchestration.md:118` 明确"来自 superpowers v6.1.1 + comet v0.3.9 源码调研"，并列出其 **14 个 skills**（`subagent-orchestration.md:120-137`）：brainstorming（苏格拉底式设计精炼）、writing-plans（设计→2-5 分钟任务）、executing-plans（批量执行+人工检查点）、**subagent-driven-development**、dispatching-parallel-agents、test-driven-development（强制 RED-GREEN-REFACTOR，删违规代码）、systematic-debugging（4 阶段根因）、verification-before-completion、requesting-code-review、receiving-code-review、using-git-worktrees、finishing-a-development-branch、writing-skills、using-superpowers（SessionStart 引导）。

其方法论核心（`subagent-orchestration.md:7-13` 转述）：**上下文隔离**——每任务派全新 subagent，精确构造其所需上下文，不继承主会话历史；核心公式 "Fresh subagent per task + task review (spec + quality) + broad final review = high quality, fast iteration"。

---

## 五、两者关系与分工：谁把谁打包在一起？

**事实核查结论：gstack 并没有把 superpowers 打包在一起。** 对 `offline-cache/gstack/` 全部 `*.md` 做 `superpowers|obra` 大小写不敏感搜索，**零命中**（2026-07-20，Grep）。两者是相互独立的上游项目（gstack=Garry Tan；superpowers=Jesse Vincent/obra），理念也无文本级互相引用。

**真正把它们打包在一起的是 swarm-yuan 自己**，证据链：

1. `swarm-yuan/.gitignore:1-11` 治理说明："gstack/ superpowers/ 是 clone 的第三方仓库（gitlink 已移除），本地使用需手动 clone"。
2. `docs/paradigm-decisions.md:49`：决策"打包 `swarm-yuan-offline-cache.zip`（44MB，含 graphify-wheels + npm + gstack + superpowers）"；`52`：`.gitignore` 忽略并 `git rm --cached` 停止跟踪 37 文件。
3. `scripts/install-offline-win.sh:79-108`：Windows 离线安装第 3 步把 `offline-cache/gstack` 复制到 `~/.claude/skills/gstack` 并跑 `./setup`；第 4 步把 `offline-cache/superpowers` 复制到 `~/.claude/plugins/superpowers`。
4. `scripts/self-check.sh:75-79`：运行时自检分别探测 `~/.claude/plugins|skills/superpowers` 与 `~/.claude/skills/gstack`。

**swarm-yuan 赋予两者的分工**（`swarm-yuan/SKILL.md:106`）：

> OpenSpec（spec-driven）/ **superpowers（subagent-driven）** / comet（state machine）/ **gstack+OCR（review）** / GitNexus+graphify（code-graph）/ gsd-core（phase-loop+goal-backward）/ claude-mem（memory persistence）

即：**superpowers = 编码实现阶段的 subagent 编排方法论（workflow 节点⑤）；gstack = 审查方法论（check 段）+ 计划期多维审查的参考系**。打包进同一 offline-cache 的原因是工程性的：swarm-yuan 的 Windows 离线安装场景要把"10 个运行时"一次性落地（`install-offline-win.sh:2,5-7`），gstack（Git 克隆类）与 superpowers（插件市场类）都不走 npm/pip 通道，只能整目录打包。

---

## 六、swarm-yuan 吸收度核实（对照三份文件）

**吸收总口径**：`swarm-yuan/SKILL.md:104` 自称"它整合的方法论（只引用调用，不重新实现）"；`108` 工具引用铁律"只允许 `gitnexus`/`graphify`/`ocr`/`claude-mem`/`gsd-tools` 命令调用，不重新实现、不复制源码"。注意：**gstack 与 superpowers 均不在允许调用的 CLI 清单里**——swarm-yuan 对它们的"引用"是**文档级方法论吸收**（写进 references 供 AI 阅读），不是运行时命令调用。门禁实证：`assets/precheck.sh:429-460` 的 `check_review` 调的是 `ocr review`（阿里 open-code-review），无 ocr 时降级为"AI 按 5 维度审查"提示；`check_security`（`precheck.sh:1101`）是 swarm-yuan 自实现，依据 `references/security-spec.md`。gstack 的 `/review`、`/cso` 本体从未被 precheck.sh 调用。

### 6.1 对 superpowers 的吸收（`references/subagent-orchestration.md`，逐条核实）

| superpowers 机制 | swarm-yuan 吸收情况 | 证据 |
|---|---|---|
| 核心公式（fresh subagent + 两阶段审查 + final review） | ✅ 全文吸收为 Orchestrator/Spawn-Collect 循环 | `subagent-orchestration.md:11-30` |
| 文件交接（Context Hygiene，brief/report 走文件路径不粘贴） | ✅ 吸收，含"42k 字符 dispatch 99% 是粘贴历史"反模式 | `:32-43` |
| 状态回报契约（DONE/DONE_WITH_CONCERNS/NEEDS_CONTEXT/BLOCKED） | ✅ 吸收 + BLOCKED 四分支处理 | `:44-61` |
| 两阶段审查（spec 合规 + 代码质量）+ final whole-branch review | ✅ 吸收 | `:63-72` |
| Progress Ledger（对话记忆不抗 compaction，落盘恢复） | ✅ 吸收（落点改为 `.swarm-yuan/sdd/progress.md`） | `:74-82` |
| 连续执行不停顿 / 模型显式选择（"Turn count beats token price"） | ✅ 吸收 | `:84-100` |
| reviewer prompt 禁忌（不预判发现、全局约束作注意力镜头） | ✅ 吸收 | `:102-107` |
| 14 skills 全量编目 | ⚠️ 编目但全部标"可引用"（advisory），无门禁化 | `:120-137` |

### 6.2 对 gstack 的吸收（`references/review-methodology.md`，逐条核实）

| gstack 机制 | swarm-yuan 吸收情况 | 证据 |
|---|---|---|
| 两遍清单（CRITICAL/INFORMATIONAL） | ✅ 吸收 | `review-methodology.md:21-38` |
| Fix-First（AUTO-FIX vs ASK） | ✅ 吸收，含"可能误报→静默丢弃" | `:40-54` |
| Specialist 并行审查（6 个 specialist 表） | ✅ 吸收（文档级） | `:70-83` |
| Plan Completion Audit 四分类（DIFF-VERIFIABLE 等） | ✅ 吸收 | `:117-128` |
| gstack v1.58 八维能力编目（ceo/eng/design/devex/codex/cso/benchmark/investigate） | ⚠️ 编目+落点建议，全部"可引用" | `:176-191` |
| cso 的 22 条 FP 硬排除 / 置信门 8/10 / pre-emit 引用门（#1539）/ 并行独立验证 / 变体分析 | ❌ 未吸收 | `review-methodology.md` 全文无对应内容（2026-07-20 通读核实） |
| review 的 adaptive gating（specialist 命中率统计）/ fingerprint 去重 +1 boost / PR Quality Score / Red Team | ❌ 未吸收 | 同上 |
| autoplan 的 6 决策原则 / Taste vs User Challenge 分类 / Decision Audit Trail / restore point | ❌ 未吸收 | `subagent-orchestration.md` 与 `review-methodology.md` 均无；swarm-yuan 的"AI 主导+用户决策"（`SKILL.md:46-53`）是原则陈述，无决策分类与审计落盘机制 |
| context-save/restore 的 bash 层标题消毒 / 仅追加 checkpoint | ❌ 未吸收（swarm-yuan 有 state-machine.sh 但无此消毒与 checkpoint 格式） | 对照 `context-save/SKILL.md:870-935` |
| canary"alert on changes, not absolutes"/"don't cry wolf"连续 2 次才告警 | ❌ 未吸收 | `review-methodology.md:190` 仅一行提及 `/benchmark`，canary 未提及 |
| SKILL.md 模板生成 + CI 新鲜度校验（`gen:skill-docs --dry-run`+`git diff --exit-code`） | ❌ 未吸收 | swarm-yuan 的 58 个框架规则三件套是手写维护，无生成-校验闭环 |

**吸收度总评**：swarm-yuan 对两者的吸收集中于**工作流形态**（编排循环、两遍审查、处置启发式），这一层吸收是忠实的（均标注出处，`subagent-orchestration.md:3-5`、`review-methodology.md:3-5`）；但**度量驱动与防误报工程**（adaptive gating、置信度标定、pre-emit 引用门、FP 排除清单、审计轨迹、checkpoint 消毒）基本未吸收。且全部吸收物均为"可引用"级 advisory，没有任何一条转化为 precheck.sh 的可执行门禁。

---

## 七、未吸收但值得吸收的机制（按对 swarm-yuan 已知问题的针对性排序）

> 对照 swarm-yuan 已审计出的"沉睡门禁、fail-open、文档漂移"问题（任务背景，见 `docs/2026-07-20-audit-optimization-decisions.md`）。

1. **【治沉睡门禁】gstack review 的 adaptive gating + `[NEVER_GATE]` 保险策略**（`review/SKILL.md:1314-1348`）：用 `gstack-specialist-stats` 统计每个审查单元的历史命中率，连续 10+ 次零发现自动降级跳过——但安全类永不降级。这给出一种"门禁可休眠但有数据依据、且安全门禁豁免"的成熟范式，比 swarm-yuan 当前"门禁睡了没人知道"高一个层级。配套可吸收：specialist 命中率统计文件、fingerprint 去重 + 多源命中置信 +1（`1413-1422`）、PR Quality Score（`1430-1433`）。
2. **【治 fail-open/误报】cso 的置信度标定 + 22 条 FP 硬排除 + pre-emit 引用门（#1539）**（`cso/SKILL.md:959-1011`；`review/SKILL.md:1241-1276`）：凡不能逐字引用动机代码行的 finding 强制降置信并压出主报告；明确枚举 FP 类（含"SKILL.md 不是文档、是可执行提示代码"这类对 skill 生态的特殊判例，`cso/SKILL.md:988`）。swarm-yuan 的 27 门禁若引入"finding 必须引用证据行否则降级"的硬规则，可直接压缩误报面。配套：**并行独立验证 subagent（只给 file:line 防锚定）**（`cso/SKILL.md:1035-1046`）与**变体分析**（`1028-1033`）。
3. **【治文档漂移】SKILL.md 模板生成系统**（`ARCHITECTURE.md:249-303`）：文档从源码元数据生成 + CI 新鲜度门禁。swarm-yuan 的 146 个 conf 变量、58 个框架三件套、27 门禁之间存在同类漂移风险（audit 已确认），可借鉴"单一事实源 + 生成物提交 + dry-run diff 校验"三件套。
4. **【决策治理】autoplan 的 6 决策原则 + Mechanical/Taste/User Challenge 三级分类 + Decision Audit Trail + restore point**（`autoplan/SKILL.md:915-1010,1567-1575,1026-1048`）：swarm-yuan 的"AI 主导+用户决策"（`SKILL.md:46-53`）目前只有方向没有机制——什么可自动、什么必须问、问过什么如何审计，autoplan 给出了完整答案，且与 swarm-yuan 的"疑虑必确认"执行准则天然兼容（User Challenge 永不自动 ≈ 疑虑必确认的形式化）。
5. **【上下文安全】context-save 的 bash 层输入消毒 + 仅追加 checkpoint**（`context-save/SKILL.md:870-897`）：用户输入永不进 LLM 层拼路径。对 swarm-yuan 的 state-machine.sh 与记忆写回（`SKILL.md:85`）是直接可移植的防注入模式。
6. **【发布验证】canary 的基线对比监控哲学**："Alert on changes, not absolutes"+"Don't cry wolf"（连续 2 次才告警）+ 四级告警 + 基线健康后才更新（`canary/SKILL.md:954-1043`）；benchmark 的显式回归阈值（时延 >50% 或 >500ms=REGRESSION，bundle >25%）+ 行业性能预算（FCP<1.8s/LCP<2.5s/JS<500KB，`benchmark/SKILL.md:711-716,737-754`）。可补 swarm-yuan 左移门禁在"发布后"一环的空白。
7. **【记忆闭环】learn 的 learnings.jsonl + 置信度 + operational self-improvement**（`learn/SKILL.md:793-882`；`SKILL.md:491-499`；标定学习 `review/SKILL.md:1278-1281`）：每次 skill 执行结束反思"什么能省 5+ 分钟"并落盘，审查标定事件也转为 learning——这是 gstack 版"记忆→生成→开发→记忆"闭环，且带置信度与跨项目开关（`cso/SKILL.md:881-917`）。swarm-yuan 的 claude-mem 写回缺少"置信度+检索反哺门禁"这一层。
8. **【skill 生态安全】cso Phase 8 Skill Supply Chain**（`cso/sections/audit-phases.md:134-157`）：swarm-yuan 本身就是 skill 生成器，其生成的目标 skill 将成为"被扫描对象"；把 P8 的恶意模式清单（凭证访问/网络外联/提示注入覆写）转化为生成时自检门禁，是进入行业/国家合规视野后的高价值项。
9. **【调试纪律】investigate 的 3-strike rule 与"3 次失败→质疑架构而非继续修"**（`investigate/SKILL.md:969,1067`）。
10. **【测试经济学】三级测试分层（免费静态校验每跑必行，付费 LLM 层显式门控）+ "观测 I/O 失败永不使测试失败"**（`ARCHITECTURE.md:305-313,403,419-427`）。对 verifier/v1 验收体系的成本控制有直接参考价值。

---

## 八、License 与合规注意事项

1. **两者均为 MIT**：gstack = MIT © 2026 Garry Tan（`offline-cache/gstack/LICENSE:1-3`）；superpowers-marketplace = MIT © 2025 Jesse Vincent（`offline-cache/superpowers/LICENSE:1-3`）。MIT 唯一实质义务是**在副本或实质部分中保留版权声明与许可声明**（两 LICENSE 文件第 5-13 行）。无 copyleft、无明确专利授权、商标名未授权。
2. **当前合规状态**：offline-cache 两个目录都随附各自 LICENSE 文件（满足保留义务）；swarm-yuan 的 references 在吸收方法论时均标注上游 GitHub 出处（`subagent-orchestration.md:3`、`review-methodology.md:3`）——attribution 实践良好。
3. **⚠️ 合规风险 1：superpowers 离线包是"空壳"**。`install-offline-win.sh:95-108` 把 marketplace 目录复制为 `~/.claude/plugins/superpowers` 并宣称"✓ superpowers"，但该目录只含市场元数据，**不含 v6.1.1 核心插件的 20+ skills 本体**（marketplace.json 全部是 URL source，离线环境无法拉取）。后果：(a) `self-check.sh:75-76` 的目录存在性检测会误判"已安装"（fail-open 的又一实例）；(b) 用户实际得不到 swarm-yuan references 所引用的能力；(c) 若要把核心插件真正 vendor 进离线包，需另行克隆 `github.com/obra/superpowers` 并保留其 LICENSE。
4. **⚠️ 合规风险 2：市场内 10 个插件各有独立 license**。marketplace README 明确"Individual plugins: See respective plugin licenses"（`offline-cache/superpowers/README.md:113-117`）。若未来 vendor 任何子插件（如 episodic-memory、claude-session-driver），须逐一核实其 LICENSE 并保留。另 elements-of-style 插件内含 Strunk《The Elements of Style》(1918) 全文 ~12k tokens（`README.md:48-51`）——1918 年美国出版物在美已入公有领域，但跨境分发仍宜标注来源与公版状态。
5. **第三方声明传递**：gstack 的 cso 引用了 Snyk ToxicSkills 研究数据（`cso/sections/audit-phases.md:136`）、README 引用 Karpathy 播客言论（`README.md:3`）——转载这些表述时应保留原始出处链。
6. **遥测随附**：gstack 自带 opt-in 遥测与设备 ID（`SKILL.md:191-217` 的遥测问询流程）。swarm-yuan 离线分发 gstack 即间接分发其遥测提示；面向对数据出境敏感的行业/国家合规场景，应在安装文档中提示用户可选择 `telemetry off`。
7. **版本来源可追溯性**：`.gitignore:4` 注明"gitlink 已移除，本地使用需手动 clone"——offline-cache 内无 `.git`，无法从包内自证克隆自哪个上游 commit。建议在离线包中补一份 `UPSTREAM.md` 记录 gstack v1.60.1.0 对应的 GitHub commit/tag 与获取日期，支撑供应链可审计性（这对"行业及国家质量标准"方向几乎是必需项）。

---

## 九、关键结论

1. **gstack（v1.60.1.0，MIT，Garry Tan）是一套"Markdown 即专家"的虚拟工程团队**：ethos 三原则（Boil the Ocean / Search Before Building / User Sovereignty）+ 模板生成防漂移 + 文件系统状态管理 + L1-L6 提示注入防线 + 度量驱动的审查编排（adaptive gating、置信标定、pre-emit 引用门、并行独立验证）。
2. **offline-cache 里的 superpowers 只是 marketplace 目录仓（v1.0.13），核心插件 v6.1.1 本体不在包内**——swarm-yuan 的 superpowers 离线安装与自检均存在空壳误判。
3. **两者互不引用；打包者是 swarm-yuan**（Windows 离线安装工程决策），分工为 superpowers=subagent 编排方法论、gstack=审查方法论。
4. **swarm-yuan 的吸收是"工作流形态级"且全部 advisory 化**：编排循环、两遍清单、Fix-First、plan 完成度审计已忠实吸收；但度量驱动门禁治理、防误报工程、决策审计、checkpoint 消毒、发布后监控全部未吸收，且无任何一条固化为 precheck.sh 可执行门禁。
5. **最优先可移植项**（直治已审计问题）：adaptive gating（治沉睡门禁）、pre-emit 引用门 + FP 硬排除（治 fail-open/误报）、模板生成+CI 新鲜度校验（治文档漂移）、autoplan 决策三级分类+审计轨迹（补"AI 主导+用户决策"的机制空白）。
