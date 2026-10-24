> **何时读我**：任务命中本文档主题时按需读取（路由表见 SKILL.md）。首行：# 仓库探查指南 (Repository Exploration Guide)

# 仓库探查指南 (Repository Exploration Guide)

生成目标技能前，必须先探查目标仓库。本指南说明如何高效探查各类项目，**包括环境依赖、外部资源、MCP 工具**。

## 探查策略

**用 Agent 子代理并行探查**（Explore 类型），三路并行：

- **路 A：结构与构建** — 顶层目录、package.json/构建文件、scripts、端口、构建系统、测试体系
- **路 B：开发规范 + 项目知识** — 读取并解析项目既有知识文件（见下方"项目知识读取"），提取规则写入特征卡
- **路 C：代码组织与外部资源** — 源码目录、组件库、接口、数据模型、安全机制、**环境依赖、外部资源（DB/缓存/MQ）、MCP 工具、静态资源、样例数据**

每路子代理的 prompt 要明确"报告具体路径、命令名、版本号、文件名、连接串格式、端口"。

> **per-phase profile 探查分级**：探查阶段按项目规模分级（与 `auto_detect_profile` 同信号源），轻量项目走单路探查，重量项目走三路+图谱工具：
>
> | profile | 规模信号 | 探查策略 | 图谱工具 |
> |---------|---------|---------|---------|
> | lite | 文件数 <80 | 单路探查（结构+规范+代码组织合一，一次 Agent 调用） | 不用（grep+Read 足够） |
> | standard | 文件数 80-500 | 三路并行子代理（路 A/B/C） | 可选（gitnexus/graphify 按项目实际） |
> | compliance | 合规信号 或 文件数 >500 | 三路并行 + 合规矩阵扫描 | 强制（gitnexus/graphify 至少其一） |
>
> **质量优先偏置**：规模边界不确定按更重档处理（如 78 文件但含微服务结构 → 按 standard 三路探查）。
> 探查阶段分级只影响探查效率（单路 vs 三路 vs 三路+图谱），不影响特征卡 17 项的完整度（所有档位都须全量探查特征卡）。

## 项目知识读取（= 生成流程 Step 2；先于一切探查，最高优先级）

> **铁律：探查代码前，先读取项目既有的知识文件和记忆。** 这些文件是项目团队积累的规则、约定、教训——不读就生成 skill = 重复造轮子 + 违反既有约定。

### 读取清单（按优先级从高到低）

| 优先级 | 文件/目录 | 提取什么 | 写入特征卡哪项 |
|--------|----------|---------|--------------|
| **P0** | `AGENTS.md` | AI agent 工作区规则：可改范围、只读区、改造分类、分支策略 | 第 2/3/6 项 |
| **P0** | `CLAUDE.md` | Claude Code 指导：项目概述、开发命令、端口约定、架构说明、A类/B类改造 | 第 1/4/5/10 项 |
| **P1** | `.zcode/memories/` 或 `~/.zcode/cli/memories/projects/*/` | 项目级记忆：用户偏好、全局规则、历史教训（如"release 仅上传 arm64.dmg + x64.zip"） | 第 6/7 项 |
| **P1** | `.claude/` 或 `~/.claude/` | Claude 配置+记忆：skills/plugins/settings、claude-mem 记忆库 | 第 7/10 项 |
| **P2** | `CONTRIBUTING.md` | 贡献规范：代码风格、PR 流程、commit 格式 | 第 6/8 项 |
| **P2** | `README.md` | 项目概述、快速开始、技术栈 | 第 1/4 项 |
| **P2** | `.github/` | PR 模板、CI workflow、issue 模板 | 第 6/8 项 |
| **P3** | `docs/` | 设计文档、specs、plans、ADR（架构决策/外部交互/数据契约的证据源——以代码为准，文档为辅，冲突须声明） | 第 8/11 项 |
| **P3** | 需求文档（PRD/需求规格/SRS，若在 docs/ 或根目录） | 需求来源与验收标准——仅在需求分析时参考，不直接进代码探查（需求描述的是"要什么"，代码描述的是"是什么"） | 第 1/2 项 |
| **P3** | `.editorconfig` / `.gitignore` | 编码约定、忽略规则 | 第 8 项 |

### 读取流程（AI 自动执行）

```
1. 扫描项目根目录 + 父目录，按上表清单检测哪些文件存在
2. 逐文件读取，提取规则条目（每条规则记录：来源文件 + 规则内容 + 适用范围）
3. 合并去重（同一规则在多个文件出现的，保留最高优先级来源）
```

### 文档转换流程（PDF/Word/图片转 AI 可读）

> 探查期枚举到文档后，非 Markdown 格式的需求/设计文档须先转换再提取——AI 读不了二进制 PDF/Word，图也读不了（除非 OCR/转图）。

```
文档转换决策：
 PDF (.pdf)         → pdftotext / Python pdfplumber 提文字 → 存 docs/converted/<name>.md；
                      含图（架构图/流程图/时序图）→ 图片抽取出 PNG → OCR（tesseract）识别文字 +
                      按图内容转 mermaid（graph TD/sequenceDiagram）便于 AI 理解
 Word (.docx/.doc)   → pandoc <file> -t markdown / Python python-docx 提文字 → docs/converted/<name>.md；
                      含图同 PDF 流程
 Markdown (.md)     → 直接读（无需转换）
 图片 (.png/.jpg)    → OCR 识别文字 + 按图内容转 mermaid 结构图（架构图/流程图必须转，文字可选）
 Excel (.xlsx)      → 数据契约/需求矩阵场景 → pandoc/python openpyxl 提表 → docs/converted/<name>.md（表格转 markdown 表）
 落点               → 转换产物存 docs/converted/（入 git 可追溯）；探查/分析读 converted 版本，原文档不动
```

**转换后提取指引**：转出的 markdown 文档按需提取架构决策（docs/ ADR）、外部交互（API/数据库/MQ/第三方服务契约）、数据模型约定——提取去向 reference-manual §5 调用链路/§6 接口清单/§8 数据字典；**以代码为准**，文档内容与代码不一致时按 §文档证据源优先级 声明冲突。

### 文档证据源优先级（以代码为准，文档为辅，冲突须声明）

> 探查/研发期参考文档时，**应用内的信息以代码为准、为主**（代码是当前真实行为）；设计文档为辅（设计意图与决策背景）；需求文档仅在需求分析时作为参考（描述的是目标而非现状）。

| 优先级 | 文档类型 | 用途边界 | 冲突处理 |
|--------|---------|---------|---------|
| 1（主） | 代码/配置/测试 | 当前真实行为、架构落地、外部交互实装 | —（真理源） |
| 2（辅） | 设计文档（docs/、ADR、specs） | 架构决策意图、外部交互设计、数据契约设计、演进背景 | 与代码不一致时**声明冲突**（spec §假设与约束段或 reference-manual 注记：文档 X 说 A、代码实现 B，以代码为准，文档待更新） |
| 3（参考） | 需求文档（PRD/需求规格） | 需求分析阶段的业务目标、验收标准、用户场景 | 不用于代码探查结论；需求与实现冲突时声明"需求未落地/已演进"，以代码为准 |

**冲突声明义务**：探查/设计时发现文档与代码不一致（架构/外部交互/数据模型/接口契约任一维度），必须在 spec 的"假设与约束"段显式写出冲突点 + 以代码为准 + 建议文档更新（不让"文档与代码不一致"静默存在）。

### 多源探查矛盾裁决（来源：semantica conflicts）

> 来源：[semantica-agi/semantica](https://github.com/semantica-agi/semantica) v0.7.0 `conflicts/conflict_resolver.py` 的 7 种 ResolutionStrategy 与 `source_tracker.py` 来源可信度模型（只取机制，不引依赖）。上文「文档证据源优先级」管**文档 vs 代码**一个维度；本节管**任意多源**矛盾时的通用裁决序。

**矛盾从哪来**（探查期四类）：三路并行探查子代理对同一组件给出互斥结论；代码 vs 文档（上文优先级表）；图谱工具（gitnexus/graphify）边集 vs 静态扫描清单；项目记忆（mine-habits/claude-mem）vs 代码现状。

**来源可信度基线**（credibility，semantica SourceTracker 思路）：

| 可信度 | 来源 | 依据 |
|-------|------|------|
| 1（最高） | 代码实测（读源码/跑命令输出） | 直接证据 |
| 2 | 配置文件/锁文件 | 声明即生效的自动事实 |
| 3 | 设计文档/ADR | 意图，可能滞后 |
| 4 | 需求文档 | 目标，可能未落地 |
| 5（最低） | 项目记忆/历史习惯 | 时效未知，须与现状核对后才可用 |

### 空值判定区分未设置与零值、豁免须带期限（semantica tip 769ff036f 增量）

> 来源：semantica-agi/semantica main tip 0934ae800→769ff036f（2026-10-21，5 提交；细节 `docs/research/R132-runtime-refresh.md`）。

- **空值判定区分「未设置」与「合法零值」**（#2058）：LPG 导出按 `SOURCE_ENDPOINT_NAMES`/`TARGET_ENDPOINT_NAMES` 与共享助手同一列表同一次序解析关系端点；`is_unset_id` 判据= None 与 "" 算未设置并回退下一拼写，**0 是真实 id 不回退**——「空值回退」规则必须枚举哪些值算空，零值是数据不是空。同时修复：后端塑形的关系（Neo4j `start_node_id`/`end_node_id` 等此前端点字段无读处）被**静默跳过**、导出只剩顶点——**导出不得静默丢边**（完整性=读到或报错，不是读到多少算多少）。
- **豁免必须有期限**（#2068）：pillow 12.3.0 八条 advisory 仅 13.0.0 可修但 docling 钉 <13——按时间盒接受登记（IGNORED_VULN_IDS + osv-scanner `ignoreUntil 2027-01-21`），且到期后 pip-audit 门禁**停止排除**这些 advisory（ignore 列表本身带过期）。**「永久忽略」与「暂时接受」是两种决策，后者必须带到期与复核点**——与本仓 sweep observe 类台账「到期变红是设计不是回归」同构。

### 溯源账本记失败路径、归因到调用（semantica tip 0934ae800 增量）

> 来源：semantica-agi/semantica main tip 34359a1dd→0934ae800（2026-10-20，5 提交；用户指令轮，细节见 `PROVENANCE/distillation-ledger.md` 对应注记）。

- **失败的生成调用也记 provenance**（#2016）：溯源链必须包含失败路径——只记成功调用的账本是幸存者偏差账本，失败时的模型/参数/时刻恰是归因最需要的证据。应用：本仓探查记录同样落失败查询（工具报错也入账），不只记命中。
- **per-call model 入 provenance**（#2051/#2055）：计量归因到调用级——知道「哪次调用用了哪个模型」才可解释成本与质量差异。
- **裁决决定持久化**（#2039）：stdio server 的 link_decisions 落盘，不随会话蒸发——裁决是资产不是瞬态。
- **安全依赖轮换**（#2046/#2049）：semgrep mcp pin 解 GHSA-84m7-p3x7-pcfv、aiohttp 升 3.14.5——供应链修复即时跟进是登记表纪律的执行面。

### 校验与消费同一边界快照、豁免生命周期两端（semantica tip 22109ee0 增量）

> 来源：semantica-agi/semantica main tip 769ff036f→22109ee0（细节 `docs/research/R140-runtime-refresh.md`）。

- **校验与消费同一边界快照**（#2079 解码围栏）：对 fd 判常规文件后，消费用检查时取的同一边界快照；危险尺寸在库自身检查前从头部预读（WebP 画布）——check-then-use 的 TOCTOU 围栏。门禁/trace-log 读文件同构：**校验对象与消费对象须同一快照**，两次打开之间文件可被替换。
- **豁免生命周期两端——授予与撤销**（#2083/#2092/#2090）：授予带可达性论证与期限（opentelemetry tracestate：从不 import、无入站解析=不可达）；修复一可装即删 28 条豁免、到期有门——**豁免是有出生与死亡的管理对象**（#2068 豁免期限纪律的生命周期延伸）。暴露面按真实执行路径核定（不可信文档内嵌图片同在范围，#2096）。

**检索事实分级准入**（semantica 增量 b90bbafe：trust tier + `min_trust` 最低信任阈）：上表可信度不只用于裁决矛盾，也用于**检索/召回结果的准入门槛**——低于 `min_trust` 的事实不进结论区，只进「待核」清单。探查结论引用记忆/历史类来源时按第 5 级处理（须与现状核对后才可用），与上表同一执法（分级准入：宁可少一条结论，不让未核事实混进结论区）。

**裁决序**（按序取首个适用，semantica 7 策略的 swarm-yuan 映射）：

1. **可信度加权**（CREDIBILITY_WEIGHTED）：按上表高可信度来源胜出——代码实测 > 一切转述。
2. **最新性**（MOST_RECENT）：同可信度时，反映代码现状的胜出（记忆/旧文档描述的是历史）。
3. **并存标注**（两源各有证据且不可判定）：双口径并存，reference-manual 注记「源 A 说 X，源 B 说 Y，未裁决」，列待验证项。
4. **人工裁决**（MANUAL_REVIEW）：矛盾影响特征卡/门禁规则/形态判定 → 升级 UserChallenge 决策（`trace-log.sh --decision` 留痕，五要素齐备）。

**裁决三纪律**：单源胜出时记录败方结论与证据（下次重探查可直接复核）；裁决过程落 trace（哪两源、各自锚点、为何胜出）；禁止「静默取其一」——没写裁决理由的取舍不可追溯。

**双时态注记**（semantica `_temporal_support_projection.py` Window 语义）：清单条目/探查结论有两个时间轴——**valid time**（代码何时如此，锚 commit/项目指纹）与 **recorded time**（第 N 轮探查何时知道）。反馈回路的「单条更新」= 写一条新 recorded time 记录，不回头改写旧结论的历史有效性；last-good 红线（条目骤降 >50% 视为探查失败保留旧清单）防的正是「新一轮探查污染历史有效认知」。

**待确认事项清单回填协议**：裁决序走到「并存标注」仍不能定的项、探查中 AI 拿不准的业务语义，集中落到 `notes/cognition.md` 待确认事项清单段（每项：问题/两源证据锚点/需要谁回填），不散落在各文档的「待验证」字样里自然蒸发。回填后按裁决序重新转正（升级 UserChallenge 的项走 trace-log --decision 留痕），转正即从清单销项——待确认事项清单长度是探查完成度的显式指标，mark-active 抽样核验时可对照。

```
4. 写入特征卡对应项（不是复制原文，是提取结构化规则）
5. 生成的目标技能的 SKILL.md 铁律段须引用来源（如"见 AGENTS.md"），不重复写死规则值
```

### 记忆复用机制

项目记忆（.zcode/memories / claude-mem）中的规则分三类，AI 须区别处理：

| 记忆类型 | 处理方式 | 示例 |
|---------|---------|------|
| **全局规则**（type: project） | 写入生成 skill 的铁律段，标注来源 | "release 仅上传 arm64.dmg + x64.zip" |
| **用户偏好**（type: preference） | 写入 dev-guide.md 的"开发偏好"段 | "不自动推送 github" |
| **历史教训**（type: rollout_summary） | 写入 reference-manual.md 的"注意事项"段 | "dev server 运行期间不得 git checkout upstream" |

> **生成的 skill 须能反向写入项目记忆**：当 AI 在开发过程中发现新规则/教训时，通过 claude-mem 或 .zcode/memories 写入，下次生成 skill 时自动读取。形成"记忆→生成→开发→记忆"闭环。

### 行为观察（读"已写下的"之外，再挖"实际做的"）

上面读的是开发者**已写下的**规则；实际研发习惯还藏在 git 历史里。自动挖掘出初稿，AI 审读采纳：

```bash
bash scripts/mine-habits.sh <PROJECT_DIR>            # → .swarm-yuan/notes/habits.md 六维统计初稿
```

**AI 审读三去向**（自动/AI 边界——脚本只统计，采纳判断归 AI）：

| 信号 | 去向 | 说明 |
|------|------|------|
| 提交前缀/分支命名分布 | SKILL.md 铁律段（引用来源，不写死值） | 与书面规范交叉验证：分布与规范一致=规范真实生效；不一致=如实记录实际惯例并标注 |
| 工作偏好（粒度/测试习惯/工具链） | dev-guide.md「开发偏好」节 | 测试提交占比、提交规模分桶等实测值支撑偏好判断 |
| 共变文件对/热点文件 | reference-manual.md 说明列注意事项 + recipes.md 配方提取（§D.7 源②） | 高频共变=隐性耦合/拼装单元信号；异常信号（测试占比 0%、巨型提交为主）如实写、不粉饰 |

红线：habits.md 是统计事实不是规范——前缀分布 ≠ 必须遵守的提交规范（书面规则优先，统计只作交叉验证）。

### 读取 AI Agent 运行时（如项目含 agent 运行时）

> 如果目标项目包含 AI agent 运行时（如独立的 agent 包、`agent/` 目录、或 plugin/hook 系统），AI 须读取其工作内容，理解 agent 的能力边界、工具链、配置方式。生成的目标技能须能指导开发者正确配置和使用 agent。

| 读取项 | 路径模式 | 提取什么 | 写入特征卡哪项 |
|--------|---------|---------|--------------|
| Agent 概述 | `<agent-dir>/README.md` | agent 版本、能力、架构 | 第 1 项（项目类型） |
| Agent 配置 | `<agent-dir>/AGENTS.md` | agent 工作规则、工具链、安全约束 | 第 2/7 项 |
| Agent 工具 | `<agent-dir>/src/tools/` 或 `tools/` | agent 可调用的工具清单（工具名/参数/用途） | 第 11 项（可复用稳定单元） |
| Agent 插件 | `<project-plugins-dir>/` 或 `plugins/` | 项目自定义的 agent 插件 | 第 11 项 |
| Agent 版本 | `<agent-dir>/pyproject.toml` 或 `package.json` | agent 运行时版本 | 第 4 项（技术栈） |

> 生成的目标技能的 reference-manual.md 须含"AI Agent 运行时"段，记录 agent 版本、能力清单、工具链、配置方式、插件清单。dev-guide.md 须含"如何配置 agent"指引。

## 代码图谱构建（= 生成流程 Step 3 内图谱优先动作）

探查前，**先用代码图谱工具索引目标仓库**，让后续探查基于图谱而非 grep。组件依赖链路优先从图谱读取。

**GitNexus（Node 生态，深度代码调用图）：**
```bash
npm install -g gitnexus && gitnexus analyze # 在目标仓库根构建知识图
gitnexus mcp # 启动 MCP server 供 agent 查询
```

**graphify（Python 生态，广谱知识图）：**
```bash
uv tool install graphifyy && graphify . # 构建 → graphify-out/GRAPH_REPORT.md + graph.json
graphify path "ComponentA" "ComponentB" # 查依赖链/最短路径
graphify export callflow-html # 调用流导出（组件依赖链路段可视化，结构关系图用 mermaid）
```

探查时读 `graphify-out/GRAPH_REPORT.md` 获取架构概览（god nodes、surprising connections），用 `graphify path/explain` 查具体依赖链。详见 `references/code-graph-tools.md`。**只引用调用，不复制实现。**

> 若目标仓库无 Node/Python 环境，或图谱工具失败，降级为 grep+读文件探查（传统方式）。

## 探查清单（通用）

> **工具使用原则**：每项探查优先用运行时工具（gitnexus/graphify/claude-mem/ocr/gsd-tools）+ Claude Code 原生能力（Read/Glob/Grep/LSP/WebSearch/Task），降级到 grep+读文件。以下是 17 项特征卡的工具使用矩阵。

### 特征卡工具使用矩阵（每项探查的工具优先级 + 降级策略）

| # | 特征项 | 优先工具 | 降级策略 |
|---|--------|---------|---------|
| 1 | 项目类型 | gitnexus `query "architecture"` + graphify `explain` | Read package.json / Glob 目录 |
| 2 | 可改范围 | claude-mem `search "project rules"` + Read AGENTS.md/CLAUDE.md | Glob + Grep 目录权限 |
| 3 | 改造分类 | gitnexus `query "layer structure"` + Read CLAUDE.md | Grep import 模式分析 |
| 4 | 技术栈 | gitnexus `query "tech stack"` + graphify `explain "dependencies"` | Read package.json/go.mod/pyproject.toml |
| 5 | 构建发布命令 | Read package.json scripts / Makefile | Grep "scripts" + Glob *.config.* |
| 6 | 分支规范 | claude-mem `search "branch rules"` + Read AGENTS.md | Grep .git/config + Read .github/ |
| 7 | 安全规则 | claude-mem `search "security rules"` + Read AGENTS.md/security-spec.md | Grep "password\|secret\|token" |
| 8 | 文档约定 | Read CONTRIBUTING.md + Glob docs/ | Grep "spec\|plan\|design" in docs/ |
| 9 | 测试体系 | gitnexus `query "test files"` + Read vitest.config/jest.config | Glob "**/*.test.*" + Grep "describe\|it\(" |
| 10 | 环境与外部资源 | gitnexus `route_map` + gitnexus `tool_map` + Read .env/docker-compose | Grep "host\|port\|url\|connection" |
| 11 | 可复用稳定单元 | **gitnexus `context <symbol>`**（360 度上下文）+ **graphify `query "stable units"`** | Grep "export\|module.exports" + Read 组件目录 |
| 12 | 数据规范 | gitnexus `query "data models"` + Read schema/migration/ORM | Grep "CREATE TABLE\|schema\|model" |
| 13 | 五层认知基底 | graphify `explain "god nodes"` + claude-mem `search "cognition baseline"` | 手动盘点（Read + Grep） |
| 14 | 领域知识 | gitnexus `query "domain entities"` + claude-mem `search "domain knowledge"` + WebSearch 行业标准 | Read 领域模型 + Grep 业务关键词 |
| 15 | 编排调用关系及约束 | **graphify `path "ModuleA" "ModuleB"`**（最短依赖路径）+ **gitnexus `trace <entry> <register>`**（调用链） | Grep "^import.*from" + madge 循环检测 |
| 16 | 详尽组件库清单（全量） | **gitnexus `analyze` + `gitnexus mcp`**（全量符号索引）+ **graphify `.`**（全量知识图） | `find` + `grep export` 自动枚举 + 计数核验 |
| 17 | 合规与质量特性基线 | Read 现有合规文档/等保备案/密评报告/PIA + Grep 质量特性声明 | Read spec §22 标准合规段 + Grep 标准关键词 |

> **Dynamic Workflows 场景**：如果项目大型（>100 文件），探查阶段可用 Dynamic Workflow 并行扇出三路子代理（结构/规范/代码组织），每路用不同的运行时工具，最后交叉验证特征卡。降级：传统 Task(subagent) 三路并行。

### A. 结构与构建

```
必查：
- 顶层目录结构（识别 monorepo/overlay/upstream/submodule）
- 包描述文件：package.json / pyproject.toml / go.mod / Cargo.toml / pom.xml
 → name, version, scripts/targets, engines/runtime, type, 依赖列表
- 构建系统：vite/webpack/rollup/esbuild/Makefile/CMake/docker/electron-builder
- 构建配置文件：*.config.ts / tsconfig.json / Dockerfile / docker-compose
- 开发命令：dev/build/test/lint/release 命令及端口约定
- 测试框架与配置：vitest/jest/pytest/go test/cargo test，测试目录，setup 文件
- 产物位置：dist/ build/ target/ release/
```

### B. 开发规范

```
必读（如存在）：
- AGENTS.md / CLAUDE.md / GEMINI.md — AI agent 工作区规则（最高优先级）
- CONTRIBUTING.md — 贡献规范
- README.md — 项目概述、快速开始
- .github/ — PR 模板、CI workflow、issue 模板
- docs/ — 设计文档、specs、plans
- .editorconfig / .gitignore — 编码与忽略约定
- 记忆文件（如 .zcode/memories/）— 项目级规则

必提取：
- 可改范围（哪些目录可改、哪些只读、只读区修改机制）
- 改造分类（A类/B类、core/plugin、src/lib——决定编码节点怎么写）
- 分支规范：命名（feat/fix/refactor）、合入策略（merge --no-ff/squash/rebase）、保护分支、推送规则
- 文档约定：spec/plan 存放位置、命名格式（如 YYYY-MM-DD-<topic>-design.md）
- 安全规则：脱敏、密钥管理、网络白名单、框架安全基线
```

### C. 代码组织与外部资源（含可复用稳定单元盘点 + 版本基线 + 安全机制 + 平台差异）

```
必查：
- 源码目录结构、模块划分
- 组件库清单：主要组件模块、关键组件名、store/状态管理位置、组件计数
- 组件依赖链路：从 App 入口到子组件的挂载树/依赖关系
- 接口清单：API 入口（控制器/路由文件）、OpenAPI 生成方式（tsoa/swagger/正则扫描）、认证机制
- 数据模型：schema 定义位置（SQL/migration/ORM model）、数据流、业务规则
- 安全机制：SSRF 防御、XSS、CSRF、认证授权、密钥管理

★必查（版本锁定铁律——核心依赖版本基线）：
- 列出 package.json/pyproject.toml/go.mod/Cargo.toml 全部依赖及其精确版本
- 标注哪些是核心技术（框架/runtime/构建工具）哪些是基础组件（UI库/状态/路由）
- 记录到特征卡第 4 项（技术栈）→ codebase.md 技术栈版本表（precheck.sh --deps 的对比基线）
- 任何后续版本变更须经用户确认 + 在 spec 版本约束声明段声明理由

★必查（安全规范覆盖——盘点既有安全机制）：
- 认证授权机制：JWT/Session/OAuth/API Key 的实现位置与校验中间件
- 输入校验：是否用 zod/joi/express-validator/pydantic 参数校验
- 输出编码：XSS 防护（是否用 DOMPurify / 框架自动转义）
- 密钥管理：密钥来源（环境变量/配置中心/密钥管理服务）、是否硬编码
- 传输安全：TLS 配置、HSTS、CSP、CORS 策略
- 日志安全：是否过滤敏感字段、是否记录完整请求体
- 依赖安全：是否用 npm audit / pip-audit / snyk / dependabot

★必查（三平台兼容——Windows/macOS/Linux 差异）：
- 脚本兼容：是否有 .sh + .ps1 双版本、是否用跨平台工具（node 脚本替代 sed/awk）
- 路径分隔符：是否硬编码 / 或 \、是否用 path.join / pathlib
- 平台特定逻辑：是否有 process.platform / os.name 分支
- 原生模块：是否含 node-gyp / native addon（须三平台预编译或构建）
- 文件系统：大小写敏感（Linux）vs 大小写不敏感（macOS/Windows）、符号链接行为差异
- 行尾符：CRLF(Windows) vs LF(macOS/Linux) 的 .gitattributes 配置
- 端口/权限：<1024 端口需 root（Linux/macOS）、Windows UAC


★必查（拼装式开发核心——可复用稳定单元盘点）：
- 可复用 API 接口：列出全部稳定 API（方法/路径/签名/用途/认证/复用方式）
- 可复用组件：列出全部稳定 UI 组件（组件名/路径/Props/用途/复用方式）
- 可复用类/函数/方法：列出全部稳定类/函数/方法/composable（签名/路径/用途/复用方式）
- 可复用 Store：列出全部状态管理 store（路径/暴露的状态和方法/复用方式）
- 可复用类型定义：列出全部 TS interface/type（路径/定义/复用方式）
- 稳定性标注：见 §11f（唯一定义点：稳定层/不稳定层/禁止改层）
 → 用 gitnexus mcp 或 graphify path 系统性盘点调用链/依赖链，而非随机 grep
 → 每个稳定单元记录：签名、路径、用途、复用方式（五维字段的权威定义在本文 §11f，历史论证见 docs/design-evolution.md A12 档案，供 dev-guide.md 引用）
- 测试体系：框架、目录、运行命令、测试案例数据

必查（环境与外部资源——材料 assets 段要求）：
- 开发环境依赖：node/python/go/java 版本要求（engines/runtime）
- 外部资源：数据库（MySQL/PostgreSQL/SQLite/MongoDB）、缓存（Redis）、消息队列（Kafka/RabbitMQ/RocketMQ）、搜索（ES/ELK）
 → 连接方式（连接串格式、端口、env 变量名）
 → 是否有 MCP 工具接入（DB 查询工具、ELK 查询、Redis 访问）
- 静态资源：图片/字体/配置文件位置、下载/填充方式
- 样例数据：seed/fixture/mock 数据位置与格式
- CI/CD：.github/workflows、Jenkinsfile、部署流程
```

### D. 详尽组件库清单与调用链路分析（Exhaustive Inventory + Call-Chain Analysis）

> **铁律：特征卡第 11 项与 reference-manual §4/§5/§6 不允许用"代表性样本"填充。** 必须按本节方法论做**全量穷举 + 调用链路分析 + 编排约束推导**，产出可被 `find` 计数核验的完整清单。
>
> **★通用性铁律：swarm-yuan 是研发范式提示词，不预设项目是前端/后端/全栈/移动/桌面/库。** 以下方法论按"先探查项目形态 → 再选择对应维度"的动态适配方式执行。每节的"维度表"列出按探查结果应枚举的构件类型——**只枚举项目实际存在的维度，不枚举不存在的**。
>
> 典型反模式（须杜绝）：探查到 85 个组件只列 10 个；依赖链路写成"模块A→模块B"的骨架树而无挂载顺序/跨模块边界/注册机制；接口清单写"GET/POST /api/xxx"而无具体端点与 handler；**对纯后端项目却按前端维度（.vue/store/bootstrap）枚举=维度错配**。

#### D.0 项目形态判定（先于一切枚举）

探查第一步：判定项目形态，决定后续枚举哪些维度。**不预设——按探查到的文件类型/框架特征动态判定。**

| 探查信号 | 判定形态 | 后续枚举维度 |
|---------|---------|-------------|
| 有 `.vue`/`.svelte`/`.tsx`+`defineComponent`/`createApp` | 含前端 | UI 组件 + store + composable/hook + 路由 + 注册装配链路 |
| 有 `@Controller`/`@RestController`/`router.get`/`app.get`/`Blueprint`/`FastAPI` | 含后端 | controller/route + service + repository/dao + middleware + ORM model |
| 有 `package.json`+`electron`/`Electron`/`BrowserWindow` | 桌面应用 | 主进程+渲染进程+IPC+preload |
| 有 `MainActivity`/`Info.plist`/`expo`/`flutter` | 移动端 | Activity/Fragment/Screen/Widget + 导航 + 平台桥接 |
| 有 `go.mod`+`cmd/`/`Cargo.toml`+`src/main.rs`/`pom.xml`+`src/main/java` | 纯后端/CLI/库 | 按 §D.1-B 后端维度 |
| 有 `worker`/`consumer`/`@RabbitListener`/`@KafkaHandler`/`celery` | 含异步消费 | 消费者+生产者+队列拓扑+幂等键 |
| 有 `Dockerfile`+`docker-compose`+多服务 | 微服务/多服务 | 每服务独立枚举 + 跨服务调用链 |
| 只有 `src/`+导出、无入口（无 main/index） | 库 | 公共 API（导出函数/类/类型）+ 内部模块依赖 |

> **判定产出**：记录"本项目含以下维度：[前端UI / 后端API / 异步消费 / 桌面IPC / 移动端 / 库导出 ...]"，后续 D.1-D.4 **只枚举列出的维度**。

> **★视觉成熟度探查（来源 impeccable v4.0.2，仅含前端时执行；详见 `references/frontend-design-methodology.md` §十一）**：含前端维度时，追加探查前端视觉成熟度，决定是否引用前端设计质量方法论：
> - **探查信号**：CSS custom properties（`--*:`）数量 ≥3 / className tokens（独特类名）数量 ≥12 / styled-components / CSS Modules / Tailwind config 文件 ≥3 / DESIGN.md 存在性
> - **判定产出**：① 「有现存视觉实现但无 DESIGN.md」→ 引用 `references/frontend-design-methodology.md` 的 `document` 命令模式（从代码反推 DESIGN.md）；② 「有 DESIGN.md」→ 引用 `extract` 命令模式（提取 token 进设计系统）+ craft-floor 审查（Verify 8 项 + Refuse 反 slop 清单）；③ 「空白」→ 引用 `init` + `shape` + `new-work` 命令模式（从 PRODUCT.md 起建视觉世界）
> - **降级**：探查信号不全时按更重档处理（质量优先），全量引用前端设计质量方法论；本探查不改 17 特征卡数字（§D.0 是探查方法论，非特征卡项）

#### D.0.5 框架探查（从依赖清单+注解+配置文件识别具体框架，激活规则集）

> **★铁律：§D.0 只判前端/后端/异步等大类，§D.0.5 进一步识别具体框架。** 探查到什么框架，就激活 `references/frameworks/<fw>.md` 中对应的框架规则集（唯一来源）+ §D.1-B 框架特定构件枚举 + precheck.conf 框架配置变量。**不预设——按探查到的信号动态激活。**

**探查方法：从构建文件依赖清单提取框架 starter**

```bash
# JVM 项目：从 pom.xml / build.gradle 提取框架依赖
grep -hE 'spring-boot-starter|mybatis|lombok|sharding|spring-batch|dubbo|rocketmq|spring-kafka|spring-amqp|data-redis|quartz|elasticjob' \
 pom.xml build.gradle 2>/dev/null | sort -u

# Node 项目：从 package.json 提取框架依赖
grep -hE '"express"|"koa"|"fastify"|"@nestjs"|"vue"|"react"|"svelte"|"element-ui"|"element-plus"|"antd"|"ant-design-vue"|"naive-ui"' \
 package.json 2>/dev/null | sort -u

# Go 项目：从 go.mod 提取框架依赖
grep -hE 'gin|echo|fiber|gorm' go.mod 2>/dev/null | sort -u

# Python 项目：从 pyproject.toml/requirements.txt 提取框架依赖
grep -hE 'fastapi|django|flask|sqlalchemy|celery' pyproject.toml requirements.txt 2>/dev/null | sort -u

# 从注解提取框架（Java）
grep -rlE '@Data|@Slf4j|@Builder|@Mapper|@Transactional|@DubboService|@RocketMQMessageListener|@KafkaListener|@RabbitListener' src/ 2>/dev/null

# 从配置文件提取框架
find . -name 'application*.yml' -o -name 'dubbo*.yml' -o -name 'bootstrap.yml' 2>/dev/null
```

**框架信号→规则集激活表见 `assets/framework-signals.md`（由 `scripts/gen-framework-index.sh` 扫描 `references/frameworks/*.md` §1 生成维护）。运行时框架识别以 `scripts/detect-frameworks.sh` 输出为准；AI 仅在需要探查细则时按需读该文件。**

<!-- 本区块由 gen-framework-index.sh 自动重写，手改内容会被覆盖。脚本失败会保留原文件不动（mv 守卫），不阻塞生成流程。 -->

# >>> framework-signal-index >>>
> 完整信号表见 `assets/framework-signals.md`（由 gen-framework-index.sh 生成维护，手改会被覆盖）。
> 运行时框架识别以 `scripts/detect-frameworks.sh` 输出为准；AI 仅在需要探查细则时按需读该文件，无需常驻上下文。
# <<< framework-signal-index <<<

> **★版本号提取（与规则文件 §3 适用版本区间匹配）**：探查时须同时提取各框架**版本号**（来源：JVM 项目 `pom.xml` `<version>` / `build.gradle` implementation；Node 项目 `package.json` `"vue": "^3.x"`；Go 项目 `go.mod` `module vX.Y.Z`；Python 项目 `pyproject.toml`/`requirements.txt` `fastapi==0.x`）。将提取到的版本与 `references/frameworks/<fw>.md` §3 规律的"适用版本"区间匹配——区间内规律实例化时附证据；区间外规律标"⚠ 待验证（项目版本 X，规律适用区间 Y）"；框架版本号须写入特征卡第 4 项技术栈摘要。

> **判定产出**：记录"本项目激活以下框架规则集：[spring-boot, mybatis, lombok, sharding, ...]"。后续 §D.1-B 枚举框架特定构件 / §D.3 推导框架约束 / `references/frameworks/<fw>.md` 引用框架规则表 / precheck.conf 填充框架配置变量。

#### D.0.6 四层架构视角枚举（TOGAF BDAT，架构类变更前置探查）

> 方法论依据 `references/togaf-metamodel-methodology.md` §1（五层元模型"对应物"列）。**触发条件**：形态判定为架构设计/专项设计/演进规划类变更时必做（适配矩阵 ★★+）；纯编码/文案类变更跳过（避免过度建模）。产出供 spec §24 架构映射节消费。

按四层各枚举一份**轻量清单**（每层 3-8 项，实体+一句话角色，沿用 `A →【动词】→ B` 双向动词模板）：

1. **业务能力层**：核心业务能力/价值流/关键流程/领域事件（来源：目录名、路由名、用例文档；DDD 项目结合限界上下文）；
2. **数据实体层**：数据实体→逻辑组件→物理组件三层对应（来源：ER 图、ORM model/schema、migration 文件——"实体→模块→表"一行一个）；
3. **应用服务层**：应用服务/逻辑组件/物理组件（来源：service/controller 目录、RPC 接口定义、模块边界）；
4. **技术服务层**：技术服务与技术组件（来源：中间件依赖、基础设施配置、部署形态）。

**纵向链初判**：对本次变更涉及的主链路，先探后连——`业务服务→数据实体→应用服务→技术服务` 四环节是否都在探查清单中可定位；缺哪层回哪层补枚举。此清单是 spec §24.5 纵向链验证的探查侧输入。


#### D.1 全量穷举方法论（按维度动态适配，确保一个不漏）

**第 1 步：按项目形态自动枚举（根据 D.0 判定结果选择维度）**

**D.1-F 前端 UI 维度（仅当 D.0 判定含前端时）**
```bash
# UI 组件（按项目框架：Vue/Svelte/React/Angular）
find <可改源码目录> -type f \( -name "*.vue" -o -name "*.svelte" -o -name "*.tsx" -o -name "*.ts" \) -path "*/components/*" ! -path "*test*" | sort
# 或按 import 用法识别组件：grep "import .* from.*components" 找全部被引用的组件文件

# 状态管理（按项目框架：Pinia/Vuex/Redux/Zustand/MobX/Provider）
grep -rlE "defineStore|createStore|createSlice|create\(|useReducer|Provider.*value" <可改源码目录>

# Composable/Hook（Vue composables / React hooks）
find <可改源码目录> -type f \( -name "use*.ts" -o -name "use*.tsx" -o -name "use*.js" \) ! -path "*test*"

# 路由定义
grep -rlE "routes|createRouter|RouterProvider|<Route" <可改源码目录>
```

**D.1-B 后端 API 维度（仅当 D.0 判定含后端时）**
```bash
# Controller / Route handler（按框架：Express/Koa/Fastify/Spring/FastAPI/Django/Gin/Echo）
grep -rlE "router\.(get|post|put|delete|patch)|@(Rest)?Controller|@Get|@Post|app\.(get|post)|Blueprint\.route|APIRouter\(\)" <可改源码目录>

# Service / 业务逻辑层
find <可改源码目录> -type f \( -name "*.ts" -o -name "*.py" -o -name "*.go" -o -name "*.java" \) -path "*/service*" -o -path "*/usecase*" -o -path "*/domain*"

# Repository / DAO / 数据访问层
find <可改源码目录> -type f \( -path "*/repository*" -o -path "*/dao*" -o -path "*/mapper*" -o -path "*/model*" \) ! -path "*test*"

# Middleware / 中间件 / 拦截器
grep -rlE "middleware|@Interceptor|@Guard|beforeEach|app\.use\(" <可改源码目录>

# ORM Model / Schema / Migration
find <可改源码目录> -type f \( -path "*/migration*" -o -path "*/schema*" -o -name "*.prisma" -o -name "schema.*" \)
grep -rlE "@Entity|@Table|Schema\(|mongoose\.|sequeliz|CREATE TABLE" <可改源码目录>
```

**D.1-FW 框架特定构件枚举（仅当 §D.0.5 探查到对应框架时执行）**

> **★各框架完整枚举命令以 `references/frameworks/<fw>.md` §2 为准**——本段仅保留 Java/Node 各框架的示例命令作为快速参考，详细/最新的枚举命令、计数基准、覆盖语言与版本差异，均由 `references/frameworks/<fw>.md` §2（特定构件枚举）维护。探查时按 §D.0.5 激活的 ACTIVE_FRAMEWORKS 逐框架读取对应规则文件 §2 执行，不在本段重复约束。

> 以下按激活的框架规则集动态选择，只枚举探查到的框架的特定构件。

```
# === spring-boot 规则集 ===
# @Configuration + @Bean（DI 配置中枢）
grep -rlE '@Configuration|@Bean' <可改源码目录> --include='*.java'
# application.yml / application-{profile}.yml / bootstrap.yml
find <可改源码目录> -name 'application*.yml' -o -name 'bootstrap.yml'

# === mybatis 规则集 ===
# Mapper 接口
grep -rlE '@Mapper|@Repository' <可改源码目录> --include='*.java'
# XML mapper 文件（SQL 注入实际发生处）
find <可改源码目录> -name '*Mapper.xml' -o -name '*mapper.xml'

# === lombok 规则集 ===
grep -rlE '@Data|@Builder|@Slf4j|@Getter|@Setter|@RequiredArgsConstructor' <可改源码目录> --include='*.java'

# === sharding 规则集 ===
grep -rlE 'ShardingRule|ShardingTable|PreciseShardingAlgorithm|sharding-key' <可改源码目录> --include='*.java' --include='*.yml'

# === spring-batch 规则集 ===
grep -rlE 'Job|Step|ItemReader|ItemProcessor|ItemWriter|@StepScope|@JobScope' <可改源码目录> --include='*.java'

# === dubbo 规则集 ===
grep -rlE '@DubboService|@DubboReference|@Service.*dubbo' <可改源码目录> --include='*.java'
find <可改源码目录> -name 'dubbo*.yml' -o -name 'dubbo*.properties'

# === rocketmq 规则集 ===
grep -rlE '@RocketMQMessageListener|RocketMQTemplate|DefaultMQPushConsumer' <可改源码目录> --include='*.java'

# === kafka 规则集 ===
grep -rlE '@KafkaListener|KafkaTemplate|@KafkaHandler' <可改源码目录> --include='*.java'

# === rabbitmq 规则集 ===
grep -rlE '@RabbitListener|RabbitTemplate|@Queue|@Exchange' <可改源码目录> --include='*.java'

# === redis 规则集 ===
grep -rlE 'RedisTemplate|StringRedisTemplate|@Cacheable|@CacheEvict|RedissonClient' <可改源码目录> --include='*.java'

# === quartz 规则集 ===
grep -rlE '@Scheduled|Scheduler|JobDetail|CronTrigger|@SchedulerLock' <可改源码目录> --include='*.java'

# === element / antd / naiveui 规则集（前端）===
grep -rlE 'el-|ElButton|ElTable|ElForm' <可改源码目录> --include='*.vue' --include='*.ts' # Element
grep -rlE 'a-|AntButton|AntTable|AntForm' <可改源码目录> --include='*.vue' --include='*.tsx' # Ant Design
grep -rlE 'n-|NButton|NDataTable|NForm' <可改源码目录> --include='*.vue' --include='*.ts' # NaiveUI
```

**D.1-A 异步/事件维度（仅当 D.0 判定含异步消费时）**
```bash
# 消费者/生产者/队列定义
grep -rlE "@RabbitListener|@KafkaHandler|@EventListener|celery|worker|consumer|Producer|publish|emit" <可改源码目录>
# 队列拓扑定义（exchange/queue/topic 定义文件）
find <可改源码目录> -type f \( -name "*queue*" -o -name "*topology*" -o -name "*exchange*" \)
```

**D.1-D 桌面/移动维度（仅当 D.0 判定含桌面/移动时）**
```bash
# 桌面：主进程/渲染进程/preload/IPC
grep -rlE "ipcMain|ipcRenderer|contextBridge|BrowserWindow|app\.whenReady" <可改源码目录>
# 移动：Activity/Fragment/Screen/Widget + 导航
grep -rlE "Activity|Fragment|Composable|Screen|Navigator|expo|flutter.*Widget" <可改源码目录>
```

**D.1-L 库导出维度（仅当 D.0 判定为库时）**
```bash
# 公共 API：入口文件的导出
cat <入口 index.ts/index.js/__init__.py/mod.go/lib.rs> # 提取全部 export
# 内部模块依赖
grep -rn "^import\|^from\|^use " <可改源码目录> | grep -v "test"
```

**D.1-T 通用维度（所有项目都枚举）**
```bash
# 类型定义（TS 项目）
grep -rlE "^export (interface|type) " <可改源码目录> --include="*.ts" --include="*.d.ts"
# 工具函数
find <可改源码目录> -type f \( -name "util*" -o -name "helper*" -o -name "common*" \) ! -path "*test*"
# 配置/常量
find <可改源码目录> -type f \( -name "config*" -o -name "constant*" -o -name "env*" \) ! -path "*node_modules*"
```

**第 2 步：解析每个文件的导出签名（非只数文件数）**

对第 1 步枚举到的每个文件，提取其**全部导出**（函数名/类名/store名/类型名/组件名 + 签名）：

```bash
# TS/JS：提取所有 export 行（签名级）
grep -nH "^export " <文件列表>
# Python：提取 def/class
grep -nH "^def \|^class \|^async def " <文件列表>
# Go：提取 func/type
grep -nH "^func \|^type " <文件列表>
# Java：提取 public class/method
grep -nH "public class\|public.*(" <文件列表>
# 前端组件签名（若有）：Props/Emits/Slots
grep -nH "defineProps\|interface.*Props\|withDefaults\|defineEmits\|defineSlots" <组件文件>
```

> 优先用 **gitnexus `context <symbol>`**（360度上下文：定义+被引用+引用关系）或 **graphify `explain <symbol>`**（节点邻域）系统性提取签名，而非逐文件 grep。

**第 3 步：计数核验（防止样本化填充）**

```
对每个维度独立核验：
 枚举计数 = 该维度 find/grep 命令输出的文件数
 清单计数 = reference-manual 对应章节的表格行数（去重后）
 断言：清单计数 ≥ 枚举计数 × 0.95（允许少量非公开/内部文件不列，但偏差须注明原因）
```

> 若某维度清单计数远小于枚举计数（如 10 vs 85），**禁止提交**，回到第 2 步继续补全该维度。
>
> **数据映射四维度是机器执法面**：数据模型实体（DIM_DATA_MODEL→§9）、MyBatis mapper XML（DIM_MAPPER_XML→§9）、
> 定时/批处理任务（DIM_SCHEDULE_JOB→§5）、ORM schema/迁移资产（DIM_ORM_SCHEMA→§8）——`inventory-verify.sh` 按 `assets/inventory-dimensions.conf`
> 自动核验这三类清单（漏列整维=FAIL；任务表路径进 --path-check）。字符串耦合层（XML/SQL 列）不进任何
> Java import 边，这三张清单 + §D.2-B Layer 5/§D.2-J 链路产物就是"漏改字段"的唯一防线，禁止样本化。

#### D.2 调用链路分析方法论（按项目形态选择链路模型）

**铁律：依赖链路不是"模块A→模块B"的骨架树。** 链路模型按项目形态选择——**前端追注册装配+组件挂载树；后端追请求处理管道+分层依赖；微服务追跨服务调用链**。不预设某一种。

**按形态选择链路模型（根据 D.0 判定）：**

| 项目形态 | 链路模型 | 追查重点 |
|---------|---------|---------|
| 含前端 | §D.2-F 注册装配链路 + 组件挂载树 + store 依赖 | 注册顺序/feature-gate/静态vs动态路由/跨模块引用 |
| 含后端 | §D.2-B 请求处理管道 + 分层依赖 + **数据映射链路（Layer 5）** | 入口→中间件→路由→controller→service→repo→DB/外部；**实体↔表列↔resultMap↔SQL 列** |
| 含异步 | §D.2-A 消息流转链路 | 生产者→队列→消费者→副作用+幂等 |
| 含定时/批处理 | §D.2-J 任务链路（信号驱动，非形态） | 触发器→job→reader/processor/writer→读写的表与实体 |
| 微服务 | §D.2-M 跨服务调用链 | 服务间同步/异步调用/共享DB/网关/trace透传 |
| 桌面 | §D.2-D IPC 链路 | 主进程↔preload↔渲染进程 IPC 通道 |
| 库 | §D.2-L 导出依赖图 | 公共API→内部模块依赖 |

---

**§D.2-F 前端注册装配链路 + 组件挂载树（仅含前端时）**

Layer 1 注册装配链路：
```
追查路径：
 应用入口（main.ts/index.ts/App.vue/main.jsx）
 → 注册中枢（bootstrap.ts/register.ts/plugin install/app.use）
 → 各功能模块的 registerXxx(app) 或 app.use(plugin)
 → registerRoute / registerNav / registerComponent / 路由表
 → 视图组件 → 子组件
```
分析方法：
1. 找入口（package.json scripts.dev / index.html script src / main 入口）
2. grep 入口文件的 `import` 与 `createApp`/`app.use`/`register` 调用
3. 追每个 register/install 函数体内挂载了什么（路由/导航/组件/store/插件）
4. 记录：**注册顺序**、**feature-gate**（受开关控制的注册）、**动态 vs 静态路由**

Layer 2 模块间依赖图：
```bash
grep -rn "^import.*from" <可改源码目录> | grep -oE "from ['\"][^'\"]+['\"]" | sort -u
# 或：graphify path "ModuleA" "ModuleB" / gitnexus trace
```
产出模块依赖矩阵（结构关系图用 mermaid，GitHub 原生渲染；若需表达模块间调用量/频次等统计数据，用 echarts option JSON 代码块。节点用项目实际模块名）。**关键：识别跨模块边界**——ModuleA 能否直接 import ModuleB 的组件？还是只能经 store/adapter？

Layer 3 组件挂载树（每个容器视图递归追 import）：
```
ContainerView (路由 /xxx)
 ├─ import ChildA from './ChildA'
 ├─ import CrossModuleComp from '<other-module>/components/...' ← 跨模块引用
 └─ import { useContainerStore } from '<this-module>/store'
 ├─ import { useOtherStore } from '<other-module>/stores/...' ← store 跨模块
 └─ import * as someApi from '<foundation>/api/xxx'
```

Layer 4 store/服务依赖链路：
```
每个 store：import 了哪些其他 store？哪些组件消费它？调用了哪些 API？
```

---

**§D.2-B 后端请求处理管道 + 分层依赖（仅含后端时）**

Layer 1 请求处理管道（从入口到 DB/外部副作用）：
```
追查路径：
 服务入口（server.ts/index.js/main.py/main.go/Application.java）
 → 全局中间件（cors/bodyParser/auth/errorHandler/logging）
 → 路由挂载（app.use(router) / @ComponentScan / include_router）
 → 路由级中间件/守卫（@Guard/beforeEach/jwt verify）
 → controller handler
 → service/usecase（业务逻辑）
 → repository/dao（数据访问）
 → DB / 外部 API / 缓存 / MQ
```
分析方法：
1. 找服务入口（scripts.start / main 函数 / Application 启动类）
2. grep 入口的中间件注册顺序（`app.use` / `@Middleware` / `add_middleware`）
3. 追路由挂载：哪些 router 被挂载、prefix 是什么、挂载顺序
4. 对每个端点追：controller → service → repository → DB/外部，记录完整调用链
5. 记录：**中间件链顺序**、**认证在哪层**、**事务边界在哪层**、**外部副作用在哪层**

Layer 2 分层依赖矩阵：
```bash
# 按分层目录聚合 import（service→repository / controller→service）
grep -rn "^import\|^from\|^use " <可改源码目录> | grep -E "service|repository|controller|domain" | sort -u
```
产出分层依赖矩阵（结构关系图用 mermaid，GitHub 原生渲染）。**关键：识别分层边界**——controller 能否直接访问 repository？domain 层能否 import ORM/框架？

Layer 3 数据流图（每条核心业务的数据流）：
```
Endpoint POST /api/xxx
 → Controller.handler(req)
 → Service.method(dto)
 → Repository.find/query/save(entity)
 → ORM → DB
 → EventBus.publish(event) ← 副作用
 → return ResponseDto
```

Layer 4 外部依赖链路：
```
每个 service：调用了哪些外部资源？DB/缓存/MQ/第三方API？
→ 记录：连接方式、事务边界、超时/重试策略、幂等性
```

Layer 5 数据映射链路（有数据访问层时——字符串耦合点，编译器不校验，漏改即静默缺陷）：
```
追查路径（按项目 ORM/SQL 映射技术选一条主线，逐层建立"字段级"对应关系）：
 MyBatis:  Mapper 接口方法 ↔ XML statement id（同名绑定）
           ↔ resultMap <result column property> / SQL 列清单
           ↔ 实体字段（getter/setter）↔ 表列（DDL/schema）
 ORM 全家（逐栈选主线，同一条链换注解载体）：
   JPA/Hibernate: 实体 @Column/@Table ↔ orm.xml/hbm.xml 映射 ↔ Flyway/Liquibase DDL 列
   GORM(Go):     struct tag `gorm:"column:x"` ↔ AutoMigrate/迁移 SQL 列
   Django ORM:   models.py 字段 ↔ migrations/ 迁移文件列（漏 makemigrations = 漂移）
   SQLAlchemy:   Column() ↔ alembic/versions 迁移
   Prisma/TypeORM/Sequelize: schema.prisma/@column ↔ migrations 目录
产出四件套：
 ① reference-manual §9 模型与映射清单（实体表 + mapper XML 表两行组，机器计数核验 DIM_DATA_MODEL/DIM_MAPPER_XML）
 ② reference-manual §8 数据字典的字段级映射清单：实体字段 ↔ 表列 ↔ resultMap property ↔ SQL 列清单
 ③ reference-manual §8 的 schema/迁移资产表（prisma/migrations/alembic/flyway/liquibase/orm.xml/hbm/schema.sql，
   机器计数核验 DIM_ORM_SCHEMA）——改模型的"第五查"：迁移是否已生成（模型↔迁移漂移是漏改字段的姊妹缺陷）
 ④ relations.jsonl 的 data-mapping/mapper-binding 边（relations-extract.sh 自动层已产出 MyBatis/JPA/hbm，
   AI 只补漏）
铁律：改实体字段的影响面反查必经此链——"谁引用了这个字段"在边集查 to=实体 的 from 集（mapper XML 清单），
      再叠加 SQL 列名字符串命中（grep 列名于 *.xml/*.java 内嵌 SQL）。禁止只查 Java import 边（XML 不在其中）。
      JPA @Query("select o from Order o where o.status=?1") 的 JPQL 实体/字段名同为字符串引用——
      清单须覆盖，改字段先 grep @Query 内嵌名。
```

---

**§D.2-A 异步消息流转链路（仅含异步消费时）**

```
追查路径：
 生产者（publish/emit/send）
 → 队列/Topic/Exchange（拓扑定义）
 → 消费者（@Listener/consumer/worker）
 → handler → service → 副作用（DB/通知/下游消息）
```
记录：**队列拓扑**、**消费幂等键**、**重试/DLQ 策略**、**消息时序保证**、**背压/限流**。

**消息拓扑配对表（端点名是双边字符串——producer 写 "order-topic" 与 listener 听
"order-topic" 互不知晓，改一边即静默断链，比漏改字段更隐蔽）**：
```
产出：reference-manual §5 消息拓扑配对表（每行：端点名 | 生产侧（file:line）| 消费侧（file:line）|
      序列化格式 | 幂等策略）。提取方法：grep 双边端点名字符串——
      Kafka:    send("X")/new ProducerRecord("X" ↔ @KafkaListener(topics="X")
      RabbitMQ: convertAndSend(ex, rk) ↔ @RabbitListener(bindings=@QueueBinding(...key="rk"))
      RocketMQ: topic="X" ↔ @RocketMQMessageListener(topic="X")
      Celery:   beat_schedule 任务名 ↔ @shared_task(name="X")/delay("X")
      单边端点（只有生产无消费/反之）显式标注"外部系统"或"孤儿端点"——改名前必查此表。
门禁：kafka/rabbitmq 规则集的 endpoint 配对门禁（warn 级自动 diff 双边名字集，命中差集提示人工核对）。
```

---

**§D.2-J 定时/批处理任务链路（仅探查到调度/批处理信号时：@Scheduled/@EnableBatchProcessing/Quartz/ElasticJob/celery beat 等）**

定时与批处理任务是"无入口请求的数据加工管道"——不经过 §D.2-B 的请求处理管道，改数据模型时最易漏改的地方（研发漏改字段的高发区）：

```
追查路径：
 触发器（@Scheduled cron / Quartz CronTrigger / JobParameters / beat_schedule）
 → 任务入口（job 类 / JobBuilder 装配 / tasklet）
 → 批处理 Step（生成期必读文件）：ItemReader（SQL 列清单 / mapper 查询 / 文件字段）
               ItemProcessor（实体字段读写 getXxx/setXxx）
               ItemWriter（mapper 写方法 / 批量 SQL 列）
 → 数据资产（读哪些表/实体、写哪些表/实体——读写方向必须记录）
产出两件套：
 ① reference-manual §5 的调度/批处理任务表（每行：任务名/入口路径/触发方式/读数据资产/写数据资产/幂等策略；
   机器计数核验 DIM_SCHEDULE_JOB，路径进 --path-check）
 ② relations.jsonl 的 job-flow 语义边（job 配置 → reader/writer 依赖的 mapper/实体；自动不猜，AI 按 Read/Write 源码逐条补）
铁律：改实体字段/表结构前必查此表——"哪些任务读写了这个资产"决定回归面（job 不在请求管道里，import 边查不全
      reader SQL 内嵌字符串列名的耦合）。
```

---

**§D.2-M 微服务跨服务调用链（仅微服务时）**

```
追查路径：
 API Gateway / BFF
 → 服务A（同步 REST/gRPC 调用服务B）
 → 服务B
 → 服务A（异步发消息到队列，服务C消费）
 → 服务C
```
记录：**同步调用链长度**、**共享DB**、**traceId透传**、**熔断/降级**、**Saga/Outbox 模式**。

#### D.2.5 机器可读关系边集（relations.jsonl——§D.2 的索引层）

调用链的 Markdown 图（mermaid 矩阵/挂载树）给 AI 读；同一批关系再落一份**机器可查的边集**给脚本消费：

```bash
bash scripts/relations-extract.sh <PROJECT_DIR> --skill-dir <目标技能目录>   # → references/relations.jsonl
```

- **自动层**（脚本产出，确定性零依赖）：import 边——TS/JS/Vue 相对说明符、py 相对导入、go module 内、java 包路径映射；**声明式映射边**——MyBatis `namespace`→Mapper 接口（`mapper-binding`）、`resultMap type`/`resultType`/`parameterType`→实体（`data-mapping`；字符串耦合点编译不校验，改实体字段的影响面反查靠它）；每边带 `evidence`（file:line）。
- **AI 层**（探查时在此初稿上补充）：语义边——`call`（调用）/`route`（路由挂载）/`message`（消息流）/`ipc`/`export`（库导出）/`job-flow`（定时/批处理装配：job 配置→reader/writer 依赖的 mapper/实体，按 §D.2-J 逐条补），行格式同款（`{"from","to","kind","evidence"}`）；madge/graphify/gitnexus 可用时按工具矩阵富化后重建。
- **消费方**：`--stable-diff` 1 跳下游传播优先读边集（import 边精确于 basename grep 启发式；改实体字段时 data-mapping 边把 mapper XML 拉进 1 跳影响面）；开发工作流 ②探查"谁依赖 X"直接查边集，替代读图；`--mark-active` 抽样核验断边（advisory）。

#### D.3 编排调用关系及约束推导（从链路分析中提炼规则）

> **这是"研发流程"的核心**：不仅是列出组件，还要提炼出**新功能开发时必须遵守的编排约束**。约束类别按项目形态动态选择——**只推导项目实际存在的约束类别**。

**按形态选择约束类别（根据 D.0 判定）：**

| 项目形态 | 适用的约束类别 |
|---------|-------------|
| 含前端 | 导入方向/跨模块边界/注册顺序/feature-gate/路由挂载/状态所有权/测试边界 |
| 含后端 | 分层依赖方向/事务边界/DTO转换边界/中间件顺序/认证层/外部副作用隔离/测试边界 |
| 含异步 | 消费幂等/消息时序/重试DLQ/生产消费解耦 |
| 微服务 | 服务间调用方向/共享DB禁止/trace透传/熔断降级/Saga补偿 |
| 通用 | 改造分类与文件落位/版本锁定/可改vs只读边界 |

**约束推导表（每条须有代码证据，示例用项目实际名替换）：**

| 约束类别 | 推导方法 | 示例格式 |
|---------|---------|---------|
| **导入方向约束**（前端） | 分析模块依赖矩阵，识别允许的依赖方向 | "ModuleA→ModuleB 允许；反向禁止（避免循环）" |
| **分层依赖方向约束**（后端） | 分析分层依赖矩阵，识别允许的层间依赖 | "Controller→Service→Repository 允许；Repository→Controller 禁止；Domain 不得 import ORM/框架" |
| **跨模块/层边界约束** | 分析跨边界 import，区分"允许直接引用"vs"只能经接口/adapter" | "ModuleA 可 import ModuleB 组件；但 ModuleA 的 service 只能经接口访问 ModuleC，不直接 import 实体" |
| **注册/启动顺序约束**（前端） | 分析注册链路的执行顺序 | "registerA 必须在 registerB 后（A 依赖 B 已注册）" |
| **中间件顺序约束**（后端） | 分析中间件注册顺序 | "auth 中间件须在 route handler 前；errorHandler 须最后注册" |
| **事务边界约束**（后端） | 分析事务开启/提交/回滚的位置 | "事务在 Service 层开启（@Transactional），Repository 不开事务；跨 service 调用不用同一事务" |
| **Feature-gate 约束** | 分析 feature flag 判断 | "ModuleB 受 ENV_FLAG 控制；ModuleA 在 ModuleB=false 时须降级" |
| **路由挂载约束**（前端） | 分析静态 vs 动态路由 | "ModuleA 子路由静态定义；ModuleC detail 路由动态 addRoute" |
| **状态所有权约束**（前端） | 分析 store 间数据流向 | "ModuleA store 聚合 B/C/D 数据，是只读消费者；某 bus 是单例" |
| **消费幂等约束**（异步） | 分析消费者幂等键设计 | "消费者须按 msgId 去重；无幂等键=重复消费风险" |
| **服务调用方向约束**（微服务） | 分析服务间调用拓扑 | "服务A→服务B 允许；服务B→服务A 禁止（避免循环依赖）" |
| **改造分类约束**（通用） | 分析文件位置决定改造机制 | "可改目录纯新增=扩展类；只读骨架改=注入类（patch/override）" |
| **测试边界约束**（通用） | 分析测试配置 | "测试框架只跑可改目录；只读区经注入间接覆盖" |

**推导流程（每条约束须有代码证据）：**
```
1. 从 D.2 的依赖矩阵，识别所有跨边界 import/调用边
2. 对每条边判断：允许的依赖 vs 应避免的反向依赖？
 → 依据：项目既有分层约定 + 循环依赖检测（madge/graphify）
3. 从注册链路/中间件链，识别顺序与 feature-gate
4. 从路由表/事务注解，识别挂载方式与事务边界
5. 把每条约束写成"因为 [代码证据]，所以 [约束规则]，违反则 [后果]"
6. 写入 dev-guide.md "编排约束"段 + reference-manual.md §5 约束注释
```

#### D.4 接口清单全量枚举（按接口形态适配）

**按探查到的接口形态选择枚举方式（不预设 REST）：**

```bash
# REST/HTTP 端点（Express/Koa/Fastify/Spring/FastAPI/Gin/Django）
grep -nH "router\.(get|post|put|delete|patch)|@(Get|Post|Put|Delete|RequestMapping)|app\.(get|post)|@app\.route|APIRouter" <路由文件列表>
# 提取 prefix
grep -nH "prefix|Router(\{|Blueprint\(|APIRouter\(" <路由文件列表>
# 提取认证中间件
grep -nH "auth|jwt|session|guard|middleware|@Guard" <路由文件列表>

# GraphQL（resolver/schema）
grep -rlE "resolver|@Query|@Mutation|@Field|@ObjectType|buildSchema|gql\`" <可改源码目录>
# 枚举每个 resolver 的 Query/Mutation

# gRPC（.proto）
find <可改源码目录> -name "*.proto" | xargs grep -H "rpc \|service "

# 消息队列消费者（作为"接口"枚举）
grep -nH "@RabbitListener|@KafkaHandler|@EventListener|@Consumer|celery\.shared_task" <可改源码目录>

# 库的公共 API（导出函数即接口）
grep -nH "^export " <库入口文件>
```

产出**每接口文件一张端点表**：
| 方法/类型 | 完整路径/名称 | handler/函数 | 认证 | 用途 | 复用方式 |
|----------|-------------|-------------|------|------|---------|
（一行一个端点，prefix 拼接到完整路径；GraphQL 列 Query/Mutation 名+返回类型；gRPC 列 service.method；MQ 列 queue+handler。不写通配符占位）

#### D.5 产出校验清单（按维度动态核验，探查完成前必过）

> **只核验 D.0 判定存在的维度**。不存在的维度跳过（如纯后端项目不核验"组件穷举"）。

**前端维度（仅含前端时）：**
- [ ] **UI 组件穷举**：§4 组件表行数 ≥ `find` 组件文件计数 × 0.95，按模块分组，每行含路径/用途/稳定性
- [ ] **Store 穷举**：§4 store 表覆盖全部状态管理调用，每行含暴露的 state/action
- [ ] **注册装配链路**：§5 含注册顺序 + feature-gate + 静态/动态路由
- [ ] **组件挂载树**：§5 含每个容器视图的挂载树（含跨模块引用注释）
- [ ] **store 依赖链路**：§5 含 store 间依赖 + 消费者反查

**后端维度（仅含后端时）：**
- [ ] **Controller/Route 穷举**：§6 每路由文件一张端点表，逐端点列出
- [ ] **Service/Repository 穷举**：§4 含全部 service/repository + 签名
- [ ] **请求处理管道**：§5 含中间件链顺序 + 认证层 + 事务边界
- [ ] **分层依赖矩阵**：§5 含分层图（mermaid）+ 允许/禁止方向；统计类数据（如层间调用量）用 echarts
- [ ] **数据流图**：§5 含核心业务的数据流（controller→service→repo→DB/外部）

**异步维度（仅含异步时）：**
- [ ] **生产者/消费者穷举**：§4 含全部生产者+消费者+队列拓扑
- [ ] **消息流转链路**：§5 含生产→队列→消费→副作用链路
- [ ] **幂等/DLQ/重试策略**：dev-guide §8 含幂等约束

**通用维度（所有项目）：**
- [ ] **类型定义穷举**：§9 覆盖全部 export interface/type（TS）或等效
- [ ] **编排约束**：dev-guide §8 含按形态推导的约束类别，每条有代码证据
- [ ] **接口全量**：§6 无通配符占位（逐端点/逐 resolver/逐 method 列出）
- [ ] **业务功能与配方**：recipes.md §A 覆盖已识别业务功能、§B 每配方五要素齐全（§D.6/§D.7，standard/compliance 档）
- [ ] **计数核验**：每个维度清单计数 ≥ 枚举计数 × 0.95

#### D.6 业务功能盘点（既有业务功能实现编目 → recipes.md §A）

> 配方层的地基：先编目"项目已有哪些业务功能、各由哪些组件拼成"——每次成功拼装的实物记录。任务配方（§D.7）与开发工作流 ②探查的复用决策都从这张表出发，不从零 grep。

从 §D.1 枚举产物与 §D.2 链路归纳（**不是重新探查**）：
- **功能识别**（按形态选入口）：前端=路由表/菜单项（页面功能）；后端=端点表按业务域聚合（接口功能）；异步=队列+handler（消费功能）；桌面=窗口/菜单项；库=导出 API 分组。每功能一行。
- **组件归因**：每功能回溯 §D.2 对应链路模型，列出它实际拼装了哪些稳定单元（§4 清单条目）。
- **接口/数据对应**：功能消费的端点（§6）与数据表/模型（§9）。
- **测试对应**：功能已有的测试案例文件与测试数据 fixture（验证资产与功能编目勾稽——无测试的功能显式标"无"）。

产出表（recipes.md §A）：`| 功能 | 入口路径 | 复用组件 | 接口 | 数据 | 测试 |`——组件路径反引号包裹（`--path-check` 校验存在性）。

#### D.7 任务配方提取（高频任务形态的拼装序列 → recipes.md §B）

把"怎么拼不违规"（§D.3 编排约束）上升为"按什么顺序拼"（配方）。三源提取，证据优先：

1. **既有实现**（最可信源）：§A 业务功能清单就是现成配方实例——同类功能此前怎么拼的，新任务照路线复用。
2. **git 同类任务历史**：`git log --oneline -- <功能目录>` 看同类任务的提交序列（改了哪些文件、什么顺序）；共变文件对（高频同改文件=隐性拼装单元，mine-habits 初稿）佐证复用组合。
3. **开发者文档/偏好**：AGENTS.md/CLAUDE.md/记忆里的流程约定与工作偏好。

每配方五要素（缺一不可，`--verify-completeness` 机器执法）：
- **触发场景**：什么任务用本配方（对齐 7 类任务路由 feature/fix/refactor/chore/docs/test/exp 与项目高频形态，如"新增页面/新增接口/新增消费者"）
- **前置查询**：查 reference-manual 哪些表（§4 组件/§6 接口/§9 数据）+ recipes §A 同类功能先例
- **复用件清单**：引用的组件库条目（反引号路径表格，`--path-check` 校验存在性）
- **胶水步骤**：最小新增（新文件 + 注册/整合点），不改既有稳定单元
- **门禁与验证序列**：task-type-gates 对应门禁集 + TEST_CMD / check_test + trace-log 留痕

配方数量按项目实际（高频形态 ≥2 个即可起步，不凑数）；低频形态不建配方（直接走九节点流）。成长期新配方经问题沉淀通道追加（SKILL.md 自成长段）。

## 各语言项目探查要点

### Node.js / 前端
- package.json: name, version, scripts, engines, type, dependencies/devDependencies 关键框架
- 构建配置：vite.config / webpack.config / tsconfig / electron-builder.yml
- 目录：src/ packages/ apps/ monorepo?
- overlay-fork 类（可改层/只读层分离）：patch 机制（patch 清单文件 + inject 脚本?）、符号链接、alias 链
- **页面知识三角**（进 reference-manual 前端构件表）：每个路由级页面枚举三答——①操作：页面有哪些按钮/入口/弹窗；②调用：每个操作调哪些 API 及**真实入参**（在调用点反推，前端常只透传一个参数对象，光看 API 定义抽不出字段）；③权限：什么角色/条件可见可点、无权限时如何降级提示。微前端项目另须单独理清主子应用拆分与通信机制（ mounting 方式/通信通道/路由归属），这是 AI 最难自己拼出的部分。

### Python

> Python/Django 生态的字符串耦合面（模板字段/URL 名/POST 参数/admin 注册/CSV 列头/工厂字段/settings 键/迁移双源等十六类，自动提取只覆盖 import 边）——探查必按 `references/frameworks/django.md` §字符串耦合面清单逐面枚举，字段变更走 spec 四查。
- pyproject.toml / setup.py / requirements.txt: 依赖、版本、entry points
- 构建：poetry / pip / setup.py / Makefile
- 目录：src/ pkg/ tests/ scripts/
- 测试：pytest / unittest，conftest.py
- lint：ruff / black / mypy / flake8

### Go
- go.mod: module path, go version, 关键依赖
- Makefile: build/test/lint/run targets
- 目录：cmd/ internal/ pkg/ api/
- 测试：*_test.go，go test 命令

### Rust
- Cargo.toml: name, edition, dependencies, [[bin]]/[lib]
- 构建：cargo build/test/run，features
- 目录：src/ examples/ tests/ benches/
- workspace 成员（monorepo）

### Java
- pom.xml / build.gradle: groupId, artifactId, version, 依赖
- 构建：maven / gradle
- 目录：src/main/java, src/test/java
- 框架：Spring Boot? 需查 application.yml/properties（DB/Redis/MQ 连接配置）

### Monorepo
- 根 package.json (workspaces) / pnpm-workspace.yaml / turbo.json / nx.json
- 各子包的 scripts，包间依赖关系
- 哪些包可改、哪些 vendored/只读

## 环境与资源检测探查（材料 assets §1/§2）

探查时必须确认开发环境与外部资源的可检测性，供目标技能的 `env-setup.sh` 使用：

```bash
# 运行时版本
node --version; python --version; go version; java -version; rustc --version

# 外部资源连通性（按项目实际，探查连接方式）
# 数据库
# 缓存
# 消息队列
# 搜索引擎

# 工具权限
git --version; gh --version; docker --version
```

探查到的连接方式（连接串格式、env 变量名、端口）写入目标技能的 `env-setup.sh` 和 `mcp-tools.md`。

## MCP 工具探查（材料 scripts §2）

探查项目是否有可接入的 MCP 工具（数据库、ELK、Redis、MQ、dubbo、union、CMDB 等）：

- 项目是否依赖外部服务 → 是否有现成的 MCP/CLI 查询工具
- 数据库：是否有 psql/mysql/mongosh CLI？是否有 MCP DB 工具？
- ELK：是否有 kibana API？curl 查询样例？
- Redis：是否有 redis-cli？连接方式？
- MQ：是否有管理 API（Kafka topics、RabbitMQ management）？
- dubbo/union：是否有注册中心查询接口？
- CMDB：是否有资产查询 API？

探查到的 MCP 工具接入方式写入目标技能的 `scripts/mcp-tools.md`。无外部资源的，标注"本项目无外部 MCP 资源"。

## 提取项目特征卡

**P0/P1 分级规则**：P0 六项 = {1 项目类型, 4 技术栈摘要, 5 构建发布命令, 11 可复用稳定单元, 15 编排调用关系及约束, 16 详尽组件库清单}——生成完成的强制门槛，计数核验（清单计数 ≥ 枚举计数 × 0.95）仅对 P0 维度强制；P1 十一项 = {2,3,6,7,8,9,10,12,13,14,17}——draft 期可以「（P1 待补）」占位（不触发 --verify-completeness 的占位符命中），`--mark-active` 前必须填实。

探查完成后，整理成结构化特征卡（供 Step 3 填充模板用）：

```markdown
## 项目特征卡：<项目名>

### 1. 项目类型（P0 必填）
（单体/monorepo/overlay-fork/微服务/库）

### 2. 可改范围（P1·可增量）
- 可改：<目录列表>
- 只读：<目录列表>
- 只读区修改机制：<patch/overlay/插件机制，或"不允许修改">

### 3. 改造分类（P1·可增量）
（项目特有的改动分类。若无明确分类，标注"默认：按目录分区"）

### 4. 技术栈摘要（含版本基线——版本锁定铁律依据）（P0 必填）
（一句话：语言 + 主框架 + 构建 + 测试）

> ★版本基线表（precheck.sh --deps 的对比基线，必须精确到版本号）：
> | 依赖名 | 版本 | 类型(核心/基础/开发) |
> |--------|------|---------------------|
> （从 package.json/pyproject.toml/go.mod/Cargo.toml 提取全部依赖精确版本）

### 5. 构建发布命令（P0 必填）
| 用途 | 命令 |
|------|------|
| dev | |
| build | |
| test | |
| release | |
端口约定：（如有）

### 6. 分支规范（P1·可增量）
- 命名：feat/* | fix/* | ...
- 合入策略：merge --no-ff / squash / rebase
- 保护分支：<列表>
- 推送规则：自动/需确认

### 7. 安全规则（P1·可增量）
- 脱敏：<规则来源>
- 密钥管理：<方式>
- 网络白名单：<机制>

### 8. 文档约定（P1·可增量）
- spec 位置：<路径>，命名：<格式>
- plan 位置：<路径>，命名：<格式>

### 9. 测试体系（P1·可增量）
- 框架：<vitest/jest/pytest/go test>
- 目录：<路径>
- 运行：<命令>

### 10. 环境与外部资源（P1·可增量）
- 运行时版本要求：<node>=23 / python>=3.11 / ...>
- 外部资源：DB=<类型+连接方式> / 缓存=<...> / MQ=<...> / 搜索=<...>
- MCP 工具：<有的列出，无则"无">

### 11. 可复用稳定单元清单（P0 必填）（拼装式开发的核心依据）

> 这是拼装式开发的关键。研发人员基于既有稳定单元（接口/组件/类/函数/方法）进行拼装，而非重复造轮子或侵入式重构。
>
> **★铁律：本项不允许用"代表性样本"填充。必须按 §D.1 全量穷举方法论做自动枚举 + 签名提取 + 计数核验，确保一个不漏。清单计数 ≥ 枚举计数 × 0.95。** 探查指南见上方 §D.1-D.5。特征卡填好后供目标技能的 dev-guide.md 和 spec-template.md 引用。
> **★铁律：本项必须配套产出"编排调用关系及约束"（见 §D.3），写入特征卡第 15 项与目标技能 dev-guide.md。** 只列清单不推约束 = 未完成。

#### 11a. 可复用 API 接口
| 接口签名 | 方法 | 路径 | 用途 | 认证 | 复用方式 |
|----------|------|------|------|------|---------|
| `GET /api/xxx/:id` | GET | /api/xxx/:id | 查询单个 | Bearer | 前端 @/api 调用 |
| `POST /api/xxx` | POST | /api/xxx | 创建 | Bearer | 前端 @/api 调用 |
（列出项目全部稳定 API，含控制器/路由文件位置）

#### 11b. 可复用组件
| 组件名 | 路径 | Props | 用途 | 复用方式 |
|--------|------|-------|------|---------|
| `<Button>` | &lt;module&gt;/components/... | type,onClick | 按钮 | import 直接用 |
（列出项目全部稳定 UI 组件，含 props 签名）

#### 11c. 可复用类/函数/方法
| 名称 | 类型 | 签名 | 路径 | 用途 | 复用方式 |
|------|------|------|------|------|---------|
| `useAuth` | composable | ` => { user, login, logout }` | composables/useAuth | 认证 | import 调用 |
| `formatDate` | 函数 | `(ts: number) => string` | utils/date | 格式化日期 | import 调用 |
| `DatabaseSync` | 类 | `new DatabaseSync(path)` | node:sqlite | DB | 内置 |
（列出项目全部稳定类/函数/方法/composable/store/工具函数，含完整签名）

#### 11d. 可复用 Store（状态管理）
| Store | 路径 | 暴露的状态/方法 | 复用方式 |
|-------|------|----------------|---------|
| `useXxxStore` | store/xxx | state, actionA, actionB | 组件中调用 |
（列出项目全部 Pinia/Vuex/Redux store）

#### 11e. 可复用类型定义
| 类型 | 路径 | 定义 | 复用方式 |
|------|------|------|---------|
| `TraceNode` | adapters/... | `{ id, name, kind }` | import type |
（列出项目全部 TS interface/type，供新功能直接引用）

#### 11f. 稳定性标注（唯一定义点）
- **稳定层**（推荐复用）：公共 API、公共组件、工具函数、类型定义、store 接口
- **不稳定层**（慎用）：内部实现细节、私有方法、实验性代码、标注 @deprecated 的
- **禁止改层**：upstream 骨架、第三方依赖、框架核心

> **本节是"稳定单元"概念的唯一权威定义点**——全仓其余文件引用此概念时一律指回"见 references/exploration-guide.md §11f"，不重复定义。每个稳定单元记录五维字段（签名/路径/用途/复用方式/稳定性标注），五维字段的历史论证见 docs/design-evolution.md A12（五维稳定单元）档案。

> 探查时用 `gitnexus analyze` + `gitnexus mcp` 或 `graphify .` 构建图谱，用图谱查询调用链/依赖链，**系统性盘点**而非随机 grep。对每个稳定单元记录：签名、路径、用途、复用方式。

#### 11g. 下游影响域（P0 必填，标记沿调用链传播）
> **★铁律（Palantir markings-propagate 映射）：禁止改层的稳定单元，其"下游影响域"（1 跳：直接调用该稳定单元的下游文件）必须记录。** `--stable-diff` 门禁的传播段据此反查——本次变更触及下游影响域文件时 warn "依赖禁止改单元 X，改动可能破坏其契约"。只列"禁止改层"的下游；稳定层/不稳定层不强制（它们可改，传播意义弱）。记录在 `reference-manual.md §5` 调用链路图，用机器可读标记 `<!-- stable-propagate: <stable_file> → <downstream1>,<downstream2> -->`，G16 断言扫此标记。
| 稳定单元（禁止改层） | 下游影响域（1 跳直接调用者） | 证据 |
|---------------------|--------------------------|------|
| `src/repositories/UserRepo` | `src/services/UserService`, `src/services/AuthService` | graphify path / gitnexus trace |
| `src/domain/Order` | `src/services/OrderService`, `src/controllers/OrderController` | import 反查 |

### 12. 数据规范（P1·可增量）
- schema 位置：<路径>
- 样例数据：<位置/格式>
- 业务规则：<关键规则>
- 勾稽关系：<外键/聚合/关联>

### 13. 五层认知基底（P1·可增量）（探查时记录基线，供 --cognition 体检对比）
> 此项不是"额外填写"，而是把前 12 项的认知状态做一次总结，形成可对比趋势的基线。认知基底共五层（认知递进/思维语言/认知辩证/偏差防范/辩证认知），详见 `references/cognition-framework.md`。

#### 13a. 认知映射表（六阶认知链落点）
| 认知阶 | 项目落点 | 文件 |
|--------|---------|------|
| ①概念 | 领域实体/稳定单元 | reference-manual §4/5/6 |
| ②结构 | 分层依赖方向 | dev-guide 分层图 |
| ③空间 | 服务/组件目录 | codebase.md |
| ④映射 | 术语↔代码↔目录 | glossary+codebase |
| ⑤规律 | 项目铁律 | dev-guide §7 |
| ⑥处理 | fail/warn/spec/ADR | precheck+spec |

#### 13b. 六维动力学基线（探查时记录值，后续 --cognition 对比趋势）
| 维度 | 基线值 | 观测方式 |
|------|--------|---------|
| 速度 | 单次变更 X 文件 | git diff --name-only |
| 聚散 | N 服务/M 组件 | find dirs |
| 趋势 | 依赖深度 X | graphify/madge |
| 强度 | 同步调用 X 处 | grep fetch/axios |
| 能耗 | store X 行/props X 个 | wc -l/awk |
| 累积量 | TODO X 处/技术债 X 条 | grep TODO |

#### 13c. 五层认知状态（探查时标注是否已建立）
- 第一层 认知递进：☐已建立（特征卡前 12 项完整 + 认知映射表）☐未建立
- 第二层 思维语言：☐已建立（spec 含 §14 交付衰减/§15 蓝图段）☐未建立
- 第三层 认知辩证：☐已建立（workflow 4-Phase + 逻辑剃刀审查）☐未建立
- 第四层 偏差防范：☐已建立（spec §16 偏差自检 + 谬误图谱）☐未建立
- 第五层 辩证认知：☐已建立（spec §17 辩证映射 + 7 对辩证范畴）☐未建立
```

### 14. 领域知识识别（P1·可增量）（技术领域 + 业务领域）
> 探查时必须识别项目所属的技术领域与业务领域，补充该领域的专业知识规则。
> 防范达克效应：不懂领域就生成 skill = 过度自信。领域知识是"稳定单元清单"的上层——不了解领域，就无法判断哪些单元是稳定的。

#### 14a. 技术领域识别
| 识别项 | 探查方法 | 示例 |
|--------|---------|------|
| 技术栈类别 | 读 package.json/go.mod/Cargo.toml 的依赖 | 前端(Vue/React)、后端(Node/Go/Java)、桌面(Electron)、移动(Flutter) |
| 数据存储类别 | 读 ORM/DB 配置/迁移文件 | 关系型(SQLite/PostgreSQL)、文档型(MongoDB)、缓存(Redis)、搜索(ES) |
| 通信模式 | 读 API/消息/MQ 配置 | REST/GraphQL/gRPC、同步/异步、长连接/WebSocket |
| 部署模式 | 读 Dockerfile/CI/构建脚本 | 单体/微服务/Serverless/桌面应用/嵌入式 |
| 安全模型 | 读认证/授权/加密代码 | Session/JWT/OAuth、RBAC/ABAC、传输层(TLS)/存储层(加密) |

#### 14b. 业务领域识别
| 识别项 | 探查方法 | 示例 |
|--------|---------|------|
| 业务类别 | 读领域模型/表名/API路径/文档 | 电商/IM通讯/CRM/ERP/监控/DevOps/教育/金融 |
| 业务核心实体 | 从领域模型/ORM/DB schema 提取 | Order/Customer/Message/Task/Report |
| 业务规则 | 从代码注释/测试用例/文档提取 | "订单金额=Σ明细×单价×折扣"、"消息已读后不重发" |
| 合规约束 | 从文档/代码中的 license/隐私/审计 | GDPR/等保/PCI-DSS/数据脱敏/审计日志 |
| 行业标准 | 从依赖/文档/代码模式识别 | OAuth2.0/OIDC/FHIR/MQTT/HL7/SOLID/CLEAN |

#### 14c. 领域深入分析（动态识别后推导客观规律，非套用静态清单）
> 识别领域后，必须对该领域做**深入分析**，推导出该领域在本项目中的**具体客观规律**。
> 这些规律不是从通用清单复制的——而是从项目的实际代码、数据流、业务规则、约束条件中**分析得出**的。
> **铁律：领域规则不得违反通用常识和客观规律。** 推导出的每条规律须标注其依据（代码证据/文档证据/行业常识）。

**分析流程（每步须产出具体结果，不可跳过）：**

```
第 1 步：动态识别领域边界
 → 从 14a/14b 的识别结果，确定项目涉及哪些技术领域 + 业务领域
 → 产出："本项目涉及以下领域：[领域A, 领域B, ...]"

第 2 步：逐领域深入分析
 → 对每个识别出的领域，回答以下问题（须有代码/文档证据）：
 (1) 该领域在本项目中的核心实体是什么？（从代码提取，非猜测）
 (2) 这些实体间的因果关系是什么？（A 导致 B，B 依赖 C）
 (3) 该领域有哪些不可违反的物理/逻辑约束？（从代码模式+行业常识推导）
 (4) 当前代码是否遵循了这些约束？有无违反迹象？
 (5) 这些约束在本次变更中是否可能被破坏？

第 3 步：推导客观规律
 → 基于第 2 步的分析，推导出该领域在本项目中的客观规律
 → 每条规律格式："因为 [代码证据/文档证据/行业常识]，所以 [客观规律]，违反则 [后果]"
 → 产出：写入 reference-manual.md "领域知识"段
```

**分析示例（以 IM 通讯领域为例，展示"动态分析→推导"过程）：**

| 分析步骤 | 具体产出 |
|---------|---------|
| 第 1 步 识别 | 识别到项目含 IM 通讯领域（依据：`chat/` 目录 + Matrix/IRC/XMPP 协议依赖 + gateway/notice 相关文件） |
| 第 2 步(1) 核心实体 | Message（消息）、Thread（会话线程）、Gateway（网关）——从代码类名提取 |
| 第 2 步(2) 因果关系 | Gateway 状态变化 → 触发 Notice → 展示 Banner → 用户感知；消息发送 → 经过网关 → 落库 → 推送 |
| 第 2 步(3) 客观约束 | 因为消息有时序性（代码证据：timeline 排序逻辑），所以消息顺序不可乱；因为已读状态会被多端同步（代码证据：多端 ACK 逻辑），所以已读须幂等；因为网关可能断线（代码证据：重连逻辑），所以离线消息须缓存 |
| 第 2 步(4) 遵循情况 | 当前代码遵循时序（timeline 按 timestamp 排序）✓；已读状态无幂等键 ⚠ |
| 第 2 步(5) 变更风险 | 本次变更如改消息发送逻辑，须保证时序不乱；如改已读逻辑，须加幂等键 |
| 第 3 步 推导规律 | "因为消息有时序性（timeline 排序），所以消息发送/存储须保序，违反则消息错乱"；"因为已读状态多端同步，所以已读更新须幂等（idempotency-key），违反则重复通知" |

> **关键区别：** 上面的规律不是从通用清单复制的"消息有序性须保证"——而是从项目实际代码（timeline 排序逻辑）分析得出的**具体约束**（"因为 timeline 按 timestamp 排序，所以须保序"）。通用清单只做参考，具体规律须从代码证据推导。

**通用领域约束参考（仅作分析起点，不直接复制到 reference-manual）：**

| 领域 | 分析起点（须结合项目代码验证后写入） |
|------|--------------------------------------|
| 数据库 | 事务边界在哪？外键关系是什么？哪些查询是 N+1？索引策略？ |
| 网络 | 通信协议是什么？无状态如何维持会话？超时/重试策略？ |
| 安全 | 认证流程？密钥存储方式？输入验证在哪层？ |
| 并发 | 共享状态在哪？锁策略？有无竞态条件？ |
| 前端 | 渲染策略？状态管理？性能瓶颈在哪？ |
| 分布式 | 一致性模型？分区容忍策略？幂等设计？ |
| IM/通讯 | 消息时序保证？已读幂等？离线缓存？推送去重？ |
| 电商 | 库存扣减方式？价格版本化？订单状态机？ |
| DevOps | 构建可重复性？回滚机制？配置分离？监控覆盖？ |

> 探查时从上表选取涉及领域作为**分析起点**，但每条规律须从项目代码证据推导，不可直接复制通用条目。precheck `--domain` 检查：reference-manual 领域知识段的每条规律是否标注了依据（代码证据/文档证据/行业常识）。

### 15. 编排调用关系及约束（P0 必填）（从调用链路分析推导，必填）

> **★铁律：特征卡第 11 项（稳定单元清单）必须配套本项。** 只列组件不推约束 = 未完成。
> 推导方法论见上方 §D.3。本项把 §D.2 三层链路分析的结论结构化为研发约束，写入目标技能 dev-guide.md 的"编排约束"段。

#### 15a. 导入方向与跨模块边界约束
| 允许的依赖方向 | 禁止的反向依赖 | 代码证据 | 违反后果 |
|--------------|--------------|---------|---------|
| 模块A → 模块B（组件+store） | 模块B → 模块A（避免循环） | grep import 分析 | 循环依赖、构建失败 |

#### 15b. 注册/装配顺序约束
| 注册顺序 | 依赖关系 | feature-gate | 代码证据 |
|---------|---------|-------------|---------|
| registerXxx 在 registerYyy 后 | XxxStore 依赖 YyyStore 已注册 | ENV_FLAG_XXX | bootstrap 注册调用顺序 |

#### 15c. 路由挂载约束
| 路由 | 挂载方式 | 定义位置 | 代码证据 |
|------|---------|---------|---------|
| /xxx | 静态定义 | router/index.ts (patch NNN) | grep addRoute |
| /xxx/:id | 动态 addRoute | registerXxxRoutes | bootstrap 注册 |

#### 15d. 改造分类与文件落位约束
| 变更类型 | 落位目录 | 机制 | 约束 |
|---------|---------|------|------|
| 纯新增（扩展类） | 可改目录/&lt;module&gt;/ | 项目允许的扩展机制（alias/插件/模块注册） | 不碰只读骨架 |
| 骨架修改（注入类） | 项目允许的注入位置（patch/override/monkey-patch） | 构建时注入或运行时替换 | 须记录在变更清单 |

#### 15e. 状态所有权与数据流约束
| 数据所有者 | 消费者 | 访问方式 | 代码证据 |
|----------|--------|---------|---------|
| StoreA（owner） | StoreB（只读） | adapter 转换 | store 间 import |

#### 15f. 测试边界约束
| 测试范围 | include 规则 | 约束 | 代码证据 |
|---------|-------------|------|---------|
| custom/**/*.test.ts | vitest.config.ts | upstream 不直接单测 | vitest.config |

> 每条约束须标注代码证据（文件:行 或 grep 命令）。precheck `--layer` 门禁可校验导入方向；`--frontend` 门禁校验循环依赖。

### 16. 详尽组件库清单（P0 必填）（全量，从 §D.1 全量穷举得出）

> **★铁律：本项是特征卡第 11 项的"全量保障"。** 第 11 项列稳定单元清单，本项记录全量枚举的计数核验结果，确保不漏。
> 按 §D.0 项目形态判定 → §D.1 按维度全量穷举 → 每维度计数核验（清单计数 ≥ 枚举计数 × 0.95）。
> 产出写入 reference-manual.md §4（全量构件表）+ §6（全量接口端点表）+ §9（全量 store/类型表）。

#### 16a. 枚举计数核验表

> **本表由 `scripts/inventory-verify.sh` 自动产出（维度注册表 `assets/inventory-dimensions.conf` 数据驱动）。**
> 跑 `bash scripts/inventory-verify.sh <项目根> --skill-dir <skill目录> --form <§D.0形态> [--tsv]`：
> - 全 PASS → 直接引用报告结论填本表「核验结果」列；
> - FAIL（清单计数 < 枚举计数 × 0.95）→ 只针对失败维度回 §D.1 补全清单后重跑；
> - DIM_MISMATCH（声明形态与枚举结果矛盾，如 backend 却检出 UI 组件）→ 回 §D.0 重判形态。
> 红线：脚本只做计数 + 错配 lint，不替模型判断维度是否适用（适用判断由 §D.0 形态判定驱动）。

| 维度 | 枚举计数 | 清单计数 | 比率 | 核验结果 | 偏差说明 |
|------|---------|---------|------|---------|---------|
（由 inventory-verify.sh 报告填，按 §D.0 判定的维度）

### 17. 合规与质量特性基线（P1·可增量）

> **本项是强监管交付的探查基线**：项目若无合规要求，填"无合规要求（默认约定，可调整）"即可，不必硬凑；
> 若命中金融/医疗/政务/央企等强监管场景，本项是 compliance profile 与合规门禁族的输入。

- 合规要求清单：等保（级别）/ 密评（GB/T 39786）/ 个保法 PIA / 行业监管（金融、医疗、政务）/ 认证（ISO27001、PCI-DSS、SOC2）：<有的列出+证据位置，无则"无">
- 既有合规证据：备案号/测评报告/审计报告位置：<docs/链接，无则"无">
- 质量特性声明（GB/T 25000 族）：项目已声明的质量特性（可靠性/性能/安全性/可维护性…）与对应测度：<有则引用>
- 数据分级：个人信息/重要数据/核心数据涉及时的分级与出境要求：<有则列出>
- 探查方式：Read 现有合规文档/等保备案/密评报告/PIA + Grep 质量特性声明（工具矩阵第 17 行）

## 探查不到时的处理

某项探查不到时：
1. 先确认是否真的没有（换关键词再搜）
2. 确实没有 → 填合理默认值，在目标技能中标注 `（默认约定，可调整）`
3. 默认值参考：
 - 分支命名：`feat/*` `fix/*` `refactor/*`
 - 合入：`git merge --no-ff`
 - 推送：不自动推送（需确认）
 - spec/plan：`docs/specs/` `docs/plans/`，命名 `YYYY-MM-DD-<feature>.md`
 - 测试目录：`tests/` 或 `__tests__/`
 - 环境/资源/MCP：无则标注"本项目无此项"
