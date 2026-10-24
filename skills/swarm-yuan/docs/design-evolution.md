# 设计演化史（施工档案——过程记录，非定稿）

> **物化注记（2026-09-01 终态重构）**：本文件收纳设计演化过程的原始记录——决策史全文与历史档案 A1-A18（历次 WP/批次/轮次施工记录）。
> 它们回答"系统是怎么变成今天这样的"，但**不构成对现状的权威描述**——现状的权威定义在 `swarm-yuan/README.md`（设计内核）。
> 决策要点（各决策确立的现行设计原则）已蒸馏回设计内核对应章节；本卷保留全文供审计与溯源。

---

## §12 决策史（全文）
> 每个决策的完整记录（问题/决策/理由/后果）——查"为什么这么定"。

> **角色标注（2026-08-21）**：本文件是决策史**原文档**（每个决策的完整记录）；本文 §6.1 §9.2（决策史索引）是索引与归纳——查"为什么决定"用 §6.1 索引，查"决策全文"用本文件。


> 活跃决策（决策 18+）。决策 1-17（建议 1-7 + 8 条建议表 + 决策 9-17）已归档至 §13 历史档案 A5 归档卷（原 docs/paradigm-decisions-archive.md；均已落地稳定，纯历史记录；决策 12/13 除外，二者仍是当前行为权威依据，归档件保留活跃锚点）。
> **口径权威源**：`swarm-yuan/assets/facts.conf`（catchphrase 数字单一事实源，self-check 机器执法）。

> **决策 13 指针锚点**（活跃决策）：决策 13（断点续传否决令废止→draft 状态门，2026-07-21 WP-H）是当前 draft/active 状态门行为的权威依据，已随决策 1-17 归档至 §13 历史档案 A5 归档卷决策 13 段。外部引用（state-machine.sh 等）指回该归档卷。

#### 决策 18：自适应轻重 + 质量优先偏置 + 授权无关化（2026-07-21 用户方针）

**用户方针**：①swarm-yuan 应为不同项目及任务自适应轻重，避免过轻或过重；②优先保障开发交付质量而非效率；③不考虑开源组件商业授权，不据此调整功能优先级。

**决策**：
1. **项目级自适应**：`generate-skill.sh --profile` 默认值 standard → `auto`（合规关键词 → compliance；文件数 <80 → lite；其余 standard）。偏置方向**只升不降**：探测失败/边界不确定一律按更重档处理，auto 打印判定依据供用户评估，显式 `--profile` 始终优先。
2. **任务级自适应**：spec 三级映射门禁集——简单 → `--all`；标准 → `--all-full`；完整（架构/跨服务/公共接口/数据模型/权限）→ `--all-full` + `--shift-left`，compliance 档项目追加 `--compliance-suite`。规模判断不确定按更大规模处理；compliance 档无"简单任务"豁免。
3. **授权无关化**：撤销 GitNexus 许可证驱动的降级（原"PolyForm 禁商用 → 非默认"），GitNexus/graphify 按技术能力平权选型（深度调用图 vs 广谱知识图，可并用）；self-check 移除许可证忠告。授权合规评估属使用方组织责任，许可证信息仅作事实登记保留（code-graph-tools.md 表）。upstream-vendor 决策的其余理由（体积/维护面/版本追踪）仍然有效，仅撤销授权条款作为决策因子。
4. **质量 > 效率**落实点：auto 阈值偏置（<80 才 lite）、任务门禁映射的强制升级条款（公共接口/数据模型/权限改动无"简单"档）、draft 状态门（半成品无法伪装交付）——效率类优化（trace 降级/Windows CI 降频）不触碰任何质量判定逻辑。

**与减重批（决策 12-14）的关系**：减重不是"做轻"而是"恰当的重量"——三档 profile 让重量显式可选，auto 让选择自动化且偏向重的一侧。

---

#### 决策 19：catchphrase 单一事实源 facts.conf（2026-07-21 减重 WP-P1）

**问题**：36 门禁/27+9、179 变量、16 特征卡、11 运行时、32 领域、13 步流程 等口径在 8+ 文件手抄，`self-check.sh check_doc_consistency` 用 6 类正则扫描 5 份文档兜底——手动同步已不可靠，`docs/PROMO.md:215` 曾长期残留"11 步"旧口径（决策 17 已修，但同类漂移会复发）。

**决策**：
1. 新增 `swarm-yuan/assets/facts.conf`（bash 可 source 的 KEY=value），穷举所有 catchphrase 数字的权威值（FACT_GATES_TOTAL=36 / FACT_GATES_CORE=10 / FACT_GATES_ARCH=17 / FACT_GATES_COMPLIANCE=9 / FACT_GATES_STANDARD=27 / FACT_CONF_VARS=179 / FACT_FEATURE_CARDS=16 / FACT_RUNTIMES=11 / FACT_DOMAINS=32 / FACT_FLOW_STEPS=13 / FACT_FRAMEWORKS=61 / FACT_REFERENCES=18 等）
2. `self-check.sh check_doc_consistency` 开头 `source facts.conf`，先用代码真值对账 facts.conf 自身（GATES_TOTAL/CORE/ARCH/COMPLIANCE/CONF_VARS/FRAMEWORKS/REFERENCES 七项），漂移即 FAIL；再用 `${FACT_*}` 值扫描散文文档（原有 6 类正则降级为"叙事漂移检测"，逻辑不变）
3. 8 份文档（README/SKILL/USAGE/PROMO/template-spec/standards-compliance/CLAUDE/paradigm-decisions）头部加 `> 口径权威源：assets/facts.conf` 引用行，指向单一事实源
4. 修 `PROMO.md:215` 残留"11 步"→"13 步"

**理由**：catchphrase 手抄导致数字漂移是范式"过重"观感的一部分——文档与代码脱节会让外部观察者误以为"全是空壳"。单一事实源把"改一处→全局同步"自动化，self-check 机器执法先对账 facts.conf 自身（防 facts.conf 漂移），再扫描文档（防文档漂移），双向兜底。

**边界**：文档头部引用行不替换正文数字（保留可读性），仅声明权威源；facts.conf 只声明"会变的数字"（门禁数/变量数/框架数等），不声明"稳定的架构"（六段式/五层认知基底等）；facts.conf 自身漂移由 self-check 机器执法（改门禁数必须同步改 facts.conf，否则 FAIL）。

---

#### 决策 20：任务类型维度实装（2026-07-21 减重 WP-P4）

**问题**：`template-spec.md:32-33`「快速入口（按任务类型）」是空占位表——只有"（任务类型 → 起始节点 → 关键参考 的表）"一行，无实际映射。分支命名有 feat/fix/refactor 但无对应门禁集差异化。spec 三级（简单/标准/完整）按变更规模分级，与任务类型正交——一个 fix 可能是"完整"级（跨服务 fix），一个 feature 可能是"简单"级（加字段）。

**决策**：
1. 新增 `swarm-yuan/assets/task-type-gates.conf`（bash 可 source），7 类任务映射（对齐用户级 AGENTS.md 分支命名）：
   - feature → `--all-full`（无豁免）
   - fix → `--all --reuse`（§14-§18 认知段可免）
   - refactor → `--all-full --reuse --stable-diff`（§14-§18 可免）
   - chore → `--all`（spec 全段可免）
   - docs → `--docs-pack`（其他门禁免）
   - test → `--all --shift-left`（§14-§18 可免；§19 必填）
   - exp → `--all`（合入前须转 feature/fix）
2. `template-spec.md` L32-33 填实任务类型映射表 + 引用 task-type-gates.conf
3. `generate-skill.sh` 生成的 `commands/spec.md` 指引改为"先判任务类型后判规模，两者取并集（更重档）"
4. `self-check.sh` 加 task-type-gates.conf 一致性断言（7 类必须齐全）

**与 spec 规模维度的关系（正交，取并集）**：
- 任务类型决定门禁子集（哪些门禁跑/豁免）
- spec 规模决定档位（--all/--all-full/--all-full+--shift-left）
- 两者取并集（更重档，质量优先，决策 18）

**边界**：
- compliance 档项目无"简单任务"豁免（决策 18）
- 公共接口/数据模型/权限改动无"简单"档（强制 ≥ --all-full）
- exp 任务合入前须转 feature/fix 正式流程（不阻塞合入是探查期特权，非交付特权）

---

#### 决策 21：WP-P5 enforce_level 随 profile 调整——延后到 WP-Q1 合入后（2026-07-21）

**问题**：WP-P5 计划让 enforce_level（strict/warn/advisory）随 profile 调整——lite 档降一档（strict→warn，保护核心 strict 不降）、compliance 档升一档（advisory→warn，纯观测类保留 advisory）。

**事实核查**：enforce_level 机制（`gen-enforce-level.sh` + `gate-enforce-level.conf` + `_enforce_of`）目前仅在 `wp-q1-gate-stratification` 分支，**未合入 origin/main**。WP-P5 的实现依赖该机制存在。

**决策**：WP-P5 延后——不在本 worktree 实施 enforce_level 随 profile 调整，等 WP-Q1 合入 main 后作为独立 WP 处理。本 worktree 的自适应减重聚焦：
- 项目级（profile auto + 动态升档 WP-P6 + 技术栈反作用 WP-P9）
- 任务级（任务类型 WP-P4 + spec 三级机器执法 WP-P7）
- 阶段级（per-phase profile WP-P8）
- 结构性（catchphrase 单一事实源 WP-P1 + 冗余合并 WP-P2 + arch.conf 懒生成 WP-P3）

enforce_level 随 profile 调整是"门禁内部分级随项目档变化"的维度，与上述"项目/任务/阶段"三级自适应正交，且依赖未合入的 WP-Q1 基础设施，故延后。

**边界**：本决策不否定 WP-P5 的价值，仅记录依赖约束与延后理由。WP-Q1 合入后应优先补做。

---

#### 决策 22：profile 动态升档——detect-profile-drift 只升不降（2026-07-21 减重 WP-P6）

**问题**：profile 在 `generate-skill.sh` create/upgrade 时写入 frontmatter 后固化；项目演进（<80 文件长到 >80，或新接入合规要求）不会自动升档，需手动 `--upgrade --profile`。固定 profile 与项目实际状态脱节是范式"不自适应"的典型表现。

**决策**：
1. 新增 `swarm-yuan/scripts/detect-profile-drift.sh`：重跑 `auto_detect_profile` 逻辑对比 frontmatter profile，漂移则输出建议
2. 偏置规则（质量优先，只升不降）：
   - 合规信号新增（docs/README 出现等保/密评/个保法/金融/医疗关键词）→ 强制提示升 compliance
   - 规模信号升档（文件数从 <80 涨到 ≥80）→ 提示升 standard
   - 规模信号降档（文件数从 ≥80 降到 <80）→ **不提示降 lite**（只升不降）
   - 探测失败/边界不确定 → 不提示（保守不误报）
3. 触发点：
   - precheck.sh `--all`/`--all-full` 启动时调用（轻量，stderr 输出，不阻塞主流程）
   - self-check.sh `check_profile_drift` 子检查（warn 不 fail）

**理由**：profile 固化是范式"生成时一次定死"的局限。动态升档让范式持续感知项目演进——文件数增长或新增合规要求时主动提示升级。只升不降是质量优先偏置的延续（决策 18）：降档可能放过原本被门禁覆盖的风险，升档只是增加保护。

**边界**：
- 漂移检测是 warn 不 fail（不阻塞 precheck 主流程；仅提示用户评估）
- 不自动执行升级（升级是用户决策，detect 只给建议命令）
- 合规信号优先于规模信号（合规最强，与 auto_detect_profile 一致）
- 降档不提示（避免项目临时减文件后误降档）

---

#### 决策 23：spec 三级机器执法——detect-spec-scale 从 spec 推断规模（2026-07-21 减重 WP-P7）

**问题**：spec 三级（简单/标准/完整）由 AI 按 `commands/spec.md` 文本指引判定，无脚本执法——一旦判"简单"选 `--all`，中途规模变化（如编码期发现实际跨模块）不会自动升档到 `--all-full + --shift-left`。文本指引依赖 AI 自觉，无机器兜底。

**决策**：
1. 新增 `swarm-yuan/scripts/detect-spec-scale.sh`：解析 spec.md 结构化字段，推断规模等级（简单/标准/完整）
2. 推断规则（质量优先，不确定升档）：
   - 侵入点 ≤3 文件（反引号路径计数）且 无风险信号 → 简单
   - 侵入点 4-10 文件 或 含任一风险信号 → 标准
   - 侵入点 >10 文件 或 含 ≥2 风险信号 或 架构变更 → 完整
   - 风险信号：跨服务 / 公共接口 / 数据模型 / 权限 / 架构变更 / 新上下文
3. precheck.sh `--all`/`--all-full` 启动时：若 SPEC_FILE 存在，跑 detect-spec-scale，当前 MODE < 推断等级 → warn 提示升档（只升不降）
4. commands/spec.md 指引改为"填完 spec 跑 detect-spec-scale 确认规模"

**与 WP-P4 任务类型正交**：任务类型决定门禁子集（哪些门禁跑/豁免），spec 规模决定档位（--all/--all-full/--all-full+--shift-left），两者取并集（更重档，决策 18）。

**边界**：
- 规模检测是 warn 不 fail（不阻塞 precheck 主流程）
- 只升不降（spec 判"完整"但跑 `--all` → warn 提示升；spec 判"简单"但跑 `--all-full` → 不提示降）
- 无法解析侵入点保守按标准（不降简单）
- 架构变更信号强制完整档（最高优先级）

---

#### 决策 24：技术栈复杂度反作用 profile——形态/框架/微服务信号升档（2026-07-21 减重 WP-P9）

**问题**：C+.0 形态判定 + C+.0.5 框架探查只影响枚举维度和 ACTIVE_FRAMEWORKS，不影响 profile 档——纯前端小项目 <80 文件判 lite，Spring 全栈大项目 >80 文件判 standard，但形态差异不进入 profile 判定。技术栈复杂度是项目"重量"的真实信号，仅按文件数判定会漏掉"小而复杂"的项目（如 50 文件的微服务多形态项目）。

**决策**：
1. `auto_detect_profile` 追加技术栈复杂度信号（在合规/规模信号之后，优先级：合规 > 技术栈复杂度 > 规模）：
   - **形态信号**：同时含 ≥3 种形态（前端 .vue/.jsx/.tsx + 后端 .py/.java/.go/.rb/.php/.kt + 异步 consumer/listener/subscriber + 微服务 services/多服务 + 桌面 electron/tauri/android/ios）→ 升 standard
   - **框架信号**：依赖文件中框架数 ≥20（package.json dependencies + pom.xml artifactId + go.mod require 粗计）→ 升 standard
   - **微服务信号**：services/ 目录存在且含 ≥2 子目录 → 升 standard
2. 偏置：技术栈复杂度信号触发时**只升不降**（与决策 18 一致）
3. auto 判定输出 reason 含技术栈信号详情（供用户评估）

**理由**：文件数是项目"体积"信号，技术栈复杂度是项目"结构"信号——两者正交。一个 50 文件的微服务多形态项目，其认知负担和门禁需求远高于 100 文件的单体前端项目。技术栈复杂度反作用 profile 让自适应从"单维（规模）"升级为"双维（规模+结构）"，更贴合项目实际重量。

**边界**：
- 技术栈复杂度信号只升不降（不因形态少而降档）
- 形态判定是粗粒度（按文件扩展名 + 目录结构），不替代 §C+.0 的精细形态判定（后者影响枚举维度）
- 框架数粗计（依赖文件行数），不替代 §C+.0.5 的框架探查（后者激活规则集）

---

#### 决策 25：范式定位声明——适用/不适用场景显式化（2026-07-21 减重 WP-P10）

**问题**：无"适用规模门槛"声明，"过重"被外部观察者视为缺陷而非显式适用域。范式定位不清晰导致：(1) 小项目用户套范式后抱怨"太重"；(2) 大项目用户不知道范式能帮他们减负。

**决策**：
1. 新增 `docs/paradigm-positioning.md`（该文件后随单一文档整合删除，内容现 §6.1 §1）：显式声明适用/不适用场景 + 轻量替代方案 + "过重"的诚实评估
2. README.md 加"适用场景"章节（链接定位文档）
3. SKILL.md 加"不适用场景"段（扩展既有"不适用"一句话）
4. CLAUDE.md 加范式定位段

**适用场景**：团队协作（≥2 人）、中大型项目（≥80 文件或 ≥3 形态）、强监管交付（合规要求）、长期维护项目（需沉淀记忆）、多技术栈混合项目（微服务/全栈）。

**不适用场景**：个人脚本/一次性原型、学习用 demo、极小改动（改 typo/调样式）、无 AI 辅助的纯人工开发。

**轻量替代**：
- 范式内：`--profile lite`（只建三目录 + 核心门禁最小集）
- 范式外：单文件 `precheck.sh` 做门禁不套生成器；传统 lint/test 工具链；AI 原生开发

**定位声明**："swarm-yuan 是重量级范式，重量是设计选择不是缺陷——通过 profile 自适应让重量显式可选。"

**理由**：范式定位显式化是"诚实化"的延续——不假装适合所有项目，明确告诉用户何时该用、何时不该用。这既是对用户的尊重（避免小项目用户踩坑），也是对范式价值的保护（避免在不适用场景被误判为"无用"）。

#### 决策 30：auto_detect_profile 偏置方向修正——只升不降→信号明确才升（2026-07-21 WP-Q2）

**背景**：决策 18 的"只升不降"让 lite 档几乎不被自动选中——auto 实际输出被压缩到 standard/compliance 二选一。一个 79 文件的小项目若没有合规关键词但 find 探测稍有不稳（SIGPIPE/head 截断）就走 standard。这与"自适应避免过重"的目标直接矛盾：把自适应退化成"自动选重档"。

**决策**：修正偏置方向，从"不确定即升档"改为"信号明确才升档，模糊走默认 standard"：
1. **明确升档**（不变）：合规关键词命中 → compliance；形态 ≥3 / 框架 ≥20 / 微服务 / monorepo → standard
2. **明确降档**：文件数 <80 且无合规关键词且非 monorepo 且依赖数 <20 → lite（WP-Q2 新增：允许降 lite）
3. **模糊走默认**：find 探测失败、依赖数不可读、边界不确定 → standard（不升不降，非"一律升"）
4. **质量优先的正确落实**：在该 fail 的地方严格 fail（strict 门禁真 fail），不在档位选择上"宁可偏重"——一个 79 文件小项目该跑 lite 就跑 lite，但 lite 档的 strict 门禁必须真 fail，不是 warn。既轻又硬，而非"lite 档藏重量"。

**与决策 18 的关系**：决策 18 的"只升不降"是当时的保守选择（advisory 门禁尚未分层，降 lite 怕放过风险）。决策 31（门禁分层）已让 advisory 显式化（6 个永不 fail），lite 档跑 strict 子集即可保证硬门禁不丢——此时"只升不降"的保守前提不再成立，修正为"明确才升"是顺势而为。

**与决策 22（detect-profile-drift）的关系**：决策 22 的"只升不降"指运行时漂移检测（项目从 lite 演进到 standard 时提示升级，不提示降级）——这是单向演进假设，仍然保留。本决策 30 修正的是生成时 auto 判定的偏置，两者作用域不同：生成时允许降 lite（信号明确），运行时漂移只升不降（演进假设）。

#### 决策 31：门禁分层 enforce_level（strict/warn/advisory）—— 2026-07-21 WP-Q1

**背景**：分析发现 precheck.sh 36 门禁中 `fail()` 调用仅 2 次（非门禁函数体内的 `fail()`），其余 34 个靠 echo/pass/warn 走流程——"门禁是执法"宣称与实际行为有系统性落差。check_cognition 275 行函数 fail=0（决策 12 已诚实化为 warn-only），但仍在 36 这个数字里被宣称"门禁"。

**决策**：引入 `enforce_level` 横切分层维度，与 core/standard/compliance 正交（一个门禁同时属于 core + strict，或 standard + advisory）：
- **strict（12 个，≥3 fail）**：真 fail 阻断交付——branch/layer/reuse/security/shift-left/compliance/sbom/privacy/authz/requirements/rtm/release-sign
- **warn（18 个，1-2 fail）**：能 fail 但触发窄，混合 warn
- **advisory（6 个，0 fail）**：永不 fail，只 warn/pass（观测/认知类）——cognition/consistency/consistency-cross/link-depth/state/mermaid

**机器化**：
1. `scripts/gen-enforce-level.sh` 扫 precheck.sh 每个 check_* 函数的 fail() 调用数，按 ≥3/1-2/0 自动归类，生成 `assets/gate-enforce-level.conf`（幂等可重跑）
2. `precheck.sh` `_enforce_of()` 读 conf（bash 3.2 兼容：换行分隔字符串 + awk 查表，不用 declare -A）；`_ENFORCE_OVERRIDE_K/V` 数组支持手动覆盖（如 check_review 从 warn 升 strict）
3. `_gate_exec()` 内 advisory 路径：子 shell 内重定义 `fail()`/`warn()`/`pass()` 为纯 echo，advisory 门禁的 fail/warn 调用变成纯输出行，永不进 FAIL_COUNT/WARN_COUNT——"advisory 是观测类，不阻断交付"语义机器化
4. `--list-gates` 子命令：输出 flag/gate_fn/enforce/tier 四列（横切维度可视化）
5. `self-check.sh` 加两断言：①gate-enforce-level.conf 与 precheck.sh fail() 数一致（防漂移）②strict 门禁必含 ≥1 fail()（防 strict 声明空壳）+ advisory 必须是 0 fail（防分类矛盾）

**理由**：
1. 诚实化——advisory 6 个门禁明确"永不 fail"，不再混在 36 里让读者以为都是硬门禁；strict 12 个是真执法，数量清晰
2. 自适应基础——后续 lite 档可只跑 strict 子集（真 fail 的），advisory 在 lite 档降级为跳过，实现"既轻又硬"而非现在的"lite 档藏重量"（不拷架构 17 门禁文件）
3. 自动归类——按 fail() 能力机械分类，不靠人工主观判断；改 fail() 即自动更新 enforce_level；self-check 防漂移
4. 手动覆盖逃生口——_ENFORCE_OVERRIDE 让语义判断优先于机械分类（如 check_review 1 fail 但语义上该 strict）

**与决策 12（check_cognition 诚实化）的关系**：决策 12 把 check_cognition 从"宣称 fail"改成"诚实 warn-only"，本决策把它从"warn-only 但仍算门禁"进一步归类为 advisory——分层更清晰。决策 12 是单门禁诚实化，本决策是全部门禁系统性分层。

**与决策 5（不拆 precheck.sh）的关系**：本决策不拆 precheck.sh（保留单文件 cp 铁律），只在内部加 enforce 机制。后续 Q1.3 拆分 36 门禁为 strict/warn/advisory 三文件是独立决策（install.sh 打包保留单文件 cp）。

#### 决策 26：复杂度负向预算--门禁/变量数冻结上限（2026-07-26 WP-rhetoric-honesty）

**问题**：范式声称帮项目降复杂度，但自身复杂度轨迹是单向膨胀--门禁数 27（初版）-> 52 -> 54（v2026.07.24），conf 变量数持续上升，框架规则 27 -> 74。若无约束，软件熵增将使范式自身复杂度不可控，与"帮项目降复杂度"的定位自相矛盾--范式可信度会被自身的演化曲线证伪。paradigm-positioning.md:8 已把"重量是设计选择不是缺陷"作为定位，但该定位只在"重量有上限"时才成立；无上限的"设计选择"等于无约束的熵增。

**决策**：自 v2026.07.26 起引入"复杂度负向预算"--

1. `facts.conf` 新增 `FACT_GATES_BUDGET=54`（门禁数上限，冻结于当前规模）与 `FACT_CONF_VARS_BUDGET=200`（变量数上限，当前 170 预留 30 增长空间）
2. `self-check.sh` 新增断言：`FACT_GATES_TOTAL > FACT_GATES_BUDGET` 则 **fail**（非 warn）--门禁数超预算是硬契约违反，须阻断合并
3. **新增须等额删除**：每个新 check_* 须在同一 WP 内删除 ≥1 个低价值 check_*（合并/废弃），保持总数 ≤ 预算
4. **例外机制**：合规强制（如新增国标映射需新门禁族）可申请预算上调，须在本决策记录追加"决策 26 修订 N"并说明理由 + 新预算值 + 上调期限
5. 变量数 `FACT_CONF_VARS` 同理受 `FACT_CONF_VARS_BUDGET` 约束，超预算同样 fail

**理由**：
1. 反熵增--软件熵增律表明无约束的复杂度增长不可逆；负向预算是把"减重"从口号变为机器执法（与 self-check 数字漂移检测同源机制）
2. 保护范式可信度--"帮项目降复杂度"的工具若自身复杂度无上限上升，其范式主张被自身演化曲线证伪；预算是"言行一致"的机器保障
3. 强制取舍--新增须等额删除，迫使每个新门禁证明其价值高于被删的旧门禁，避免"只加不减"的渐进式膨胀
4. 例外留逃生口--合规等硬需求可上调预算，但须显式记录理由，避免暗箱膨胀

**与决策 25（范式定位）的关系**：决策 25 把"过重"从缺陷转为"显式可选"的适用域声明；本决策给"显式可选"加了上限--"重量是设计选择"成立的前提是"重量有预算"。无预算的"设计选择"等于无约束膨胀，决策 25 的定位会沦为修辞。本决策是决策 25 的诚实化补丁。

**与 self-check 现有断言的关系**：现有 `check_doc_consistency` 守"数字漂移"（声明 vs 真值）；本决策的预算断言守"数字膨胀"（真值 vs 预算）。前者防"说错"，后者防"长太多"，两者互补。

##### 决策 26.1：等价替换 check_canary → check_loop_oracle（2026-07-27 WP-loop）

**问题**：E1（Oracle Gate 循环）提供了脚本层 `setup-loop.sh` + `loop-hook.sh`，但无门禁化兜底——AI 不主动跑 loop 时，无机械门检查「是否有未完成的 loop」。`check_canary`（advisory 档，0 fail）在生成器自身仓库无实际 canary 环境（无发布产物/无线上指标），形同虚设：未配 `CANARY_LATENCY_MS/CANARY_ERROR_RATE` 时直接 `return 0`，从未 fail。

**决策**：等价替换 `check_canary`（advisory）→ `check_loop_oracle`（strict）——
1. 删除 `gates-advisory.sh` 的 `check_canary()` 函数体（保留占位注释供计数核验）
2. 新增 `gates-strict.sh` 的 `check_loop_oracle()`：3 fail 调用（required/no_history/incomplete）→ strict 档
3. `precheck.sh` `GATE_FLAGS` 替换 `--canary` → `--loop-oracle`
4. `gate-enforce-level.conf` 重生成（gen-enforce-level.sh 幂等）：strict 21→21，advisory 14→14，总数维持 54
5. canary 监控能力保留为 `references/canary-monitoring.md` 文档 + Oracle Gate 循环形式（`setup-loop.sh --verify '<canary 验证命令>'`）
6. `FACT_GATES_ADVISORY_ONLY` 10→9（canary 是 advisory-only 10 之一）

**理由**：
1. **门禁预算守恒**——决策 26 要求新增须等额删除；canary（advisory，从未 fail）→ loop_oracle（strict，3 fail）是"低价值换高价值"的等价替换，总门禁数 54 不变
2. **强制力升级**——canary 是 advisory（0 fail，永不阻塞），loop_oracle 是 strict（3 fail，可阻塞 RC）；从"观测不阻断"升级为"机器执法阻断"
3. **能力保留**——canary 监控未消失，改为 Oracle Gate 循环形式落地（`setup-loop.sh --verify`），比原 advisory 门禁的 warn 强制力更强（promise 被拒则 loop 继续）
4. **填补缺口**——E1 的脚本层 Oracle 只有 AI 主动启动 loop 才生效；`check_loop_oracle` 是门禁级 backstop，`LOOP_ORACLE_REQUIRED=1` 时强制要求走 Oracle 验证

**与 E1（Oracle Gate 循环）的关系**：E1 是脚本层（`setup-loop.sh` + `loop-hook.sh`），本决策是门禁层（`check_loop_oracle`）。两层互补：脚本层管"loop 怎么跑"，门禁层管"loop 是否跑完"。

**Z3 fail-closed**：`LOOP_ORACLE_REQUIRED=1` 时，无 loop 状态文件且无 `LOOP_ORACLE_EXEMPT_REASON` → fail（与 sbom/crypto/dengbao 等 7 项 strict 合规门禁同 fail-closed 语义）。

##### 决策 26.2：预算上调 54→55（check_method_size 入编追认，2026-08-27 R10 回归收口）

**问题**：field-feedback 轮（632feff，2026-08-26）新增 `check_method_size`（方法粒度——单方法行数上限，语言无关启发式）时把 `FACT_GATES_TOTAL` 54→55，但未同步 `FACT_GATES_BUDGET` 也未等额删除——自该日起 self-check 预算断言悬挂 fail（55 > 54）跨五个合并批次至今，违反"新增须等额删除"的硬契约却未被收口，预算机制自身成了带病运行。

**决策**：按决策 26 条款 4 例外机制追认预算上调——
1. `FACT_GATES_BUDGET` 54→55，与新真值对齐（`facts.conf` 同步）
2. 上调性质为**追认既有事实**（门禁已存在且有消费者：`--method-size` flag + `GATE_FLAGS` 注册 + R7 双栈演练真实执行），非为未来新增预留空间
3. 新预算冻结于 55：后续新增门禁仍须等额删除或按条款 4 另行修订，本修订不构成"预算随门禁自动增长"先例

**理由**：
1. **等额删除无候选**：五维整合轮（2026-08-26）后 55 门禁逐项核验均有真实覆盖面（fixture 双态在案 79 组 + gate-fixture 48 组 + cli-ab 逐字节锁行为）；删除任一门禁均为真实覆盖损失，为守数字而删覆盖是本末倒置
2. **check_method_size 属"流程性约束缺失"的根因修复**（field-feedback 六反馈之一）：方法粒度是词法可判定的硬规则面（>60 行 warn），符合决策 27 条款 3 的"③ 概念无法以方法论吸收且不机器执法会致范式失真"——纯文档自觉无法防方法膨胀
3. **悬挂 fail 的制度成本**：预算断言长期带病运行会驯化"self-check RC=1 属正常"的肌肉记忆，掏空 fail-closed 执法可信度——收口比悬挂更符合预算机制的立意

**上调期限**：无期限（冻结于 55）；若后续合规强制需新门禁族，按条款 4 另行修订。

**与 26.1 的区别**：26.1 是等价替换（总数守恒，不动预算）；26.2 是预算上调（总数+1，追认）。两者都是"预算变动须留痕"的不同形态。

#### 决策 27：运行时升级整合纪律--吸收优先于新增门禁（2026-07-26 runtime-update-2026-07）

**问题**：`swarm-yuan/research/` 下 11 个外部运行时仓库需定期对齐上游最新稳定版，以保持深度/CLI/方法论三层接线的有效性。但每次升级挖出的新功能概念（如 gsd-core v1.8.0 的 reversibility tagging、superpowers v6.2.0 的 resume-based fix loop）会自然引诱"新增门禁"的冲动--若每次升级都加门禁，决策 26 的复杂度负向预算会被上游版本节奏绑架（上游发版越快、swarm-yuan 门禁越膨胀）。

**决策**：自 v2026.07.26 起确立"运行时升级整合纪律"--

1. **定期对齐**：`research/` 下 11 个运行时仓库定期对齐上游最新稳定版（非 rc/beta/alpha）；升级留底按 §13 历史档案 A10/A11 系列格式在本文档追加"运行时升级报告"。
2. **吸收优先于新增门禁**：升级挖出的新功能概念，**优先以方法论吸收**（references 文档 / SKILL.md 叙事 / state-machine warn 分支 / trace-log 字段 / 新增 G<N> self-check 断言）落地，**不新增 `check_*` 门禁**（守决策 26 的门禁预算上限；决策 26.2 追认上调后现行值 `FACT_GATES_BUDGET=55`）。
3. **新增门禁的最后手段**：仅当满足以下任一条件才允许新增门禁--① 等额删除旧门禁（守决策 26）；② 合规强制（如新增国标映射需新门禁族，按决策 26 修订流程申请预算上调）；③ 概念无法以方法论吸收且不机器执法会致范式失真。
4. **self-check 断言不受门禁预算约束**：G<N> 断言（如 G10 版本 oracle 单源真值）是 `self-check.sh` 的自检逻辑，不计入 `FACT_GATES_TOTAL`（现行 55 = `precheck.sh` 的 `check_*` 函数数，决策 26.2 后）。新增 G<N> 断言是合规的扩展点。
5. **conf 变量有余量**：`FACT_CONF_VARS_BUDGET=200` vs 当前 170，预留 30 槽位；新增 precheck.conf 变量在预算内。

**理由**：
1. **解耦上游节奏**：把"对齐上游"与"门禁膨胀"解耦--上游发版是外部节奏，门禁数是内部复杂度，后者不应被前者绑架。
2. **方法论吸收的充分性**：多数运行时新概念是"模式指引"（如 reversibility 评级、resume-based fix loop），由 AI 引用执行即可，无需机器执法；硬门禁化是过度工程。
3. **守决策 26 可信度**：决策 26 把"门禁数有上限"作为范式可信度的机器保障；本决策给"升级时如何不破上限"的操作纪律，两者互补。
4. **self-check 断言是轻量扩展点**：G<N> 断言守的是 swarm-yuan 自身的健康（修辞诚实/复杂度预算/版本 oracle 单源），非项目门禁；它不受门禁预算（现行 55）约束，是吸收"运行时新概念催生的自检需求"的合规出口。

**与决策 26 的关系**：决策 26 确立"门禁数有预算上限"；本决策确立"运行时升级时如何守预算"--吸收优先、新增最后。本决策是决策 26 在升级场景的操作化。

**首次应用（2026-07-26）**：本轮升级 6 个运行时（claude-mem/graphify/gsd-core/open-code-review/ruflo/superpowers），挖出 6 项整合吸收（reversibility 评级 / broken-windows ledger / honest-edge provenance / resume-based 修复环 / 可证伪性纪律 / version oracle 单源），全部以方法论吸收 + G10 断言落地，**门禁数保持 54**（G9 通过）。详见 §13 历史档案 A10（原 runtime-update-2026-07）。

---

### 决策 28：标记沿调用链传播（Palantir markings-propagate 映射，R11 调研吸收，2026-07-31）

**问题**：R11 调研（`docs/research/R11-palantir-mapping.md` §4.1）把 Palantir 工程哲学作为外部参照系审视 swarm-yuan 设计盲区，发现首要缺口——稳定单元标注（稳定/不稳定/禁止改，`exploration-guide.md` §11f）是 **file-glob 级静态属性**（`STABLE_GLOBS`），不沿调用链向下传播。`--stable-diff` 门禁只检测"是否直接改了 STABLE_GLOBS 内文件"（`gates-warn.sh` `check_stable_diff` §1-§2），**检测不到"是否改了依赖禁止改单元的下游文件"**。例：

```
UserRepo (禁止改, 在 STABLE_GLOBS) ← UserService (无标注) ← UserController (无标注)
现状：改 UserService 不触发 --stable-diff → 但可能破坏 UserRepo 调用契约
```

这与决策 31（门禁分层）发现"36 门禁仅 2 fail"同性质——"标记是执法"宣称与实际行为有系统性落差。Palantir 的对应机制是 `/docs/foundry/security/overview/` 的 "Mandatory controls propagate along lineage"：标记是数据本身的属性，沿计算传播；新建看板不会"忘记"加安全，因为看板读的对象自带标记。

**决策**：扩展 `--stable-diff` 语义加传播段（下游改动只 **warn** 不 **fail**，保持 enforce_level 归类不变），**不新增 `check_*` 门禁**（守决策 26：门禁预算 54 不变）——

1. **`assets/precheck.arch.conf`** +`STABLE_PROPAGATE=1`/`STABLE_PROPAGATE_HOPS=1`（开关+跳数，默认开启 1 跳）
2. **`assets/precheck.sh` `_default_conf`** 兜底补同名变量（防 set -u 崩 + 目标技能 conf 缺时降级）
3. **`assets/gates-warn.sh` `check_stable_diff` §3 传播段**：本次变更触及"调用 STABLE_GLOBS 文件的下游文件"时 warn "依赖禁止改单元 X，改动可能破坏其契约，须在 spec §MODIFIED 声明"。下游影响域来源优先从 `reference-manual.md §5` 的机器可读标记 `<!-- stable-propagate: <stable> → <downstream> -->` 提取，降级为 grep import 反查（best-effort）
4. **`references/exploration-guide.md` §11g** 新增"下游影响域"段（特征卡第 11 项 P0 子项）：每个"禁止改层"稳定单元须记录 1 跳下游影响域（用 graphify path / gitnexus trace 提取），作为传播 warn 的数据源
5. **`scripts/self-check.sh` G16 断言**（不计入 FACT_GATES_TOTAL=54，守决策 27 第 4 条）：守 absorb 四载体一致性（arch.conf 开关 + exploration-guide 填充指引 + facts.conf 口径 + gates-warn.sh 传播段），缺失才 fail，叙事漂移只 warn
6. **`assets/facts.conf`** +`FACT_STABLE_PROPAGATE=1`/`FACT_STABLE_PROPAGATE_HOPS=1`（口径同步）+ `FACT_CONF_VARS` 169→171 / `FACT_CONF_VARS_ARCH` 109→111（机械计数真值）

**预算核算**：

| 项 | 变更前 | 变更后 | 预算 | 余量 |
|----|--------|--------|------|------|
| FACT_GATES_TOTAL | 54 | 54（扩展现有 `check_stable_diff` 语义，不加 `check_*`） | 54 | 0 |
| FACT_CONF_VARS | 169 | 171（+STABLE_PROPAGATE/STABLE_PROPAGATE_HOPS） | 200 | 29 |
| G<N> 断言 | G15 | G16（不计入 54） | — | — |

✅ 全部合规决策 26（门禁预算）+ 决策 27（吸收优先于新增门禁）。

**理由**：
1. **诚实化**——`--stable-diff` 宣称"防范破坏 Repository 接口"，现状只防"直接改 Repository"，防不了"改 Service 间接破坏 Repository 契约"；传播段把后者纳入 warn，消除"宣称 vs 实际行为"的落差（与决策 31 同性质诚实化）
2. **warn 不 fail**——下游改动是"风险提示"（warn 级），直接改稳定单元才是"硬执法"（strict 级，§2 的 fail 不变）；warn 不增 fail 计数 → 不改变 `--stable-diff` 的 enforce_level 归类（保持原档），与决策 31"advisory/warn/strict 横切分层"一致
3. **方法论吸收**——Palantir "markings propagate along lineage" 不硬搬为 `check_marking_propagation` 新门禁，而是扩展现有 `--stable-diff` 的语义 + 特征卡填充指引 + G16 断言三载体吸收，守决策 26/27
4. **1 跳邻域防爆炸**——默认 `STABLE_PROPAGATE_HOPS=1`（仅 1 跳下游），避免大型项目（如 yudao-cloud 5564 java 文件，R9 样本）图遍历爆炸；2+ 跳列为 R12 待测项（R11 §8）

**与决策 31（门禁分层）的关系**：决策 31 把 54 门禁按 fail 能力分 strict/warn/advisory 三档；本决策扩展 `--stable-diff`（warn 档）的语义，不改变其 enforce_level 归类（下游 warn 不增 fail 计数）。两者正交：决策 31 是"按 fail 数分层"，本决策是"按传播深度分层 warn"。

**与决策 27（吸收优先于新增门禁）的关系**：本决策是 R11 调研（外部参照系）催生的改进，Palantir "markings propagate" 概念以方法论吸收（门禁语义扩展 + 填充指引 + G16 断言三载体）落地，**0 新 `check_*` 门禁**——验证决策 27 纪律不仅适用于"上游运行时升级"，也适用于"外部理念调研"场景。

**可信度声明**：Palantir "markings propagate along lineage" 一手来源 `/docs/foundry/security/overview/`（高可信，R11 §0.3）。swarm-yuan 的"file-glob 级不传播"现状是 2026-07-31 工作树实测（`gates-warn.sh:254-336` + `precheck.arch.conf:9`）。

---

### 决策 29：语义/动能二分显式命名 + 动作授权锚定组件标记 + FDE 反向传播形式化（Palantir ontology/FDE 映射，R11 调研吸收，2026-07-31）

**问题**：R11 调研（§4.2/§4.3/§4.4）发现三个次要缺口：
- **§4.2 语义/动能二分未显式命名**：swarm-yuan 的"特征卡（语义）+ 门禁（动能）"二分与 Palantir "semantic/kinetic primitives"二分**结构性同构**，但只用"立法/执法/司法"三权隐喻命名，未显式命名语义/动能分层——导致"组件清单（语义）"与"门禁规则（动能）"的耦合关系（门禁依据来自特征卡，`README.md:107` 立法→执法映射表）不清晰。
- **§4.3 动作授权未锚定组件标记**：动作授权（决策三级分类 + 四权分离）是"资产路径驱动"（改 precheck.conf/facts.conf 要 policy-guardian，改普通源码不要），**不取决于组件的稳定性标注或上游依赖**——存在治理盲区（改依赖禁止改单元的下游文件既不触发 `--stable-diff`，也不触发 UserChallenge）。
- **§4.4 FDE 反向传播通道未形式化**：forward deploy 强（每项目生成专属技能 + memory-writeback 三路写回），backprop 弱/手工（R1-R9 调研 + WP-* 批次都是人工捕获）；R9 已暴露"5 项目清一色 Java/JS Web"样本偏倚，反向传播弱会加剧偏倚。

**决策**（纯文档变更，0 新门禁，0 新变量）：

1. **`references/cognition-framework.md` 新增 §7** "语义层/动能层二分（Palantir 本体论映射）"：
   - 语义层 = 特征卡 17 项 + 详尽组件库清单（§C+.1）+ 调用链路（§C+.2）+ 编排约束（§C+.3）
   - 动能层 = 54 门禁（check_*）+ 决策治理三级分类 + 四权分离 agent 拓扑 + 状态机
   - 继承关系：动能层规则继承自语义层（门禁依据来自特征卡，`README.md:107` 立法→执法映射表）
   - 与立法/执法/司法三权隐喻的关系：正交（三权描述权力分立，语义/动能描述结构分层）
2. **`references/decision-governance.md` §2.2 升级规则补一条**"组件标记驱动升级"：
   - AI 记录决策时，若拟改文件在某个"禁止改"稳定单元的下游影响域（决策 28 的 1 跳邻域），自动评 `costly` 可逆性（§2.4 已有 costly 评级，此处补"何时判 costly"的规则）
   - `cost_if_wrong` 字段须反映"可能破坏上游稳定单元契约"
   - 这不改变三级分类（Mechanical/Taste/UserChallenge），只在 `reversibility` 横切属性上体现
3. **`references/fde-backprop.md` 新建**（方法论引用层，非门禁）：定义"反向传播纪律"——每 N 个 forward deploy 后（N 可配，建议 5），跑 `scripts/cost-report.sh` 聚合 N 个项目的 `decisions.jsonl`/`trace.jsonl`，提取高频 UserChallenge 模式与高频门禁 fail 模式，作为 WP-* 批次的输入（人工审阅后落地，非自动改核心模板——守"AI 主导+用户决策"原则）。借鉴 Palantir FDE = "human equivalent of backpropagation"。
4. **`swarm-yuan/SKILL.md`** "它整合的方法论"表方法论引用层补一行：FDE-backprop（本仓库自创，借鉴 Palantir FDE=human backpropagation）

**预算核算**：0 新门禁，0 新变量，1 新 references 文件（`fde-backprop.md`，FACT_REFERENCES 34→35，references 不受决策 26 门禁预算管）。

**理由**：
1. **设计清晰度**——语义/动能二分是结构性切分（描述"是什么"vs"能做什么"），与三权隐喻（权力分立）正交；显式命名两层让"组件清单→门禁规则"的继承关系可见，非"立法/执法"单一隐喻所能表达
2. **治理盲区**——决策 28 的传播 warn（§4.1）+ 本决策的动作授权锚定组件标记（§4.3）双通道补"改下游依赖禁止改单元"的治理缺口：门禁层 warn + 决策层 `costly` 评级
3. **FDE 反向传播形式化**——swarm-yuan 的 forward deploy 强（每项目生成专属技能 + memory-writeback 三路写回），backprop 弱/手工（R1-R9 调研 + WP-* 批次都是人工捕获）；R9 已暴露"5 项目清一色 Java/JS Web"样本偏倚，反向传播弱会加剧"核心模板只反映 Java/JS Web 品类"偏倚
4. **纯方法论吸收**——0 新门禁 0 新变量，守决策 26/27；Palantir 本体论/AIP/FDE 概念以 references 文档吸收，不硬搬为机器门禁

**与决策 28 的关系**：决策 28 补"标记沿调用链传播"的门禁层缺口（`--stable-diff` 传播 warn）；本决策补"动作授权锚定组件标记"的决策层缺口（`costly` 评级规则）+ 语义/动能显式命名的设计清晰度缺口 + FDE 反向传播的形式化缺口。两者共同落地 R11 调研的 P1-P3 建议。

**可信度声明**：Palantir 本体论（semantic/kinetic 二分）/ AIP（AI 经本体论行动）/ FDE = human backpropagation 均一手来源（`/docs/foundry/ontology/overview/` + `/docs/foundry/aip/overview/` + Architecture Center，高可信，R11 §0.3/§1.1/§1.5/§1.7）。

---

### 决策 32：上下文窗口自适应压缩——SKILL.md 分层折叠 + frontmatter 精简 + 预算门禁（2026-08-01）

**问题**：`context-surface.sh --gen`（生成期必读三件套：SKILL.md + exploration-guide.md + template-spec.md）当前 170,709 字节，已从 post-opt 基线 156,992 膨胀回涨（+13,717 字节，+8.7%），逼近 pre-opt 基线 193,226。SKILL.md 200 行/37KB 是常驻硬成本，其中约 90 行是"按需展开"段（Step 详解 :90-107、方法论吸收记录 :141-150、reference 清单表 :154-192），但它们常驻 SKILL.md 正文，每次 skill 加载都进上下文。`FACT_CONTEXT_SURFACE_PRE_OPT=193226` 是孤儿事实（self-check 不校验）。

**决策**：三层压缩 + 预算门禁，0 新门禁 0 新 G<N> 断言（预算检查并入现有 G9 `check_complexity_budget()`）——

1. **第一层 SKILL.md 正文分层折叠**（主战场）：
   - Step 1-12 详解（:90-107，~8KB）移到新建 `references/generation-flow.md`，正文只留 ASCII 节点总览流程图 + 4 条铁律摘要 + 指针
   - 方法论吸收记录（Palantir + 运行时升级 6 条，:141-150，~3KB）折叠为 1 句话指针指向 `docs/runtime-update-2026-07.md`（现 §13 历史档案 A10）
   - reference 清单表 33 行（:154-192，~3KB）压缩为 6 行分类索引（探查/填充/认知/方法论/合规/安全）
   - AI 主导 7 条决策分类（:59-66，~2KB）折叠为 1 句话指针指向 `references/decision-governance.md`
   - verifier 定位 + WP-P3 框架台账（:101-103，~1KB）折叠为 1 句话指针
2. **第二层 frontmatter description 精简**：删门禁子分类细节（27 via --all-full: core 10 + architecture 17; compliance 17...）+ shift-left/rtm/release-sign 细节，保留触发词 + 核心能力 + 13/54/5/32 四个主 catchphrase。931B → ~350B（-62%）
3. **第三层 上下文预算门禁**：
   - `facts.conf` +`FACT_CONTEXT_SURFACE_BUDGET=180000`（当前压缩后 ~120000，预留余量）
   - `self-check.sh` `check_complexity_budget()`（G9）追加上下文表面预算 **warn** 断言（跑 `context-surface.sh --gen` 取 TOTAL，超预算只 warn 不 fail，渐进式对齐 MEASURE 模式）
   - CI 已跑 `--check-only`，预算 warn 进 CI 输出防回涨
   - `FACT_CONTEXT_SURFACE_PRE_OPT` 保留为历史基线（不动），新预算是独立键

**预算核算**：

| 项 | 变更前 | 变更后 | 预算 |
|----|--------|--------|------|
| FACT_GATES_TOTAL | 54 | 54（不改门禁） | 54 |
| FACT_CONF_VARS | 171 | 171（FACT_CONTEXT_SURFACE_BUDGET 在 facts.conf 非三件套，不计入） | 200 |
| FACT_REFERENCES | 34 | 35（+generation-flow.md） | — |
| context-surface --gen | 170,709B | ~120,000B（-30%） | 180,000（warn） |
| G<N> 断言 | G16 | G16（并入 G9，不加新） | — |

✅ 合规决策 26/27。

**理由**：
1. **按需展开段常驻是上下文浪费**——Step 详解只在执行到对应 Step 时需要，不该常驻 SKILL.md；references 设计意图本就是按需读取（SKILL.md:154"按需读取"），Step 详解同理
2. **frontmatter 是不可压缩硬成本**——skill 被 skill-finder 匹配时强制进上下文，931B 含门禁子分类细节属过度信息，精简到"被匹配"的最小集
3. **预算门禁防回涨**——post-opt→当前的 +8.7% 回涨无人守；warn 断言让回涨可见，CI 输出形成软约束
4. **0 新门禁 0 新断言**——预算检查复用 G9 `check_complexity_budget()`，不加新 `check_*`/G<N>（守决策 26/27）

**与决策 26（复杂度负向预算）的关系**：决策 26 守"门禁数/conf 变量数"预算；本决策补"上下文表面字节"预算——三者同源（负向预算防膨胀），但维度不同（数量 vs 字节）。字节预算 warn-only（渐进式），数量预算 fail（已达标）。

**与 generate-skill.sh 目标技能 SKILL.md 的关系**：目标技能侧已实现按 profile 档过滤 SKILL.md 索引表（`generate-skill.sh _fg_emit_skill_md`（R128 拆分后函数名锚，不随行号漂移） WP-P5），本决策给 swarm-yuan 自身 SKILL.md 加同层级的"按需折叠"——生成器自身先做到精简，生成的目标技能才能继承精简模式。


### 决策 33：范式作为条件而非内容——去抽象化重构与落地优先原则（2026-08-21，R13）

**决定**：swarm-yuan 从"内容驱动"重构为**两体系统（厚生成器 + 薄生成物）**，全部机制按"条件 vs 内容"判别式归位；总原则确立 **落地优先于删除**。

**背景**：R13 根本性复盘（zcode 会话库 32 主会话全量还原五轮"过重"诊断史 + 仓库病理量化 + Codex 源码级对照）确诊：范式被编码为要 AI 阅读、记忆、自觉执行的内容——40+ 概念体系靠机械打分落地（0 fail）、10/54 门禁默认不可触达、7 份行业 profile 无脚本加载、生成物 AI 读代码前先消费 5 万 token。维护者三问纠正：①概念体系不删除、完善落地；②门禁不下调；③industry-profile 必须真实加载。

**判别式**：机制分两类——**条件**（运行时约束行为、零认知占用、糊弄结构上不可能）与**内容**（要 AI 先读先记再自觉、每会话重复付税、糊弄结构上必然）。保护清单全部在条件侧；病灶清单全部在内容侧。补充教义：权限边界 fail-closed；fail-open 只允许在有下层强制兜底处。

**关键落地**（五批次，批次合计净 -653 行，diff 铁律机器验证）：
- 认知框架落地化：check_cognition 机械计分退役 → AI 判断引导 + `.swarm-yuan/notes/` 留痕（概念不删除，落地为"AI 判断的检查单"）
- 十门禁全接线：cert/cwe-audit→compliance 序列、decision/state-phase→full 序列、upstream-baseline→precheck 启动、其余挂宿主 hooks/loop-hook（可达率 54/54，FACT_GATES_TOTAL 保持 54）
- industry-profile 真实加载：`conf-render.sh --industry` 渲染 precheck.industry.conf 挂 source 链
- 模板减负：spec 仪式节折叠按需（9 核心节）/ workflow 10→4 要素 / 核对清单 96→12 / 五维表→两维表
- 门禁条件化：`scripts/gate-rules.sh` 三值求值器（allow/prompt/forbid 取最严）+ `rules.d/*.rules` 规则即数据 + FORBID 消息带替代方案
- 生成器瘦身：SKILL.md 重写为工作指引式（142→93 行/8.7KB，决策号/WP 号退出正文）/ facts 21 记账键退役 / check_doc_consistency 434→70 行（散文数字扫描退役——不手抄即无漂移）/ 税制断言（认知面 ≤256KB）
- 宿主下沉：Codex hooks 渲染（v0.148 exit 2=deny 经 codex-gate-wrapper.sh 协议适配）+ settings 沙箱通配符 deny（**/.env 防重命名绕过）+ failure-detector 叙事剧场退役

**验收（§6 进 self-check 断言）**：固定税 ≤8KB｜概念 ≤12｜可达率 54/54｜认知面 252KB<256KB｜孤儿资产=0（G18）｜反向引用=0（G19）｜吸收落地率 100%。

**预算变更**：FACT_GATES_TOTAL 54（不下调）/ FACT_ARTIFACT_BYTES_BUDGET=262144（新增）/ FACT_SKILLMD_BYTES_BUDGET=8192（新增）/ FACT_CONF_VARS_USERFACE=20（新增）。

### 决策 34：概念落地问责 + 吸收三问 + 生成物税制（防复胖三制度，2026-08-21，R13）

**决定**：三条防复胖制度成为生成器侧条件（self-check 机器可查），替代决策 26 的纯数量预算（数量预算只防新增，不防概念闲置——闲置才是棘轮失效的根因）。

1. **概念落地问责**：新概念体系进 SKILL.md 或生成物，必须同时给出落地路径（接线/AI 判断引导/路由——三选一，不接受"先放着"）。机器载体：self-check 概念消费路径断言。
2. **吸收三问**：①能否落到运行时条件（门禁/hook/脚本）？②替换既有机制还是叠加？③六个月后谁会引用？——三问不过只留调研报告（docs/research/），不进 references。R4 六段叠加吸收已按此回退（批次 0）。
3. **生成物税制**：进 UNIVERSAL_FILES 的审核问题 = "目标 AI 每会话为它付多少税"；行为参数留在包内不进全局配置（conf user 面收缩，43 glob 已迁 rules.d/framework-globs.rules）。机器载体：`FACT_ARTIFACT_BYTES_BUDGET` / `FACT_SKILLMD_BYTES_BUDGET` / `FACT_CONF_VARS_USERFACE` 三断言键。

**节奏注记**：批次之间至少间隔一个真实使用周期（用当前形态生成真实目标技能验证后再进下一批）——慢本身就是防复胖（07-21 一天 32 commit 曾被点名为"减重密度可疑"）。

**与决策 26 的关系**：决策 26 守"门禁数/conf 变量数"负向预算；本决策补"概念闲置/吸收纪律/生成物税"三个维度——同源（防膨胀）但覆盖存量与过程，不止数量。

**与决策 27 的关系**：决策 27（吸收优先于新增门禁）被三问强化——"吸收"不再自动成立，必须答出落地形态；方法论文档不再是合法归宿，条件是。

---

### 决策 35：创造纪律——未创建且未运行的机制不得声称（2026-08-24，audit-claims-reality 轮）

**决定**：§0.2 冲程一的反推纪律（机制必须答出派生自哪条本体关系）补第二条执法——**创造纪律：声称的机制必须能被创建（可运行）且被运行（CI/断言接线）；只存在于文档的机制不是实体，是传闻**。费曼两条的范式翻译：*What I cannot create, I do not understand*（未创建=不理解）；*Know how to solve every problem that has been solved*（已解未接线=未占有）。

**背景**：audit-claims-reality 轮三路并行审计发现 44 项"声称-现实"裂缝，全部可归约为两类创造缺失——①设计了没实现（precheck 启动接线在 source 前死调用、生成物 hooks 装错目录被 `|| true` 兜底静默失效、G-cognition/SKILLMD 预算空头断言）；②实现了没接线（`_count_advisory_only` 定义后零调用——最能抓漂移的函数自身是死代码、九个孤儿测试写完即脱钩、sarif-fixture 无 runner、Windows .bat 步骤被 `|| echo` 吞成永绿）。修复按 MECE 四类落地（A 功能断裂 11 / B 口径 7 组 / C 执法 7 / D 卫生 7，6 commit，verifier 八票绿）。

**执法载体**（防复发的结构性安排，不是一次性修复）：①facts.conf 每个 catchphrase 数字必须配 self-check 等值断言（子族六键/conf 变量四键模式）——新增数字不配断言即空头执法；②生成物接线由 gen-e2e mounted_in 锚机器守（hooks.json 引用路径实存断言）；③测试写完必须当批接 CI（孤儿测试=知识未占有）；④历史快照文档（decisions/research/verifier runs）旧数字刻意不同步——声称的边界清晰化也是纪律的一部分。

**与决策 34 的关系**：决策 34 的概念落地问责防"概念闲置"（新概念进 SKILL.md 须有落地路径）；本决策防"机制虚报"（既存声称须真被创建并运行）——一个管新增概念的入口，一个管既有声称的真值。

### 决策 36：恰当应用——吸收物处置三态与反权威叙事（2026-09-08，去教条化轮）

**决定**：决策 34 吸收三问的处置端补执行框架。每项吸收物过三问后按三态处置——**用**（有真实消费者：保留并修到名副其实，语义对、消费者接好、有测试）/ **并**（与既有机制重复或归属错位：合并到真正的家，单一事实源）/ **删**（仅限无消费者 + 无独立信息 + 有误导性三者同时成立）。删除是最后手段，不是默认姿态；反对教条主义不是烧书，是把每样东西放到恰当应用的位置上。

**反权威叙事三条**（吸收文案的永久禁令）：①禁止权威框架叙事——不把既有机制按经典术语重命名为"律/原则"，不造"机制↔经典"对照表冒充增量；②"同构印证/方向验证"不得作为吸收依据——外部来源与本仓机制相同只证明"不重造轮子"，吸收的唯一合法依据是"本仓有真实缺陷/需求，该外部机制能填"；③三问③"六个月后谁引用"不接受预期性答案（"AI 会按 X 自查"），必须指认具体消费者（脚本/检查单接线点/流程步骤）。

**本轮执法（案例）**：
- 恒零清单（R17-ops 落地，两轮控制论吸收唯一新增代码）——语义错误：测"零执行"却自称"恒零拦截"，"近 N 次窗口"与 N 无关，恒零集由运行档位结构性决定，无测试无调度；且其声称用途的另一半（连续 skip 沉睡门禁）早由 adaptive-gating 正确覆盖。处置：**用**——修正为名副其实的零拦截清单（窗口内全 pass、零 fail 零 warn = 从未发现问题；warn 档按设计不阻断、全 skip 归 adaptive-gating，均不入列），补 tests/test-gate-trends.sh 钉死四态语义并接 CI。
- 控制论"十律"文档（R17/R18 入网，同日 R19 扩为 four-theories-methodology 四论单载体）——机制全部先于吸收存在、落地桥判据全复用既有断言的问题依旧，但其形态处置归属 R19（用户提供的四论框架文本驱动重构，吸收用户框架与吸收书本权威性质不同）。本轮只做**咬合**：文档 7 处"恒零"表述与修正后的零拦截清单语义同步，消除声称-现实分叉。十律/同构表作为本决策前的存量保留，后续吸收文案按三条禁令执行。
- dsh 文档 §七/§八 版本注记——dsh 发布节奏驱动本仓文档膨胀（每版本数百字"簇 X 补强"归档，多数无落地）。处置：**并**——压缩为版本指针，未被正文覆盖的操作原则（两种格式迁移谱系/删后端三段式）各留一句，细节留 refresh 调研档；一~六章真实映射与 §五触发条件登记制不动。
- upstream-baseline 节奏——自定"破坏性驱动+季度例行"，实际六天三轮 + 同日复核。处置：补执行纪律条款（patch 零增量不登记/同日复核废止/细节留调研档），四段冗长口径注各压为一行。

**追记（同日，用户裁定）**：用户指示"恰当应用、不盲目剪裁"同样适用于存量——豁免收回，对 four-theories-methodology.md 按三态标准手术：机制对照表一/二**删**（纯重命名，三条件全中）；落地桥表**删**（判据全为既有断言复写，唯一独有的操作行"生成核对清单补一行"**并**入五问）；十律编号与权威叙事框架退场，五篇内容按平实小节**用**（闭环兜底/冗余协同/误差不放大/信噪比分级/镇定与稳定域 + 认知方法论五节）；系统论七手段对账表改写为结构七问检查单（对账表→工具，**用**）。文档 197→156 行，四论框架（用户文本）与 R18 一手复核成果（原著引文与案例）保留。

**与决策 34/35 的关系**：决策 34 管吸收入口（三问不过不进 references），本决策管入口之后的处置形态与文案禁令；决策 35 管"机制必须真被创建运行"，本决策的"指认具体消费者"是它在吸收面的推论。历史调研档（docs/research/）作为过程记录不改写——声称的边界清晰（决策 35），教训的留痕也清晰。

---

### 决策 37：R21 核心链条补强——配方层/行为吸收/验证资产化/问题沉淀/关系边集（2026-09-09，复盘改进轮）

**背景**：用户复述核心思路链条（认知结构关系→工程规范→框架×技术栈×业务→组件库→拼装式编排流程→吸收开发者实际习惯→目标技能→验证能力→迭代成长）并要求全面复盘改进、核心思路不变。十环对照复盘结论：①②③④⑨⑩六环已实现有测试背书；真缺口在⑤任务级配方层（拼装停留在约束层，snippets 全占位）、⑥开发者实际行为吸收（只读已写下的规则）、⑩问题驱动沉淀通道（成长只由结构变化触发）；中等级缺口：业务功能清单无显式产物、测试资产无清单维度+TEST_CMD 静默跳过、项目 rules.d 无探查期步骤、①关系无机器可读索引。用户裁定范围=全量三线+①关系索引。

**决定与落地**（四批一收口，v2.10.0）：
- **⑤+③ 配方层**：目标技能新增 `references/recipes.md`（项目特定文件）——§A 业务功能清单（功能→组件→接口→数据→测试编目，"既有业务功能实现"显式化）+ §B 任务配方五要素（触发场景/前置查询/复用件/胶水/门禁与验证）。探查方法论 §C+.6 业务功能盘点/§C+.7 配方提取（三源：既有实现/git 同类任务历史/开发者文档）；verify-completeness 结构执法 + inventory-verify path-check 扩展（配方引用复用件防幻觉）。**本体四问走复用 Map/Component 实体路径**：配方是地图的"装配路线"维度，不新增本体类型；机器锚=path-check 扩展。
- **⑥ 行为吸收**：mine-habits.sh 六维机械统计（提交前缀/分支命名/规模分桶/共变文件对/热点/测试提交占比）→ notes/habits.md 初稿，AI 审读三去向（铁律引用/开发偏好节/注意事项+配方佐证）；dev-guide 固定「开发偏好」节（无来源写"暂无已记录偏好"诚实降级，节存在性执法）。红线：统计事实≠规范。
- **⑨⑩② 验证与成长**：inventory-dimensions +DIM_TESTFILES（测试文件一等清单维度）；check_test 未配置 TEST_CMD 且探到测试文件→显式 warn（消静默跳过，enforce 档不动）；生成的 SKILL.md 自成长段+第⑤环问题沉淀（新问题三选一沉淀：inventory-update/recipes/gate-rules --persist + trace-log 留痕）——成长触发从"结构变化"单通道扩为"结构+问题"双通道；Step 8 增项目 rules.d 探查期生成。
- **① 关系边集**：relations-extract.sh 机械 import 边（TS/JS/Vue 相对解析/py 相对导入/go module 剥离/java 包映射，零外部依赖——madge/graphify 深度层由 AI 按工具矩阵富化，不假装接线未装工具）→ references/relations.jsonl；消费方=--stable-diff 1 跳传播（边集优先于 basename grep 启发式）+ 流B 探查查边集；mark-active 抽样核验断边（advisory）。**本体四问**：边=links.md 既有依赖关系的实例化，新载体非新类型；锚=--verify 抽样。

**发现的缺陷（本轮修复）**：snippets.md/mcp-tools.md 属 UNIVERSAL_FILES 会被 --upgrade 覆盖，但 Step 7 要求 AI 填入项目内容且不在保留清单——升级即丢失填充。修复：USER_FILLABLE_FILES 守卫（已非占位骨架则跳过覆盖），e2e 回归锁。

**刻意不做（登记待办）**：⑩成长效果回归评测（需跨周期数据，与 gate-trends 跨窗效果同批）；④符号级组件索引；测试框架规则集扩容（破坏性变更驱动）。

**SKILL.md 税制执行记录**：配方/偏好/问题沉淀/边集进目标技能均走既有预算通道（recipes/relations 按需读不进每会话税；自成长段新增第⑤环后实测 8154B ≤ 8192B 预算——A 批同步压缩自成长段措辞 8067→7817B 腾位，税不增）。

---

**追记（2026-09-09，同日 quality:full 吸收）**：用户提供 aifc 项目 quality-full.mjs（十步串行质量门禁，fail-fast + 每步耗时留痕）。处置：按决策 36 三态判——其十步与本仓既有门禁（build/test/contract/reuse/consistency/layer/docs-pack/security/deps 九旗）几乎全部重复，重复建 check_* 会撞 55 预算冻结且造第二事实源。落地形态=**用**（不并、不删）：把"十步串行 + fail-fast + 映射既有 flag"沉淀为 workflow.md 节点⑥⑦的质量门禁序列指引 + commands/precheck.md 常用序列建议，生成骨架自动携带；不新增门禁函数。吸收依据是真实缺陷——原节点⑥只列单门禁名，未给"多门禁按什么顺序跑、先跑构建还是安全"的执行面，quality:full 补上了这个排序与 fail-fast 纪律。

### 决策 38：审计收账轮——版本口径机器锚与认知面预算例外登记（2026-09-10，agents-md-audit-round）

**背景**：按用户级 AGENTS.md 对 swarm-yuan 全面排查，得 23 项"声称-现实"裂缝。代码与验证体系全绿（79 fixtures / e2e / gen-e2e 本机实测），裂缝集中在文档层。其中两项需要治理决策而非单纯改字：

**决定一：版本口径三面失同步的根治 = 机器锚**。根 README badge 停在 v2.7.0、SECURITY.md 停在 v2.6.1，而技能 README 已 v2.10.1——四次发版漏改。过程根因：发版 checklist 只写 "Update README badge (if applicable)"，未指明哪份文件。根治不是再改一次字，是把「根 README badge = 技能 README badge = CHANGELOG 首行版本」做成 self-check 文档一致性段的可执行断言（漂移即 warn + FAIL 置位），并同步修 CONTRIBUTING 发版步骤。与 FACT_SCRIPT_LOC 两度未随改随更同族教训：账实对账必须机器执法，靠人记必然漏。

**决定二：认知面预算超标的处置 = 登记例外而非瘦身**。实测 262179B 超 262144B 预算 35B。超额成因核查（git -S 考古）：5170a0a 补随发 standards-map.conf（修复 compliance 核验静默失效）与 rules.d/framework-globs.rules（修复 G21 快照失锚）——两件都是修静默失效的必要税，非内容膨胀。裁定：FACT_ARTIFACT_BYTES_BUDGET 262144→266336（+4KiB ≈ 1.6%，冻结现状 + 显式余量），例外理由留 facts.conf 键注释。边界：不构成先例，下次超标仍须逐例登记（瘦身或例外二选一，禁静默）；R13「成长 = 预算内替换」纪律不变。

**同轮修复清单**（纯文档层，无代码行为变更）：usage-manual 双节号/悬空指针 8 处、三理念 ↔ 四理念叙事分岔合一、数字速览二表收敛（手册 §10 改指 README 附录 A）、CONTRIBUTING 三处陈旧、生成器模板 hermes-agent/ncwk 项目沉积泛化、CLAUDE.md ~68K 行口径更新、capabilities 版本注记头同步。修复面验证 = self-check + e2e + fixtures + gen-e2e 全绿。

**决策索引（R13 后）**：决策 1-17 见 §13 历史档案 A5 归档卷；决策 18-29 见本文前部；决策 30-32 自适应与压缩；决策 33-34 R13 重构与防复胖；决策 35 创造纪律（audit-claims-reality 轮）；决策 36 恰当应用（去教条化轮）；决策 37 R21 核心链条补强（复盘改进轮）；决策 38 审计收账轮（版本口径机器锚 + 认知面预算例外）；决策 39 Harness 实践吸收（证据分级 + 吸收边界 + 四新对象登记）；决策 40 双运行时纳入（存量来源补登记 + 机制级吸收不引依赖）；决策 41 知识生命周期吸收（四段协议显式化 + 过期三态 + 知识粒度裁决）；决策 42 整合轮（吸收层接线台账 + 路由承诺兑现 + 孤儿零容忍机器执法）；决策 43 分派整合轮（反向索引方法论分派表 + 分派零落档可达性执法）；决策 44 随发补缺轮（可达必随发 G25 ⑥ + 节点级方法论引用机器契约 + 变异锁）；决策 45 平实语言轮（黑话首现释义 + 术语词典单一事实源 + 机器锚词与人文叙事分离）。

---

### 决策 39：Harness 实践吸收轮——证据分级口径与吸收边界（2026-09-18，r37-harness-practice-absorption）

**背景**：用户指令深度调研行者明灵《Harness实践：OpenSpec + Superpowers + CodeGraph + Ponytail + Caveman + RTK》上下篇并吸收。文章披露四新上游对象，指针与数字全部经 GitHub API/本仓 comet 克隆源码重核后才登记（文章"Shape→Build→Verify→Archive"相名在 comet 0.4.1 克隆不存在——A 级证实的是非 full 流程 Open 直进 Build 的仪式裁剪；官方评测数字在克隆 README 直查升 B 级）。收口后用户两轮追加指令（"去除脚手架相关内容"、"整合下"），沉淀两条治理原则。

**决定一：吸收证据分级口径 = A/B/C 三级**。A=本机实测（API/源码/命令输出）、B=官方一手（上游 README/release 直查）、C=二手转述（文章/媒体）。媒体报道的仓库指针/版本/性能数字默认 C 级，未经核实不得写入引用基线列。口径固化进 upstream-baseline 头注，调研轮断言全程标注。本轮实践即四仓指针全重核：codegraph 71,356★/MIT、ponytail 141,551★/MIT、caveman 106,373★/混合许可（Proxy=BSL-1.1 零接触）、rtk 80,864★/Apache-2.0。

**决定二：脚手架/装配内容不吸收（用户裁决）**。上游的安装器/骨架装配行为描述（自动写宿主配置、init 接入实录、插件安装行为、生命周期 hooks 安装面罗列）一律不进载体——吸收机制、不吸收装配叙事；机制句保留（"装完≠激活/trusted_hash"、供应链三引擎审查）。已落载体者移除（add2c34），原则入方法论吸收口径。

**同轮能力登记**：①懒生成七层阶梯随发（DietrichGebert/ponytail 蒸馏——⑤编码先查再写决策程序化；懒≠偷工四不砍与门禁下限同向）；②codegraph 进图谱第三选型 + 基线表第 17 行（watch 未接线，升级前提=本机跑通索引+查询；不进 FACT_RUNTIMES 13 计数——选型备选非接线运行时，与 dsh 同处理）；③评测双口径 pass^3（连三绿=稳定收敛）/pass@3（能力上界）+ 裁判运动员四重分离（judge 独立 agent/模型/baseUrl/凭证）——verifier 评测作业口径；④comet 实操层七机制（Native 仪式裁剪/resume-probe 四值/allow_paths/doctor/eval 分离等，克隆 A 级直查）；⑤三漏输出经济学/三种熵/工具面三原则分落各 methodology 载体。认知面预算第七次登记 303104→317440B（实测 313499B，功能性增量逐例登记）。整合轮（8f90e09）补衔接：SKILL.md 追踪表行、generate-skill 节点⑤骨架消费接线、锚点修正、残留口径清理——大吸收轮收口后必跑衔接审计入惯例。

---

### 决策 40：双运行时纳入轮——存量来源补登记与机制级吸收边界（2026-09-23，R45 dual-runtime-absorption）

**背景**：用户指令将 tanweai/pua 与 semantica-agi/semantica 两仓作为基础运行时纳入（后续持续更新），要求源码级调研、能力完善、完整回归、更新设计文档并发版。调研发现一处治理裂缝：pua 是 swarm-yuan 六项机制的既有来源（WP-loop 批：任务路由/四权分离/Oracle Gate/compaction 续传/失败检测/防作弊门，facts.conf 逐条注记），却从未登记进 upstream-baseline——吸收关系成立而供应链登记缺席。

**决定一：存量来源必登记（登记漂移修复 + 防复发原则）**。凡机制被改写吸收的上游，必须同步进 upstream-baseline 登记表（机器锚 baseline_status=），无论其是否为"接线运行时"。理由：登记表是供应链可审计性的单一事实源（ISO/IEC 5230 方向），"吸收了但没登记"意味着依赖关系对审计不可见——与决策 38"账实对账必须机器执法"同族。防复发机制：本决策立后，吸收任何新上游机制时 checklist 增加一步"upstream-baseline 增行"（吸收落点与登记行必须同轮出现）。pua 以 v3.5.1 补登记（synced），机制源定位同 dsh 先例（不进 FACT_RUNTIMES 分层计数）。

**决定二：机制级吸收不引依赖（semantica 裁决）**。semantica v0.7.0 是治理水准很高的企业数据/文档 KG 平台，但 22 个核心直接依赖（grpcio/protobuf/pyarrow/sklearn/scipy）对 skill 型项目不可接受，RepoIngestor 代码分析为正则级（仅 Python/JS-TS，无 AST/调用图）。裁决：**读源码借鉴设计优于引依赖**——只吸收数据模型层小而硬机制（溯源哈希链/冲突解决策略/双时态窗口），每项数百行以内可独立重写。这是 R37"吸收机制不吸收装配叙事"的延伸：机制也不一定以依赖形式吸收，能在本仓以等价实现复刻的机制以本仓实现为准（保留来源锚点与设计出处）。

**同轮能力登记**：①pua v3.5.1 五协议（诊断先行/失败计数语义/信心门控六步/四状态交付/体面退出）落 governance-agents.md §Z；②failure-detector 计数语义精化（grep 无匹配豁免 + 普通成功不清零 + 验证类成功才清零；顺带修复 BASH_COMMAND 撞 shell 内建变量的真实缺陷——赋值被 shell 重置，同签名去重在真实宿主下失效面）；③semantica 溯源哈希链落 trace-log.sh --verify-chain（decisions.jsonl 决策行携带 seq+prev+checksum，篡改/删行/重编号三类破坏机器可检）；④冲突解决策略 + 双时态注记落 exploration-guide（多源矛盾裁决序：可信度加权→最新性→并存标注→人工裁决）。回归：test-failure-detector 扩至 19 态全绿；upstream-baseline 17→19 行。

---

### 决策 41：知识生命周期吸收轮——四段协议显式化与知识粒度裁决（2026-09-24，R49 haibo-knowledge-base）

**背景**：用户指令深度调研京东技术《拆解京东海博 AI-Native 落地保障：海博团队 AI 知识库能力建设》（2026-09-24）并完善 swarm-yuan 能力。文章为组织级 AI 知识库实践（生产/消费/沉淀/防腐全生命周期），OKF 外部锚点经 Google Cloud 官方博客一手核验（B 级；"宽容消费"官方未明示，标注为文章转述），AB 实验数字按 C 级"文章自报"处理。

**决定一：知识生命周期四段协议显式化（补协议不加结构）**。swarm-yuan 总闭环天然覆盖知识生产（流A 探查）/消费（流B ②）/沉淀（memory-writeback+问题沉淀）/防腐（指纹反馈回路），但各段动作协议此前隐性。裁决：新建 knowledge-lifecycle-methodology.md 承载四段协议全景 + 既有落点对账表，净增五机制全部挂到既有环节的协议层（SKILL.md ②读法六步/反馈回路过期三态、template-spec 回归分级、exploration-guide 页面三角+悬置回填）——弧线表不加行、门禁 55 守恒、不新增结构。过期三态（续期/降级标注/归档不删）与 last-good 红线正交：红线防"探查失败污染历史认知"（轮级），三态防"条目级陈旧"（条目级）；归档不是删除，是关闭 recorded time（与双时态注记同构）。

**决定二：知识粒度裁决——单仓研发场景保单文件地图模式，OKF 原子文件树登记为光谱另一端**。上游采纳 OKF（一概念一文件/YAML type/index.md 渐进披露）产千篇级知识库；swarm-yuan 的 reference-manual 是表格化地图模式，其计数核验（inventory-verify 表锚对账）与 last-good 红线两条执法线都建立在表格行上，原子化会拆断执法线。裁决：维持地图模式为默认；仅当项目知识长到"摘要优先失效"（按需读取需翻过多条目）时才按 OKF 粒度拆分，且拆分前提是计数核验与红线两条执法线在原子形态下等价重建。跨仓链路缝合（上游领域知识纵向）暂不吸收——单仓边界，登记为未来方向。

**不吸收清单**（披露）：角色化知识层（测试/产品/运营多角色视图，目标技能为研发单角色）、build-* 技能族装配与文档产量叙事、京东内部栈（JSF/JMQ/京ME）、平台化与"知识找人"展望。方法论源不登记 upstream-baseline（非运行时、非机制改写来源的整仓关系，同方法论文档先例）。

**同轮能力登记**：①knowledge-lifecycle-methodology.md 新档（FACT_REFERENCES 45→46）；②反馈回路过期三态（SKILL.md+README）；③回归范围分级推导协议（必跑/应跑/建议跑四路反查以 relations.jsonl 边集为底座，AI 判断引导不新增 check_*）；④知识读取六步协议（意图→地图→锁定→摘要优先→追链→分组注入）；⑤前端页面知识三角（操作/调用点反推真实入参/权限+微前端通信）；⑥悬置清单回填协议（裁决不定项集中落 notes/，回填转正销项，清单长度=探查完成度指标）。

---

### 决策 42：整合轮——吸收层接线台账与路由承诺兑现（2026-09-24，R50 capability-map）

**背景**：用户裁决"调研吸收了非常多的第三方运行时组件和设计理念，但没有很好地整合起来形成一个整体，优化重构"。诊断三裂缝（全部证据化）：①**路由断层**——46 档 references 档头全部承诺"路由表见 SKILL.md"，但第六层是散文泛列举（"各 *-methodology.md（…等）"），约三分之一档位（claude-code-capabilities/memory-persistence/review-methodology/gsd-patterns/行业八档等）在 SKILL.md 不按名出现，README 也仅提 7 档；②**孤岛**——10 档零同伴引用（ai-process-records/canary-monitoring/crypto-spec/quality-management-standards/four-theories/codex 双档等，逐一核实用途均正当但接线不可见）；③**无台账**——13 运行时（facts.conf 分层计数）/19 行 upstream-baseline（供给侧）/46 references（需求侧）三者零对账，"这个能力从哪来、在哪个节点被消费"只能逐档翻叙事。

**决定一：吸收层接线台账 = capability-map 单一事实源（补协议不加结构）**。新建 references/capability-map.md：五族整合视图（吸收物按总闭环段归位——生成主干/拼装与知识消费/编排与治理/验证与过程资产/安全合规与行业）+ 46 档逐档接线（来源→证据分级→消费节点→触发）+ 19 运行时消费侧映射（接线深度/消费点/降级链）。与既有两表分工：弧线表（SKILL.md 第四层）管核心概念闭环，本表管吸收层档级接线，upstream-baseline 管供应链供给侧——三表各守一面。本表不入 UNIVERSAL_FILES 随发（生成器侧台账，目标技能只收随发子集）。

**决定二：路由承诺机器兑现（G25 双向对账，孤儿零容忍）**。SKILL.md 第六层从散文重写为五族路由表（46 档全部按名出现）；self-check G25 守三面：孤儿零容忍（每实存档必须被 map 收录——吸收必接线）、幽灵零容忍（map 表格首列档名必须实存——台账不登记幽灵，awk 机械解析）、两级互指（SKILL.md 必须引用 map）。此后新增 reference 档不同步接线，self-check 即 warn——"吸收了但没整合"从叙事问题变为可检漂移。零归档裁决：10 篇零同伴档经逐篇核实全部有正当消费点（canary=门禁降档保留/setup-loop 消费、ai-process-records=GB/T 8566 留痕口径等），碎片化根因是台账缺席而非档位冗余，故本轮不合并不归档任何档；未来真冗余将以"消费点相同且内容重叠"形态在台账上现形，届时再裁。

**同轮能力登记**：①capability-map.md 新档（FACT_REFERENCES 46→47）；②SKILL.md 第六层五族路由表；③self-check G25 断言（warn-only 对齐 G13-G17 族，不计入 FACT_GATES_TOTAL=55）；④README 附录 B 吸收行 13 份→47 篇陈旧计数修正 + 附录 D 认知面上限 310KB→320KiB 修正（R37 期第七次登记后的漂移，同族残留）。门禁 55 守恒、UNIVERSAL_FILES 71 不变（map 不随发）、认知面三件套预算不受影响（map 不在三件套内）。

---

### 决策 43：分派整合轮——反向索引闭环与方法论可达性（2026-09-25，R51 dispatch-integration）

**背景**：R50 收口后目标同日复验未过，完成审计重述判据并逐条取证，发现 R50 只闭合了**正向接线**（档→消费节点台账），"整合成一个整体"缺**反向分派面**。实锤：task-methodology-router.md 名实不符——标题自称"任务类型 × 方法论路由表"，实际只路由"节点序列+门禁聚焦"，13 篇 `*-methodology.md` 仅 lazy-generation/togaf 两篇被提及；流B 七类任务（feature/fix/refactor/chore/docs/test/exp，task-type-gates.conf 权威集）无任何方法论档分派——46 档吸收物对执勤任务不可路由。R50 的 capability-map"消费节点"列是断言，消费侧（router/template-spec）并未实际载有接线。

**决定一：反向索引 = 方法论分派表（task-methodology-router §方法论分派表）**。14 任务类型（流B 七类 + 架构/前端/安全/治理机制设计/发布运维/验收交付/记忆沉淀七横切）× 方法论档按消费节点序分派（【必】/【按】分级），13 篇 *-methodology.md 全部可分派到达；生成侧任务叠加注记；其余行为档（gsd-patterns/logic-razor 等）按场景补充到达；安全合规族显式声明不走任务分派（门禁条件加载）——分工边界写死，防两类分派面互相僭越。路由升三维度：节点序列 + 门禁聚焦 + 方法论分派。

**决定二：可达性机器执法（G25 ⑤ 分派零落档）**。`*-methodology.md` 每档 basename 必须出现在分派表（warn-only 对齐 G25 族，不计入 FACT_GATES_TOTAL=55）。吸收层闭环定局：**建档必接线（正向，G25 ①）+ 接线必可达（反向，G25 ⑤）**。template-spec"方法论整合"行以单源指针指向分派表（不复刻清单——合一收敛防两处漂移）。认知面预算第十次逐例登记 327680→336896（实测 332672B 超 4992B，成因=分派表+5136B 功能本体随发执勤侧）；三件套 187886B 余量内不登记。

**同轮过程教训**：worktree 创建前 shell cwd 已被静默重置到 swarm-yuan/ 子目录，`git worktree add` 相对路径建错位置（swarm-yuan/swarm-yuan/.claude/）——多 worktree 操作必须绝对路径复合命令（darwin-zsh-pitfalls 第 N 次实证）；本轮即按此修复重建。

---

### 决策 44：随发补缺轮——可达必随发与节点级引用契约（2026-09-25，R52 node-methodology-refs）

**背景**：R51 收口后完成校验器指出自曝弱覆盖（workflow.md 节点级方法论引用无机器断言）；补强审计中发现更深裂缝（A 级实测）：**分派表随发（UNIVERSAL_FILES）但 13 篇方法论仅 3 篇随发**（cost-estimation/lazy-generation/review-methodology）——目标技能侧 feature 行分派的 knowledge-lifecycle、fix 行的 codex-methodology、验收行的 agent-skills 等 10 档在产物中根本不存在。R51 的"13/13 可分派到达"只在生成器仓成立，目标技能侧分派悬空——"整合成整体"在消费端仍是空心的。

**决定一：可达必随发（G25 ⑥ 随发或声明）+ 12 档随发补缺**。随发判定准则：被流B/执勤任务行引用的档必须随发（UNIVERSAL_FILES 71→83，12 档按流B 消费节点补缺）；纯生成侧任务（治理机制设计/合规审计）引用的档标【生成器侧】（four-theories/dsh-engineering/context-engineering-layering）——分工边界显式声明，目标侧引用即悬空者不得无标。吸收层三向闭环定局：**建档必接线（G25 ①）+ 接线必可达（G25 ⑤）+ 可达必随发（G25 ⑥）**。预算两笔逐例登记：FACT_ARTIFACT_BYTES_BUDGET 336896→483328（第十一次，实测 477979B，12 档 ≈+145KB 功能必要税）；FACT_SKILLMD_BYTES_BUDGET 9216→9728（第三次，按需读取索引表 +12 行）。

**决定二：节点级方法论引用 = 机器契约（⑩ 要素，变异锁守护）**。verify-completeness 双要素契约（⑨ 调用追踪 + ⑩ 方法论引用）逐节点断言，缺则列 file:line 并 exit 1；emit 九节点骨架预填具体档（对偶分派表消费节点序）；正负变异锁测试（test-workflow-methodology-ref：正向过/剥引用拦/剥追踪拦）锁死契约，重构回潮 CI 即红。template-spec 10 字段→11 字段（⑩ 插 ⑨ 后、检查表升 ⑪），"第 ⑨ 要素"既有引用面零涟漪。

**同轮修复与新 checklist 项**：新随发的 cordis/mea-loop 自带「AI 填充指引」章节标题撞零占位符扫描词表（随发即卡 mark-active，gen-e2e 实测）——改名「填充指南」，**随发新档必过占位符四词预扫**（待填充/（待填充）/<占位符>/填充指引）入 checklist；README 预算行三处陈旧数字（R51 漏改 + R33 起漂移）同轮清账——**预算登记 checklist 自本轮起含"README 两处同步"显式步骤**（同族残留第三次，升级防复发）。

---

### 决策 45：平实语言轮——黑话首现释义与机器锚词/人文叙事分离（2026-09-25，R53 plain-language）

**背景**：用户对整合目标追加约束"不要有脚手架和黑话"。审计实锤：R49-R52 四轮引入大量自造术语（流A/流B、档、随发、接线、对偶、反向索引、G25、三件套、认知面、税制、变异锁、随发或声明……），随发面的 task-methodology-router 黑话密度 21 处、SKILL.md 首现"流A/流B"无释义、生成 workflow.md 产物头带"生成器仓/不随发生成物"内部口吻——违反用户级 AGENTS.md 第 4 节"黑话必须翻译：内部代号首现给全称或一句话解释"。脚手架残留审计：用户面 grep 脚手架/装配/安装器零上游叙事残留（"装配"为仓库自有架构词——装配层/装配成目标技能——保留）。

**决定一：术语词典 = 释义单一事实源 + 首现全称句**。使用手册术语词典扩 15 条（流A/流B/档/随发/接线/能力地图/方法论分派表/【生成器侧】/G 断言/三件套/认知面/税制/变异锁/证据分级），与既有 20+ 条同表；SKILL.md 等预算受限面只做首现全称句（"流A=生成器的 12 步生成流程"），深释义归词典；README 术语消歧段加指针。新自造词入正文前先入词典（防复发）。

**决定二：机器锚词与人文叙事分离**。grep 锚（【生成器侧】标注、「调用追踪」「方法论引用」要素词、全部档名）**保持字面**供 G25/verify-completeness/测试执法——人话化只改叙事层（"反向索引/对偶"→"配套查询：从文档查用途 vs 从任务查读什么"），锚词与断言实测全绿后收口。此分离原则与决策 27（吸收优先于新增门禁）同族：执法靠字面锚，可读性靠平实叙事，两者不互斥。

**同轮能力登记**：①术语词典 +15 条；②SKILL.md 流A/流B 首现定义 + 两处 R49 枚举瘦身（预算内替换，三件套 188383B≤188416B）；③router/capability-map/emit 产物头人话化（G25 ⑤⑥ 与四测试/e2e 全绿实证锚词未破）；④README 词典指针。

---

### 决策 46：吸收判据两问——内容与方法分离，消费登记不得编造（2026-09-30，R76 回退+R77 制度化）

**背景**：R76 将《支付系统为什么必然走向 Flow 编排》一文的领域知识（流程编排五阶段、选型矩阵、跨境出款链路等）物化进 domain-knowledge 与 industry-profile-payment 两档，发 v2.40.0。用户复盘裁决"学习文章中的有效方法，不要瞎融合，不要拼凑，不要硬粘合"，全量回退（v2.40.1）。根因有二：**吸收对象错置**（抄了文章的内容层，没学文章的方法层——领域知识摘要入库，格式再对齐也是剪贴）；**消费登记编造**（capability-map 与 §3.5 写的"探查关注点/门禁联动"消费点是形式成立实际牵强，两问答不上来）。

**决定一：吸收入库两问（硬判据）**。任何内容进 references/（含扩充既有档）前必须过两问并写进轮台账：① swarm-yuan 的哪个环节缺这个（生成流程 Step X / 开发工作流节点 X / 门禁 X / 反馈回路）；② 谁在什么场景消费它——须给**真实触达证据**（消费方文档正文引用 / 分发行+任务分派注入 / 门禁依据 / 按需加载机制 / 机制代码化），capability-map 登记行本身不算证据。两问答不上 → 记轮台账即可，不入库。

**决定二：文章源两层分离**。文章的价值分内容层（领域知识，默认不吸收——除非过两问且属该档既有定位，如行业档立法内容）与方法层（论证/分析/决策方式——正确形态是**机制化**：变成流程中的问句、检查项、模板字段，而非知识段落）。R49 三态处置协议（SKILL.md 反馈回路消费）是方法机制化的正例；R76 十维表是内容入库的反例。

**决定三：执行纪律与判断的关系澄清**。sweep 全绿/防复发锁/三面一致只证明"做的过程干净"，不证明"该做"——判断（两问）在先，纪律在后。R76 的 28 断言锁全程绿，锁的是不该入库的内容。

**消费登记真实性由判据守，不由机器锁守**：G25 只能对账"档名双向存在"，无法判定"消费节点是否真实"（R76 实证：登记可以编）。capability-map 对账纪律第 5 条同步补此口径。

**R77 同轮登记**：① 全量复盘 46 档消费证据（文档面引用扫描+机器面消费核查+逐档定性）——结论：无一档需回退（历史吸收各有真实消费形态：机制代码化 dsh §3.2→project-fingerprint / 分发行+任务分派 generate-skill L137-144 / 门禁依据 gates / --industry 按需加载行业八档 / G14 存在锁 context-engineering / 维护者参考 four-theories 六场景 / 认证资产 quality-management 边界声明），R76 是唯一无消费设计例外，成因即判据缺位；② 文章方法三问（被什么击穿 / 不用 X 的最强做法 / 给决策变量不给唯一答案）以问句形态机制化进 spec §2 决策记录（模板+填充指引双向同步）——该方法落地过两问：每次含技术选型的 spec 填充与评审都会触达；其余三条方法（体感先行/场景化痛点/两份实物对比+缺席清单）属论证写作质量，swarm-yuan 无消费环节，记 R76 台账 §四不物化。

---

### 决策 47：分发面与生成器侧档分离——预算棘轮根因根治（2026-10-20，R125 深度复盘重构轮）

**背景**：决策 38 确立"预算是恒等式"（新内容进技能须等额删除或逐例登记），决策 26.2 冻结门禁预算 56。但 FACT_ARTIFACT_BYTES_BUDGET 在 R107-R123 间被例外上调 32 次（262144→598016B），且多数成因是"运行时刷新轮把上游 release note 逐版吸收叙述写进随技能分发的 references"——目标技能读者为不消费的版本注记付每会话加载税。R125 全量审计发现：claude-code-capabilities.md 81755B 中 42441B 是 v2.1.xxx 逐版能力段；self-check 预算断言按仓内源档计量，与"真实每会话加载"（分发产物）不符；"预算是恒等式"被"生成器侧档与分发面不分"破坏。

**决定一：分发面与生成器侧档分离**。生成器侧档（references/*.md 仓内源档）承载两类内容并保留全量（目标技能消费面 + 生成器供应链决策史）；复制进目标技能骨架的分发面只保留消费面，`scripts/distill-references.sh` 按 DISTILL_BOUNDS 净化清单（数据驱动）把"版本基线/运行时吸收叙述"段剥离。仓内源档不改一字（决策史完整可审）。

**决定二：预算计量口径贴真实**。self-check 预算断言对 refd（净化分发）条目按净化后产物计量，不再按仓内源档计量——预算约束的是"目标技能每会话加载"，不是"生成器仓内档体积"。实测分发面 595053B→523190B（-12%），预算余量 2963B→74826B。

**决定三：登记台账独立成档**。FACT_ARTIFACT_BYTES_BUDGET 行尾 11.5KB 巨型注释（32 次登记理由链）外移 `swarm-yuan/docs/budget-exception-ledger.md`，本行只留键值+台账指针；新增登记只在台账追加一行。

**与决策 38/26.2 的关系**：不推翻"预算是恒等式"，而是补上其被绕过的漏洞——此前"新增须等额删除"的对象被错位理解成"仓内档体积"，而真实消费对象（分发产物）从未被净化。本决策让恒等式重新对准真实税基。

### 决策 48：状态完整性三原则与执行面消费闭环（2026-10-20，R126 完整性加固轮）

**背景**：R126 六域并行审计（90 项分级发现，主会话对高危锚点逐条实证）暴露四类结构性根因，超越单点 bug 层面：① 门禁状态协议不对称——`.gate-fail-flag` 承载"白名单门禁红"全局状态，但清除散布在「任何含 precheck.sh 的 exit 0 命令」（含 --fix-suggest/--doctor/cat 这类非门禁成功），一位全局状态被任意局部结果覆写；② 生成器「子命令中段拦截+exit」布局使后段定义对前段路径静默不可见——「交付形态 DoD 在位性」检查自 2026-10-11 落地起从未触发（_DELIVERY_SHAPES 在 verify 路径恒空+赋值被覆盖，双保险双失效），证明「写了执法」不等于「执法在跑」；③ set -euo pipefail 与 find|head/grep -c 惯形系统性相克（SIGPIPE/双零/无兜底三形态），逐点人肉修补追不上新漏点；④ 数字口径「声明集中、消费人肉」只闭环一半——漂移锁自身的成功摘要携带硬编码漂移数字（598016），51 个顶层 references 中 41 个游离在锁外，两个 FACT 键被文档引用为权威源而 facts.conf 从未落地。

**决定一：全局状态的写入/清除权属单一化**。flag 的写=任何门禁运行 FAIL>0（含单门禁——修复单门禁 fail 被 set -e 直退跳过写侧的洞）；清=仅覆盖式全量运行 FAIL==0（precheck 内 _COVERING_RUN 标记）；hook 不再按命令文本清（它无从得知运行模式）。局部结果不得覆写全局状态——状态机的 restore 同理作废结论字段（verify_result/verify_evidence 随 phase 回滚失效），set 子命令对受保护字段 fail-closed（phase 只走 transition，verify_result=pass 须先挂证据——MEA 铁律从 warn 升级为机器拦截）。

**决定二：执行面消费闭环**。facts.conf 每个键须有执行面机器消费者（scripts/tests/assets/verifier）或入显式豁免登记（附理由）；references 顶层文档逐档须在漂移锁视野内（断言覆盖或 TDN_EXEMPT 登记）。死配置与脱管文档从「漂移发生→人肉补锁」翻转为「新增即须抉择」。配套根治：文档引用的权威源键必须在 facts.conf 真实存在（悬空引用=FAIL）。

**决定三：同族缺陷按族修不按点修**。管道退出码族（find|head SIGPIPE/grep -c 无兜底/|| echo 0 双零）一次清剿并各配回归；conf 判据族收敛 _conf_var_filled/_skill_conf_files 单一实现（消灭五套互不兼容的空值判据）；hooks 路径族统一 ta_hook_path 布局探测（七适配器）；XML 属性容差族（mapper/resultMap/bean/entity 全族空白+单引号容差）。R36/R75「复制面即回归面」的教训正向应用：修一处时把同族面全部找出并同批根治。

**与既有决策的关系**：决定一是「guard 必须能观测自身失败分支」（§决策链 R101 四层模型）与「fail-gate 捕获模型」（R118）的协议层补完——捕获模型的强制力与 flag 生命周期纪律同生共死；决定二是决策 47（计量口径贴真实）向「声明-消费闭环」的推广；决定三是 R125「同族排查」工作方式的方法论沉淀。


### 决策 49：行为保持式拆分的证据标准与并行子代理的归属切分（2026-10-21，R128 backlog 清零轮）

**背景**：R126 审计留下的 9 项中低危余量与 5 个 200+ 行职责混杂函数（verify_completeness 263 / inject_frameworks 275 / check_framework_globs 82 实测 / copy_universal_templates 148 / create 流 emit 段 572）在同一轮由主会话 + 5 个子代理并行清零。两个方法论问题在本轮被迫显式回答：① 2949 行单文件里拆函数，怎样证明「行为没变」而不是「测试恰好没覆盖到变化」；② 多个子代理同时在一棵树上改代码，怎样不互相踩。

**决定一：拆分的行为保持证据 = 拆前基线产物逐字节 diff，不是测试全绿**。测试全绿只是准入；对生成器这类「输出即产物」的程序，拆分前后对同一输入集（create 三档 + inject 全路径 + verify 普通/strict + check-framework-globs）各跑一次，产物与输出经**归一化**（仅时间戳/版本串/随机目录名）后 `diff -r` 必须零差异，每拆一个函数复跑一次。本轮该标准实际拦下一个「首版拆法吞掉了原 set -e 中止」的行为漂移——测试没抓到，基线 diff 抓到了。拆分中发现的原代码缺陷（check_framework_globs 零命中静默中止）**在拆分提交里逐位保留，单独立法修复**：行为保持与缺陷修复不混在一个提交里，否则 diff 证据失去意义。配套机器锁 test-r128-function-size（heredoc 感知边界，上限 150 行，单 heredoc 本体超限者逐个豁免并加活体反向断言）防再长肥。

**决定二：子代理并行按文件归属不重叠切分，重文件独占 worktree**。切分依据是「谁改哪些文件」而非「谁做哪个主题」：spec-first/.bat/self-check 三项文件集互不相交，可共享主 worktree 但**不提交**（由主会话按路径分组收口，避免 index 锁竞争与归属混淆）；install 层与 generate-skill.sh 各自独占 worktree 自行提交（后者 2949 行单文件被多人同时编辑必冲突，前者的测试会调 generate-skill.sh——隔离防中途语法错误互相污染测试结果）。worktree 总数守 ≤3 上限。每个子代理报告**不直接入账**：主会话复跑其测试、核对 `git diff --name-only` 是否越界允许清单、抽查关键断言后再提交或合流——本轮据此发现并修正了子代理测试里的 G20 全角相邻坑与范围外遗留（fail-gate-hook 的同族 cut -d'#'）。

**决定三：并行支已顺手修掉的项先盘点再开工**。三会话同号并发（R126）后，backlog 清单与树的真实状态可能已不符：开工前逐项 grep/实测确认（本轮 10 项盘出 3 项已被并行支关闭：trace-log 决策锁、run-one-fixture 统一执行器、TLS §8 误报），避免重复劳动与二次冲突。

**与既有决策的关系**：决定一是决策 47「计量口径贴真实」在重构验收上的同构——「测试绿」之于「行为不变」正如「仓内档体积」之于「真实加载税」，都是代理指标替代了真实对象；决定二把决策 48 的「同族缺陷按族修」从单会话扩展到多代理协作的切分原则；决定三是 R124/R126 并行会话教训（见记忆 parallel-session-branch-replay）的开工侧对偶。

### 决策 50：注册表平面与生成视图——事实从手抄副本改为表驱动（2026-10-21，重构落地轮）

**背景**：`FACT_SCRIPT_LOC` 两度滞留旧值、顶层规范文档行号引用随重构漂移、门禁聚合文件与分发清单内嵌代码、全量汇编 1.7MB 无生成器——同类病的共同根因是同一事实存在多份手抄副本，靠人记同步必然漏（决策 38 已定调「计量口径贴真实」，本轮把它从数字推广到清单与分层）。

**决定**：六张 TSV 权威表（门禁 / 框架 / 方法论文档 / 运行时 / 宿主 / 分发清单）成为唯一事实源；`facts.conf` 拆手写预算段 + 生成段（`registry-render.sh --facts` 产出 `facts.generated.conf`，禁手改）；三个门禁聚合文件改为 `--gates` 再生视图（与域源逐字节一致入 self-check 对账）；分发清单由 `dist.tsv` 生成派生块；`registry-render.sh --check` 做表 ↔ 代码 ↔ 夹具三向一致性（双向零孤儿 + claim 等级 + 外键 + 死键豁免）入 self-check 与 CI；全量汇编上线 `build-compendium.sh --check` 新鲜度抽查，正本变更未同步即红。执法配套：派生文件手改即判脏；新增门禁只碰三处（表一行 + 域函数 + 夹具）。

**与既有决策的关系**：决策 19（facts 单源）与 26（预算恒等式）从「数字」推广到「清单、分层、聚合视图」；决策 35（入库产物可逐字节再生）从 enforce 配置推广到门禁聚合与分发清单；行号锚禁令（函数名锚替代）同族。落地证据：registry-render --check 全绿入 self-check；汇编新鲜度检查实测抓到使用手册陈旧。

### 决策 51：统一测试入口与并行安全调度——同构回归与「并行不降验证强度」（2026-10-21，重构落地轮）

**背景**：本地全量回归与 CI 曾各跑各的清单（互相有对方没有的项），测试无层级元数据；统一入口落地后其并行档又有隐患——runner 读了 parallel_safe 元数据但批调度未消费，`--jobs>1` 会让安装/卸载、自检缓存、离线包等共享状态测试与其他测试并跑撞夹具；整场串行回归 55 分钟也成为迭代税。

**决定一：回归入口单一化**。`tests/run.sh` 按五层（静态语法 / 门禁双态 / 框架双态 / 生成链路 / 独立验证器）选择测试集，`index.tsv` 登记层级与并行安全元数据（未登记默认可并行）；本地 sweep 与 CI 跑同一入口同一参数，同构达成；单实例锁防同树并发两场回归。

**决定二：并行安全调度 = 元数据被真实消费，而不是被读取**。双队列调度：parallel_safe=yes 按 `--jobs` 分批并发，parallel_safe=no 排到最后逐个独占（批内不与任何测试同跑）。契约测试沙箱化锁死该行为（六个假测试用运行标记互侦测：不安全测试零并跑 + 安全测试真并行，改前必红）。默认并行度 4；实测整场回归 55 分钟 → 24 分钟，两轮全绿。

**决定三：并行只加速执行，不降低验证强度**。提速不得改变任何一条测试的通过与失败含义；并行分发出去的单元（子代理、后台任务、并发测试批）的结果仍由发起方按原判定收敛——子代理报告须主会话独立复跑核验后入账。该条同时立法进用户级协作规范与生成器产出的目标技能设置原则，与决策 49 决定二（子代理报告不入账须复核）同源。

**与既有决策的关系**：决定一是决策 48「执行面消费闭环」在测试组织上的应用（入口与元数据都要有真实消费者）；决定二是「守卫双保险」哲学——安全不是标注出来的是调度出来的；决定三把决策 49 的多代理复核纪律从仓库工程推广为默认工作方式。

---

## §13 历史档案（A1-A18）
| 编号 | 档案 | 说明 |
|------|------|------|
| A1 | 范式定位 | 适用/不适用边界的原始论述。 |
| A2 | 设计逻辑简版 | 早期一页纸设计逻辑（已并入 DESIGN §0）。 |
| A3 | 本体论刻画 | BFO 范畴论/部分学正式刻画（已并入 DESIGN §0）。 |
| A4 | 理念一致性对照 | 设计理念与实现一致性对照表（归档版）。 |
| A5 | 决策史归档前卷 | 决策 1-20 原文（现行版含修订索引）。 |
| A6 | 框架规则引擎设计 | 框架规则引擎选型设计（方案 A；设计时点为 7 框架种子，现 79 框架）。 |
| A7 | 审计优化决策 | 审计轮优化决策记录。 |
| A8 | 上游引入决策 | 上游运行时引入边界决策。 |
| A9 | Q2 重量级审查 | 2026-08-19 分层实现评审报告。 |
| A10 | 运行时升级 2026-07 | 2026-07 运行时升级差异报告。 |
| A11 | 运行时升级 2026-08 | 2026-08 运行时升级差异报告。 |
| A12 | 五维稳定单元 | 稳定单元五维字段定义。 |
| A13 | 宣传文案 | 对外宣传口径（历史版本）。 |
| A14 | 运行时升级 2026-09 | R16 运行时升级差异报告（claude-code/codex/dsh/better-harness）。 |
| A15 | 运行时补核 2026-09 | R17 补核轮差异报告（claude-code/codex/dsh 三件套深审 + 外围九项快审）。 |
| A16 | 运行时补核 2026-09 | R18 补核轮差异报告（claude-code 263 纯修复轮 + gsd-core 1.13 证据纪律吸收 + graphify/gstack/impeccable 外围三行）。 |
| A17 | 运行时补核 2026-09 | R20 补核轮差异报告（claude-code 265 实质轮五项落地 + comet 0.4.0 触发兑现 drift 归零 + ocr/graphify/ruflo/ECC/codex-security/gstack 六行移动）。 |
| A18 | 运行时补核 2026-09 | R22 补核轮差异报告（codex 0.154.0 实质 minor 兑现 + dsh 0.1.5-rc.1 跨线 + claude-code 267 治理原语 + openspec/claude-mem/ocr/graphify/gstack/ruflo 六行移动）。 |

### A1. 范式定位

> 适用/不适用边界的原始论述。（历史原文，不再单独维护）

> **归档标注**：本档案（范式定位 v2/v3 原稿）已并入本文档 §6.1 §1（定位与适用域，原 docs/DESIGN.md §1）——单一设计事实源现为本文档 §6.1；本段保留为历史原稿（不再单独维护，内容以 §6.1 为准）。



> 版本：v2（2026-08-21，R13 去抽象化重构后修订；v1 见 git 历史 WP-P10）
> 目的：显式声明 swarm-yuan 的适用/不适用场景与当前架构形态。
> 依据：R13 终态方案 `docs/research/R13-final-plan.md`（v6）——范式作为条件而非内容，厚生成器 + 薄生成物。

### 范式定位一句话

**swarm-yuan 是"生成器厚、生成物薄"的两体系统——生成时刻允许厚（探查知识全量），生成物必须薄到近乎无形（每会话固定税 ≤8KB、概念体系 ≤5）。重量在生成器侧是投资，在生成物侧是税——税制有机器预算。**

### 与 v1 定位的关键差异

v1（WP-P10）说"swarm-yuan 是重量级范式，重量是设计选择"——那是 2026-07 的真实，也是五轮"过重"诊断反复追问的对象。R13（2026-08-21）重构后，定位修正为：

| 维度 | v1（2026-07） | v2（2026-08，R13 后） |
|------|---------------|----------------------|
| 架构 | 单体重型 | 两体：厚生成器 + 薄生成物 |
| 范式形态 | 内容（要 AI 读记并自觉执行） | **条件**（运行时约束行为，零认知占用） |
| 重量表述 | 20k 文档 + 22k 脚本 = 设计选择 | 生成物每会话固定税 ≤8KB（机器断言）；生成器侧知识全量保留（一次性消费，不算税） |
| 概念体系 | 40+ 套编号概念 | 5 个层次名词（探查/约束/演化/留痕/生成）+ 认知框架落地为 AI 判断引导 |
| 门禁 | 54 门禁（10 个默认不可触达） | 54 门禁全部有真实触发路径（54/54 可达，不下调） |
| 自适应 | 三档 profile（lite 砍文件） | 项目档 × 任务档双维（砍文件不再发生——lite 无 hooks 生命周期，任务档只影响 spec 展开与门禁子集） |

### 适用场景

| 场景 | 为什么适用 | 推荐档 |
|------|-----------|--------|
| **团队协作项目（≥2 人）** | 项目地图让多人共享认知；门禁守护分支质量；运行时条件不依赖人自觉 | standard |
| **中大型项目（≥80 文件）** | 探查全量穷举 + 计数核验（≥0.95）保证组件清单可信；path-check 杀幻觉组件 | standard |
| **强监管/合规交付** | 合规门禁族 fail-closed + 行业 profile 真实注入（`conf-render.sh --industry`） | compliance |
| **长期维护项目** | 自成长链（fingerprint 感知 + scope 局部重探查 + last-good 红线）让技能跟项目演进 | 任意档 |
| **小项目但想要门禁** | lite 档 = 地图 + 约束 + 演化（无 hooks 生命周期，零常驻税之外的负担） | lite |

### 不适用场景

| 场景 | 为什么不适用 | 替代方案 |
|------|-------------|---------|
| 个人脚本/一次性原型 | 探查+门禁的开销远超脚本本身复杂度 | 直接 AI 裸写 |
| 极小改动（typo/调样式） | 不需走 spec 流程 | 直接改 |
| 无 AI 辅助的纯人工开发 | 范式设计为 AI 驱动（条件由 hook/门禁在 AI 会话中生效） | 传统 lint/test 工具链 |

### 范式外轻量方案

1. **单文件 precheck.sh**：直接拷 `swarm-yuan/assets/precheck.sh` 到项目，配 `precheck.conf`，跑 `--all` 核心门禁——不套生成器、不建 skill 目录。
2. **传统工具链**：ESLint/Prettier/golangci-lint/pylint + Git hooks。
3. **AI 原生开发**：直接对 AI 说"帮我改这个 bug"——不套任何范式。

### 当前架构的诚实评估

R13 后的真实状态（v2.1）：

- **生成物税有预算且被断言**：SKILL.md 骨架 8.7KB（≤8KB 预算）；认知面 references 拷贝 252KB（≤256KB 预算）；每会话固定税（SKILL.md+hooks+settings+conf）≤8KB——全部进 self-check 断言，超标即 fail。
- **重量没有消失，只是归位**：生成器侧 68K 行自举仍在（探查知识/框架规则/行业 profile——一次性消费，不算每会话的税）；生成物侧 ~25 文件，AI 读项目代码前的概念负担从 150+ 记忆槽降到 5 个层次名词。
- **治理由条件承载**：门禁输出三值（allow/prompt/forbid 取最严）、规则在 rules.d 数据文件（非 conf 硬编码）、FORBID 消息带替代方案（给模型的 API）、hooks 双宿主真实拦截（Claude Code deny JSON + Codex exit 2）。
- **吸收有纪律**：新概念进 SKILL.md 必须给出落地路径（接线/AI 判断引导/路由——不接受"先放着"）；吸收一律过三问（能否落到运行时条件/替换还是叠加/六个月后谁引用）。

**结论**：如果你的项目值得 AI 先懂再写（团队协作/中大型/长期维护/强监管），swarm-yuan 的生成器厚是合理投资——而生成物薄保证 AI 不被范式本身的重量拖住。

### 决策记录

v1 定位：决策 25（2026-07-21）。v2 修订：R13 终态方案 + 决策 33/34（见本文 §6.3 决策史）。


### A2. 设计逻辑简版

> 早期一页纸设计逻辑（已并入 DESIGN §0）。（历史原文，不再单独维护）

> **归档标注（2026-08-21 v3 整合）**：本档案已并入本文档 §6.1 §0.5-0.7（闭环流+流速流量+四测量维度，原 docs/DESIGN.md）——单一设计事实源现为本文档 §6.1；本段保留为历史原稿（不再单独维护，内容以 §6.1 为准）。


> 本体论驱动原理见本文 §6.1 §0.1-0.4+0.8（原 docs/DESIGN-ONTOLOGY.md；发动机——机制从关系派生、设计走四问、演进先改本体、行为被本体约束）。本文只讲**流动**：过程如何展开、账本如何回流。

### 闭环流（系统的过程形态）

```
代码仓库 →① 生成段（探查+装配）→② 产物段（目标技能，出口受税制预算门约束）
  →③ 使用段（AI 按需 grep 地图做拼装式开发，行为被条件实时拦截）
  →④ 账本段（全量留痕）→⑤ 回流段（审计+评测校验体系自身，改进写回①②）
```

**自成长是闭环流的闭合条件**——砍掉回流边，系统退化为一次性脚手架生成器。

### 流上的流速与流量

- **厚薄**：①段知识一次性消费（厚是投资），③段产物每会话重复消费（厚是税）——"两体系统"就是这个消费频次差的旧名
- **流量阀**：profile 四档参数化①段装配多少
- **出口预算门**：②→③ 边界上，固定税 ≤8KB / 认知面 ≤256KB / 概念 ≤5（机器断言）
- **校验相位**：③段事中门禁、④段事后审计、⑤段对校验器自身的元评测——"三层 Harness"就是校验点在流上的三个相位
- **对外端口**：①段输入端口（三层接线取外部证据）、③段执行端口（hooks 挂宿主）

### 四个测量维度（本体结构沿流的投影定律）

闭环流被发动机驱动（§6.1 §0.1-0.4"四冲程"，原 DESIGN-ONTOLOGY.md）做功，做功效果在四个维度上可测——**四维不是选出来的视角，是本体 2×2 结构的必然展开**（实体二分 × 关系二分，推导见 §6.1 §0"发动机与仪表盘"节）：

| 维度 | 从本体哪格展开 | 测什么 | 在此维度上的历史语言 |
|------|---------------|--------|---------------------|
| **时间轴** | 发生体（occurrent） | 流段/相位/消费频次 | 两体系统（厚薄=频次差）、四档 profile（流量阀）、三层 Harness 的相位分布 |
| **产物轴** | 持续体（continuant） | 载荷/出口预算/税 | 税制（≤8KB/≤256KB/概念≤5）、五层一棵树（载荷拓扑） |
| **校验轴** | 表征关系（aboutness） | 表征可信：指向/覆盖/时效 | 三层 Harness（门禁=事中/审计=事后/评测=元）、path-check/计数核验/stability-audit |
| **边界轴** | 依赖关系（dependence） | 依赖连通：输入口/执行口/锚 | 三层接线（①段输入口）、宿主下沉（③段执行口）、digest 链（锚） |

**历史层次语言的归位由此成立**：每套语言都是对某个维度的观测记录（两体系统=时间轴频次观测、税制=产物轴出口观测、三层 Harness=校验轴相位观测、三层接线=边界轴端口观测）——它们不冲突，因为本体的 2×2 结构只有四格，每套语言各守一格。九条内核与贯穿原则跨格（不变量与守恒律，见本体文档）。


### A3. 本体论刻画

> BFO 范畴论/部分学正式刻画（已并入 DESIGN §0）。（历史原文，不再单独维护）

> **归档标注（2026-08-21 v3 整合）**：本档案已并入本文档 §6.1 §0.1-0.4+0.8（本体论驱动原理+燃料+工具箱，原 docs/DESIGN.md）——单一设计事实源现为本文档 §6.1；本段保留为历史原稿（不再单独维护，内容以 §6.1 为准）。


> 本体论在这个系统里是**发动机**，不是标本柜。它不回答"这个东西该归哪个类"，它回答：**这个系统为什么长这样、下一步怎么长、凭什么信它**。
> 之前两稿的毛病：我把本体论讲成了范畴分类学（四大切面/四个坐标系/投影映射）——那是在给系统拍照，不是在给系统点火。本稿重写为驱动原理：本体论如何生成机制、如何驱动每一次设计与演进、如何约束 AI 的行为。

---

### 一句话

swarm-yuan 是被本体论驱动的生成系统：**先说清世界里有什么，一切机制从"存在"推导出来，一切演进从本体开始改，AI 的一切行为被本体约束**。本体不是对系统的描述，是系统的上游——机制是它的实现投影，演进是它的丰富过程，行为空间是它划出的边界。

### 引擎的四个冲程

#### 冲程一：本体生成机制（为什么有这些机制）

每个机制都不是发明出来的，是本体里某条**关系的实现**：

| 本体里的关系（先有） | 派生的机制（后有） |
|---------------------|-------------------|
| 地图**表征**仓库 | path-check（验证表征指向真实存在）、计数核验 ≥0.95（验证表征覆盖够全）、stability-audit（验证表征没过时） |
| 规则**治理**命令 | 三值求值器（治理的判定）、FORBID 带替代（治理的表达方式）、审批沉淀（治理的演化通道） |
| 账本**记录**过程 | trace-log（记录的工具）、gate-audit（记录的固化）、审计闭环（记录的复盘） |
| 技能**依赖**生成器版本 | .swarm-yuan-version 版本戳、--upgrade 升级机制 |
| 决策**锚定**trace | ref_trace_hash digest 链 |
| 好基线**不因坏状态**失效 | last-good 红线（骤降 >50% 拒写） |

**反推纪律（这条冲程的执法）**：每个机制必须能回答"我实现本体里的哪条关系"。答不出的机制是孤儿——要么删掉，要么先回本体补定义再实现。这一条直接继承 R13 的"概念落地问责"，但从"落地"深化到"从本体派生"。

#### 冲程二：本体驱动设计（新需求来了怎么想）

传统思路：新需求 → 想加什么功能 → 实现功能清单。
本体驱动思路：新需求 → 四问推导 → 功能只是推导链末端的投影：

1. **这引入什么新实体？**（进 objects.md——本体论节俭：想清楚它跟已有类型的区别）
2. **实体间产生什么新关系？**（进 links.md——这条关系的语义是什么）
3. **新关系的机器锚是什么？**（没有锚的关系 = 未来的漂移 bug——历史上全部漂移 bug 的统一根源）
4. **锚怎么检测失效？**（进 self-check 对账或 ontology-verify 健康检查）

四问答完，实现是水到渠成的；四问没答就写代码，就是 R13 之前五轮膨胀的老路。

#### 冲程三：本体驱动演进（系统怎么成长）

成长史 = 本体的丰富史 + 依赖的锚定史。这个视角把整个演化过程串成一条线：

- **R13 之前**：本体是隐式的（没人写下"存在什么"），机制凭感觉加——机制与本体漂移，声称的关系没有锚（12 vs 13、6355 vs 6393 这类漂移 bug 全是这么来的）
- **R13**：清理"机制↔本体"的错位——机械打分退役，因为它声称测"理解"，但本体里根本没有"理解"这个实体，只有行为记录
- **R14**：补关系——goal 闭环、证据态、双账本（"账本记录过程"这条关系的深化）
- **R15**：补锚——digest 链、gate-plan、audit-closure（给无锚关系配上断裂检测）
- **R16**：本体显式化——assets/ontology/ 三目录成为事实源，机制↔本体可机器对账
- **以后每次演进**：先改本体目录 → 派生实现 → 对账验证收尾。本体先行，实现跟随。

#### 冲程四：本体约束行为（AI 怎么被管住）

Palantir 的一句话在这个系统里的对应："你建不出绕过治理的看板，因为看板读的是受治理的对象" ↔ **AI 做不出绕过门禁的操作，因为操作过的是受治理的规则和账本**。

- AI 读到的不是一堆散文档，是类型名词（21 类型）+ 封闭动作空间（11 动作——每个都有治理载体和留痕载体）
- 想直接改文件？挂载在宿主上的 hooks 拦（mounted_in 关系生效）
- 想改账本抹痕迹？integrity-guard 的自指防护拦（Ledger 是受治理对象）
- 想跑危险命令？rules.d 三值判 forbid，FORBID 消息带替代方案——**在受约束空间里指路，而不是在自由空间里祈祷**

### 发动机与仪表盘（四冲程与四坐标系的本质关系）

发动机（四冲程）是动力；效果需要在维度上**可观测**——这就是四坐标系（时间/产物/校验/边界）的位置。它们不是四个"视角"（此前表述的错误），而是**本体结构沿闭环流展开的必然测量维度**——本体有什么结构，流上就有什么维度可测：

| 本体结构 | 沿流展开为 | 测什么 |
|----------|-----------|--------|
| **实体二分 · 发生体**（occurrent：生成/会话/决策/审计） | → **时间轴** | 流段、相位、消费频次（"两体系统"是这里的观测） |
| **实体二分 · 持续体**（continuant：仓库/技能/规则/账本） | → **产物轴** | 载荷、出口预算、税（"税制"是这里的观测） |
| **关系二分 · 表征关系**（represents/records/snapshot_of/closes——aboutness 一系） | → **校验轴** | 表征可信度：指向/覆盖/时效（"三层 Harness"是校验点在此轴的相位分布） |
| **关系二分 · 依赖关系**（generated_by/governs/mounted_in/anchors/propagates_to/plans——dependence 一系） | → **边界轴** | 依赖连通：输入口/执行口/锚（"三层接线/宿主下沉"是这里的端口） |

**为什么恰好是四个**：实体有两大范畴（BFO 的 continuant/occurrent 顶级二分），关系有两大类（哲学两大关系传统：aboutness 与 dependence——links.md 的 10 条关系恰可完备二分为 4+6）。2×2=4，不多不少——**四坐标系是本体结构的投影定律，不是设计者的分类趣味**。

每个冲程的效果都落进这四个维度可验：冲程一派生的机制落在校验轴/边界轴（锚在哪、验什么）；冲程二的产出落在产物轴+时间轴（新实体进载荷、新过程进流段）；冲程三的演进轨迹四轴皆留（本体改了哪格、哪条锚补了）；冲程四的行为约束在校验轴（拦截率）+时间轴（会话过程）上可测。**没有仪表盘，发动机是否在做功无从知晓；没有发动机，仪表盘测的是一台停着的机器。**

### 本体本身（引擎的燃料，简洁版）

- **实体**：21 类型（objects.md）——仓库/组件/技能/规则/账本/门禁/决策/目标...；刻意**不承诺**的：AI 的"理解"、认知分数（不可观测的东西不进本体，只承诺其行为记录）
- **关系**：10 条（links.md）——每条带机器锚（关系的实例可验证存在）
- **动作**：11 个（actions.md）——封闭空间，每个动作可审计

三份目录是事实源（与 facts.conf 的数字口径平行），self-check 对账 18 实存点，ontology-verify 六锚健康检查。

### 范畴工具箱（附录：刻画时用的学术工具，非主体）

需要精细刻画时才用的工具（来源见文末）：continuant/occurrent 二分（持续体 vs 发生体——恰好解释了"两体系统 vs 闭环流"不是矛盾是两个范畴）；部分学（部分 ≠ 构成材料——税制管的是构成不是部分）；Quine 承诺（承诺 = 量化遍历的实体）。这些是**镜头**，引擎是上面四个冲程。

### 调研来源

- BFO：[bfo-ontology.github.io](https://bfo-ontology.github.io/) / [Wikipedia](https://en.wikipedia.org/wiki/Basic_Formal_Ontology) / [IEEE 教程](http://ieeexplore.ieee.org/document/7288715/)
- 部分学与构成：[SEP: Mereology](https://plato.stanford.edu/entries/mereology/) / [Baker](https://people.umass.edu/lrb/files/bak02onmS.pdf) / [Evnine](https://kathrin-koslicki.squarespace.com/s/Simon-Evnine-Constitution-and-Composition.pdf)
- 本体论承诺：[SEP: Ontological Commitment](https://plato.stanford.edu/entries/ontological-commitment/)
- Palantir 本体论工程：[Ontology Overview](https://palantir.com/docs/foundry/ontology/overview/) / [Why create an Ontology?](https://palantir.com/docs/foundry/ontology/why-ontology/) / 本仓 R11 报告


### A4. 理念一致性对照

> 设计理念与实现一致性对照表（归档版）。（历史原文，不再单独维护）

> **归档标注（2026-08-21 v3 整合）**：本档案已并入本文档 §6.1 §2/§9（理念一致性，原 docs/DESIGN.md）——单一设计事实源现为本文档 §6.1；本段保留为历史原稿（不再单独维护，内容以 §6.1 为准）。



> 日期：2026-07-21 ｜ 单一事实源：本文表与 `swarm-yuan/scripts/self-check.sh` 的 `check_doc_consistency` 机械解析互证。
> 目的：让"目标技能 在实际项目中可用、研发全流程 7 阶段真实可执行、13 运行时非花架子、三平台 CI 全覆盖"从宣称变成可核对的事实。

### 一、13 运行时接线分层（WP1）

> 注：本表为 WP1 时点快照（11 运行时：4 深 + 3 CLI + 4 方法论）。后续吸收 impeccable（方法论第 5）+ codex-security（CLI 第 4）后扩为 13（4 深 + 4 CLI + 5 方法论），权威数见 `swarm-yuan/assets/facts.conf`（FACT_RUNTIMES=13）。本表保留历史接线明细，计数以 facts.conf 为准。

| 层 | 运行时 | 真实接线方式（脚本里会执行的） | 降级载体 | self-check 可安装 | 验证 fixture |
|----|--------|------------------------------|---------|------------------|-------------|
| **深度接线（4）** | GitNexus | precheck.sh `gitnexus status`/`query`/`trace`/`detect_changes`（19 处子进程调用） | graphify → grep+madge | ✅ 源码+npm | check_layer/link-depth/impact gate-fixture |
| **深度接线（4）** | graphify | precheck.sh `graphify explain`（7 处） | grep+madge | ✅ uv/pipx | check_link-depth gate-fixture 降级路径 |
| **深度接线（4）** | claude-mem | precheck.sh `claude-mem search "project rules conventions"` | progress ledger + decisions.md | ✅ 源码(bun)+npx | check_knowledge gate-fixture |
| **深度接线（4）** | ocr | precheck.sh `ocr review --from --to --audience agent` + 降级 `ocr scan` | 5 维度手动清单 | ✅ npm i -g | review gate-fixture（mock bin/ocr） |
| **CLI 接线（3）** | OpenSpec | check_requirements `openspec validate --all --strict`（WP1.1 新增） | 自带文档检查（TBD/ID/EARS） | ✅ 源码+npm | requirements-openspec gate-fixture（mock bin/openspec） |
| **CLI 接线（3）** | comet | state-machine.sh `comet guard`（WP1.2 新增） | 自带 state-machine.sh 文件检查 | ✅ 源码+npm | state-machine guard 实测（mock bin/comet） |
| **CLI 接线（3）** | gsd-core | check_review `gsd-tools validate health`（WP1.3 新增，warn 级） | ocr + 手动清单 | ✅ 源码 build+npx | review-gsd gate-fixture（mock bin/gsd-tools） |
| **方法论引用（4）** | superpowers | 无 CLI；AI 按 subagent-orchestration.md 引用其 14 skills 模式 | 自带 subagent-orchestration.md 手动编排 | ❌ 需 `/plugin install` | 无（方法论层不接线 CLI） |
| **方法论引用（4）** | gstack | precheck.sh `if [[ -d ~/.claude/skills/gstack ]]; then echo 提示`（不执行 gstack 命令） | ocr + 手动清单 | ❌ 需 git clone + setup | 无 |
| **方法论引用（4）** | Ruflo | 无脚本调用；文档明说"不要求安装" | superpowers+claude-mem+gsd-core | ✅ npm i -g（但装上无脚本调用） | 无 |
| **方法论引用（4）** | ECC | 无 CLI；AI 按 review-methodology.md 引用其 hook profile 模式 | 自带 precheck + state-machine | ❌ 需 `/plugin install` | 无 |

**核对结论**：13 运行时按 4 深 + 4 CLI + 5 方法论分层（WP1 时点 11：4 深 + 3 CLI + 4 方法论；后吸收 impeccable + codex-security），每层有自带降级载体，未装不阻塞（fail-open）。深度+CLI 层在 precheck.sh/state-machine.sh 有真实命令调用 + fixture 验证；方法论层诚实标注为模式引用，不假装深度接线。

### 二、研发全流程 7 阶段 × 门禁映射

| 阶段 | spec 章节 | workflow 节点 | 门禁函数 | 双态 fixture | 真实可执行 |
|------|----------|--------------|---------|-------------|-----------|
| 需求 | §1 背景目标 / §4 Spec Delta | ①需求理解 → ②设计 spec | check_requirements（+openspec validate） | requirements / requirements-openspec | ✅ |
| 分析（左移） | §19 测试设计 / §20 变更影响 / §21 可观测性 | ②spec ★左移 / ③plan ★左移 | check_shift_left / check_impact | shift-left / impact | ✅ |
| 设计 | §3 改造类型 / §5 详细设计 / §5.5 复用 / §14-§18 | ②-③ design+tasks | check_layer / check_stable_diff / check_link_depth / check_reuse / check_deps / check_security / check_cognition / check_domain | layer/stable-diff/link-depth/reuse/deps/security/cognition/domain | ✅ |
| 开发 | plan Task 1..N / §20 变更影响 | ④分支 → ⑤编码（subagent-driven） | check_build / check_framework（79 框架动态分发） | build / 79 framework-fixture | ✅ |
| 测试 | §11 测试策略 / §19 用例骨架 | ⑥测试验证（ocr 5 维度） | check_test / check_review（+gsd-tools health） | test / review / review-gsd | ✅ |
| 部署/发布 | §20.3 灰度 / §21.5 告警+Runbook | ⑧构建发布（★运维左移） | check_build / check_release_sign / check_sbom / check_privacy | build / release-sign / sbom / privacy | ✅ |
| 运维/合规交付 | §21 可观测性 / §22 标准合规 | ⑦合入 + ⑧发布 + ⑨完成检查 | check_compliance / check_docs_pack / check_shift_left §21 | compliance / docs-pack / shift-left | ✅ |

**核对结论**：7 阶段无空壳，每阶段有 spec 章节 + workflow 节点 + 门禁函数 + 双态 fixture。

### 三、三平台 CI 矩阵（WP2）

| 平台 | CI Job | 覆盖 | 状态 |
|------|--------|------|------|
| Linux | ubuntu-latest（verify-framework-rulesets / fixture-double-state / generator-self-gate / self-check / shellcheck / e2e / verifier） | 79 ruleset + 79 fixture + 48 gate-fixture + e2e + verifier all + shellcheck 18 脚本 | ✅ 全覆盖 |
| macOS | macos-latest（macos-bsd-compat） | bash 3.2 语法 + 79 ruleset + 79 fixture + 48 gate-fixture（BSD grep/awk 兼容） | ✅ 全覆盖 |
| Windows | windows-latest（windows-compat，WP2.1 新增） | Git Bash bash -n + 79 fixture + 48 gate-fixture + .bat 烟雾测试 | ✅ WP2.1 新增 |

**核对结论**：三平台 CI 全覆盖，Windows 不再是虚假声称。.bat WSL 路径转换 bug 已修（WP2.2）。离线包 wheel 三平台覆盖（WP2.3）。

### 四、测试覆盖矩阵（WP3）

| 测试体系 | CI Job | 覆盖 | 状态 |
|---------|--------|------|------|
| 79 framework fixture（id 级双态） | fixture-double-state + macos + windows | 79 框架 × violating/compliant/expected-fail-ids | ✅ 三平台 |
| 48 gate-fixture（全量双态） | fixture-double-state + macos + windows + verifier | 48 门禁组（WP3.3 从 6 组扩到全量） | ✅ 全量 |
| e2e（四框架注入全链路） | e2e + verifier all | Java demo mybatis/lombok/spring-batch/sharding | ✅ WP3.1 进 CI |
| verifier all（C1-C8 验收） | verifier（WP3.2 新增） | fixtures + gate-fixtures + e2e + cli-ab + metrics-assert | ✅ WP3.2 进 CI |
| shellcheck | shellcheck（WP3.4 扩展） | 18 个核心+verifier+tests 脚本 | ✅ WP3.4 扩展 |

**核对结论**：测试覆盖缺口补齐，e2e/verifier/48 gate-fixture 全进 CI。

### 五、两条设计理念落实（WP4，2026-07-21）

| 理念 | 落实点 | 机器执法 | 状态 |
|------|--------|---------|------|
| **1. 连贯动作**（一键生成 + 一键使用，无需用户指定阶段/工具） | `/swarm-yuan <项目路径>` → Step 0-8（13 节点）全自动；目标技能用户只说"开始新需求 xxx" → 8 工作流节点自动驱动；hooks.json 自动接线（SessionStart 状态恢复 + PreToolUse 范围门禁）；工具选择走 has_* 守卫 + 降级链（gitnexus→graphify→madge→启发式） | `--verify-completeness` 零占位符；骨架铁律禁中途停止 | ✅ 已落实（设计性例外：特征卡/spec/合入/发布等 7 处用户决策点保留确认——确认≠指定阶段/工具） |
| **2. 全链路追踪**（每步调用有信息提示，显示调用了何种工具及技能，无需用户确认） | ① stdout 公告：每 Step/节点输出 `→ [Step N/节点X] 调用 <技能/工具> · <目的>`；② 落盘：`scripts/trace-log.sh` 追加 `.swarm-yuan/trace.jsonl`（ai-process-records §2.4 第四级调用留痕）；③ 门禁执行层：每门禁 `=== 检查 ===` 横幅 + pass/warn 归因工具 + gate-runs.jsonl + SARIF；④ hooks 单行摘要（原 `--quiet` 为无效参数已移除，改为一行 ✓/✗ 提示）；⑤ **第三方工具调用点全接线（WP-D1/D3）**：`trace_tool()` 桥（precheck.sh + state-machine.sh）——gitnexus query/trace/detect_changes、graphify explain、claude-mem search、ocr review/scan、openspec validate、gsd-tools validate health、comet guard 共 7 工具 10 个调用点逐一接入，输出走 **stderr**（cli-ab stdout 逐字节契约不破），守卫探测（has_*/indexed）不 trace 防噪音 | `--verify-completeness` 校验 workflow.md 每节点含「调用追踪」要素（template-spec §2 第 ⑨ 要素），缺则列 file:line + exit 1 | ✅ 已落实 |

**核对结论**：理念 1 此前已落实；理念 2 的缺口（AI 行为层无调用公告铁律、无机器校验、hooks 静默）由 WP4 补齐——workflow 10 要素（新增第 ⑨ 调用追踪）+ trace-log.sh 双通道 + verify-completeness 机器执法 + hooks 单行摘要。

---

### 五之二：R13 后的一致性修订（2026-08-21，v2.0/v2.1）

| 理念 | R13 后形态 | 状态 |
|------|-----------|------|
| **1. 连贯动作** | 不变（Step 0-8 全自动 + 8 工作流节点）；workflow 骨架从 10 要素精简为 **4 要素**（入口/参与方/门禁/产出物——其余 6 要素并入产出物说明，80 槽→32 槽） | ✅ 持续落实（verify-completeness 的「调用追踪」检查已同步为 ⑥ 产出物与追踪段含 trace-log.sh 调用） |
| **2. 全链路追踪** | 不变（stdout 公告 + trace-log.sh + gate-runs + SARIF + hooks 摘要）；failure-detector 的 L2-L4 叙事剧场退役（保留 L1 简短提示 + SPINNING brief——hooks 输出从叙事降为条件提示） | ✅ 持续落实（test-failure-detector 已同步新形态断言） |
| **3. 范式作为条件（R13 新增）** | 机制分条件/内容两类：条件（运行时约束，零认知占用）保留并强化（path-check/计数核验/last-good/状态门/三值规则/FORBID 带替代）；内容类转落地化（概念框架→AI 判断引导+notes 留痕）或接线（10 门禁全接线 54/54）/路由（40 references 何时读我） | ✅ R13 批次 0-4 + 增量全部收口（五维断言 G18/G19 守护） |
| **4. 落地优先于删除（R13 总原则）** | 概念/门禁/profile/references 一概不删——病根是"没有正确落地"（机械打分/僵尸孤立/无路由），全部转为真实消费路径 | ✅ 认知框架落地化、industry-profile conf-render 真实加载、装饰文档路由化、methodology 执法载体提取 |

**R13 后一致性自检入口**：`bash swarm-yuan/scripts/self-check.sh --check-only`（含 G18 孤儿资产扫描 + G19 层间反向引用 + 认知面税制断言 252KB<256KB + FACT_GATES_TOTAL=55 真值对账）。

### 六、自检命令

```bash
# 文档一致性（数字口径机械核对，含根 CLAUDE.md）
bash swarm-yuan/scripts/self-check.sh --check-only

# 全量验收（79 fixture id 级 + 48 gate-fixture + e2e + cli-ab + metrics-assert）
bash verifier/v1/run-verifier.sh all

# 理念 2 机器执法（workflow 调用追踪要素 + 零占位符）
bash swarm-yuan/scripts/generate-skill.sh --verify-completeness <skill_dir>

# trace-log 双通道实测（stdout 公告 + trace.jsonl 落盘）
bash swarm-yuan/assets/trace-log.sh --node "Step 4" --actor graphify --tool "graphify explain"

# 三平台 CI（推到 GitHub 后自动跑 ubuntu + macos + windows）
git push
```


### A5. 决策史归档前卷

> 决策 1-20 原文（现行版含修订索引）。（历史原文，不再单独维护）

> **角色标注（2026-08-21）**：本文件是决策史**原文档**（每个决策的完整记录）；本文档 §6.1 §9.2（决策史索引）是索引与归纳——查"为什么决定"用 §6.1 索引，查"决策全文"用本归档卷。


> 归档日期：2026-07-31 ｜ 来源：§6.3 决策史主文件（原 docs/paradigm-decisions.md）决策 1-17（建议 1-7 + 8 条建议表 + 决策 9-17）
> 归档原因：决策 1-17 均已落地稳定，是纯历史记录（决策 12/13 除外，二者仍是当前行为的权威依据，主文件保留指针锚点）。
> 活跃决策见本文 §6.3（决策 18+）。

---

> 日期：2026-07-20 ｜ 分支：`chore/leftover-suggestions`
> 记录 7 项遗留建议的处置决策与理由，供后续版本维护参考，避免重复调研。
> **口径权威源**：`swarm-yuan/assets/facts.conf`（catchphrase 数字单一事实源，self-check 机器执法）。

### 处置总览

| # | 建议 | 决策 | commit |
|---|------|------|--------|
| 1 | `_resolve_path` 左结合 bug | ✅ 修 | `d31ca48` |
| 2 | GNU grep -E 下 `\|` 字面 | ❌ 不修（保留原始行为） | — |
| 3 | 测试覆盖扩展（26 门禁 fixture + CI） | 🟡 部分（CI 骨架做，26 fixture 留长期） | `74bb244` |
| 4 | offline-cache 迁移 Release | ✅ 做（不做 filter-repo 瘦身） | `1c412f2` + `2e7b...` |
| 5 | 片段内既存小瑕疵 | 🟡 部分（dubbo/seata/vue 修，sentinel 不修） | `f893f73` |
| 6 | 生成器增强（SKIP_BAT） | ✅ 做 | `2f37607` |
| 7 | 本决策文档 | ✅ 做 | 本 commit |

### 逐项决策理由

#### 建议 1：`_resolve_path` 左结合 bug —— ✅ 修

**问题**：`cd "$dir" && pwd -P || cd "$dir" && pwd` 在 bash 左结合下解析为 `((cd && pwd -P) || cd) && pwd`，正常路径执行两次 pwd 返回两行值，`-f "$cand"` 永远 false，`check_layer §3/§6`、`check_contract §2` 沉睡。

**修复**：方案 C 直接 `cd && pwd -P`（POSIX -P 三平台兼容），失败走原回退。

**苏醒后发现的第二个 bug**：修复 _resolve_path 后 `check_layer §3` 苏醒，立即暴露 §1 的 glob 解析 bug——`base=${g%%/\**}` 最长匹配把 `overlay/custom/client/*/components/**` 误截成 `overlay/custom/client`，find 扫整个 client 目录，把 `__tests__/adapters/composables` 全归入 component 层，§3 误报 249 个假违规。改 `base=${g%/\**}` 最短匹配 + compgen -d 展开 glob。修复后 ncwk-dev `--layer` 从 249 假违规降到 0。

**教训**：沉睡门禁修复后会暴露下游 bug，需用真实项目样本验证苏醒后行为。

#### 建议 2：GNU grep -E 下 `\|` 字面 —— ❌ 不修

**问题**：`ROLLBACK_KEYWORDS` 等 5 个变量用 `\|` 在 `grep -E` 下是字面 `|`，部分匹配永不命中。

**决策**：保留原始行为。修复会改变门禁判定（让沉睡匹配苏醒），与建议 1 同性质但影响面更大（5 个变量 × 多处 grep），且无样本可预测苏醒后行为。

**后续**：留独立版本决策，若要修需逐变量评估苏醒影响 + 补 fixture。

#### 建议 3：测试覆盖扩展 —— 🟡 部分做

**做了**：`.github/workflows/ci.yml` CI 骨架 4 个 Job（57 verify + 57 fixture + self-check + shellcheck）。触发：push/PR 到 main。

**未做**：26 个非框架门禁（`--scope/--sensitive/--layer` 等）的 fixture。工作量大（每个门禁要造 violating+compliant 双态），留长期扩展，按同范式补齐。

**理由**：CI 骨架能防回归是高 ROI；26 门禁 fixture 是长期工程。

#### 建议 4：offline-cache 迁移 Release —— ✅ 做（部分）

**做了**：
1. 打包 `swarm-yuan-offline-cache.zip`（44MB，含 graphify-wheels + npm + gstack + superpowers）
2. 上传到 GitHub Release `v2026.07.20-offline`（https://github.com/issac-new/Swarm-yuan/releases/tag/v2026.07.20-offline）
3. `install-offline-win.sh（已废弃）` 开头加降级链：本地 cache 不存在 → curl 从 Release 下载 → 降级在线安装
4. `.gitignore` 忽略 `*.whl/*.tgz/gstack/superpowers/`；`git rm --cached` 停止跟踪 37 文件（本地保留）

**未做**：`git filter-repo` 历史瘦身（改写历史 + force push 风险高，留独立决策）。历史 blob 32MB 保留在 .git，但今后不再增长。

**与 memory 全局规则关系**：不冲突。"仅 arm64.dmg + x64.zip" 针对 SwarmStudio 桌面应用；swarm-yuan 是 skill 仓库，现有 8 个 Release 全为 .zip，本附件延续 .zip 惯例（与 `v2026.07.12-offline` 的 59MB zip 先例一致）。

#### 建议 5：片段内既存小瑕疵 —— 🟡 部分修

**修了**：
- dubbo.sh:25 / seata.sh:27 删 `|pom.xml`（被 `*.xml` 遮蔽，死分支，机械等价）
- vue.sh 10 处消息前缀 `vue:` → `fw_vue_<id>:`（与 vue.md §4 命名规范一致，退出码等价）

**未修**：sentinel.sh 内联 grep。A/B 类收益小（19 处单文件 if grep -qE 强改收益小），C 类 5 处 `-qiE` 不等价（`_fw_grep_count` 不支持 `-i`），D 类 4 处需要文件列表/行号/匹配内容（`_fw_grep_count` 只给计数无法替代）。整体非必要。

#### 建议 6：生成器增强 —— ✅ 做

**做了**：`generate-skill.sh` 的 `copy_universal_templates` 加 `SKIP_BAT` 环境变量，设 1 跳过 .bat 复制（macOS/Linux 用户无需 .bat，让 skill 目录更干净）。默认 0 保持兼容（仍复制 7 个 .bat）。

**未做**：snippets.md / mcp-tools.md 是静态参考文档（非模板），create 模式仍复制，upgrade 模式若用户已修改则保留（现状已如此，无需改）。

#### 建议 7：本决策文档 —— ✅ 做

记录上述 6 项决策，供后续版本维护参考。

### 不做的事（汇总）

- 建议 2（grep `\|` 字面）：保留原始行为，留独立版本决策
- 建议 3 的 26 门禁 fixture：工作量大，留长期扩展
- 建议 4 的 `git filter-repo` 历史瘦身：force push 风险高，留独立决策
- 建议 5 的 sentinel 内联 grep：收益小/有风险

### 重构报告（2026-07-20）评估的 8 条建议处置

外部重构报告提出 8 条建议，评估后处置如下：

| # | 建议 | 决策 | 理由 |
|---|------|------|------|
| 1 | precheck.sh 拆分为模块化（precheck/lib/gates/） | ❌ 不做 | 范式核心约束：单文件可移植（目标技能 只需 cp 一个 precheck.sh）。拆分会破坏 install.sh 的"复制即用"设计 |
| 2 | 分层配置 schema + local | ❌ 不做 | 已用 `_default_conf()` + `${VAR+x}` 兜底解决 set -u 崩溃；schema 文件增加复杂度但收益有限 |
| 3 | Shell 可移植性（install.sh 加严格模式） | ✅ 部分做 | install.sh 已有 `set -euo pipefail`（报告不属实）；已加 `--version` + bash 版本校验 |
| 4 | 框架片段 META 头标准化 | 🟡 标注 | 需改 57 片段，工作量大。当前注释约定 + verify-framework-ruleset.sh 已兜底四要素核验 |
| 5 | bats-core 测试框架 | 🟡 标注 | 引入 bats-core 是大工程。已做 CI 骨架（ci.yml 4 Job）+ self-check 文档一致性检查这种轻量项 |
| 6 | 文档一致性检查 | ✅ 做 | self-check.sh 加 `check_doc_consistency`（片段数/门禁数/conf 变量数/references 数）；已发现并修复 SKILL.md "45 变量"→"146 变量"漂移 |
| 7 | 降级策略可观测性 | 🟡 标注 | 改降级函数是大重构（涉及多个 check_* 门禁），先标注，后续版本评估 |
| 8 | 状态机持久化（断点续传） | ❌ 不做 | SKILL.md 明确"不允许中途停在骨架阶段"是设计哲学，断点续传违背零占位符铁律 |

### 风险与缓解

- **建议 1 苏醒 check_layer §3**：已用 ncwk-dev 实证（249 假违规 → 0），且修复了连带暴露的 glob 解析 bug
- **建议 4 Release 迁移**：不删历史 blob（只停止跟踪），install-offline-win.sh 加本地 cache 优先逻辑保证已有 cache 不受影响
- **建议 6 SKIP_BAT**：默认 0 保持兼容，只影响显式设 1 的用户
- **重构报告建议 1/2/8 不做**：保护范式核心设计（单文件可移植 / 已有兜底 / 零占位符铁律）

---

### 2026-07-21 设计理念落地一致性整改决策

> 触发：用户要求"整理项目设计理念，确保落地实现与设计一致，目标技能 要能在实际项目中使用，运行时要真实使用不能是花架子，三平台自测回归集成测试"。
> 三路并行探查（运行时接线 / 全流程覆盖 / 跨平台兼容）后，3 项决策。

#### 决策 9：11 运行时半接线→真接线（OpenSpec/comet/gsd-core）—— ✅ 做

**问题**：探查发现 11 运行时里 4 个深度接线（GitNexus/graphify/claude-mem/ocr，precheck.sh 真实命令调用）、3 个半接线（OpenSpec/comet/gsd-core，self-check 能装但 precheck/hooks 不调用，靠 AI 自主用 slash）、4 个纯文档引用（superpowers/gstack/ECC/Ruflo）。与"整合 11 运行时"宣称有落差。

**决策**：把 3 个半接线提升为 CLI 真接线——OpenSpec 接进 check_requirements（`openspec validate --all --strict`）、comet 接进 state-machine guard_phase（`comet guard`）、gsd-core 接进 check_review（`gsd-tools validate health`，warn 级）。全部带 `has_*` 守卫 + 降级到自带载体，未装不阻塞。4 个纯文档引用保持方法论引用层，诚实标注不假装深度接线。

**理由**：用户明确选"提升半接线为真接线"。3 个运行时都有真实 CLI（本机实测 comet/openspec/gsd-tools 子命令），接线后目标技能 在装了这些运行时的项目里能真实调用其能力，不再是花架子。降级设计保护未装场景。

**fixture**：requirements-openspec（mock bin/openspec）、review-gsd（mock bin/gsd-tools）、state-machine comet guard 实测（mock bin/comet）。36 gate-fixture 全量验证无回归。

#### 决策 10：Windows 平台真实化（CI + .bat + 离线包）—— ✅ 做

**问题**：Windows 是虚假声称——CI 无 windows-latest、.bat 包装器从未测试、离线包 wheel 全是 macosx arm64 却叫 `-win`、.bat 的 WSL 路径转换有 bug（WSL 用 `/mnt/c/` 但 .bat 用 `/c/`）。

**决策**：
1. CI 加 windows-latest Job（bash -n + 61 fixture + 36 gate-fixture + .bat 烟雾测试）
2. 修 8 个 .bat 的 WSL 路径转换（`echo !BASH_CMD! | findstr /i "wsl"` 判断，WSL 用 `/mnt/c/`，Git Bash 用 `/c/`）
3. build-offline-win.sh（已废弃） 加多平台 wheel 下载（`pip3 download --platform macosx_11_0_arm64/manylinux2014_x86_64/win_amd64 --only-binary=:all:`）
4. UPSTREAM.md 补离线包平台覆盖说明

**理由**：用户明确选"补 Windows CI + 修离线包"。这是最实的虚假声称，必须让"三平台"名副其实。.bat WSL 路径 bug 是 bash 3.2 全角字符 bug 同类（平台相关沉睡），CI 实跑才能现形。

**风险**：Windows CI 可能暴露既有 bash 兼容问题——缓解：windows Job 初期 bash -n + fixture 双态 + .bat 烟雾，发现问题逐个修；不追求一次全绿，先让问题现形。

#### 决策 11：测试覆盖补齐（e2e + verifier + 36 gate-fixture 进 CI）—— ✅ 做

**问题**：CI 不跑 e2e、不跑 verifier、36 gate-fixture 只跑 6 组、shellcheck 只查 6 个脚本。验收体系（C1-C8）形同虚设——CI 不执行验收器。

**决策**：
1. CI 加 e2e Job（四框架注入全链路）
2. CI 加 verifier all Job（C1-C8 全量：fixtures + gate-fixtures + e2e + cli-ab + metrics-assert，timeout 15min）
3. run-verifier.sh 的 gate_fixtures 从硬编码 6 组改为全量遍历 36 组；CI 的 fixture-double-state Job 同步改全量
4. shellcheck 覆盖从 6 个脚本扩展到 18 个（含 verifier/v1/* + tests/* + state-machine.sh + offline 脚本）

**理由**：用户明确选"全补"。验收体系不进 CI 等于没有验收——本次让 C1-C8 真正生效。36 gate-fixture 全量覆盖所有门禁组（含 WP1 新增的 openspec/gsd fixture）。

**教训**：验收体系（verifier/）和 CI 长期脱节是组织缺陷——verifier 是 P1 重构时建的验收器，但只手动跑过（runs/ 留 7 个日志），从未进 CI。本次补齐后，任何门禁语义变更都会被 verifier all 的 cli-ab 逐字节等价断言抓住。

#### 决策 12：check_cognition 诚实化（不实装 fail 阈值）—— ✅ 做（2026-07-21 减重 WP-B）

**问题**：check_cognition 被 2026-07-20 审计自认"装饰性叙事"（0 个 fail() 调用、裸 `echo "⚠"` 不计 WARN_COUNT 不受 SILENT 控制、COGNITION_MAP 是死变量），作为 36 门禁之一账面虚增执法强度。

**决策**：不实装 fail 阈值（维持"刻意不重设计"的既有决策），做三点诚实化：
1. 函数入口明示性质：「认知体检报告（warn-only，永不 fail，不参与门禁否决）」
2. 裸 `echo "    ⚠"` 统一为 `warn()`（计 WARN_COUNT、受 SILENT 控制；④映射/①概念/②结构/第二层共 5 处）
3. 死变量 COGNITION_MAP 接入：_default_conf 补声明，④映射段配置且文件存在时纳入检查输入（不改变 /3 计分口径）

**理由**：审计已判定其实质是"只读体检报告"。诚实化 = 账面与实质一致，而非强行赋予它不具备的执法语义。装 fail 阈值的风险（计分口径未经真实项目校准，误报即淹没）大于收益。

**联动**：同日 WP-A 合规 9 门禁拆出 --all-full 为 --compliance-suite（27+9），门禁总数 36 不变、函数不变，self-check 机械一致性断言不受影响。

#### 决策 13：断点续传否决令废止——draft 状态门替代一次性铁律（2026-07-21 减重 WP-H）

**问题**：决策档曾否决状态机断点续传（理由：违背零占位符铁律）。但该否决使生成流程成为 all-or-nothing——12 步管线必须一次走完，是范式"过重"的最大采用门槛；且长流程中断后只能整体重来。

**新论据**：原否决针对的是"断点续传 = 中途交付半成品"。状态门方案把"可中断"与"可交付"解耦：
1. 骨架 frontmatter `status: draft`（机器可识别），draft 期间 `--all-full`/`--compliance-suite` 被 precheck 禁用（exit 2）——半成品无法以"门禁全绿"伪装成交付物
2. `--mark-active` 以严格零占位符核验（--strict）为翻转前提——零占位符铁律从"流程纪律"升级为"状态迁移的机器准入"
3. 断点续传幂等（只补缺失文件，不覆盖已有内容），与 upgrade 路径语义清晰分离

**决策**：正式废止"断点续传违背零占位符铁律"的否决，以 draft/active 状态门替代。零占位符铁律的适用点从"流程结束"移到"draft→active 迁移"。

**联动**：WP-E 三档 profile（零占位符按档适用）+ WP-G 特征卡 P0/P1 分级（P1 可「（P1 待补）」，--mark-active 前清零）+ WP-A 合规门禁拆出（27+9）。

> **★活跃决策（2026-07-31 归档时标注）**：决策 13 仍是当前 draft/active 状态门行为的权威依据，主文件（现 §6.3）保留指针锚点。外部引用（state-machine.sh 等）指回本归档卷。

#### 决策 14：offline-cache 治理收口（2026-07-21 减重 WP-J）

**事实核查**：git 索引内 offline-cache 实际只剩 UPSTREAM.md（8KB）——whl/tgz/zip 自 v2026.07.20 起已迁 GitHub Release 附件（install-offline-win.sh 的降级链自动下载），196MB 均为本地 ignored 内容。根 .gitignore 旧注释"已故意纳入 git 跟踪"是迁移前的表述残留，与 swarm-yuan/.gitignore 矛盾。

**决策**：
1. 根 .gitignore 矛盾注释重写（指向 Release 迁移事实与 fetch 脚本）
2. 新增 scripts/fetch-offline-cache.sh（从 Release v2026.07.20-offline 拉取，已存在跳过，失败附手工指引）
3. 无索引手术可做（索引早已只有 UPSTREAM.md）——本项为表述与工具收口，非新决策方向

#### 决策 15：连贯动作理念落实——generate-skill 真生成 settings/.mcp + fail 诊断 + state-machine auto（2026-07-21）

**问题**：设计理念 1（连贯动作）3 处虚假——SKILL.md Step 9 宣称生成 settings.local.json/.mcp.json 但 generate-skill.sh 不生成；precheck fail 仅 exit 1 无诊断修复建议；state-machine guard 占位直接 pass、transition 需显式传阶段。

**决策**：
1. generate-skill.sh create + upgrade 段真生成 settings.local.json（最小权限模板）+ .mcp.json（MCP server 接入模板，默认空 mcpServers，AI 按已装运行时激活）
2. precheck.sh fail() 收集 FAIL_IDS + _fix_suggest 映射表（30+ 常见 fail id → 建议文案）+ --fix-suggest 子命令（只输出建议不 exit 1）
3. state-machine.sh guard_phase 实装产出物检查（design 查 proposal.md/SPEC_FILE、verify 查 tasks.md 全勾）+ auto 子命令（自动判下一阶段 + guard + transition，免去记阶段名）

**理由**：用户要求"连贯动作落实"。3 处虚假让"一键全流程"名不副实。修复后生成器真产出全套配置、fail 有修复建议、状态机自动流转。

**边界**：fail 修复建议只建议不自动执行（与"用户决策"原则一致）；auto 不跳过 guard（守卫仍检查产出物）；settings/.mcp 是模板带占位符由 AI 填充（配置模板允许占位符，--verify-completeness 不扫这两文件）。

#### 决策 16：全链路追踪理念落实——trace-log 孤儿转真接线（2026-07-21）

**问题**：设计理念 2（全链路追踪）3 处虚假——trace-log.sh 功能完整但 precheck/state-machine/generate-skill/self-check 四脚本无一处调用（孤儿）；9 个第三方工具调用点调用前无公告、空结果时静默；探查阶段无进度提示。

**决策**：
1. precheck.sh _gate_exec 门禁级接 trace-log（每门禁 started + done/fail/warn/pass 双状态，输出 stderr 不污染 stdout/cli-ab）
2. 新增 trace_tool() 辅助函数，9 个工具调用点（gitnexus query/trace/detect_changes、graphify explain、ocr review、claude-mem search、openspec validate、gsd-tools validate health、comet guard）调用前各加一行 trace_tool
3. check_layer 空结果加 pass（修静默：gitnexus 无跨层问题时不再完全静默）
4. state-machine.sh / generate-skill.sh 各接 trace_tool（comet guard / create / upgrade / inject / verify）
5. SKILL.md Step 1 探查进度 prompt 补强（三路子代理每路启动前调 trace-log）

**理由**：用户要求"全链路追踪落实"。trace-log 设计正确却自己是孤儿是最大虚假。修复后每步调用有 `→ [节点] 调用 actor · tool（status）` 公告 + trace.jsonl 落盘。

**边界**：trace 输出 stderr（stdout 纯净不破坏 cli-ab 逐字节等价）；trace-log 落盘失败仅 warn 不阻塞主流程；探查阶段进度靠 prompt 约束 AI（无脚本强制，因探查是 AI 行为非脚本）。

#### 决策 17：全局一致性收口——文档口径与实现对齐（2026-07-21）

**问题**：全局排查发现文档残留过时口径——acceptance-criteria.md 仍写 57 fixture/31 flag/六组（实际 61/36/全量 36 组）；USAGE.md "hermes-agent"（应为 agent 运行时）；README "11 步"（实际 13 节点 0~8）；README 目录树未列 settings.local.json/.mcp.json。

**决策**：
1. acceptance-criteria.md 全量更新：57→61、31→36、六组→全量 36 组、C3 补 Swarm-studio ABSENT、C4 补严格层/信息层分离、C8 补全量 36 组
2. USAGE.md 步骤表 5.5 补 settings.local.json/.mcp.json 生成；hermes-agent→agent 运行时
3. README（根 + swarm-yuan/）11 步→13 步；目录树后补"生成的目标技能含"清单（含 settings.local.json/.mcp.json）
4. 本决策 15/16/17 记录入 paradigm-decisions.md

**理由**：用户要求"全局排查并彻底完成"。文档口径与实现脱节会让外部观察者误以为"全是空壳"。本次把所有过时数字/术语/清单与当前实现对齐。



### A6. 框架规则引擎设计

> 79 框架规则引擎选型设计（方案 A）。（历史原文，不再单独维护）

> **归档标注（2026-08-21 v3 整合）**：本档案已并入本文档 §6.1 §4-§6（探查/约束/演化，原 docs/DESIGN.md）——单一设计事实源现为本文档 §6.1；本段保留为历史原稿（不再单独维护，内容以 §6.1 为准）。



> 日期：2026-07-17 ｜ 分支：`feat/framework-rules-engine` ｜ 状态：待评审
> 解决问题：实测中 swarm-yuan 生成的目标技能 对特定开发框架（lombok、spring-batch、mybatis、sharding-jdbc 等）适应性不足——框架知识是否产出、产出多深、门禁有无实现，全凭生成时 AI 临场发挥，质量不可控。

### 1. 背景与根因诊断

swarm-yuan 在 commit `6114ad8` 已建立 v1 框架适配（§C+.0.5 框架探查 + 20 个框架规则集 + precheck.conf 框架变量段），但存在 5 个断层：

| # | 断层 | 证据 |
|---|------|------|
| 1 | **门禁断层**：precheck.conf 定义了 ACTIVE_FRAMEWORKS 等 8 个框架变量，但模板 `assets/precheck.sh` 完全未消费（0 处 framework 匹配） | 生成时门禁全靠 AI 即兴手写。ncwk-dev 碰巧手写了 28 项检查（`_fw_vue_check` 等），Java 项目生成时无章可循 |
| 2 | **产物断层**：`framework-knowledge.md` 不在六段式模板内（template-spec.md / generate-skill.sh / SKILL.md 均未提及） | ncwk-dev 的该文件是生成时即兴发明，是否产出、多深全凭运气 |
| 3 | **深度断层**：domain-knowledge.md 每框架仅 5-6 条"分析起点"规律 | 无最低深度标准（枚举/约束/门禁/领域知识四要素不齐）、无 §C+.1 式计数核验 |
| 4 | **覆盖断层**：仅 20 个框架规则集，偏 Java 后端 + 少量前端 UI 库 | 缺 NestJS/Express/Fastify/Django/Flask/FastAPI/Gin/Gorm/Angular/Next.js 等；Java 侧缺 Spring Cloud/Security/JPA/MapStruct/XXL-Job/Seata/Sentinel；数据侧缺 Kettle/Flink/Paimon |
| 5 | **验证闭环断层**：生成流程 Step 12 最终检查不含框架适配验证；`--domain` 门禁只 grep"因为/证据"关键字 | 框架维度错配/浅填充无法被自动发现 |

**根因一句话**：ncwk-dev 的高质量框架适配是"那次生成时 AI 认真即兴手写"的产物，范式本身没有把它制度化。

### 2. 设计目标与验收标准

#### 2.1 目标（用户已确认）

- **落点**：改 swarm-yuan 范式仓库（本分支），并用增强后的范式 `--upgrade` 回灌已生成的 ncwk-dev（作为升级路径的实测验证）
- **深度标准**：每个激活框架**四要素齐备 + 量化门槛**——①特定构件枚举（带计数核验）②开发约束（写入 dev-guide §10）③门禁实现（precheck.sh 真实代码，非占位）④领域规律（≥10 条带代码证据）。缺一项 = 生成未完成
- **覆盖**：全栈均衡 ~56 框架（见 §6）
- **调研方式**：联网调研官方文档 + 版本区间标注；规律标注适用版本；无法确认的标"待验证"而非臆造

#### 2.2 非目标

- 不改动 swarm-yuan 的 26 门禁总体结构与五层认知框架
- 不追求框架数量凑整；质量门槛（≥10 规律/框架）优先于数量
- 不在生成时联网（规则库全内置，离线可用）；联网调研只发生在范式自身维护时

### 3. 总体架构与数据流（方案 A）

新增两个库 + 改造七个既有文件：

```
swarm-yuan/
├── references/frameworks/          ★新增：框架规则库（~56 个 .md，每框架 1 文件）
│   ├── _template.md                   规则文件模板（六段式，见 §4.1）
│   ├── mybatis.md / spring-batch.md / lombok.md / sharding.md / ...
├── assets/framework-gates/         ★新增：门禁片段库（~56 个 .sh，每框架 1 片段）
│   ├── mybatis.sh                   含 _fw_mybatis_check() 真实实现
│   └── ...
├── assets/precheck.sh              改造：内置 check_framework() 调度器 +
│                                    _fw_resolve_globs/_fw_grep_count 公共函数
│                                    （从 ncwk-dev 反哺的已验证实现）
├── assets/precheck.conf            改造：框架变量段通用化（约定式命名，见 §5.4）
├── scripts/generate-skill.sh       改造：新增 --inject-frameworks 注入逻辑
├── references/exploration-guide.md 改造：§C+.0.5 信号表迁移为索引，指向规则库
├── references/domain-knowledge.md  改造：20 框架段瘦身→索引，指向 frameworks/
└── references/template-spec.md     改造：framework-knowledge.md 正式入六段式模板
    SKILL.md                        改造：六段式表格 reference 行补 framework-knowledge.md
```

生成时数据流：

```
§C+.0.5 框架探查 → ACTIVE_FRAMEWORKS=[mybatis, lombok, sharding, ...] + 各框架版本号
   ↓
逐框架读 references/frameworks/<fw>.md（Step 4.5 框架深化）
  ①信号确认 ②执行构件枚举命令(计数核验) ③规律种子→项目代码验证→实例化(附证据)
   ↓
generate-skill.sh --inject-frameworks（Step 7.5，生成/--upgrade 共用，幂等）
  → assets/framework-gates/<fw>.sh 片段注入目标 precheck.sh 标记区块
  → 生成 references/framework-knowledge.md 骨架（规律种子，AI 实例化后填充）
  → precheck.conf 填充框架变量
   ↓
Step 12 验收闭环（四要素量化核验，不过 → 回 Step 4.5）
```

**ncwk-dev 反哺**：ncwk-dev 手写的 7 个框架检查函数（vue/naiveui/pinia/koa/socketio/vite/vitest）是已实战验证的实现，先反向收割进 `assets/framework-gates/` 作为片段库种子（仅补契约头注释），再经注入机制回灌 ncwk-dev——回灌零回归，片段库起步即有 7 个高质量样本。

### 4. 格式契约

#### 4.1 规则文件 `references/frameworks/<fw>.md` —— 六段式结构

```markdown
---
ruleset_id: mybatis
适用版本: MyBatis 3.5.x / MyBatis-Plus 3.5+（差异单独标注）
最后调研: 2026-07-17（来源：官方文档 3.5.19 / MP 3.5.12）
---

# <Framework> 规则集

## §1 探查信号（→ §C+.0.5 激活依据，含置信度）
| 信号类型 | 模式 | 置信度 |
| 依赖 | mybatis-spring-boot-starter / mybatis-plus-boot-starter | 高 |
| 注解 | @Mapper / @MapperScan / @TableName | 高 |
| 文件 | **/*Mapper.xml | 中（需排除他用） |
| 配置 | mybatis.mapper-locations / configuration: 节点 | 高 |

## §2 特定构件枚举（命令 + 计数核验方式）
- Mapper 接口 / XML 映射（计数核验基准）/ TypeHandler / 拦截器 / 分页插件 ...

## §3 领域规律（≥10 条，每条五要素）
### 规律：<标题>
- **适用版本**: 如"全版本"或"MP 3.5.7+"
- **规律**: ……
- **违反后果**: ……（尽量挂 CWE/官方 issue 依据）
- **验证方法**: 具体 grep/read 命令（即"代码证据"的采集方式）
- **对应门禁**: fw_<ruleset_id>_<rule>（fail/warn 级）或"人工检查"

## §4 门禁清单（id / 级别 / 实现逻辑 / 依赖 conf 变量）
| 门禁 id | 级别 | 实现逻辑 | 依赖变量 |
（门禁 id 命名规范：fw_<ruleset_id>_<rule>）

## §5 跨框架交互规则
| 交互对 | 规则 | 理由 |
（如 mybatis × sharding：DML WHERE 须含分片键；lombok × jpa：@Data 排除懒加载关联字段）

## §6 版本陷阱速查
| 版本 | 变化 | 影响 |
```

三条硬约束：

1. §3 每条规律**必须挂门禁 id 或标注"人工检查"**——不允许"写了规律但没有执法"
2. §4 每个门禁 id 必须在 `assets/framework-gates/<fw>.sh` 中有**同名实现**（命名一一对应，可被脚本机械核验）
3. §3 规律数 **≥10**；部分框架规律更成熟，门槛更高（如 spring-boot/mybatis/vue/react ≥15）。具体门槛由各规则文件头部 `深度门槛` 字段显式声明，未声明时默认 ≥10，避免歧义

#### 4.2 门禁片段 `assets/framework-gates/<fw>.sh` —— 注入契约

```bash
# ruleset: mybatis  requires_conf: MYBATIS_MAPPER_DIRS SQL_INJECTION_WHITELIST
# gates: fw_mybatis_dollar(fail) fw_mybatis_binding(fail) fw_mybatis_foreach(warn)
_fw_mybatis_check() {
  echo "  [mybatis] MyBatis 框架规律"
  # 实现只准使用：precheck.sh 公共函数（pass/fail/warn/
  # _fw_resolve_globs/_fw_grep_count）+ bash 3.2 兼容语法（三平台铁律）
  # 每条检查与规则文件 §4 的门禁 id 一一对应
}
```

**函数命名约定**：`_fw_<ruleset_id>_check`，其中 ruleset_id 的连字符转下划线（如 `spring-boot` → `_fw_spring_boot_check`）；片段文件名保留连字符（`spring-boot.sh`）。

注入机制（`generate-skill.sh --inject-frameworks`，生成/--upgrade 共用）：

- 目标 `precheck.sh` 内设标记区块 `# >>> swarm-yuan:framework-gates >>> ... # <<< swarm-yuan:framework-gates <<<`（仅目标文件有区块标记，片段文件自身不带嵌套标记），注入 = 幂等替换区块内容
- `check_framework()` 采用**动态分发**：遍历 ACTIVE_FRAMEWORKS，函数名经 `tr '-' '_'` 转换后用 `declare -f` 探测——存在则调用，**缺失则 fail**（探查到但没实现 = 范式缺陷，必须暴露）。无需重生成 case 分支，天然幂等
- 片段头部 `requires_conf` 注释被解析，自动核对 precheck.conf 是否声明对应变量，缺失则注入占位 + warn

#### 4.3 反哺与回灌的零回归保障

ncwk-dev 现有 `_fw_vue_check` 等 7 个函数**原样收割**为片段库种子（仅补契约头注释）；回灌 ncwk-dev 时其手写实现被同名片段**等价替换**（内容相同，仅位置迁入标记区块）。回灌后 `--all-full` 26 门禁 + `--framework` 检查项逐项比对，**只允许增多不允许减少**。

### 5. 流程改造与验收闭环

#### 5.1 生成流程 Step 增量改造

| 环节 | 现状 | 改造 |
|------|------|------|
| Step 4 §C+.0.5 框架探查 | 信号表 20 框架硬编码在 exploration-guide | 信号表迁移至各 `frameworks/<fw>.md §1`，exploration-guide 只留**信号汇总索引**（由脚本机械生成）；探查时**额外记录各框架版本号**（pom.xml/package.json/go.mod），用于规律版本区间匹配 |
| **Step 4.5（新增）框架深化** | 无 | 逐激活框架：读规则文件 §2 执行构件枚举+计数核验 → §3 规律种子逐条用项目代码验证（成立→实例化附证据；不成立→剔除并记录原因；区间外→标"待验证"）→ 产出填入 framework-knowledge.md |
| Step 7 填充 | framework-knowledge.md 不在模板 | template-spec.md 正式定义该文件：`--inject-frameworks` 生成骨架（规律种子），AI 在 Step 4.5 实例化后填充；**残留未实例化种子 = 占位符，零容忍** |
| **Step 7.5（新增）门禁注入** | 无（靠 AI 手写） | `generate-skill.sh --inject-frameworks`：片段注入标记区块 + 重生成 case 调度 + 校验 precheck.conf 变量声明 |
| Step 12 最终检查 | 无框架适配核验 | 新增**四要素量化核验**（见 §5.2） |

#### 5.2 验收闭环——四要素量化核验

对 ACTIVE_FRAMEWORKS 中每个框架逐项核验，任一不过 = 生成未完成（回 Step 4.5）：

| # | 要素 | 核验规则 | 核验方式 |
|---|------|---------|---------|
| 1 | **枚举** | 框架特定构件枚举计数 ≥ 实际计数 × 0.95（沿用 §C+.1 系数） | 重跑规则文件 §2 枚举命令 vs framework-knowledge/reference-manual 清单行数 |
| 2 | **领域知识** | framework-knowledge.md 该框架节规律数 ≥ 规则文件头部声明的 `深度门槛`（默认 10），100% 含"证据:"字段；0 条残留"待验证"种子 | grep 计数比对 |
| 3 | **门禁** | precheck.sh 含 `_fw_<id>_check` 函数；函数内检查项数 = 规则文件 §4 门禁清单条数；`--framework` 实跑该框架分支 exit 0 | grep 存在性 + 条数比对 + 实跑 |
| 4 | **约束** | dev-guide.md §10 含该框架约束段（≥3 条，每条标注来源规律 id） | grep 段标题 + 条数 |

`--framework` 门禁自身两处收紧：已激活框架但 `_fw_<id>_check` 函数缺失 → **fail**（动态分发，declare -f 探测）；ACTIVE_FRAMEWORKS 未配置但探查信号明显（如存在 `*Mapper.xml`）→ warn 提示"疑似漏配 <规则集>"。

#### 5.3 错误处理与边界

| 场景 | 处理 |
|------|------|
| 探查到框架但范式无对应规则文件（长尾框架） | 生成时 warn 明确列出"未覆盖框架清单"，写入目标技能 framework-knowledge.md §待补；**不静默跳过**；引导用户按 `_template.md` 贡献新规则集（扩展机制正式化） |
| 框架版本超出规律标注区间 | 该规律标"待验证"而非直接实例化；`--framework` 对"待验证"规律 warn（提示人工确认），不 fail |
| 片段注入冲突（用户手改了标记区块内代码） | 检测区块哈希与上次注入不符 → 暂停并要求用户裁决（遵守"疑虑必确认"），裁决结果记入 `.swarm-yuan-version` |
| 跨框架规则冲突 | 以规则文件 §5 交互段为准；framework-knowledge.md 中冲突规律须互相引用说明取舍 |
| 离线环境生成 | 规则库/片段库全内置，不依赖联网；联网调研只发生在范式自身维护时 |

#### 5.4 precheck.conf 变量段通用化

现有 8 个框架变量（MYBATIS_MAPPER_DIRS 等 mybatis/lombok/sharding/spring-batch 专用硬编码）改造为**约定式命名**：`<RULESET_ID>_<VAR>`（如 `MYBATIS_MAPPER_DIRS`、`VUE_FILE_GLOBS`、`KAFKA_TOPIC_PATTERNS`）。片段头部 `requires_conf` 声明依赖，注入时自动核对。既有 8 个变量保留兼容。

### 6. 框架清单（~56 个，按生态分组）

| 组 | 框架（ruleset_id） | 数量 |
|----|-------------------|------|
| **Java 核心** | spring-boot, spring-cloud, spring-security, spring-batch, spring-data-jpa, mybatis（含 MyBatis-Plus）, lombok, mapstruct, validation（hibernate-validator）, jackson, junit5-mockito | 11 |
| **Java 分布式/中间件** | sharding, dubbo, seata, sentinel, nacos, xxl-job, elasticsearch, netty | 8 |
| **数据集成/流计算**（新增组） | kettle（PDI ETL）, flink（含 flink-sql / flink-cdc 差异标注）, paimon（Apache Paimon 流式数据湖） | 3 |
| **MQ/缓存/调度**（已有，深化） | rocketmq, kafka, rabbitmq, redis, quartz, elasticjob | 6 |
| **数据库**（已有，深化） | mysql, postgresql, sqlserver | 3 |
| **Node 后端** | express, koa, nestjs, fastify, typeorm, prisma | 6 |
| **Python** | django, flask, fastapi, sqlalchemy, celery, pytest | 6 |
| **Go** | gin, gorm | 2 |
| **前端核心** | vue, react, angular, nextjs, nuxt | 5 |
| **前端 UI/工程** | element, antd, naiveui, vite, webpack, tailwind | 6 |
| **前端测试** | jest-vitest | 1 |
| **合计** | | **57** |

说明：

- 7 个（vue/naiveui/pinia/koa/socketio/vite/vitest）门禁实现从 ncwk-dev 反哺；socketio 可归入 Node 组，pinia 随 vue、vitest 随 jest-vitest 合并管理，最终数量以 **56±4** 浮动，不重凑数而重质量门槛（每框架 ≥10 规律）
- 现有 20 个规则集全部按新六段式模板重写深化
- kettle/flink/paimon 为用户指定补充（2026-07-17）：kettle 覆盖 ETL 作业/转换工程规律（kettle 已停止活跃演进，重点标注 Pentaho CE 9.x 与 Hop 分叉）；flink 覆盖 checkpoint/savepoint 状态语义、watermark、exactly-once 两阶段提交、Table API/SQL 与 DataStream 选型；paimon 覆盖主键表 Changelog 语义、Compaction、与 Flink 读写协同

### 7. 调研分批计划

每批：联网调研（官方文档/changelog 现行版本，2026-07 时点，来源 URL 记入规则文件头部）→ 写规则文件 + 门禁片段 → 自核验（四要素 + 片段双态测试）。

| 批次 | 内容 | 验收 |
|------|------|------|
| P0 | 基建：`_template.md` + precheck.sh 调度器/公共函数 + 注入机制 + conf 通用化 + **收割 ncwk-dev 7 片段** + 信号索引生成脚本 | 收割后 ncwk-dev 回灌零回归（26 门禁全 pass、`--framework` ≥28 项） |
| P1 | 实测踩坑组：mybatis, lombok, spring-batch, sharding（最高优先） | 每个过四要素核验 + 双态测试 |
| P2 | Java 核心其余 7 个 | 同上 |
| P3 | Java 分布式 8 + 数据集成/流计算 3（kettle/flink/paimon）+ MQ/缓存/调度深化 6 | 同上 |
| P4 | 数据库 3 + Node 6 + Python 6 | 同上 |
| P5 | Go 2 + 前端 12 + 流程/文档收尾（exploration-guide/domain-knowledge/template-spec/SKILL.md 改造） | 全量回归 |

### 8. 验证策略

#### 8.1 ncwk-dev 回灌验证（P0 后即做，范式首个实测）

1. 用新范式对 `/Volumes/nvme2230/lab/ncwk/.claude/skills/ncwk-dev` 执行 `--upgrade`
2. **零回归断言**：`--all-full` 26 门禁全 pass；`--framework` 检查项 ≥ 原 28 项；手写 `_fw_*_check` 内容等价迁入标记区块
3. **新能力断言**：framework-knowledge.md 转为新模板结构；`.swarm-yuan-version` 记录升级

#### 8.2 测试策略

- **门禁片段双态测试**：每片段配 fixture（1 个违例 + 1 个合规样本），断言 fail/pass 两态——P1 起每批附带
- **端到端 fixture**：构造迷你 Java 项目（pom.xml 含 mybatis+lombok 依赖 + 故意违例的 `*Mapper.xml` / `@Data @Entity`），跑完整生成流程，断言四要素核验全部触发且 `--framework` 按预期 fail
- **范式自兼容**：全部脚本遵守三平台兼容铁律（无 `declare -A`、`sed -i.bak+rm`、`grep -E` 等现有约定）
- 全程在本仓库 `feat/framework-rules-engine` 分支开发；**不自动推送 GitHub**，推送前做敏感信息脱敏检查

#### 8.3 风险与缓解

| 风险 | 缓解 |
|------|------|
| 56 框架调研量大，单批质量滑坡 | 每批独立验收（四要素 + 双态测试），不达标不进入下一批；P1 四框架先行验证模板合理性后再放量 |
| 规律版本区间过时 | 文件头"最后调研"日期 + 来源 URL；范式发布流程增加"规则库时效检查"（>6 个月 warn） |
| precheck.sh 注入后体积膨胀 | 片段仅在激活时注入目标技能；范式自身的片段库不影响运行时性能 |
| ncwk-dev 回灌回归 | P0 验收硬门禁：检查项只增不减，26 门禁全 pass |


### A7. 审计优化决策

> 审计轮优化决策记录。（历史原文，不再单独维护）

> **归档标注（2026-08-21 v3 整合）**：本档案已并入本文档 §6.1 §5/§7（约束+留痕，原 docs/DESIGN.md）——单一设计事实源现为本文档 §6.1；本段保留为历史原稿（不再单独维护，内容以 §6.1 为准）。



> 分支：`fix/audit-optimization`（已合入 main）｜ 触发：`/goal 全面分析 swarm-yuan skill，排查设计理念/实现机制/实现文件问题并迭代优化`
> 方法：4 个并行子代理审计（设计理念 / precheck 机制 / 生成器+生命周期 / 57 门禁+fixture），全部结论经主会话**独立复核**（读代码路径 + 实跑复现）后才处置。

### 审计结论总览

**算术骨架真实成立**（独立复核确认）：27 个门禁 flag ↔ 27 个 `check_*` 函数一一对应；核心 10 + 架构 17 = 27；precheck.conf = 146 变量；57 框架三件套（规则 md / 门禁片段 / fixture）1:1:1；32 领域；57/57 fixture 双态绿。

**但因果链在真实配置上被四类问题削弱**：① 沉睡/崩溃（set -e + pipefail + 空数组）；② 未配置门禁静默跳过，绿 ≠ 合规；③ 存在性门禁对范式自带模板自证；④ 文档头部数字无单一事实源 → 漂移。

### 已修复（5 批，均带验证）

| # | 严重级 | 问题 | 修复 | commit |
|---|--------|------|------|--------|
| 1 | CRITICAL | `check_shift_left` 三处 grep 缺 `|| true`，set -e+pipefail 下 `--all-full` 在 framework/test 门禁前中断（实测复现：输出停在「运维监控左移」，框架+测试门禁永不执行） | grep 管线末加 `|| true` | `61f2af6` |
| 2 | HIGH | `--all`/`--all-full` 分发循环中，单门禁 fail 路径非零返回（check_scope:339 等）触发 set -e，中断后续 8-9 个门禁 | 分发循环加 `|| true`（FAIL 全局仍正确汇总） | `61f2af6` |
| 3 | HIGH | 7 处空数组 `"${ARR[@]}"` 在 bash 3.2 崩溃（unbound variable），`_default_conf` 默认空数组时触发 | 改 `${ARR[@]+"${ARR[@]}"}` 防护 | `61f2af6` |
| 4 | MED | `check_stable_diff` glob 前缀 `%%` 最长匹配 bug（`paradigm-decisions.md` 已在 check_layer 修过的同款） | `%%` → `%` 最短匹配 | `61f2af6` |
| 5 | HIGH(fail-open) | `generate-skill.sh --inject-frameworks` 缺闭标记时 awk `skip=1` 到 EOF，静默删除区块后公共库+main 分发（无备份不可恢复） | 校验双标记，缺闭标记即中止不改动文件 | `61f2af6` |
| 6 | 文档漂移 | USAGE.md/PROMO.md 停留 14特征/25门禁/45变量/架构15/10运行时；SKILL.md 正文 10运行时（frontmatter 本就 11）；framework-signal-index 漂移（koa 缺 socket.io） | 全部同步至真值 16/27/146/11；索引重生成 | `2817185` |
| 7 | 机制 | `check_doc_consistency` 只 grep SKILL.md，抓不到 USAGE/PROMO 漂移；门禁函数计数 `[a-z]+` 漏数下划线（23≠27） | 新增跨文档数字一致性检查（从代码算真值扫散文）+ 索引时效检查 + 计数口径修复 | `2817185` |
| 8 | chore | Swarm-studio 通用文件过时（批次 1/2 修复未同步） | `SKILLS_PATH_REWRITE --upgrade` 重同步，恢复填充型文件，清理 backup/.bat | `d8568a8` |
| 9 | HIGH | verifier shellcheck 腿硬编码 `/mnt/agents/tools`，无 shellcheck 机器谎报 `SHELLCHECK_ERRORS 0` | 按 `$SHELLCHECK`→PATH→/tmp→/mnt 解析，均无则失败关闭报 `SHELLCHECK_UNAVAILABLE` | `7c8c69d` |
| 10 | HIGH | 修复 #1 移除崩溃掩盖后，ROLLBACK_KEYWORDS 的 `\|` 字面 bug 变成活跃误报（有回滚预案也 fail） | 单独修复 ROLLBACK_KEYWORDS 为 ERE 交替符（仅这个可达硬门禁；其余 4 处 warn-only 保留沉睡） | 本批 |

每批验证：`bash -n` 语法通过 + 57/57 fixture 双态绿 + e2e RC 0 + `--all-full` 最小 conf 实跑到 framework/test 门禁并正常汇总。

### 刻意不修（遵循范式「不贸然唤醒沉睡门禁」原则）

以下问题真实存在且为 HIGH，但修复会**改变门禁判定行为**，在无真实项目样本+fixture 覆盖的情况下，贸然修复可能「唤醒沉睡门禁 → 淹没真实项目误报」（`paradigm-decisions.md` 建议 1/2 的教训）。留作独立版本决策，每项需先补 fixture 再评估苏醒影响：

1. **五层认知基底是装饰性叙事**：`check_cognition` 含 **0 个 `fail()` 调用**（门禁永不 fail，仅对范式自带 spec-template 做关键词打分）；分数上限标注 `/11`（实际 14）`/19`（实际 22）错配。修复 = 重新设计该门禁的判定语义，不是改 bug。
2. **`\|` 交替符在 grep -E 下是字面**（5 处：ROLLBACK_KEYWORDS/BREAKING_DDL/METRIC/LOG/TRACE）：实测 `grep -ciE '回滚\|revert'` 对含两词的 spec 返回 0。**已部分修复**：ROLLBACK_KEYWORDS 经 `SPEC_FILE` 可达且是硬门禁，修复 #1 移除崩溃掩盖后实测会对「有回滚预案」的 spec 误报 fail（`✗ spec 无回滚预案声明`）——故单独修复为 ERE 交替符（见下「追加修复」）。BREAKING_DDL/METRIC/LOG/TRACE 四处是 warn-only 且已带 `|| true`，修复会让它们「苏醒」开始 warn（行为改变），按 `paradigm-decisions.md:31-36` 决策**保留沉睡**，留独立版本评估。
3. **存在性门禁对范式自带模板自证**：`--shift-left`/`--domain`/`--cognition`/`--impact` 在无项目 spec 时回退到 `assets/spec-template.md` 并对其空壳判 pass。`--reuse` 已修过同类（precheck.sh:830-836 注释），其余四处未修。
4. **SILENT 跳过洞**：`--all-full` 下未配置门禁静默消失（约 15 个），运行仍 conclude「✓ 门禁检查通过」，汇总不披露实际执行了几个。是「文档记录的设计」（precheck.sh:234），但汇总行过度声称。建议加跳过计数器（非破坏）。
5. **`check_link_depth` 兜底 GNU-only**（`grep -rzoP`，macOS/BSD 无效）→ pure_fwd 静默为 0（fail-open）；**madge 循环依赖 grep 可能永不命中**（verdict 走 stderr 被丢弃）。
6. **Swarm-studio 样例违反自家 v2 旗舰主张**：reference-manual §4 只 10 组件无签名/计数核验（README 称 15+），§6 用通配符 `/api/kanban/*`（template-spec 禁通配符），§9/辩证/领域段缺失；`precheck.conf:1` 硬编码作者机器绝对路径。修复 = 重填样例（内容工作，非 bug）。
7. **运行时数 9/10/11 三处漂移**（cognition-framework.md:116 说 9）——本次只统一了 SKILL/USAGE/PROMO 到 11；cognition-framework.md 的「9」涉及该文档自身叙事，留待确认是否同步。

### 遗留（低优先，未处置）

- `migrate_merged_frameworks` 写回多行 `ACTIVE_FRAMEWORKS` 会产生孤儿续行（MED，需非模板 conf 格式才触发）。
- `SKILLS_PATH_REWRITE` 会改写 self-check.sh 内运行时探测路径（MED，studio 实例 superpowers/ecc 检测受影响）。
- `state-machine.sh` 允许前向跳阶段（open→verify 守卫是占位 `pass`）。
- 5 个死 conf 变量（COGNITION_MAP/LOMBOK_ANNOTATIONS/TEST_DIR_PATTERNS/IMPL_DIR_PATTERNS/METRIC_ENDPOINTS）。
- 安装/自举层面：CI 从未对生成器仓库跑 27 门禁；26/27 非框架门禁无 fixture。

### 方法论备注

子代理审计的每条 HIGH/CRITICAL 结论，主会话都**独立复核**（读代码路径 + 写最小 conf 实跑复现）后才动手——子代理报告的「--all-full 中断」「空数组崩溃」「fail-open 注入」「USAGE 漂移」「认知门禁 0 fail」「\| 字面」六条全部经实跑确认属实。这避免了按二手报告误改门禁逻辑（本仓库的头号风险）。


### A8. 上游引入决策

> 上游运行时引入边界决策。（历史原文，不再单独维护）

> **归档标注（2026-08-21 v3 整合）**：本档案已并入本文档 §6.1 §3.3（接线）/§9.3（吸收边界）（原 docs/DESIGN.md）——单一设计事实源现为本文档 §6.1；本段保留为历史原稿（不再单独维护，内容以 §6.1 为准）。



> 日期：2026-07-20 ｜ 分支：`feat/standards-compliance`（P1-7）
> 记录 superpowers 核心插件 vendor 问题的正式决策与理由，供后续版本维护参考，避免重复调研。格式参照本文 §6.3 决策史。

### 处置总览

| # | 事项 | 决策 | 依据 |
|---|------|------|------|
| 1 | vendor superpowers 核心插件 v6.1.1 进 offline-cache | ❌ 不 vendor（维持 marketplace 元数据 + 空壳明示现状） | 本文件 §二 |
| 2 | 空壳误判治理（诚实检测 + 文案） | ✅ 已做（P0） | `self-check.sh` check_superpowers 实质检测、`offline-cache/UPSTREAM.md` §二 |

### 一、背景事实（2026-07-20 核实）

- offline-cache 内的 `superpowers/` 是 **superpowers-marketplace v1.0.13**（全目录仅 4 文件：`LICENSE`、`README.md`、`.claude-plugin/marketplace.json`、`.claude/settings.local.json`），核心插件 v6.1.1 本体不在包内；marketplace.json 以 URL source 指向 `https://github.com/obra/superpowers.git`（`docs/research/R5-upstream-local.md` §四，2026-07-20 本地实证）。
- 核心插件仓库 https://github.com/obra/superpowers ：**MIT** 许可证，最新 release **v6.1.1**（2026-07-02 发布；v6.0.0→v6.1.1 约六周内 5 个 tag）——GitHub REST API 实测，访问 2026-07-20。
- swarm-yuan 对 superpowers 的吸收是**文档级方法论引用**（14 个 skills 能力清单登记于 `swarm-yuan/references/subagent-orchestration.md:118-137`），不是运行时命令调用——`swarm-yuan/SKILL.md:108` 工具引用铁律的允许 CLI 清单（graphify/gitnexus/ocr/claude-mem/gsd-tools）不含 superpowers。
- P0 已完成诚实检测与文案：`scripts/self-check.sh` check_superpowers 实质检测（须含 `skills/` 子目录或 `.claude-plugin/plugin.json` 才判已安装；仅 marketplace 元数据判空壳 miss，fail-closed）；`scripts/install-offline-win.sh（已废弃，WP 瘦身后改用 Release 附件 + self-check install_from_src_release）:105` 文案改为「目录已复制，需在 Claude Code 中 /plugin enable」；`offline-cache/UPSTREAM.md` §二空壳明示。

### 二、决策理由

#### 1. zip 体积

offline zip 已 44MB（`docs/paradigm-decisions.md:49`）。核心插件含 20+ skills 本体及资源，vendor 将进一步膨胀 Release 附件；离线包的消费场景是 Windows 一次性落地 11 个运行时（`scripts/install-offline-win.sh:2,5-7`），体积直接决定分发成本。

#### 2. 维护面

vendor 即承担版本追踪与逐版重核义务。核心插件迭代快（v6.0.0→v6.1.1 约六周 5 个 tag），vendor 副本会立即开始漂移，须纳入本文 §6.4 上游基线审计例程；而 swarm-yuan 对 superpowers 没有运行时调用，vendor 不带来任何运行时收益——纯属为「文档级引用」背维护负担。

#### 3. 许可证

核心插件本身 MIT（允许再分发，保留 LICENSE 即可），不构成 vendor 障碍；但 marketplace 编目的 10 个插件各有独立 license（marketplace README 明示 "Individual plugins: See respective plugin licenses"），一旦开 vendor 口子，就须逐一核实并保留各子插件 LICENSE；elements-of-style 插件还内含 Strunk《The Elements of Style》(1918) 全文（美国公有领域，跨境分发宜标注来源与公版状态）。不 vendor 核心插件，即把许可证敞口收敛在 marketplace 元数据一个 MIT 文件上。

#### 4. plugin 生态

superpowers 的正规获取路径是插件市场在线安装（marketplace.json 的 URL source 机制本为在线拉取设计）；vendor 核心插件等于维护一份脱离市场更新通道的静态副本，与上游生态演进脱节。离线用户需要核心能力时的既定路径：在线环境 `/plugin install superpowers@claude-plugins-official`，或手动 clone 仓库并保留其 LICENSE（UPSTREAM.md §二已明示）。

### 三、风险与缓解

| 风险 | 缓解 |
|---|---|
| 离线用户误以为已装核心插件（空壳） | P0 已修：self-check 实质检测 fail-closed；install-offline-win.sh 文案不再宣称核心能力；UPSTREAM.md §二明示 |
| references 引用的 14 个 skills 能力离线不可得 | 接受。吸收物是方法论（已写进 references 供 AI 阅读），不依赖插件本体在场 |
| 未来 superpowers 能力变成运行时依赖 | 复审触发：若 `SKILL.md:108` 允许 CLI 清单新增 superpowers 系命令，或离线分发成为主要形态，重开本决策并连子插件许可证复核一并进行 |

### 不做的事（本决策明确）

- 不 vendor 核心插件 v6.1.1 及 marketplace 任何子插件
- 不改 install-offline-win.sh 的复制目标（仍复制 marketplace 目录，由实质检测兜底避免误判）
- 不逐版追 superpowers 更新（引用基线 v6.1.1 = 上游最新 release，本文 §6.4 状态 synced）


### A9. Q2 重量级审查

> 2026-08-19 分层实现评审报告。（历史原文，不再单独维护）

> **归档标注（2026-08-21 v3 整合）**：本档案已并入本文档 §6.1 §0 冲程三（机械 vs AI 边界，原 docs/DESIGN.md）——单一设计事实源现为本文档 §6.1；本段保留为历史原稿（不再单独维护，内容以 §6.1 为准）。

> **档案标注（2026-08-21）**：本档案已并入本文档 §6.1 §2.2（范式作为条件，原 docs/DESIGN.md）——内容以 §6.1 为准；本段保留为机械 vs AI 边界复盘历史原稿。


**评审背景**：Q2 报告（"机械门禁/脚本扫描破坏 AI 灵活性"）的深水区单独评审。WP-Q2-lite 已收
failure-detector 去重 + tone 软化 + trace-log --key-node 三件套，但还有三条更深的问题需要拍板。

**评审方法**：把 54 门禁按"机械信号 vs AI 判断"二分，给出三个维度（D1 探索式 / D2 假装可机器 /
D4 流程过度脚本化）的边界清单。

---

### D1：探索式 gate 移除/rewrite —— 哪些门禁应改为 AI 自觉判断

**判定原则**：门禁的输出是否确定可信？
- 可信（exit 0/1 与断言一致） → 保留机械
- 不可信（启发式/易误报/依赖工具版本） → 转 AI 自觉判断（advisory 级保留，不机械 run）

**转 AI 自觉判断的候选（advisory → 文档化提示，不再机械跑）：**

| 门禁 | 现状 | 问题 | 建议 |
|------|------|------|------|
| `check_cognition` | grep + wc -l 数 5 个维度 | 5 维度本质是认知框架清单，AI 读 reference 即可 | 转文档化（"检查 cognition 5 维度"），不再机械 grep |
| `check_consistency` | 术语↔代码 grep | 误报高（同名词多） | 保留但降为「提醒人工核对」模板 |
| `check_link_depth` | graphify/madge 深度 | 工具依赖重，未装降级统计纯转发函数 | 转可选（OFF=1 时不跑） |
| `check_diagram` | 检测 mermaid/plantuml | 启发式，AI 看图即可 | 转 AI 自觉判断 |
| `check_decision_audit` | decisions.jsonl 格式 | 格式机械可查，但"决策是否合理"是 AI 判断 | 保留格式校验，删"合理性"判断 |
| `check_state` | state.yaml 字段 | 字段机械可查，但状态是否合理是 AI 判断 | 保留字段校验 |
| `check_pr_quality` | 各种 wc -l + grep | 启发式强，AI 看 diff 即可 | 转 AI 自觉判断 |
| `check_operate` | HTTP/health-check 探活 | 探活机械可信，但"运营是否合理"是 AI 判断 | 保留探活，删"合理性"判断 |

**保留机械（信号可信，误报少）：**
- `check_layer` / `check_branch` / `check_security` / `check_sensitive` —— grep + 模式匹配确定
- `check_requirements` / `check_rtm` —— spec 结构化字段机械可查
- `check_test_evidence` / `check_review_record` / `check_release_sign` —— 文件存在性机械可查

---

### D2：taste vs mechanical —— 哪些门禁"假装可机器"

**判定原则**：fail/warn 是否每次都能指向真实问题？

**误报高的（应转 advisory 或重写信号）：**

| 门禁 | 误报成因 | 建议 |
|------|---------|------|
| `check_consistency_cross` | 术语↔代码 grep，同名词/缩写误报 | 转 advisory（已 advisory，但 warn 级别仍输出） |
| `check_stable_diff` | "稳定"标注 vs 实际改动 | 改 inventory-verify --stability-audit 接管（已做） |
| `check_adr` | ADR_DIR 不存在 fail 太硬 | 改 warn（已 advisory，但 ADR_DIR 还是 fail） |
| `check_framework` | 框架规则 grep 启发式 | 按 fw 分组，没装 fw 时跳过 |
| `check_knowledge` | 知识库存在性 + grep 规律 | 知识库缺失不算 fail，仅 warn |
| `check_sast_deep` | semgrep/lexical 启发式 | 未装时 warn，不 fail |
| `check_metrics` | 覆盖率/复杂度启发式 | 未配置时 skip_if_unconfigured |
| `check_crypto` | 加密配置 grep | 启发式强，AI 看代码即可 |
| `check_oss_eval` | SBOM/license 启发式 | 无 SBOM 工具时降级 |
| `check_docs_pack` | 文档存在性机械可查，但"文档质量"是 AI 判断 | 保留存在性，删质量判断 |

**taste 类（AI 判断，不应机械化）：**
- 组件复用是否重复造轮子（AI 看语义，不只 grep 重名）
- 架构决策是否合理（ADR 质量）
- spec 是否清晰可执行（不是结构化字段就能保证）
- 测试是否覆盖关键路径（不是文件存在性）

---

### D4：生成流程过度脚本化 —— 哪些环节应让 AI 判断

**现状**：generate-skill.sh 17 步骨架创建 + 8 节点 workflow + state-machine.sh 阶段追踪。
**问题**：有些环节是"AI 应该自己判断"（非机械流程），但目前脚本化了。

**应让 AI 判断的环节：**

| 环节 | 现状 | 问题 | 建议 |
|------|------|------|------|
| Step 2 特征卡提取 | extract-feature-cards.sh 机械 | 17 项特征卡本质是 AI 阅读 spec 后的判断 | 脚本只做"模板化输出"，特征值 AI 填 |
| Step 4 组件库清单 | inventory-verify 机械计数 | 已硬化（WP-Q1A）防幻觉 | 保留现状 |
| Step 5 conf 填充 | conf-render.sh 嗅探+模板 | 嗅探机械可信，但"是否需要该门禁"是 AI 判断 | conf-render 出初稿，AI 审 |
| Step 6 框架深化 | framework-evidence 机械 grep | 框架规律本质是 AI 对项目代码的理解 | 机械只做"证据存在性"，规律实例化 AI 做 |
| Step 7 hooks/commands 生成 | generate-skill 模板化 | 模板固定，但"目标技能 是否需要这些 hooks" 是 AI 判断 | 默认全开，AI 删 |

**保留机械的环节（确定性高）：**
- 骨架创建（generate-skill.sh 文件复制+占位符）—— 纯机械
- precheck.conf 模板渲染（conf-render.sh）—— 嗅探+模板机械
- 占位符清零（verify_completeness）—— 机械 grep
- 状态门（--mark-active）—— 机械规则
- 门禁分级 enforce_level 加载 —— 机械 conf 读

---

### 综合建议（不动代码，仅评审结论）

1. **advisory 档 15 个门禁里，5 个转 AI 自觉判断**（cognition/diagram/pr_quality/consistency/link_depth 中的"质量判断"部分），其余 10 个保留机械信号但删掉"合理性"判断（只报存在性/格式）。
2. **warn 档 25 个门禁里，7 个降级为 advisory**（consistency_cross/stable_diff/framework/knowledge/sast_deep/metrics/crypto），避免误报打断主流程。
3. **strict 档 20 个门禁不动**——这 20 个信号可信、误报少，机械运行合理。
4. **生成流程**保留机械骨架创建 + conf-render + verify_completeness + mark-active + enforce_level；特征卡提取/框架规律实例化/hooks 选择这三个环节转"机械出初稿 + AI 审"模式。

**下一步**：
- 用户拍板是否进入实施（Q2-heavy D1/D2/D4 改造）
- 若实施，预计 4 个 worktree（advisory 降级 / warn 降级 / 生成流程 AI 化 / 文档同步）
- WP-Enforce2/3 待 Q2-heavy 结论（若 advisory 大量降级，Enforce2/3 需要重新评估范围）


### A10. 运行时升级 2026-07

> 2026-07 运行时升级差异报告。（历史原文，不再单独维护）

> 本报告记录 `swarm-yuan/research/` 下 11 个外部运行时仓库的对齐情况：6 个升级到最新稳定版，5 个已最新。每个升级项附功能差异与**整合建议**（建议的落地情况见 §3"整合吸收落地清单"）。
>
> 口径：本报告是留底文档，不进 `facts.conf` 单一事实源（运行时版本号不在 catchphrase 口径内）。运行时仓库本身是 `research/` 下未追踪的嵌套 git 仓库，升级不产生 swarm-yuan 自身的 git diff--本报告是升级的唯一留底。

### 1. 升级总览

| 运行时 | 接线层 | 旧版本 | 新版本 | 范围 commit 数 | 状态 |
|---|---|---|---|---|---|
| claude-mem | 深度接线 | v13.11.0 | v13.12.4 | ~6 个 release | ✅ 升级 |
| graphify | 深度接线 | v0.9.19 | v0.9.27 | 108 | ✅ 升级（origin/v8 线性路径）|
| gsd-core | CLI 接线 | v1.7.0 | v1.8.0 | 91 | ✅ 升级 |
| open-code-review | 深度接线 | v1.7.12 | v1.7.17 | 67 | ✅ 升级 |
| ruflo | 方法论引用 | v3.32.4 | v3.32.9 | 8 个修复 | ✅ 升级 |
| superpowers | 方法论引用 | v6.1.1 | v6.2.0 | SDD 重构 + 压缩扫荡 | ✅ 升级 |
| ECC | 方法论引用 | v2.0.0 | v2.0.0 | -- | ⊙ 已最新 |
| comet | CLI 接线 | 0.3.9 | 0.3.9 | -- | ⊙ 已最新 |
| gitnexus | 深度接线 | v1.6.9 | v1.6.9 | -- | ⊙ 已最新 |
| openspec | CLI 接线 | v1.6.0 | v1.6.0 | -- | ⊙ 已最新 |
| gstack | 方法论引用 | （无 tag）| （无 tag）| -- | ⊙ 已最新（main 跟随）|

#### graphify 版本路径说明（重要）

`research/graphify` 存在两条无共同祖先的谱系：
- **v0.9.x 线**（`origin/v8`，生产主线）：40 语言 / 10+ IDE 平台 / strict PreToolUse hook / vs mem0/supermemory 基准。本次升级路径 v0.9.19 -> v0.9.27，`git merge-base v0.9.19 v0.9.27 = v0.9.19`，108 个 commit，2026-07-18 ~ 2026-07-26。
- **v1.0.0 线**（commit `0a31c08`，不在 `origin/v8`）：13 语言 / 单平台 / "Karpathy /raw folder" 框架，2026-04-05（比 v0.9.19 旧 3 个月），是独立且更不成熟的并行代码库。

**本次取 v0.9.27（v0.9.x 线），不取 v1.0.0**。理由：v1.0.0 与 v0.9.19 无共同祖先（`git merge-base` 返回空），是异源旧分支；取它会丢失当前生产线的 40 语言/10 平台能力。

### 2. 逐项功能差异

#### 2.1 claude-mem（v13.11.0 -> v13.12.4）

**核心用途**：Claude Code（及 Codex/Cursor/Antigravity CLI/Windsurf）的持久记忆压缩系统--自动捕获工具使用观察、生成语义摘要、通过 hooks（捕获）+ worker 服务（压缩）+ Chroma 语义搜索（检索）跨会话可用。

**新功能**：
- **v13.12.0 双车道云同步（SyncHub，PR #3333）**：6 阶段同步架构--(P1) 每用户 Cloudflare Durable Object 同步枢纽 `workers/sync-hub`；(P2) 客户端 apply 路径 + schema 迁移 v41；(P3) 枢纽 push/pull 传输 + mutation outbox（持久本地变更队列，离线/重试存活）；(P4) advisory WebSocket 速度层（"正确性从不依赖 socket 存活"）；(P5) 护栏 + 监控（kill switch / watchdog / canary / 全同步矩阵 E2E）；(P6) canonical v2 projection pipeline。**默认关闭**（`CLAUDE_MEM_CLOUD_SYNC_HUB_URL` 空）。
- **v13.11.0 worker 原生云同步（PR #3182）**：独立 `cloud-sync.mjs` daemon 退役，worker 自身同步记忆；schema v40 自修复。
- **v13.12.2 `docs/merge-rubric.md`**（新工件）：bug-fix PR 的验收门槛，从 54-PR 合并扫荡中提炼。
- **v13.12.2 54 社区 bug-fix PR 合并**：根因修正 ONLY，拒绝 guards/circuit-breakers/fallbacks/retries/fail-open/self-healing/truncation。

**关键修复**：
- **v13.12.1 版本 oracle 单源**：4 个 worker-script resolver 改为按**版本排序、永不按 mtime**，共享一个确定性 version oracle。此前 mtime 排序导致重启风暴（一天 2,424 次回收）。
- **v13.12.3 SIGKILL-the-corpse**：hook 不再委托垂死 worker 回收自己；版本不匹配时 hook 自身读 PID 文件 -> `SIGKILL` 旧 worker -> 等端口关闭 -> 自己 spawn 新版本。垂死 worker 的 successor handoff 仅服务 CLI 发起的 `claude-mem restart`。

**行为变更/弃用**：无顶层 CLI 子命令变化；技能集字节级不变（18 skills）；`/cloud-sync` skill 为 SyncHub 重写。

**整合建议**（落地见 §3.6）：
1. "单一 version oracle、永不按 mtime 排序"作为 self-check 断言（G10）--选版本/候选的路径必须用全序（version > capability > lexical）。
2. Merge Rubric 作为反模式门禁模板--拒绝"survive 失败而非 correct 根因"的 generated gate/skill。
3. 两车道同步（持久 outbox + advisory 快路径 + kill switch/watchdog/canary）作为多运行时/多设备同步模式参考。
4. SIGKILL-the-corpse 作为子代理/进程编排的生命周期模式--回收 stale worker 时由 supervisor 而非垂死进程 own kill+respawn。

#### 2.2 graphify（v0.9.19 -> v0.9.27）

**核心用途**：AI 编码助手的知识图谱构建器--`/graphify` 把项目（代码经 tree-sitter AST，文档/PDF/图片/视频经 LLM 语义 pass）映射为可查询图（`graph.json` + `graph.html` + `GRAPH_REPORT.md`）。查图而非 grep 文件。每条边标 `EXTRACTED`/`INFERRED`/`AMBIGUOUS`。本地优先（代码解析不用 LLM）。

**新功能**（v0.9.20-27）：
- **v0.9.27 C# 命名空间感知成员调用解析**（#1609）：typed receiver 经 `using`/scope 解析，`base.`/`this.field` receiver，经 `inherits` 链的继承成员查找。JS/TS 非相对 import 经 `jsconfig.json`/`tsconfig.json` `baseUrl`/`paths` 解析（#2153）。Python 装饰器创建图边（#2154）。
- **v0.9.26 Windows hook 重建超时武装**（#2148）：`threading.Timer` fallback（Windows 无 SIGALRM），`GRAPHIFY_REBUILD_TIMEOUT` 不再是静默 no-op。Bash `source` 文件调用得到 `calls` 边（#2141）。
- **v0.9.25 协议改 MIT -> Apache 2.0**（显式专利授权 + 专利报复 + 贡献条款；MIT 保留为 `LICENSE-MIT`）。移除死代码 `.graphifyinclude`（#2112）。
- **v0.9.24 MCP `get_neighbors`/`get_community` 遵守 `token_budget`（默认 2000）**，截断在顶部宣告（#2069）。
- **v0.9.23 `graphify path`/MCP `shortest_path` 确定性 + 每跳真实关系标注**（#2074）。`query` 不再丢弃超预算答案（种子按跳距排序，命名种子始终先渲染）。
- **v0.9.22 `graphify god-nodes` CLI 子命令**；`--output` 作为 `--out` 别名（#2004）。
- **v0.9.21 Ollama 自动检测 `OLLAMA_HOST`**（不仅 `OLLAMA_BASE_URL`）（#1940）。Barrel re-export 链解析（#1983）。
- **v0.9.20 graphify-first nudge 匹配 Claude Code 的 Grep 工具**（不仅 Bash）（#1986）。

**新 CLI/标志/hook**：新子命令 `graphify god-nodes`/`god_nodes`；新别名 `--output`；新 MCP 参数 `token_budget`；新 env `OLLAMA_HOST` 检测；`GRAPHIFY_REBUILD_TIMEOUT` 在 Windows 实装。strict PreToolUse hook（v0.9.19 引入，本范围细化）：`graphify install --project --strict` 装一个 PreToolUse hook，首次原始源码读取时 `permissionDecision: "deny"` 重定向到 `graphify query`，然后降级为软 nudge；每会话至多触发一次；fail open。

**行为变更/弃用**：协议 MIT -> Apache 2.0（向后兼容）；移除 `.graphifyinclude`（用 `.graphifyignore` 的 `!` 否定）；安装器不再覆盖不可解析的 settings 文件；`graphify uninstall` 不再删除用户自写的 `### graphify` 段。

**整合建议**（落地见 §3.3）：
1. **honest-edge provenance（EXTRACTED/INFERRED/AMBIGUOUS）作为记忆模式纪律**--每条 swarm-yuan 写回的记忆/断言应带溯源标签，`graphify diagnose` 对无源证据的 code-typed 节点标 `verification: "unverified"`。直接可移植的反幻觉机制。
2. **prompt-fingerprinted cache namespacing**--语义缓存条目按提取 prompt 的 fingerprint 命名空间化，prompt 变更只失效受影响条目。可移植到 swarm-yuan 的 cached 探查/分析。
3. **atomic-write + shrink-guard + fail-closed 作为工件完整性模式**--JSON 工件写临时文件再 `os.replace`；shrink guard 拒绝用更小的不完整图覆盖更大的完整图；不可解析文件 fail closed。
4. **token-budgeted、truncation-announced MCP/子代理输出**--每个工具/子代理响应声明 token 预算、按查询相关性排序、被查询目标保证不被截断、顶部宣告截断内容。
5. **strict PreToolUse "deny-then-downgrade" hook 模型**--hook deny 首次原始读取、重定向到结构化查询、然后降级为软 nudge、每会话至多一次、fail open。比 advisory `additionalContext` 更高带宽的门禁模型。

#### 2.3 gsd-core（v1.7.0 -> v1.8.0）

**核心用途**：GSD Core（"Git. Ship. Done."）是上下文工程 + spec 驱动开发框架，驱动 AI 编码代理经 5 步阶段循环：**Discuss -> Plan -> Execute -> Verify -> Ship**。通过在 fresh-context 子代理中跑重研究/规划/执行、保持主会话精简、结构化工件（STATE.md/CONTEXT.md）跨会话存活来解决上下文腐化。

**新功能**（91 commits）：
- **可逆性评级（reversibility tagging，#1951）**：plan 记录 `<reversibility rating="reversible|costly|one-way">`；`one-way` 自动插 `checkpoint:decision`；`costly` 标记但不阻断；"不确定时按 reversible"避免 checkpoint 疲劳。`--no-reversibility-gates` 覆盖。
- **`<precondition>` 任务元素（Design by Contract，#1949）**：任务前可选元素，未满足则 halt with `checkpoint:human-verify`。与后置条件（`<verify>`/`<done>`/`<acceptance_criteria>`）+ 不变量（`must_haves.truths`）配合。
- **破窗台账（broken-windows ledger，#1950）**：`WINDOWS.md` 工件跨阶段累积 stubs/TODOs/skipped tests/unrun verifies/unmet truths；`/gsd-ship` **在有 open 条目时阻断**（`ship:pre` 门禁，`artifact-frontmatter-equals` 谓词 on `open_count == 0`）。新 `gsd-tools windows status|append|waive|fixed` 子命令。
- **tracer-first planning 默认（#1945）**：每个 plan 默认 LEAD 一个生产质量端到端"tracer"切片；post-tracer 反馈门禁 halt-on-fail（自治）或 `checkpoint:human-verify`（交互）。
- **gsd-debugger 可靠性套件（Epic #1957）**：多信号 fix-acceptance 护栏（5 信号：目标测试 + mutation check Stryker + no-op/behavior-deleting detector + adjacent/held-out tests + revert-and-reconfirm）；Spectrum-based fault localization（Ochiai，#1959）；RCA 分支（fishbone + AND-gate，#1960）；bug-taxonomy 分类 + 策略路由（Bohrbug/Heisenbug-Mandelbug/Concurrency，#1961）；regression-test hardening PBT（#1962）；blameless-postmortem Prevention block（#1963）；semantic KB recall via MemPalace（#1964）。
- **Claude orchestration capability（BETA，默认关）**：采用 Claude Code 的 Workflow 工具（`/effort ultracode`）作为可选并行执行后端。
- **Honest verifier**：verify-phase 对非可推断的 `backstop` truths 弃权（不 false-pass）；直接跑声明的 probe 脚本（不信 SUMMARY 自报 PASS）；阻断 phase-modified 源文件含未追踪 `TBD`/`FIXME`/`XXX` 债务标记前进。

**新 CLI/标志**：`gsd-tools windows status|append|waive|fixed`；`gsd-tools claude-orchestration detect-backend|emit-workflow`；`gsd-tools state rebuild`；`--no-reversibility-gates`、`--no-tracer`、`--failure-class`。

**行为变更/弃用**：移除 Gemini CLI 运行时（"用 Antigravity CLI 代替"）；验证 staleness 改用 git commit time（非 fs mtime）；ReDoS 加固；phase-directory 解析对跨项目碰撞 fail loud。

**整合建议**（落地见 §3.1、§3.2）：
1. **reversibility-tagged 决策门禁**--把 `reversible/costly/one-way` 三级作为决策属性：one-way 决策自动升级到 UserChallenge（需人工 checkpoint）。
2. **broken-windows ledger 作为跨阶段 ship 门禁**--`WINDOWS.md` 风格缺陷登记，ship 前任何 open 条目阻断。
3. **multi-signal fix-acceptance 护栏（反过拟合）**--5 信号门禁，尤其"revert-and-reconfirm"信号捕捉只因偶然状态通过的修复。
4. **bug-taxonomy-routed debugging**--先分类失败类（Bohrbug/Heisenbug/Concurrency），再经显式表路由技术；SBFL 在 Heisenbug 上明确禁止（flaky 谱毒化排名）。
5. **honest-verifier 弃权 + 债务标记阻断**--对非可推断 truth 弃权而非 false-pass；直接跑 probe 脚本；阻断含未解 `TBD`/`FIXME`/`XXX` 的前进。

#### 2.4 open-code-review（v1.7.12 -> v1.7.17）

**核心用途**：OpenCodeReview（`ocr`）是 AI 驱动的代码审查 CLI（阿里巴巴内部工具开源）。读 Git diff，把变更文件发给可配置 LLM（经带 tool-use 的 agent），生成行级精度结构化审查评论。核心理念：**确定性工程 × agent 混合**--硬约束（精确文件选择、智能文件捆绑、细粒度规则匹配、外部定位/反思模块）处理"绝不能错"的；agent 处理动态决策与上下文检索。

**新功能**（67 commits）：
- **原生 OpenCode 集成（#498）**：`@opencode-ai/plugin` TS 插件，注册 `ocr_review` + `ocr_health` 工具 + `ocr-review` slash command。支持 `preview=true`（仅列将审查文件不用 LLM）。
- **iFlytek Spark 内置 LLM provider（#485）**：OpenAI 兼容端点。
- **GraphQL（.graphql/.gql）allowlist + 规则（#491）**：schema 演进/破坏性变更/命名/资源限制规则。
- **Julia（.jl）allowlist + 规则（#501）**：排除 Pkg `test-dir` 约定。
- **Rust 宏正确性检查（#475）**：`macro_rules!`/proc-macro 脚枪--`$expr` 双求值、缺 `$crate::`、未括号展开优先级、proc-macro panic 而非 `compile_error!`。仅在宏被定义时触发（保持精度优先）。
- **PO/Pot 代码审查规则（#404/#406）**：gettext `.po` 翻译文件 + `.pot` 模板。
- **Gerrit CI 集成示例（#401）**：stdlib-only `post_review.py`，一次批量 Gerrit POST。
- **Windows `install.ps1`（#397）**：校验和验证的一行安装。

**新 CLI/标志**：OpenCode 插件参数（`from`/`to`/`commit`/`resume`/`exclude`/`model`/`concurrency`/`timeoutMinutes`/`maxTools`/`maxGitProcesses`/`preview`）；新 slash command `ocr-review`；`--end-of-options` 守卫（git >= 2.24）。

**行为变更/弃用**：diff 解析修复（merge commit 对第一 parent 审查）；LLM 循环竞态修复（per-`RunPerFile` 会话作用域异步记忆压缩）；配置 round-trip 保留手编 `timeout_sec`。

**整合建议**：
1. **确定性工程 × agent 混合作为审查模式模板**--硬约束处理"绝不能错"的（精确文件选择、智能捆绑、细粒度规则匹配），agent 处理动态决策。
2. **四层规则优先级链 + `merge_system_rule`**--`--rule` flag > 项目 `.opencodereview/rule.json` > 全局 > 内嵌 `system_rules.json`，first-match-wins，可选合并。可移植到 swarm-yuan 的项目级门禁叠加框架默认。
3. **外部定位 + 反思模块**--position anchor 门禁（验证引用的行/文件匹配问题）+ reflection 门禁（复查评论内容对代码）作为两个质量门禁。
4. **per-language 规则文档注册表 + 精度优先偏置**--每语言规则文档，每规则"仅在 X 存在时触发"谓词守卫。
5. **async per-conversation 记忆压缩（竞态修复）**--每个 `RunPerFile` 会话 own 其压缩状态，防跨代理历史拼接。

#### 2.5 ruflo（v3.32.4 -> v3.32.9）

**核心用途**：Ruflo（前 Claude Flow）是 Claude Code 和 Codex 的 **agent meta-harness**--用 100+ agents、协调 swarm、自学习记忆（AgentDB + better-sqlite3）、federated 通讯、MCP server、hooks、密码学 witness/验证系统包装模型的执行层。

**新功能**（8 个修复，无新 CLI 命令/标志）：
- **跨平台（Windows 原生）plugin hooks（#2721）**：把每个 hook 命令从 `/bin/bash -c '...'`（Windows 原生失败）改成 `node -e` bootstrap 解析 `scripts/ruflo-hook.cjs`--"同一命令串在 Windows/macOS/Linux 不变运行"。
- **真 memory-DB 完整性检查进默认 `doctor`（#2748）**：之前仅 `existsSync()+statSync()`（任何文件都 PASSED）；现在默认跑 `checkMemoryStructuralIntegrity`（有界、WAL-aware `PRAGMA quick_check`）；确定性 malformed DB 映射到 `fail` 非 `warn`。
- **拒绝不安全 sql.js whole-image 写（live native WAL writer 下，#2749）**：memory CRUD 若回退到 sql.js read-modify-export-rename 路径，存在 `-wal`/`-shm` sidecar（live native 连接证据）时**拒绝**，返回 typed `success: false`。
- **statusline 真模型名 + worktree-aware 版本解析（#2747）**：`getUserInfo()` 不再硬编码 `'Opus 4.6 (1M context)'`；`getPkgVersion()` 加纯 fs worktree-root resolver（解析 worktree `.git` 文件指针恢复主仓根，无 `git rev-parse` spawn）。
- **`memory_search` namespace 修复（#2722）**：MCP 工具处理器把省略的 `namespace` 强制为字面 `'default'`，击败搜索层 `|| 'all'` 扇出回退。
- **defense-in-depth better-sqlite3 去重（#2746）**：强制单一去重 `better-sqlite3@12.9.0`（修补 SQLite 3.53.0，修复 SQLite WAL-Reset Bug）；close 前 `wal_checkpoint(TRUNCATE)`。

**新 hook 机制形态**：`node -e` bootstrap hook 模式（`process.argv=[...];require(path.join(CLAUDE_PLUGIN_ROOT,'scripts','ruflo-hook.cjs'))`）是新跨平台 hook 调用标准，替代 shell-based hooks。

**行为变更**：`checkMemoryDatabase` 报告行重标"Memory Database Presence"（诚实化存在-only 范围）；malformed unencrypted DB 现 fail（原 warn）；`better-sqlite3` 加到 `@claude-flow/cli` optionalDependencies，每条路径在 `MODULE_NOT_FOUND` 时降级 sql.js。

**整合建议**：
1. **witness-attested 质量门禁**--三层回归模型（行为 smoke + 密码学 SHA-256/marker-substring/Ed25519 witness manifest + 时序 `history.jsonl` for bisection）。每个 swarm-yuan 门禁可证明其载荷检查仍在位。
2. **sidecar-presence refusal 作为并发安全门禁**--"若 `-wal`/`-shm` 存在则拒绝不安全写"泛化为协作写入者检测门禁。
3. **`node -e` 跨平台 hook bootstrap**--生成带 hooks 的技能应采用此形式（无 shell 展开），直接关联 swarm-yuan 的"11 运行时整合"声明。
4. **tiered native->fallback doctor 检查**--"优先 native `integrity_check`，回退 sql.js main-image-only，各自诚实标注"分层是优雅降级验证门禁的模板。
5. **worktree-root resolver 无 `git` spawn**--纯 fs `.git` 文件指针解析器，延迟敏感模式可用。

#### 2.6 superpowers（v6.1.1 -> v6.2.0）

**核心用途**：跨 harness 技能包（Claude Code/Codex/Cursor/Kimi/Pi/Antigravity/OpenCode/Gemini）发~14 个行为塑造开发技能 + SessionStart bootstrap hook。技能以 markdown + prompt 模板 + shell 脚本形式；`evals/` harness 用 LLM 评判真实代理会话。

**新功能**：
- **SDD plan-scoped workspace**：`.superpowers/sdd/` 之前无 plan 身份或生命周期--后续 plan 会读前 plan 的进度账本当自己的（实战观察到"三轮污染"）。现 `sdd-workspace` 要求 plan 文件、解析 `.superpowers/sdd/<plan-basename>/`；ledger 首行命名其 plan；**最终审查干净后删除 workspace**（git 历史是持久记录）。
- **resume-based 修复环 + 五轮熔断**：修复环改用"resume 原实现者语义而非 fresh dispatch"：R1-3 resume 原实现者处理 open findings；R4-5 fresh dispatch 更强模型；R=5 熔断，controller **逐条 adjudicate** 每个 open finding（每条 adjudication 入 ledger；禁止静默丢弃）。
- **scoped re-review prompt**：新模板 `re-review-prompt.md`--re-reviewer 只验修复（per-finding verdicts ADDRESSED/NOT ADDRESSED）+ 检查 fix diff 新破坏，不重读全任务。out-of-scope 观察入 ledger 不入环。
- **`writing-good-tests.md`（替换 `testing-anti-patterns.md`）**：六规则正向目录，每条先给 GOOD 示例 + 吸收可证伪性纪律："说出会让该测试失败的生产改动，期望独立于被测代码推导"+ 闭合 **Mutation Check**。硬止两类陷阱：**string-presence trap**（grep 式测试伪造可证伪--可观察的是行为不是文本）+ **change-detector trap**（常量断言能失败却保护不了什么）。
- **Windows SessionStart hook via Git Bash**：hook 命令串以引号路径开头，破坏 PowerShell/cmd.exe；现声明 `shell: "bash"`，Claude Code ≥ 2.1.81 解析为 Git for Windows。
- **branch-wide 技能压缩扫荡**：recap/persuasion/social-proof 段跨~12 技能移除；guard 段转为 house **Excuse/Reality rationalization 表**。每次剪切经子代理探针微测；一次可测量降级行为的剪切（TDD 的"Why Order Matters"）被重作为 rationalization 行而非发布。
- **`finishing-a-development-branch` 不再提供丢弃工作**：完成菜单去掉"Discard this work"。

**新工件**（无新技能目录）：`skills/subagent-driven-development/re-review-prompt.md`（新文件）；`skills/test-driven-development/writing-good-tests.md`（新文件，替换 `testing-anti-patterns.md`）；`skills/using-superpowers/references/gemini-tools.md`（恢复）；新 hook 机制 `shell: "bash"` 声明。

**行为变更/弃用**：SDD workspace 改 per-plan 且最终审查干净后删除（breaking for 现有 scratch 目录）；修复环语义改 resume（R1-3）而非总 fresh dispatch；`testing-anti-patterns.md` 移除（折入 `writing-good-tests.md`）；`finishing-a-development-branch` Option 2 现真创建 PR/MR 并报告 URL。

**整合建议**（落地见 §3.4、§3.5）：
1. **plan-scoped 持久进度账本**--`.superpowers/sdd/<plan-basename>/` 模式：per-plan workspace、首行命名 plan、最终审查干净后删除、是 compaction 后的 resume map。
2. **resume-based 修复环 + 五轮熔断**--R1-3 resume / R4-5 fresh+更强模型 / R=5 adjudicate 模式，eval-验证的子代理模式。
3. **scoped re-review prompt 作为验证门禁**--re-reviewer 只判决 fix diff（ADDRESSED/NOT ADDRESSED per finding + 新破坏检查），out-of-scope 入 ledger。
4. **可证伪性门禁 + Mutation Check**--"说出会让该测试失败的生产改动"+"期望独立于被测代码推导"+ 闭合 mutation check + 硬止 string-presence/change-detector 陷阱。
5. **技能文本编辑的微测门控**--每次剪切经子代理探针微测；可测量降级行为的剪切被重作而非发布；rationalization 表形式（Excuse/Reality 行在代理 rationalization 中途触发处）。

### 3. 整合吸收落地清单

从上述 30+ 候选里精选 6 项落地。**全部不新增 `check_*` 门禁**（守决策 26 的 `FACT_GATES_BUDGET=54` 上限），以方法论吸收（references 文档 / SKILL.md 叙事 / state-machine warn 分支 / trace-log 字段 / 新增 G10 self-check 断言）为主。

| # | 来源 | 概念 | 落地点 | 类型 |
|---|---|---|---|---|
| 3.1 | gsd-core v1.8.0 | reversibility 分级 | `references/decision-governance.md` §2.4 + `decisions.jsonl` schema + `trace-log.sh` | 方法论 |
| 3.2 | gsd-core v1.8.0 | broken-windows ledger | `references/gsd-patterns.md` + `state-machine.sh` archive guard warn 分支 | 方法论 + warn 增强 |
| 3.3 | graphify v0.9.27 | honest-edge provenance（EXTRACTED/INFERRED/AMBIGUOUS）| `assets/trace-log.sh` confidence 字段 + `references/memory-persistence.md` | 方法论 + 字段扩展 |
| 3.4 | superpowers v6.2.0 | resume-based 5 轮熔断修复环 + scoped re-review | `references/subagent-orchestration.md` | 方法论 |
| 3.5 | superpowers v6.2.0 | 可证伪性 + Mutation Check | `references/review-methodology.md` | 方法论 |
| 3.6 | claude-mem v13.12.x | version oracle 单源真值 | `scripts/self-check.sh` G10 + `assets/facts.conf` `FACT_VERSION_ORACLE_RULE` | self-check 断言 |

**未落地但留作后续候选**（证据已记录，待预算或需求触发）：
- ruflo witness-attested 门禁（需新 check_*，超预算，待决策 26 修订）
- ruflo `node -e` 跨平台 hook bootstrap（待 hooks 实装时落地）
- graphify strict PreToolUse "deny-then-downgrade" hook 模型（待 hook 机制扩展）
- gsd-core multi-signal fix-acceptance 护栏（需新 check_*，超预算）
- ocr 四层规则优先级链（待 review 门禁重构）
- claude-mem 两车道同步模式（待多设备同步需求）

### 4. 验证

- 升级后各运行时 `git describe --tags --abbrev=0` 已对齐目标版本（见 §1 表）。
- graphify `git merge-base v0.9.19 v0.9.27 = v0.9.19`，确认线性路径（非异源 v1.0.0）。
- 整合落地不新增 `check_*` 函数，`FACT_GATES_TOTAL` 保持 54 ≤ `FACT_GATES_BUDGET` 54（G9 守住）。
- 新增 `FACT_VERSION_ORACLE_RULE` 是 `facts.conf` 变量（非 `precheck.conf` 变量），不计入 `FACT_CONF_VARS=169`。
- 落地验证见 self-check.sh G10 + shellcheck + bash -n + fixture 抽跑。


### A11. 运行时升级 2026-08

> 2026-08 运行时升级差异报告。（历史原文，不再单独维护）

> 触发：user message「更新所有运行时依赖及环境版本到最新版，分析与上次之间的版本差异，消化吸收融合其功能优势」
> 数据来源：GitHub REST API + npm registry（2026-08-21 实测）；sub-agent 调研报告（见 session 上下文）
> 历史轮次：`docs/research/R6-upstream-web.md` §0（2026-07-20）/ §6.6 A10（原 runtime-update-2026-07，2026-07-26）/ 2026-08-14 轮（未单写报告）

### 一、14 上游版本差异速览（基线 → 最新）

| 项目 | 基线 | 最新（2026-08-21） | 跨度 | 动作 |
|------|------|---------------------|------|------|
| openspec | v1.9.0 | **v1.10.0**（2026-08-19） | 1 minor | 升基线 + 吸收 |
| comet | v0.3.9 | 0.4.0-beta.18（2026-08-13） | beta 连发 | **仍观望**（无正式版） |
| GitNexus | npm 1.6.9 | 1.6.9（2026-07-04 停滞） | 无变化 | 保持 license-risk |
| gsd-core | v1.10.0 | **v1.11.0**（2026-08-19 next 分支） | 1 minor | 升基线 + 吸收 |
| claude-mem | v13.15.0 | **v13.15.3**（2026-08-20） | 3 patch | 升基线 + 吸收（watch） |
| ocr | v1.9.2 | **v1.9.8**（2026-08-20） | 6 patch | 升基线 + 吸收 |
| graphify | v0.9.42 | **v0.9.47**（2026-08-19） | 5 patch | 升基线 + 吸收 |
| superpowers | v6.3.0 | v6.3.0（2026-08-12） | 无变化 | 已同步 |
| gstack | v1.60.1.0 | **v1.68.2.0**（2026-08-20 commit 51932ec） | 8 minor | 升基线 + 吸收 |
| ruflo | v3.38.9 | **npm 3.38.12**（release 3.38.9） | 3 patch | 升基线（npm 为准） |
| ECC | v2.1.0 | v2.1.0（2026-07-27） | 无变化 | 已同步 |
| impeccable | v4.0.4 | **skill-v4.1.1**（2026-08-14） | 1 minor | 升基线 + 吸收 |
| codex-security | v0.1.11 | **v0.1.16**（2026-08-20） | 5 patch | 升基线 + 吸收 |
| dsh | rc.8 | rc.8（master=141eb6f 2026-08-19） | 无新版 | 已同步 |
| **claude-code** | v2.1.232（2026-08-13 调研基线） | **v2.1.237**（2026-08-20） | 5 patch | 升基线 + 吸收（R4 补核；2026-09-01 R16 再补核至 v2.1.252，见 §6.6 A14） |
| **codex-cli** | v0.146.0（2026-08-14 调研基线；本机 0.146.0） | **v0.148.0**（2026-08-18 stable）+ v0.149.0-alpha.4 预告 | 2 stable | 升基线 + 吸收（R4 补核；**破坏性**两处；2026-09-01 R16 再补核至 v0.152.0，见 §6.6 A14） |

**新增**：dsh（deepseek-harness）+ claude-code + codex-cli 三项入表——表从 13 扩到 16 个运行时。claude-code/codex 是核心安装目标（install.sh 检测），CLI 侧差异单列本文 §6.4 §三。

### 二、可吸收点 → 落地点

按 swarm-yuan 口径分两类：方法论文档（references/）与工程纪律（已有机制对齐强化）。

#### 2.1 openspec v1.10 → `references/review-methodology.md` / spec-template

- **task plan 强制"完成判据"**（test / 命令 / 可观察结果 / 交付物）——"Implement the thing"不再算计划。
  落地：spec-template §3 plan 部分加"完成判据必填"指引；`--verify-completeness` 已有占位符检测，可扩展检 plan 章节是否含完成判据字段（本轮不落地机器执法，仅文档强化）。
- **诊断输出一律走 stderr 不污染 stdout 管道**——与 swarm-yuan 既有 CLI 纪律一致，对齐确认。

#### 2.2 gsd-core v1.11 → `references/gsd-patterns.md` / `references/decision-governance.md`

- **guard 必须能观测自身失败分支**——不可观测的 guard 拒绝注册。落地：gsd-patterns.md 增"guard 可观测性"段；本仓 fail-gate-hook.sh 的 flag 捕获模型天然满足（PostToolUse precheck 退出码 → flag → PreToolUse 读 flag 决策）。
- **STATE.md 盖 commit 戳 + 新鲜度检测**——本仓 `.swarm-yuan-version` 已有 `source_repo` 盖戳；可扩展为 state.yaml 盖 commit 戳（本伦不落地，登记候选）。
- **validator 收敛统一 envelope + owner 分阶段 ratchet**——本仓 trace-log.sh 单 JSONL envelope 已对齐。

#### 2.3 claude-mem v13.15.x → `references/memory-persistence.md`

- **错误信封分类**（cmem.ai gateway `{code,message,action,url,request_id}`；402/quota 耗尽不重试，失败收敛单行日志）。
  落地：memory-persistence.md 增"错误信封分类"段（quota 类不重试 vs 网络瞬断可重试的区分）。
- **session-start 的 observer-health 告警**（observation 停止流入时提示）——本仓 SessionStart hook fingerprint 感知是同构机制，已落地。
- **多界面促销/提示文案单一事实源**（`src/shared/pro-promo.ts`）——本仓 facts.conf 单一事实源机器执法同构，已对齐。

#### 2.4 ocr v1.9.8 → `references/review-methodology.md`

- **JSON/SARIF 输出时 review 进度走 stderr、非 TTY 关颜色**——本仓 precheck.sh `--format json` 已对齐（SARIF 子集结果打印 stdout 末尾，进度走 stderr）。
- **api_key 从命令解析**（`api_key = "!op read ..."` 模式）避免明文落盘——本仓 precheck.conf 无 secret 字段，安全边界已对齐；登记候选供未来 AI 工具集成参考。
- **resume 可信校验 + transition lineage + Ctrl-C 保留 checkpoint**——本仓 state-machine.sh dump-journal/restore-journal 已对齐。

#### 2.5 graphify v0.9.47 → `references/code-graph-tools.md` / `references/memory-persistence.md`

- **no-op 运行产物字节一致 / 不触碰时间戳**（manifest 时间戳 no-op 时不重写，避免假 dirty commit）。
  落地：code-graph-tools.md 增"幂等写入纪律"段；本仓 project-fingerprint.sh `--diff` 无变化时不重写基线文件已对齐。
- **超时二分降级而非整体失败**（文件 chunk 超时二分拆分）——登记候选供未来 inventory-verify 大项目性能优化参考。
- **node id 不变 / 不重键既有图**（破坏性变更零容忍）——本仓 replay 规则不可变原则（WP-R12-D）同构。

#### 2.6 impeccable v4.1 → `references/frontend-design-methodology.md`

- **对抗性 verdict**（多候选先内部比较再呈交；safer/bolder 沿熟悉-大胆轴定向重掷）。
  落地：frontend-design-methodology.md 增"对抗性 verdict"段；本仓 decisions.jsonl `alternatives` 字段已对齐（须列备选）。
- **证据坏则重取证重跑**（截图坏/缺时重拍重跑评审；拒绝假抠图 mask 冒充 cutout）。
  落地：frontend-design-methodology.md 增"证据完整性"段；本仓 inventory-verify `--path-check` HALLUCINATION 阻断同构。

#### 2.7 codex-security v0.1.16 → `references/codex-security-methodology.md`

- **发现 → 外部 tracker 发布 → 关联持久化 → verify-fix 闭环**（Linear 深度集成 + 交互式修复 + 只读 verify-fix）。
  落地：codex-security-methodology.md 增"闭环管线"段；本仓 decisions.jsonl outcome 生命周期（WP-R12-D）+ trace-log.sh --decision 已对齐。
- **bulk-scan 每仓库强制 cost limit**——本仓无 bulk 场景，登记候选。

#### 2.8 gstack v1.68.2 → `references/review-methodology.md` / fail-gate-hook 设计哲学

- **每个 guard 必须可证明会触发（否则删除）**（v1.64.1 净删 24,943 行的 guard 收紧波）。
  落地：review-methodology.md 增"guard 可证伪触发"段；本仓 self-check.sh 各 check_* 函数与 facts.conf 数字机器执法已对齐（facts 漂移即 fail）。
- **issue/PR 关闭附 receipt 证据**（v1.68.0 90 个过期 PR 带证据关闭）——本仓 trace-log.sh + decisions.jsonl 已对齐。
- **fail-closed hooks 三件套**（v1.66.1 content binding）——本仓 fail-gate-hook.sh + integrity-guard.sh + failure-detector.sh 三件套同构，已对齐。

#### 2.9 ruflo 3.38.12 → 不吸收

SynthID-Text 风格的 LLM 文本水印（WASM crate + 浏览器/Deno ESM 入口）是新能力方向，但与 swarm-yuan 运行时无关（本仓无 LLM 文本生成场景）。仅升引用基线到 3.38.12（patch 列车跟随），不吸收。

#### 2.10 Claude Code v2.1.237 → `references/claude-code-capabilities.md`

- **Todo/Task 工具默认移除**（v2.1.233，破坏性）：Opus 4.8 / Sonnet 5 / Fable 5 / Mythos 5 及更新模型上 TaskCreate/TodoWrite 默认不可用（`CLAUDE_CODE_ENABLE_TODO_TOOLS=1` 兜底）。
  落地：claude-code-capabilities.md 增"Todo 工具移除与自有链路"注记——本仓目标技能的进度跟踪走 `trace-log.sh`（自有链路，不依赖 CLI Todo 工具），无兼容性风险；生成器提醒 SKILL.md 不依赖 TodoWrite 表述门禁进度。
- **`notify_when_idle` 跨会话通知**（v2.1.236）：本机另一 Claude Code 会话空闲时发一次性通知（opt-in 无轮询）。登记候选：未来"门禁长跑完成后通知主会话"可走官方机制。
- **"Concise" output style**（v2.1.237）：直接给结果跳叙述。与门禁驱动开发契合；生成技能使用文档可推荐。
- **`claude-api` 技能 200k→25k 按需加载**（v2.1.234）：swarm-yuan 的"按需读取引用索引"（WP-P5）同构机制，方向验证（不新增落地）。
- **沙箱通配符 read-deny 防重命名绕过**（v2.1.236）：目标技能 settings.local.json 的 `**/.env` deny 规则更强了（文档注记级吸收）。

#### 2.11 Codex v0.148.0 → `references/codex-methodology.md`

- **hooks 异步命令 + MCP 工具调用**（v0.148）：**重要机会**——precheck 门禁可注册为 Codex hook 而非仅靠 prompt 约定，门禁"执法"在 Codex 侧获得官方强制点。登记候选（下轮评估 hooks.json 的 Codex 等价物）。
- **Agent Plugins 四类目录**（v0.147）：local/personal/workspace/remote——生成技能的分发新通道（打包为 Codex 插件）。登记候选。
- **skill-creator validation 拒绝 TODO 占位符**（v0.148）：本仓 `--verify-completeness` 零占位符检测同构，方向验证。
- **`/export` 会话导出**（v0.148）：门禁验收记录随会话导出留档（契合 ai-process-records 方法论，文档注记级）。
- **破坏性两处**：① v0.147 移除 `codex exec --full-auto` → `--sandbox workspace-write`（本仓生成脚本无 `--full-auto` 引用，无影响；install.sh Codex 检测登记版本下限候选）；② v0.149-alpha 移除技能模型委托（本仓无按子任务指定模型设计，无影响）。

### 三、不吸收清单（显式登记）

| 能力 | 来源 | 不吸收理由 |
|------|------|-----------|
| LLM 文本水印 SynthID-Text | ruflo 3.38.12 | 本仓无 LLM 文本生成场景 |
| Linear 深度集成（直连 API） | codex-security v0.1.13-15 | 本仓不绑定特定 tracker；decisions.jsonl 是本地 JSONL 而非外部 SaaS |
| task plan 完成判据机器执法 | openspec v1.10 | 本仓已有 `--verify-completeness` 占位符检测；完成判据属语义判断，GATE_AI_JUDGMENT 原则下不机械 grep |
| STATE 文件 commit 戳新鲜度检测 | gsd-core v1.11 | 登记候选（下一轮 WP）；本仓 state.yaml 当前由 state-machine.sh 管理，无新鲜度告警需求场景 |
| `.graphifyrc` viz_node_limit 烘焙 | graphify v0.9.47 | 本仓无 graphify 配置文件场景（graphify 是方法论引用层） |

### 四、候选登记（下轮触发条件）

| 候选 | 触发条件 | 预估工作量 |
|------|----------|-----------|
| state.yaml 盖 commit 戳 + 新鲜度检测（gsd-core v1.11） | 用户报"state.yaml 过期导致流程错位" | 小（state-machine.sh status 增 stale 告警） |
| inventory-verify 大项目超时二分降级（graphify v0.9.47） | 用户报"inventory-verify 大项目跑超时" | 中（_enum_count 加 timeout + 二分） |
| plan 完成判据模板字段（openspec v1.10） | 用户反馈"plan 没写怎么算完成" | 小（plan-template.md 加字段 + 文档） |
| api_key 命令解析模式（ocr v1.9.8） | 本仓未来接入 AI 工具需 secret | 小（precheck.conf 加 SECRET_CMD 模式） |
| Codex hooks 注册 precheck 门禁（codex v0.148 hooks 异步命令 + MCP 工具调用） | 下轮适配评估——门禁在 Codex 侧获官方强制点 | 中（调研 Codex hooks.json 等价物 + 生成器支持） |
| Codex Agent Plugins 打包分发（codex v0.147 四类目录） | install.sh 对 Codex 目标增加插件形态选项 | 中（打包脚本 + 目录约定） |
| `notify_when_idle` 门禁长跑通知（claude-code v2.1.236） | 用户需要"门禁跑完通知主会话"场景 | 小（SendMessage 调用脚本） |
| install.sh Codex 版本下限检测（≥0.147，`--full-auto` 已移除） | 下次 install.sh 改动时顺带 | 小（版本比较 + 提示） |

### 五、落地清单（本轮已做）

- [x] §6.4 上游基线（原 docs/upstream-baseline.md）全表更新（13→14 运行时，9 项升基线 + 1 项仍 drifted + 1 项仍 license-risk + 3 项已同步）
- [x] §6.4 §二 关键结论 2026-08-21 重写
- [x] §6.4 §三 comet 观望状态 2026-08-21 重核注记
- [x] §6.4 §WP-Y 处置策略 2026-08-21 更新
- [x] 本报告即 §6.6 A11（原 docs/runtime-update-2026-08.md）
- [ ] `references/review-methodology.md` 吸收 openspec/gsd-core/gstack 三点（下一 WP）
- [ ] `references/memory-persistence.md` 吸收 claude-mem 错误信封分类（下一 WP）
- [ ] `references/code-graph-tools.md` 吸收 graphify 幂等写入纪律（下一 WP）
- [ ] `references/frontend-design-methodology.md` 吸收 impeccable 对抗性 verdict + 证据完整性（下一 WP）
- [ ] `references/codex-security-methodology.md` 吸收 codex-security 闭环管线（下一 WP）
- [ ] `references/gsd-patterns.md` 吸收 gsd-core guard 可观测性（下一 WP）

### 六、验证

- `bash scripts/self-check.sh --check-only` 无 drift warn（除 comet 仍 drifted 为预期）
- 14 个 baseline_status 标记行齐全（13  synced/watch/license-risk + 1 drifted）


### A12. 五维稳定单元

> 稳定单元五维字段定义。（历史原文，不再单独维护）

### 什么是五维字段

特征卡第 11 项"可复用稳定单元"中，每个单元用五个维度完整描述：

| 维度 | 含义 | 作用 |
|------|------|------|
| **签名** | 单元的技术标识（函数名/组件名/类名/接口名） | 精确定位，避免歧义 |
| **路径** | 单元在代码库中的文件位置 | 快速查找，确认存在 |
| **用途** | 单元的功能描述（做什么、解决什么问题） | 理解价值，判断是否可复用 |
| **复用方式** | 如何引用这个单元（import/alias/注册/API 调用） | 指导编码，避免错误引用 |
| **稳定性标注** | 单元的稳定性等级（核心稳定/可演进/实验性） | 评估风险，决定是否依赖 |

---

### 真实项目示例

#### 示例 1: Vue 组件

**签名**: `CockpitWorkspace`

**路径**: `custom/client/cockpit/components/CockpitWorkspace.vue`

**用途**: 
- Cockpit 主工作区容器组件
- 整合看板、聊天、文件面板、协作图谱四大功能区
- 提供三段联动式布局（全貌→聚焦→处理）
- 管理用户决策流（WorkDecision）和任务状态

**复用方式**:
```typescript
// 在 registries/client/bootstrap.ts 中注册
import('./../custom/client/cockpit').then(({ registerCockpit }) => registerCockpit(app))

// 在其他组件中引用
import CockpitWorkspace from '@/custom/cockpit/components/CockpitWorkspace.vue'
```

**稳定性标注**: **核心稳定** ⭐⭐⭐
- 位于 cockpit 模块顶层，被多个子组件依赖
- 接口稳定（props/emit 未变）
- 测试覆盖完整（cockpit-store.test.ts）
- 禁止侵入式重构

---

#### 示例 2: TS 函数

**签名**: `isGatewayNotice(content: unknown): boolean`

**路径**: `custom/client/chat/gateway-notice.ts`

**用途**:
- 判断文本是否为网关关闭/重启告警
- 识别 swarm-agent gateway 推送的系统事件消息
- 命中后由 chat store 打 `systemType: 'gateway'` 标记
- 渲染层据此折叠为紧凑系统提示

**复用方式**:
```typescript
// 在 chat store 中调用
import { isGatewayNotice } from '@/custom/chat/gateway-notice'

if (isGatewayNotice(message.content)) {
  message.systemType = 'gateway'
}
```

**稳定性标注**: **核心稳定** ⭐⭐⭐
- 纯函数，无副作用
- 正则模式稳定（`/^⚠️\s*Gateway\s+(shutting down|restarting)\b/i`）
- 被 vitest 单测覆盖
- 可安全依赖

---

#### 示例 3: Pinia Store

**签名**: `useCockpitStore()`

**路径**: `custom/client/cockpit/store/cockpit.ts`

**用途**:
- Cockpit 全局状态管理
- 整合看板（kanban）、聊天（chat）、Matrix 客户端状态
- 提供任务搜索、注意力管理、协作图谱、历史记录、通知等功能
- 管理用户待办（UserTodo）和租户过滤

**复用方式**:
```typescript
// 在组件中调用
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'

const cockpitStore = useCockpitStore()
const tasks = cockpitStore.filteredTasks
```

**稳定性标注**: **核心稳定** ⭐⭐⭐
- 被 CockpitWorkspace 等多个组件依赖
- 接口稳定（computed/ref 未变）
- 测试覆盖（cockpit-store.test.ts）
- 禁止修改签名（新增字段可以，改字段不行）

---

#### 示例 4: API 接口

**签名**: `kanbanApi.getTasks(params: KanbanTaskQuery): Promise<KanbanTask[]>`

**路径**: `custom/client/cockpit/api/kanban-extras.ts`

**用途**:
- 获取看板任务列表
- 支持分页、过滤、排序
- 返回标准化的 KanbanTask 类型

**复用方式**:
```typescript
// 在 store 或组件中调用
import * as kanbanApi from '@/custom/cockpit/api/kanban-extras'

const tasks = await kanbanApi.getTasks({ status: 'open', limit: 50 })
```

**稳定性标注**: **可演进** ⭐⭐
- 接口参数可能扩展（新增过滤条件）
- 返回类型稳定（KanbanTask 未变）
- 调用方需处理分页逻辑
- 可依赖，但需关注版本变更

---

#### 示例 5: 适配器（Adapter）

**签名**: `taskAdapter.mapToViewModel(task: KanbanTask): TaskViewModel`

**路径**: `custom/client/cockpit/adapters/task-adapter.ts`

**用途**:
- 将后端 KanbanTask 转换为前端 TaskViewModel
- 处理字段映射、默认值、计算属性
- 解耦后端 API 与前端渲染

**复用方式**:
```typescript
// 在 store 中调用
import * as taskAdapter from '@/custom/cockpit/adapters/task-adapter'

const viewModel = taskAdapter.mapToViewModel(rawTask)
```

**稳定性标注**: **可演进** ⭐⭐
- 映射逻辑可能随后端字段变化
- 接口稳定（mapToViewModel 签名未变）
- 被 cockpit-store 依赖
- 可依赖，但需关注后端变更

---

### 五维字段的作用

#### 1. 签名：精确定位

- **避免歧义**：`useCockpitStore` vs `useKanbanStore` 是两个不同的 store
- **支持搜索**：IDE 可快速跳转到定义
- **支持重构**：重命名时全局替换

#### 2. 路径：快速查找

- **确认存在**：`custom/client/cockpit/store/cockpit.ts` 确实存在
- **理解结构**：路径反映模块划分（cockpit/store/ vs cockpit/components/）
- **支持导航**：点击路径直接打开文件

#### 3. 用途：理解价值

- **判断复用**：这个单元解决什么问题？我的需求是否匹配？
- **避免重复**：已有 `isGatewayNotice` 就不需要再写一个
- **指导设计**：新单元应该放在哪里？如何命名？

#### 4. 复用方式：指导编码

- **正确引用**：`import { useCockpitStore } from '@/custom/cockpit/store/cockpit'`
- **避免错误**：不要用 `@/stores/hermes/cockpit`（路径错误）
- **支持注册**：在 bootstrap.ts 中注册组件

#### 5. 稳定性标注：评估风险

- **核心稳定** ⭐⭐⭐：可安全依赖，禁止侵入式重构
- **可演进** ⭐⭐：可依赖，但需关注版本变更
- **实验性** ⭐：谨慎依赖，可能大幅变更

---

### 特征卡第 11 项的完整示例

```markdown
## 11. 可复用稳定单元清单

### 组件库

| 签名 | 路径 | 用途 | 复用方式 | 稳定性 |
|------|------|------|---------|--------|
| CockpitWorkspace | custom/client/cockpit/components/CockpitWorkspace.vue | 主工作区容器 | import + registerCockpit | ⭐⭐⭐ 核心稳定 |
| CockpitKanban | custom/client/cockpit/components/CockpitKanban.vue | 看板面板 | import | ⭐⭐⭐ 核心稳定 |
| CockpitChatPane | custom/client/cockpit/components/CockpitChatPane.vue | 聊天面板 | import | ⭐⭐⭐ 核心稳定 |
| GatewayNoticeBanner | custom/client/chat/components/GatewayNoticeBanner.vue | 网关通知横幅 | import | ⭐⭐⭐ 核心稳定 |

### 函数库

| 签名 | 路径 | 用途 | 复用方式 | 稳定性 |
|------|------|------|---------|--------|
| isGatewayNotice | custom/client/chat/gateway-notice.ts | 判断网关告警 | import | ⭐⭐⭐ 核心稳定 |
| renderMarkdown | custom/client/cockpit/components/CockpitWorkspace.vue | Markdown 渲染 | 组件内使用 | ⭐⭐ 可演进 |

### Store

| 签名 | 路径 | 用途 | 复用方式 | 稳定性 |
|------|------|------|---------|--------|
| useCockpitStore | custom/client/cockpit/store/cockpit.ts | Cockpit 全局状态 | import + 调用 | ⭐⭐⭐ 核心稳定 |
| useKanbanStore | custom/client/kanban/store/kanban.ts | 看板状态 | import + 调用 | ⭐⭐⭐ 核心稳定 |

### API

| 签名 | 路径 | 用途 | 复用方式 | 稳定性 |
|------|------|------|---------|--------|
| kanbanApi.getTasks | custom/client/cockpit/api/kanban-extras.ts | 获取看板任务 | import + 调用 | ⭐⭐ 可演进 |

### 适配器

| 签名 | 路径 | 用途 | 复用方式 | 稳定性 |
|------|------|------|---------|--------|
| taskAdapter.mapToViewModel | custom/client/cockpit/adapters/task-adapter.ts | 任务数据转换 | import + 调用 | ⭐⭐ 可演进 |
```

---

### 五维字段在门禁中的应用

#### `--reuse` 门禁

检测新增单元是否与既有单元重名：

```bash
# 检查新增的 isGatewayNotice 是否与既有单元重名
grep -r "export function isGatewayNotice" custom/
# 如果找到多个定义 → fail（重复造轮子）
```

#### `--stable-diff` 门禁

检测稳定层是否被改而未声明：

```bash
# 检查 STABLE_GLOBS 指定的稳定单元是否被修改
git diff custom/client/cockpit/store/cockpit.ts
# 如果有改动但 spec §3 未声明 MODIFIED → fail
```

#### `--layer` 门禁

检测依赖方向是否违反分层规则：

```bash
# 检查 domain 层是否导入了 presentation 层
grep "import.*from.*components" custom/client/cockpit/store/cockpit.ts
# 如果 store 导入了 components → fail（依赖倒置）
```

---

### 总结

五维字段是特征卡第 11 项的核心——它完整描述了每个可复用稳定单元的技术标识、位置、功能、引用方式和稳定性。

**特征卡是立法，门禁是执法。** 五维字段定义了"哪些单元可以复用、如何复用"，`--reuse` / `--stable-diff` / `--layer` 门禁验证"代码是否遵守这些规则"。


### A13. 宣传文案

> 对外宣传口径（历史版本）。（历史原文，不再单独维护）

**从「AI 辅助写代码」到「AI 懂项目再写代码」的认知基础设施**

一句话摘要：swarm-yuan 为你的项目生成专属技能（目标技能）——它用 17 项特征卡让 AI 认识你的项目，用 55 个质量门禁守护代码合规——特征卡是立法，门禁是执法，两者构成从认知到交付的完整闭环。
（边界声明：门禁外部有效性目前在 Java/JS Web 品类上验证（R9），跨品类见 `verifier/v2/external-validity.md` 立项稿。）

> **口径权威源**：`assets/facts.conf`（catchphrase 数字单一事实源，self-check 机器执法）。

---

### 一、为什么「AI 写代码」已经不够了？

大模型普及两年，几乎每个开发者都在用 AI 写代码。但当我们审视真实的生产现场，会发现一个尴尬的事实：

**AI 的代码生成能力已被充分释放，但项目认知几乎为零。**

#### 三个结构性瓶颈

**瓶颈 1：AI 不知道你的项目规则。** AI 不知道哪些目录不能改、依赖版本不能升级、哪些组件可以复用。产出的代码经常违反项目规则。

**瓶颈 2：AI 不懂你的领域。** 密码必须哈希、SQL 必须参数化、消息有时序性——这些是客观规律，违反就是硬伤。AI 不知道。

**瓶颈 3：检查靠人工，过程不可见。** 没有自动化检查就没有信任，没有信任就只能逐行人工 review。

**核心论断：AI 的代码生成能力已经很强，但「项目认知」——对项目规则、结构、领域知识、可复用单元的理解——还停留在零。**

---

### 二、swarm-yuan 的关键设计理念

#### 理念一：先认识，再行动

AI 写代码前必须先认识项目。swarm-yuan 生成的目标技能用 **17 项特征卡** 完成认知，用 **55 个质量门禁** 守护行动。不认识就写 = 盲动。

#### 理念二：拼装式开发

新功能 = 既有稳定单元的拼装 + 最小新增胶水代码。三条禁止：禁止重复造轮子、禁止侵入式重构、禁止破坏性改造。特征卡第 11 项盘点全部可复用单元，门禁 `--reuse` 验证复用合规。

#### 理念三：呈现递进的关系，而非仅关注计算

门禁不是"数 import 数"——每个计数背后指向一条关系规律。`--layer` 数 import 是为了验证"结构是否遵循依赖单向"；`--reuse` 数新增导出是为了验证"概念是否复用了既存稳定单元"。

#### 理念四：特征卡是立法，门禁是执法

> 📌 **隐喻边界**：三权分立为教学类比，非政治学严格对应--门禁无法律普遍约束力，verifier/v1 与门禁同仓库同 CI、无司法独立裁量权。详见本文 §1.2 与 §2.3。

17 项特征卡定义「项目应该是什么样的」，55 个门禁验证「代码是否符合」。两者构成闭环——特征卡驱动门禁配置，门禁验证特征卡定义的规则。**门禁还按执法强度分三档（决策 19）**：strict 17（真 fail 阻断）/ warn 22（混合）/ advisory 16（永不 fail，观测类）——让"门禁是执法"不再是一句宣称，而是机器可核验的分层。

---

### 三、17 项特征卡：项目的「认知 DNA」

#### 什么是特征卡

特征卡是 AI 探查项目后提取的 **17 项项目特征**，每项落到真实路径和版本号，不用占位符。它不是独立文件，而是**分散承接进目标技能的各个文件中**，是门禁配置和文件填充的「数据源」。

**没有特征卡，门禁就是无源之水——不知道项目边界在哪、哪些单元稳定、什么领域规律不能违反。**

#### 17 项特征卡

| # | 特征项 | AI 提取什么 | 为什么重要 |
|---|--------|-----------|-----------|
| 1 | 项目类型 | 单体/monorepo/overlay-fork/微服务 | 决定探查策略和门禁方向 |
| 2 | **可改范围** | 可改目录 + 只读目录 + 只读区修改机制 | **安全铁律依据**——改了只读区 = 违规 |
| 3 | **改造分类** | A类(纯新增)/B类(骨架修改) | **决定代码怎么写** |
| 4 | 技术栈 | 语言+框架+构建+测试（含版本基线） | 版本锁定依据，`--deps` 对比基线 |
| 5 | **构建命令** | dev/build/test/release 真实命令 | **门禁执行基础**——`--build` `--test` 跑这些 |
| 6 | 分支规范 | 命名/合入/保护分支/推送 | `--branch` 校验规则 |
| 7 | 安全规则 | 脱敏/密钥/白名单 | `--sensitive` `--security` 扫描范围 |
| 8 | 文档约定 | spec/plan 位置和命名 | spec 文件路径 |
| 9 | 测试体系 | 框架/目录/命令 | `--test` 执行命令 |
| 10 | 环境资源 | 运行时/DB/缓存/MQ/MCP | `--service` 配置 |
| 11 | **可复用稳定单元** | 全部稳定 API/组件/类/函数/store/类型（五维字段定义见 `references/exploration-guide.md` §11f） | **拼装式开发核心依据**——`--reuse` 重名检测源 |
| 12 | 数据规范 | schema/样例/业务规则/勾稽 | `--consistency` 核对项 |
| 13 | 认知框架 | 认知映射表 + 六维动力学基线 | `--cognition` 对比基线 |
| 14 | **领域知识** | 技术+业务领域 → 推导客观规律 | **防达克效应**——`--domain` 违规检测 |

**第 11 项是核心中的核心。** AI 用 graphify `query` / gitnexus `context` 系统性盘点全部稳定单元（GitNexus 因 PolyForm Noncommercial 禁商用降级为非默认，graphify（MIT）提为默认代码图谱工具）——不是随机 grep，而是基于代码图谱的 360 度上下文查询。每个单元记录五维字段（定义见 `references/exploration-guide.md` §11f）。

#### 特征卡如何驱动一切

**→ 文件填充：** SKILL.md 铁律 ← 第 2/6 项 → codebase.md 技术栈 ← 第 4 项 → dev-guide.md 改造分类 ← 第 3 项 → reference-manual.md 组件库 ← 第 11 项 → release.md 命令 ← 第 5 项……

**→ 门禁配置：** precheck.conf 三件套 178 个变量（core 18 + arch 112 + compliance 48）从特征卡推导——WRITABLE_DIRS ← 第 2 项、TEST_CMD ← 第 5 项、LAYER_DEFS ← 第 3 项、STABLE_GLOBS ← 第 11 项、SERVICE_DIRS ← 第 10 项……

**→ 开发流程：** 开始新需求时 AI 从第 11 项检索可复用单元 → 预填 spec §5.5 → 编码时查第 11 项组件库拼装优先 → 提交前 55 个门禁按特征卡规则检查。

#### 落地示例（SwarmStudio overlay）

| # | 真实值 |
|---|--------|
| 1 | overlay 注入式二次开发（Vue 3 + Electron） |
| 2 | 可改: overlay/；只读: upstream/（严格禁止） |
| 3 | A类（custom/ 纯新增）+ B类（patches/ 骨架修改） |
| 5 | `npm run dev`(:8649) / `npm test` / `npm run inject` |
| 11 | CockpitWorkspace / CockpitKanban / GatewayNoticeBanner 等 15+ 组件 |
| 14 | IM 通讯（Matrix 协议）+ DevOps 监控 |

---

### 四、55 个质量门禁：特征卡的守卫者

#### 门禁与特征卡的关系

**特征卡是立法，门禁是执法。**

| 特征卡项（立法） | 门禁（执法） |
|----------------|-------------|
| 第 2 项：overlay/ 可改，upstream/ 只读 | `--scope` 检查 git diff 是否触碰只读目录 |
| 第 5 项：`npm run build` | `--build` 运行此命令，非零 = fail |
| 第 6 项：feat/fix/refactor | `--branch` 校验分支名是否匹配正则 |
| 第 7 项：密钥不入代码库 | `--sensitive` `--security` grep 扫描密钥模式 |
| 第 11 项：CockpitWorkspace 等稳定单元 | `--reuse` 检测新增单元是否与既有重名 |
| 第 11 项：STABLE_GLOBS 指定的稳定层 | `--stable-diff` 检测稳定层被改而未声明 |
| 第 14 项：密码必须哈希 | `--domain` grep 检测密码明文存储 |

#### 核心门禁（`--all`，10 个，通常 10-20 秒）

| 门禁 | 检查什么 | fail 条件 |
|------|---------|----------|
| `--branch` | 分支命名 + 保护分支 | 在 main 上开发 / 分支名不合规 |
| `--scope` | 改动范围 | 只读目录有改动 |
| `--build` | 构建通过 | 构建失败 |
| `--sensitive` | 敏感信息 | 密码/密钥明文 |
| `--review` | 代码审查（5 维度） | ocr 检测到 High |
| `--reuse` | 复用合规 | spec 缺 §5.5 / 新增单元与既有重名 |
| `--deps` | 依赖锁定 | 版本变更但 spec 未声明 |
| `--security` | OWASP Top 10 | 注入/XSS/eval/硬编码密钥 |
| `--test` | 测试通过 | 测试失败 |
| `--consistency` | 业务规则 + 勾稽 | 人工核对项 |

#### 架构门禁（`--all-full`，17 个，通常 15-40 秒，未配置则静默跳过）

| 门禁 | 检查什么 | 特征卡依据 |
|------|---------|-----------|
| `--layer` | DDD 分层边界（穿透/倒置/领域污染/聚合跨引用） | 第 3 项 |
| `--stable-diff` | 稳定单元篡改（改稳定层须 spec MODIFIED 声明） | 第 11 项 |
| `--link-depth` | 调用链深度（链路膨胀/纯转发堆叠） | 第 13 项 |
| `--adr` | 架构决策记录（ADR + 技术债登记） | 第 8 项 |
| `--contract` | 接口契约（version + ACL 防腐层） | 第 10 项 |
| `--consistency-cross` | BDAT 一致性（术语表 vs 代码 + 数据所有权） | 第 12 项 |
| `--impact` | 变更影响分析（消费方反查） | — |
| `--service` | 微服务架构（共享 DB/同步链/网关/trace） | 第 10 项 |
| `--api` | API 契约与幂等（version/幂等键/分布式事务） | 第 10 项 |
| `--state` | 前端状态管理（巨型 store/prop drilling/派生 useState） | 第 11 项 |
| `--frontend` | 前端组件架构（层级/props/循环依赖/CSS 污染） | 第 11 项 |
| `--cognition` | 认知递进体检（六阶+六维+五层总分） | 第 13 项 |
| `--domain` | 领域知识违规检测（密码明文/SQL 拼接/XSS/并发竞态） | 第 14 项 |
| `--knowledge` | 项目知识复用（AGENTS.md/CLAUDE.md/记忆 → skill 引用） | — |
| `--diagram` | 可视化（mermaid 结构图：架构/流程/调用链 + echarts/antv 数据图：统计/分布/趋势） | — |

#### 合规门禁（17 个，独立 `--compliance-suite` 按需执行，未配置则静默跳过）

| 门禁 | 检查什么 | 特征卡依据 |
|------|---------|-----------|
| `--compliance` | 标准合规矩阵核验（六锚点 + 零占位符 + spec §22 标准合规段） | 第 8 项 |
| `--docs-pack` | 文档包清单（rusp/gbt9386/gbt8567 profile 必备文档 + TBD 扫描） | 第 8 项 |
| `--sbom` | SBOM 生成 + 许可证块名单扫描（启用后 fail-closed） | 第 4 项 |
| `--privacy` | 个人信息扫描（身份证/手机号/银行卡内置模式 + 豁免留痕，启用后 fail-closed） | 第 7 项 |
| `--authz` | 授权类弱点扫描（缺鉴权注解/IDOR/CORS 放行带凭据，CWE-862/863/639/284） | 第 7 项 |
| `--requirements` | 需求质量检查（spec 无 TBD/待定 + REQ- 唯一编号，严格模式 fail-closed） | 第 8 项 |
| `--crypto` | 密码算法合规（profile=gm 密评：弱算法 → fail，国密白名单 SM2/SM3/SM4） | 第 7 项 |
| `--rtm` | 需求追溯矩阵（spec REQ- 编号须在测试目录或追溯矩阵可追溯；RTM_MATRIX_REQUIRED=1 时矩阵缺失 fail-closed） | 第 8 项 |
| `--release-sign` | 发布签名与 provenance（产物须带 .sig/.asc/.att/.bundle 伴随签名；cosign verify-blob 验签 + SLSA provenance fail-closed） | 第 5 项 |
| `--dengbao` | 等保 2.0 控制点（DENGBAO_LEVEL 二/三级分级：双因子/审计日志/审计字段/个人信息保护缺口，启用后 fail-closed + 豁免留痕） | 第 7 项 |
| `--pia` | 隐私影响评估（PIA 文档缺失 → fail，启用后 fail-closed） | 第 7 项 |
| `--sast-deep` | 深度 SAST（semgrep→opengrep→内置降级链，启用后 fail-closed） | 第 7 项 |
| `--oss-eval` | 开源代码安全评价（复用 --sbom 产物，成分清单/许可证纳入评价，启用后 fail-closed） | 第 4 项 |

#### 降级策略

每个门禁优先用运行时工具，无则降级：

```
graphify explain（知识图，默认）→ gitnexus trace（代码图谱，仅非商用场景）→ madge（依赖树）→ 纯转发统计
ocr review（diff 审查）→ ocr scan（全文件）→ AI 5 维度审查
claude-mem search（记忆库）→ 文件检测
```

**有能力就用，无能力降级——不浪费工具，也不因缺失崩溃。**

---

### 五、五层认知框架：特征卡和门禁的哲学根基

| 层 | 解决什么 | 与特征卡/门禁的关系 |
|----|---------|-------------------|
| 认知递进 | 如何认识项目 | 特征卡 17 项 = 认知递进的产物 |
| 思维语言 | 如何思考 | spec §14-§18 = 思维语言在 spec 中的落地 |
| 认知辩证 | 如何推演+自证伪 | 门禁 `--cognition` = 认知辩证的验证工具 |
| 偏差防范 | 如何纠偏 | spec §16 偏差自检 = 偏差防范的工程落地 |
| 辩证认知 | 如何统一前四层 | 门禁 `--domain` = 辩证认知的违规检测 |

> 门禁不是"数 import 数"——`--layer` 数 import 是为了验证"结构是否遵循依赖单向规律"；`--reuse` 数新增导出是为了验证"概念是否复用了特征卡第 11 项的既存稳定单元"。每个计数背后指向一条关系规律。

---

### 六、13 个运行时 + 32 个领域

**运行时工具**（只引用调用不重新实现）：OpenSpec / superpowers / comet / GitNexus / graphify / gsd-core / claude-mem / ocr / gstack / Ruflo / ECC / impeccable / codex-security

**领域知识速查**：数据库 ACID / 网络 CORS / 安全密码哈希 / IM 消息保序 / 电商库存原子扣减 / 金融金额 Decimal……32 个领域的客观规律。

**铁律：领域规则不得违反通用常识和客观规律。违反就是硬伤。**

---

### 七、Claude Code 深度集成

| 能力 | 用法 |
|------|------|
| ⚡ Hooks | SessionStart 注入状态 + PreToolUse(Write) 检查范围 |
| / Slash Commands | `/my-skill:spec` / `/my-skill:precheck` / `/my-skill:explore` |
| 🔌 MCP | 自动注册 gitnexus / claude-mem / graphify |
| 🌊 Dynamic Workflows | 复杂变更并行扇出 + 交叉验证 |
| 🔍 LSP | go-to-definition / find-references |
| 🤖 Subagent | 每任务新 subagent + 两阶段审查 |

---

### 八、零占位符 + 自举

**零占位符：** AI 执行完整 12 步流程后由脚本机器执法（`bash scripts/generate-skill.sh --verify-completeness <skill_dir>`）——零残留才算完成。

**自举：** swarm-yuan 能用自身的 55 个门禁检查自身（CI 三档 RC=0）。**自举只证明内部自洽，不证明外部有效**--详见 README.md §自举（S17 去重：此处不再重复完整论证，PROMO 仅声明要点，完整诚实声明在 README）。

---

### 九、一键安装，兼容 7 个 AI 工具

```bash
git clone https://github.com/issac-new/Swarm-yuan.git
cd Swarm-yuan/swarm-yuan
bash install.sh
```

Claude Code / Codex / Cursor / Windsurf / OpenCode / Gemini CLI / Kimi——自动检测，安装到对应目录。

---

### 数字一览

| 维度 | 数值 |
|------|------|
| **特征卡** | **17 项（驱动全部文件 + 184 个门禁变量 + 开发流程）** |
| **质量门禁** | **55 个（核心 10 + 架构 18 + 合规 19 + FULL-only 2 + advisory-only 6，特征卡立法 + 门禁执法）** |
| 运行时工具 | 13 |
| 领域知识 | 32 个领域 |
| 认知框架 | 5 层 |
| 兼容 AI 工具 | 7 个 |
| 三平台 | macOS / Linux / Windows |
| 零占位符 | ✅ |
| 自举 | ✅ |

---

**项目地址**：https://github.com/issac-new/Swarm-yuan

**使用说明**：本文 §6.5（原 USAGE）

---

> AI 的代码生成能力已经很强，但「项目认知」还停留在零。swarm-yuan 生成的目标技能用 17 项特征卡让 AI 先懂你的项目，用 55 个质量门禁守护代码合规——特征卡是立法，门禁是执法。


## 6.7 调研证据链

> `docs/research/` 保留 16 份调研报告（R1-R15）——它们是决策史引用的外部项目调研过程档案（对象是外部项目而非本系统设计），按"证据链不整合、指针可达"原则保留在仓库中。

---

### A14. 运行时升级 2026-09（R16，全量 16 运行时）

> 触发：user message「更新 research 目录下运行时（包括 claude code、codex、deepseek harness 等工具的版本变化情况）到最新稳定版本，比较和上一版功能差异，然后整合吸收其功能理念，优化 swarm yuan skill 能力」+「运行时不仅仅指这 4 个，research 下依赖的各种第三方都要包括」
> 数据来源：npm registry dist-tags + GitHub releases/tags + 本地 12 克隆 git fetch+checkout+diff（2026-09-01 实测）；完整调研报告 `docs/research/R16-runtime-refresh.md`（含四路子代理源码级证据）
> 范围：**全量 16 运行时**——R16 初段四件套（claude-code/codex-cli/dsh/better-harness）+ 扩展段 12 项（openspec/comet/GitNexus/gsd-core/claude-mem/ocr/graphify/superpowers/gstack/ruflo/ECC/impeccable/codex-security）
> 差异详表：CLI 双雄见 §6.4 §三 3.4；其余见本报告 + references 八份 R16 补核段（claude-code-capabilities / codex-methodology / dsh-engineering-methodology §七 / gsd-patterns / decision-governance / review-methodology / memory-persistence / subagent-orchestration）

#### 一、版本差异速览（基线 → 最新）

| 项目 | 基线 | 最新（2026-09-01 实测） | 跨度 | 动作 |
|------|------|--------------------------|------|------|
| **claude-code** | v2.1.232（调研基线）/ v2.1.237（R4 补核） | **v2.1.252**（npm latest，2026-08-31；stable dist-tag=2.1.236 通道分裂） | npm 15 版（CHANGELOG 12 条） | 升基线 + 吸收 |
| **codex-cli** | v0.146.0（调研基线）/ v0.148.0（R4 补核） | **v0.152.0**（2026-09-01 stable；v0.153.0-alpha.1 同日） | 4 stable（405 commits） | 升基线 + 吸收 |
| **dsh** | dsh-v0.1.0-rc.8（R12） | **dsh-v0.1.1-rc.2**（b150a551b；master 0.1.2-alpha.3 等 rc 再调研） | 207 commits（功能线） | 升基线 + 吸收 |
| better-harness | 0.6.4（R14） | 0.6.6（v0.6.6 tag，2026-08-31） | 2 patch | 纯方法论源不入表；对账通过（missing≠zero），无新落地单元 |
| **gsd-core** | v1.11.0 | **v1.12.0**（2026-08-30 next） | 182 commits，**1 破坏性** | 升基线 + 吸收（state.json 契约/fails_when/共识门） |
| **claude-mem** | v13.15.3 | **v13.21.2**（2026-08-31 GitHub；npm latest 回钉 12.4.7 通道异常已澄清） | 31 tags | 升基线 + 吸收（配额熔断器/观察者契约） |
| **ocr** | v1.9.8 | **v1.11.1**（2026-08-31） | 45 commits | 升基线 + 吸收（语义分组/session compare/effort 预设） |
| **graphify** | v0.9.47 | **v0.9.53**（2026-08-30 GitHub v8 线；npm 0.10.0 异源旧分支不取） | 123 commits | 升引用基线（方法论无新机制不补段） |
| **gstack** | v1.68.2.0 | **v1.77.0.0**（2026-08-31 master；vendor 快照不动） | 9 minor | 升基线 + 吸收（spawned 原语/ponytail/wiring fail-open） |
| **ruflo** | v3.38.12 | **v3.38.20**（2026-08-24 npm=tag） | 31 commits | 升基线（dream cycle 登记候选） |
| **ECC** | v2.1.0 | **v2.2.0**（2026-08-31） | 108 commits/530 文件 | 升基线 + 吸收（Plan Canvas 监听纪律/skills-over-MCP 候选） |
| **codex-security** | v0.1.16 | **v0.1.24**（2026-08-28） | 133 commits | 升基线 + 吸收（第 15 skill assess-patch-risk 候选） |
| openspec | v1.10.0 | **v1.11.0**（2026-09-01） | 13 commits | 升基线，对账通过（CLI 人体工学无新机制） |
| superpowers | v6.3.0 | v6.3.0（无新版） | — | 对账通过 |
| comet | v0.3.9 | 0.4.0-rc.1（正式版未出） | 20 beta + 1 rc | **仍 drifted 观望**（rc 阶段仍落 117k 行新子系统） |
| GitNexus | npm 1.6.9 | v1.6.11-rc.23（GitHub 恢复活跃，全 rc） | — | 仍 license-risk 不追 |
| impeccable | v4.1.1 | skill-v4.1.2（2026-08-26） | 1 patch | 有新 tag 但候选级（gate 协议合规一行），暂不升基线 |

#### 二、吸收落地（全部文档层/候选登记，不新增 check_* 门禁，守门禁预算 55）

| # | 来源 | 概念 | 落地点 | 类型 |
|---|------|------|--------|------|
| 1 | claude-code v2.1.248 | `--restricted` 锁定模式 → 环境前置诚实化（restricted 会话=门禁失能会话） | `references/claude-code-capabilities.md` R16 补核段 | 方法论 |
| 2 | claude-code v2.1.251 | PreModelSwitch/PostModelSwitch hook（模型切换可治理点）+ hooks 表 2 行 | 同上 + §四 hooks 表 | 方法论 + 候选（adaptive-gating 硬执法挂点，触发=弱模型越档真实场景） |
| 3 | claude-code v2.1.248 | Workflow 工具 prompt 外置 skill 化 5.7k→1k | 同上（上下文外置第三次方向验证） | 方法论（无实现——本仓 WP-P5 已同构） |
| 4 | codex v0.151 | Guardian 信任用户显式调用 skills → 结构化 PASS/FAIL 证据态输出是宿主审批通用货币 | `references/codex-methodology.md` R16 补核段 | 方法论 |
| 5 | codex v0.149/150/152 | 破坏性三处对账（untrusted AGENTS.md / planning 默认禁用 / skills token 预算 2%/10k） | 同上（逐条对账：本仓用户级安装无暴露面 / 自备 spec 无影响 / frontmatter 紧凑已满足） | 对账结论 |
| 6 | dsh 0.1.1 | Authorization seam 三件套 + 二版本模式 + 投影态校验 + 合而复撤纪律 | `references/dsh-engineering-methodology.md` §七（+§五候选 1 条：二版本模式，触发=渲染层损坏事故） | 方法论 + 候选 |
| 7 | better-harness 0.6.6 | "缺失证据不显示为零" | 对账通过（gate-report missing_evidence 态"不插值不算分"已同语义），无改动 | 对账结论 |
| 8 | gsd-core v1.12.0 | `.planning/state.json` 机器可读状态契约 + `<fails_when>` 强制（验收命令必须声明失败信号，破坏性）+ 共识门证据加权（孤立 HIGH 须 source-grounded）+ 缺失≠VERIFIED | `references/gsd-patterns.md` + `references/decision-governance.md` R16 补核段 | 方法论（落地） |
| 9 | claude-mem v13.21.2 | 配额熔断器四规则（持久化/单探针/generator 认领/额度≠故障）+ 观察者 SILENT/NO CONTACT 契约 + 有界会话代际 + "继任者就绪"重启语义；npm 通道异常澄清（oracle 以 GitHub tag 为准） | `references/memory-persistence.md` R16 补核段 | 方法论（落地） |
| 10 | ocr v1.11.1 | 语义文件分组审查（LLM 聚类≤10/组，组级 sub-agent）+ 跨 session findings 比较（非行号匹配四象限）+ `--effort` 预设 | `references/review-methodology.md` R16 补核段 | 方法论（落地）+ 分档候选 |
| 11 | gstack v1.77.0.0 | spawned 会话原语（标记只信创建者/破坏性永不自动选/decisions 回执）+ **fail-closed 的 wiring 层也会 fail-open**（pipefail 案钉 wiring 测试）+ ponytail 简化 lens + 捷径台账 | `references/subagent-orchestration.md` + `references/decision-governance.md` R16 补核段 | 方法论（落地） |
| 12 | ECC v2.2.0 | Plan Canvas 监听纪律（await 驻留才可达/canvas 内必答/兜底 hook——不允许静默失效）+ "skills over MCP" 政策 | `references/subagent-orchestration.md` R16 补核段 | 方法论（落地）+ 候选单行 |
| 13 | codex-security v0.1.24 | 第 15 skill assess-patch-risk（SHA-256 绑定工件 + 五维 + 五值裁决 + auto_merge_candidate） | `references/review-methodology.md` R16 补核段 | 候选登记 |
| 14 | ruflo v3.38.20 | dream cycle（假设评估前冻结 + 对抗性 critic 复现 + ACCEPT-scoped 落地） | `references/review-methodology.md` R16 补核段 | 候选登记 |
| 15 | impeccable skill-v4.1.2 | gate 输出必须匹配宿主拦截协议否则形同虚设（Stop hook 改发 Codex decision 格式） | `references/review-methodology.md` R16 补核段 | 候选登记 |
| 16 | comet 0.4.0-rc.1 | Supervisor Change v2 多 session 子图分派 + Portable State + Agent Learning Loop | `references/subagent-orchestration.md` R16 补核段 | 候选登记（等 stable 升基线时一并落地） |
| 17 | openspec v1.11.0 / superpowers v6.3.0 | 无方法论新机制 / 无变化 | 对账通过，零改动 | 对账结论 |

#### 三、验证

- [x] `bash scripts/self-check.sh --check-only` 无 drift warn（16 个 baseline_status 标记行齐全；11 synced + 1 drifted（comet 预期）+ 1 watch（claude-mem）+ 1 license-risk（GitNexus）+ 2 对账通过）
- [x] references 八份补核段过吸收三问（①落到运行时条件/对账结论 ②追加式不替换既有段 ③六个月后由 R16/A14 引用）
- [x] research/ 12 个本地克隆全部 checkout 到最新稳定 tag（gitignored 不入 git）；graphify 跟踪线确认=GitHub v8 分支 v0.9.53（npm 0.10.0/v1.0.0 异源旧分支不取）
- [x] 门禁 55 不增（预算 55 守恒）、FACT_RUNTIMES 13/5 与 FACT_REFERENCES 41 不变（补核轮不加新载体）
- [x] 本报告即 §6.6 A14；调研证据链 `docs/research/R16-runtime-refresh.md`

### A15. 运行时补核 2026-09（R17，三件套深审 + 外围九项）

> 触发：user message「更新 research 目录下运行时到最新稳定版本，（包括 claude code/codex/dsh）比较和上一版功能差异，然后整合吸收其功能理念，优化 swarm yuan skill」
> 数据来源：npm registry dist-tags + GitHub tags + 本地 16 克隆 git fetch+checkout+diff + anthropics/claude-code CHANGELOG raw 抓取（2026-09-05 实测）；完整调研报告 `docs/research/R17-runtime-refresh.md`（四路子代理源码级证据）
> 范围：点名三件套（claude-code/codex/dsh）深审 + research/ 下其余运行时全量快审（距 R16 四天的补核轮）
> 差异详表：CLI 双雄见 upstream-baseline §三 3.5；dsh 见 references/dsh-engineering-methodology §八；外围九项见 R17 报告 §五

#### 一、版本差异速览（基线 → 最新）

| 项目 | 基线（R16） | 最新（2026-09-05 实测） | 跨度 | 动作 |
|------|------|--------------------------|------|------|
| **claude-code** | v2.1.252 | **v2.1.261**（npm latest，2026-09-04；stable=2.1.236 分裂持续） | npm 9 版 | 升基线 + 吸收（无头执法档/宿主 deny 漂移警示/skill-doctor） |
| **codex-cli** | v0.152.0 | **rust-v0.153.4**（npm 0.153.3 慢一 patch；v0.154.0-alpha.3 在 alpha） | 106 commits，无破坏项 | 升基线 + 吸收（Guardian 条件性兜底/回合中结构化问答/hooks 三层信任） |
| **dsh** | dsh-v0.1.1-rc.2 | **dsh-v0.1.2-rc.1**（2026-09-03；0.1.3-alpha.1 已出现） | 1735 commits / 8 breaking | 升基线 + 吸收（**R16 预告的 0.1.2 调研兑现**：跨版本读兼容/删后端纪律/失败词表/孵化围栏） |
| **openspec** | v1.11.0 | v1.12.0（2026-09-03） | CLI 人体工学延续 | 升基线，对账通过 |
| **claude-mem** | v13.21.2 | v13.24.0（2026-09-04） | #3838 熔断器事件形状修正 | 升基线 + 补核（watch 维持） |
| **ocr** | v1.11.1 | v1.11.4 | 纯修复 | 升基线，对账通过 |
| **ruflo** | v3.38.20 | v3.38.21 | 单 patch | 升基线，对账通过 |
| **codex-security** | v0.1.24 | v0.1.25 | 跨扫描发现关系保留 + sealed 去重 | 升基线 + §十二注记 |
| **GitNexus** | v1.6.11-rc.23 | v1.6.11 **stable**（Zig/Spring 摄取等实质功能；npm 停滞） | rc→stable | license-risk 不变，登记不追 |
| comet | 0.4.0-rc.1 | 0.4.0-rc.4（正式版未出，rc.2-4 全稳定性修复） | — | **仍 drifted 观望**（裁决不变） |
| impeccable | v4.1.1（候选级） | skill-v4.1.3 / v4.2.0（Comps 可执行契约 + 录制回放钉行为 830 命令逐字节） | 2 版 | 候选级维持不升基线，候选登记 |
| better-harness | v0.6.6 | v0.7.0-alpha1 已出（证据上传端到端/原生 run streams） | alpha 未稳 | 观望，维持不入表 |
| gsd-core/graphify/superpowers/gstack/ECC | — | 零增量 | — | 对账通过 |

#### 二、吸收落地（全部文档层/候选登记，不新增 check_* 门禁，守预算 55）

| # | 来源 | 概念 | 落地点 | 类型 |
|---|------|------|--------|------|
| 1 | claude-code v2.1.259 | `--permission-prompts none` 无头执法档 → prompt 档无人值守坍缩为 deny（R13 三值化环境边界） | `references/claude-code-capabilities.md` R17 注记段 | 方法论 + 候选注记 |
| 2 | claude-code 259→260 + codex 0.153.0 | **宿主治理层条件性教义**：Claude Read-deny 应用至 Bash 参数后即回退 + strict sandbox `!` 出沙箱；Codex Full Access/User approval 跳过 Guardian——宿主 deny/审批层版本间不保证在场，执法确定性只能锚自持 55 门禁 | capabilities/codex-methodology R17 段 + upstream-baseline §3.5 评估 | 方法论（教义升级：R13"fail-open 须兜底"→"宿主治理层整体视为条件性"） |
| 3 | claude-code v2.1.261 | `/skill-doctor` 技能成本审计（未用技能+上下文成本）+ 子代理提示词外置 + 输出预算设置 | 同上（门禁预算宿主侧证据源；外置第四次验证） | 方法论（登记） |
| 4 | claude-code v2.1.257/260 | `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` + Workflow schema 前置校验 + Containment Escape + 后台命令限时移除 | 同上 | 方法论（登记） |
| 5 | codex v0.153.0 | `request_user_input_async` 回合中结构化问答（Interrupt 守护点候选正式参照）+ hooks 三层信任 + context_management 实验模式（ChatGPT 后端限定） | `references/codex-methodology.md` R17 注记段 | 方法论 + 候选登记 |
| 6 | dsh 0.1.2-rc.1 | 跨版本读兼容三件套（compatibleVersions/backup-and-skip/构建归档夹具）+ 删 SQLite 后端迁移纪律（显式切断+旧构建出口+归档原子替换）+ `<domain>/<reason>` 失败词表 + Agent Teams 孵化围栏 | `references/dsh-engineering-methodology.md` §八（簇 A/B/D 补核；机械落地触发条件未变） | 方法论（补核段） |
| 7 | claude-mem #3838 | 熔断器判据必须绑定上游真实事件形状（rate_limit_event 与 SDK 消息形状不匹配案） | `references/memory-persistence.md` R17 补核 | 方法论（对账通过） |
| 8 | impeccable v4.2.0 | Comps 可执行契约阶段门 + 录制回放钉行为（830 命令+16058 函数调用逐字节——cli-ab 同构印证）+ 统一规则引擎 | `references/review-methodology.md` R17 段 | 候选登记 |
| 9 | codex-security v0.1.25 | 跨扫描发现关系保留（findings 生命周期跨扫描延续） | `references/codex-security-methodology.md` §十二注记 | 对账结论 |
| 10 | comet rc.4 / GitNexus v1.6.11 / better-harness 0.7.0-alpha1 / openspec v1.12.0 / ocr v1.11.4 / ruflo v3.38.21 / gstack 零增量 | 观望维持 / license-risk 登记 / 观望 / 对账通过 | `references/subagent-orchestration.md` comet 行 + `references/code-graph-tools.md` GitNexus/graphify 事实同步 + upstream-baseline 各行 | 对账结论 |
| 11 | 数字裂缝修正 | codex-security-methodology FACT_REFERENCES 34→41；code-graph-tools graphify 许可证 MIT→Apache-2.0、0.10.0 待评估注记与 R16 裁决对齐 | 两文件就地修正 | 裂缝修复 |

#### 三、验证

- [x] 16 克隆 git fetch + 移动项 checkout（codex rust-v0.153.4 / dsh 0.1.2-rc.1 / openspec v1.12.0 / claude-mem v13.24.0 / ocr v1.11.4 / ruflo v3.38.21 / codex-security npm-v0.1.25 / comet rc.4 跟踪 / gitnexus v1.6.11）；better-harness 维持 v0.6.6
- [x] 吸收三问 14 项评审：落地 9（方法论层）+ 候选 3 + 对账若干；references 八份补核段全部追加式、不替换既有段
- [x] 门禁 55 不增（预算 55 守恒）、FACT_RUNTIMES 13/5 不变、FACT_REFERENCES 41 不变（补核轮不加新载体）
- [x] `bash scripts/self-check.sh --check-only` 无新 drift；16 个 baseline_status 标记行齐全（13 synced + 1 drifted（comet 预期）+ 1 watch（claude-mem）+ 1 license-risk（GitNexus））
- [x] 本报告即 §13 A15；调研证据链 `docs/research/R17-runtime-refresh.md`

---

### A16. 运行时补核 2026-09（R18，claude-code 纯修复轮 + 外围四行移动）

> 触发/协议/证据链同 `docs/research/R18-runtime-refresh.md`；本段为 §13 档案摘要。

#### 一、结论

- 三件套：claude-code v2.1.261→**v2.1.263**（纯修复轮，changelog 单条 reliability、npm 无 262——无机制级变化，无吸收）；codex rust-v0.153.4 / dsh 0.1.2-rc.1 零增量。
- 外围 4 行移动：**gsd-core v1.13.0**（minor：证据纪律三连 + Review Dispositions Ledger 契约化，注记级吸收）；graphify v0.9.55（六项图谱完整性修复对账）；gstack v1.80.0.0（1.79 派发不搁浅 / 1.80 hooks 单一状态根——韧性族注记，vendor 不动）；impeccable skill-v4.2.1（候选级观察）。
- 网络：github.com git 通道当日间歇 connection reset，16 克隆 fetch 分批重试后全部成功；版本真值 npm + GitHub API 双核。

#### 二、吸收（三问 11 项浓缩）

落地注记 5（gsd 证据纪律三连 #4085/#4157/#4163 + Dispositions Ledger #4345 + gstack 1.79 派发不搁浅）+ 一行印证 2（context-drift 前置门与 fingerprint --diff 同向 / gstack 1.80 状态根）+ 候选 1（dispatch.maxConcurrency + quick-batch manifest）+ 观察行 1（impeccable 4.2.1）+ 无吸收 1（claude-code 263）+ 对账 1（graphify 幻影边关闭）。零新 references 文档、门禁 55 守恒、FACT_RUNTIMES 13 / FACT_REFERENCES 41 不变、不发版。

#### 三、验证

- [x] 16 运行时 npm + GitHub API 双核；移动项克隆 checkout（gsd-core v1.13.0 / graphify v0.9.55 / gstack c241216）
- [x] 规范层数字裂缝：code-graph-tools graphify 基线行滞后 0.9.53 → 0.9.55 就地修复
- [x] `bash scripts/self-check.sh --check-only` 无新 drift；本报告即 §13 A16

### A17. 运行时补核 2026-09（R20，claude-code 265 实质轮 + comet 0.4.0 兑现）

#### 一、触发与结论

用户点名三件套 + 全量快审（2026-09-09，距 R18 三天）。结论：codex/dsh 零增量（0.154 与 0.1.5 均在 alpha 通道不取）；claude-code v2.1.264-266 为**实质轮**（2.1.265 功能性条目密集）；**comet 0.4.0 stable 发布，R16 预登记触发条件命中**——引用基线 v0.3.9→v0.4.0、drifted→synced，**16 行 drift 归零**。

#### 二、落地

吸收三问过审 5 项落地 claude-code-capabilities.md R20 注记（--plugin-dir 目录化 / 1GB 工具结果上限 / prompt-cache 稳定性族（编排不变量：不得重排提示前缀）/ 中断工具调用恢复诚实性（partial 第二实证）/ 不可信内容标记候选）+ 266 教训（宿主行为细节版本间不保证稳定第三次实证）。comet 段按 0.4.0 架构重写（subagent-orchestration.md）。外围注记一行×6（ocr 1.11.6 评审控制参数化 / graphify 0.9.56（克隆 origin 重指向 Graphify-Labs）/ ruflo 3.38.23 真实测量替换虚构基准 / ECC 2.2.1 维护版 / codex-security 0.1.26 / gstack 1.83.0.0）。执行纪律（2026-09-08 增补）首次全流程执行：细节全留 R20 档、无同日复核、patch 级外围只动表行。零新 references 文档、门禁 55 守恒、FACT_RUNTIMES 13 / FACT_REFERENCES 42 不变、不发版。

#### 三、验证

- [x] 16 运行时 GitHub releases 双核 + 移动项克隆 checkout（comet 0.4.0 / ocr v1.11.6 / graphify v0.9.56 / ruflo v3.38.23 / ECC v2.2.1 / codex-security npm-v0.1.26 / gstack caba78f）
- [x] `bash scripts/self-check.sh --check-only` 全绿 + comet drift warn 归零 + 认知面预算达标（超限则按 R18 先例裁旧注记段）
- [x] 本报告即 §13 A17；调研证据链 `docs/research/R20-runtime-refresh.md`

### A18. 运行时补核 2026-09（R22，codex 0.154.0 实质轮 + dsh 0.1.5-rc.1 跨线）

#### 一、触发与结论

用户周期性点名三件套 + 全量快审（2026-09-10，距 R20 次日，非同日复核）。结论：**codex rust-v0.154.0 stable 兑现**（R20 收口后数小时——唯一 minor 实质轮）；**dsh dsh-v0.1.5-rc.1 出 rc**（R20 预告触发点命中，跨 0.1.3→0.1.5 两功能线，rc 作基线沿 R17 先例）；claude-code v2.1.267 为实质 patch（治理原语 + 缓存大族 + fail-closed）。16 行 drift 保持零。

#### 二、落地

三件套注记：claude-code-capabilities.md R22 段（`maxEffortLevel` effort 治理原语候选 / prompt-cache 工具动态性大族（缓存稳定性编排不变量第三波——工具面变更由宿主 deferred/replay 消解）/ managed allow-list fail-closed 第四实证 / `--system-prompt-snapshot` 快照-新鲜度权衡）；codex-methodology.md R22 段（worktree 隔离原语候选 / inline 追问 / plugin-skill 热刷新（技能热装载成双宿主标配）/ Guardian 授权时效性与上下文完整性 / `codex mcp-server` 移除破坏项对账零引用）；dsh-engineering-methodology.md §九（动态系统提示不破 KV Cache（缓存友好编排第三实证）/ 消息归属与顺序成编排不变量 / 暂停即终止用户独占恢复权）。外围注记：openspec 1.13.0（解析器不得静默改写——诚实性族新样本）/ claude-mem 13.24.5（npm 通道恢复）/ ocr 1.11.7 / graphify 0.9.57 / gstack 1.84.1.0（impeccable interop）/ ruflo 3.40.0（Cross-Host Federation + Claims，方法论级候选）。**跨档主题**：「保持不变量」清单扩展——claude 保缓存 / codex 保授权 / dsh 保消息归属；证据链的上下文完整性与证据本身同等重要。零新 references 文档、门禁 55 守恒、FACT_RUNTIMES 13 / FACT_REFERENCES 42 不变、不发版（补核轮）。

#### 三、验证

- [x] 16 运行时 GitHub releases 双核 + 移动项克隆 checkout（codex rust-v0.154.0 / dsh dsh-v0.1.5-rc.1 / openspec v1.13.0 / claude-mem v13.24.5 / ocr v1.11.7 / graphify v0.9.57 / ruflo v3.40.0 / gstack 71f6048）
- [x] `bash scripts/self-check.sh --check-only` 全绿 + drift warn 保持零 + 认知面预算达标（超限则按 R18 先例裁旧注记段）
- [x] 本报告即 §13 A18；调研证据链 `docs/research/R22-runtime-refresh.md`



### 决策 52：离线分发终口径与三平台一键（2026-10-22，R133-R136）

- **源装分离**：可经 npm/pip 源装的运行时不入包体（安装命令走源，comet 通道修正为 npm scoped 真包后全部功能运行时可源装）；源装不了的（知识资产/docs 档案/三 GitHub 源码包）才随包——`--everything` 即此口径的零降级件。
- **一键默认**：无参数安装=全宿主自动检测+全段装载，Windows/macOS/Linux 三入口同构；`--minimal` 保留显式路径。
- **版本溯源随包**：`.bundle-version` 兜底 git 缺席场景；安装器两层（本地 vendor 优先→源兜底）；完整性校验对含空格文件名保真。
- 依据：用户三轮裁决（"vendor 安装走 npm/pip 源"、"三平台=Windows/macOS/Linux"、"一键安装"）；月度审计 R1-R7 修复后 sweep 6/6（111 锁）。

### 决策 53：入口硬顶与升级在途门（2026-10-24，R140）

- **入口文件 20000 字符硬顶**：宿主压缩后重挂载技能在 20000 字符处截断、其后内容整会话消失（superpowers v7.0.1 实测物化为体积守门）；与 11392B 预算构成两档防线——预算可按先例再登记上调，硬顶锚宿主行为不可越（FACT_SKILLMD_BYTES_HARD_CAP，gen-e2e §7.6b 断言）。
- **升级在途门**：升级即破坏性变更（comet 0.5.0 升级门理念）——项目状态机停在中间阶段时 fail-closed 拒升级（exit 2 点名 change/phase 与解除路径），open/archive/无状态放行，SWARM_YUAN_UPGRADE_ALLOW_INFLIGHT=1 显式豁免。
- **门禁八族修复**（实栈回归实抓，test-r140 24 断言锁）：门禁文件锚技能根全局注入（temp 部署形态 CWD 落错文件）/构建产物排除（coverage·dist·target）/--all-full warn 压缩披露可对账/评审记录文件名口径对齐（日期命名被认）/SPEC_FILE·CHANGE_IMPACT_FILE 环境通道条件赋值（死代码复活）/spec 发现取最新 mtime/shift-left plan 发现补 .swarm-yuan/tasks.md 承载 §20 执法。
- 依据：R140 实栈回归三任务九节点全流程（后端 39/39、前端 27/27、门禁终态 fail 0）+ sweep 6/6（116 锁测试）；证据链 docs/research/R140-runtime-refresh.md。

### 决策 54：状态/历史分离与执行面预算（2026-10-24，全功能重构轮）

**背景**：R140 运行时刷新把 13 项新基线写进了 `docs/upstream-baseline.md`，但作为“权威源”的 `assets/registry/runtimes.tsv` 仍停在旧值（claude-code 2.1.304 vs 2.1.309、codex 0.163 vs 0.164、ruflo 3.58.1 vs 3.59.17 等）——注册表平面出现双源漂移，而 self-check 仍全绿。同轮实测还发现：终态设计文档的派生计数（324 行/55 篇/99 文件/113 测试/202 断言）全部滞后；3 个测试未登记 `tests/index.tsv`；执行面代码行数无预算；`build-compendium --check` 只抽查每卷前 200 行；生命周期原则声称“表内状态列”，但门禁表与文档表没有 status 列。

**决定**：

1. **状态表与历史分离**：`upstream-baseline.md` 只存当前值；逐轮核验与旧表全文进 `docs/research/upstream-changelog.md`（append-only）。状态表由 `registry-render.sh --write-upstream-baseline` 从 `runtimes.tsv` 渲染，`--check` 校验逐行一致、面积 ≤40KB、无历史头注。
2. **派生计数不手抄**：终态设计文档与注册表 README 不再写易漂移的行数/篇数/测试数/断言数，改为指向 `facts.conf`、`--counts`、`tests/index.tsv` 与运行输出；豁免表路径统一为仓库根 `docs/`。
3. **测试元数据闭环**：所有 `test-*.sh` 必须登记 `tests/index.tsv`；`test-runner-contract` 对未登记项 fail，防止并行/层级默认值静默兜底。
4. **执行面预算**：新增 `FACT_ENGINE_CODE_LOC_MAX` 与 `FACT_FRAMEWORK_GATE_LOC_MAX`（2026-10-24 实测冻结 7769 / 18464；R141 sharding 聚合外包检测 +5 行登记上调至 18469），self-check 超限即 fail；口径为域源，不含生成的聚合视图，避免双计。
5. **生命周期可观**：`registry-render.sh --lifecycle` 输出 claim 不足、无夹具、未接线、未实证的退役候选；终态文档如实标注“自动退役拦截尚未建立”。
6. **汇编可重生成**：`build-compendium.sh --regen` 重渲六卷，`--check` 逐字节比对；不再用前 200 行抽查代替全文一致性。

**与既有决策的关系**：决策 50（注册表平面）从“表存在”推进到“表的派生视图也由表生成”；决策 38/26（预算）从门禁/变量/字节扩展到执行面代码行数；决策 48（执行面消费闭环）落到测试元数据与生命周期候选；决策 49/51 的“宣称须有证据”用于清理终态文档中的过时计数。

### 决策 55：运行时刷新吸收与升级预演（2026-10-24，R141）

**背景**：例行刷新核验 22 项上游运行时，7 项移动。openspec 1.15.0 引入 `update --dry-run`，把“升级前先看变更面”从人工约定变成 CLI 能力；claude-mem 15.0.2 暴露旁路观察通道与主任务争输出预算的问题；ruflo 3.61.1 与 graphify 0.9.95 延续“虚假成功/认证虚标/可预测临时文件”三族。本仓已有在途状态门管升级时机，但缺少“升了会动什么”的内容面。

**决定**：

1. **升级预演物化**：`generate-skill.sh --upgrade --dry-run` 走完整升级流程但零写入，输出 add/change/delete 三态；暂存副本放系统临时目录、不落 trace；单独使用 fail-closed；在途门对预演放行、真升级仍拦截。与在途门互为时机面/内容面。
2. **旁路通道预算隔离**（claude-mem 15.0.2）：观察/摘要/打分类辅助调用不得与主任务争同一输出预算；降级重试有界且成本如实入账。吸收为 references 方法论，不加门禁。
3. **虚假成功与写入安全继续入册**（ruflo 3.61.1 / graphify 0.9.95）：dry-run 必须真干跑、零分与缺省不得折算成功、临时文件名不可预测、证据等级不虚标。均为既有“声明-消费对账”族的续例。
4. **基线写回注册表**：7 项移动写回 `assets/registry/runtimes.tsv`，状态表由脚本重渲；逐轮差异只进 `upstream-changelog.md` 与 R141 轮档，不写回状态表。
5. **不新增门禁**：门禁 56 冻结不变；本轮新增 2 个回归测试（dry-run 10 断言、项目根重定位 11 断言）并同步 2 个版本钉测试。
6. **实栈回归两处根治**：① 项目迁移/克隆后 `--upgrade` 保留 AUTO:detected 旧 `PROJECT_DIR`，门禁读旧项目 coverage 产物——升级流程新增项目根重定位（conf + 操作档刷新，历史证据不动，外部 target-dir 只告警）；② ShardingSphere 下 `COALESCE(SUM(...))` 阻断聚合归并（3 行只算 2 行）——sharding 规则库补第 15 条，`fw_sharding_unsupported_sql` 增检测，夹具双态锁。

**与既有决策的关系**：决策 46（吸收两问）继续作为过滤器；决策 53（在途门）补上内容面；决策 54（派生面收口）要求本轮的版本差异只进 append-only 记录。依据：`docs/research/R141-runtime-refresh.md`。

### 决策 56：账本落点四级解析（2026-10-24，R141 双活合流）

- **账本落点四级解析**（trace-log/state-machine，D1 trade-forge 实证）：独立调用且 CWD 在技能目录内时，决策/trace 账本曾逐字落 pwd 写进技能侧 `.swarm-yuan/` 碎片（正本在项目侧，全新生成技能时碎片被清=证据链断；D-140-01 三条决策实证）。根治=PROJECT_DIR 四级解析（`--project-dir` 显式 > 环境变量 > 同目录 precheck.conf > CWD 在技能目录内上溯项目根 > 逐字 pwd 兜底），state-machine 同条带（R126 两侧一致契约延续）。
- 依据：R141 实栈回归两任务九节点全流程（后端 49/49、门禁终态 fail 0）+ test-r141 14 断言；证据链 docs/research/R141-runtime-refresh.md。
