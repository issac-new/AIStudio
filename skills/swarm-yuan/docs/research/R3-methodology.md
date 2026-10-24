# R3 · 方法论体系深度分析：references/ 14 篇方法论文档

> 调研日期：2026-07-20（档案日期，自 git 首次提交补录——本目录为决策史过程档案，内容定格于调研时点，不随后续演进更新）

> 角色：R3-方法论体系分析员 ｜ 日期：2026-07-20
> 范围：`swarm-yuan/references/` 下 13 篇方法论文档 + `references/frameworks/_template.md`（合计 14 个文件，5453 行）
> 方法：全文通读 + 全仓 grep 引用图谱 + 门禁代码（`assets/precheck.sh`，2667 行）交叉验证 + 审计文档（`docs/2026-07-20-audit-optimization-decisions.md`、`docs/paradigm-decisions.md`）比对
> 证据约定：文件路径均为相对仓库根 `/Volumes/nvme2230/lab/Swarm-yuan` 的路径；行号为 2026-07-20 当日工作区实测。

---

## 一、总览：14 篇文档的功能定位与被引用关系

### 1.1 逐篇画像

| # | 文件（行数） | 核心主张 | 结构 | 被引用/驱动关系 | 死活判定 |
|---|-------------|---------|------|----------------|---------|
| 1 | `cognition-framework.md`（130） | 五层认知基底总导航：认知递进→思维语言→认知辩证→偏差防范→辩证统一，"缺任一层，认知有系统性漏洞"（:15） | 五层总览表 + §1 第一层 + §2 第二层 + §3 第五层 + §4 执行准则 + §5 ECC 认知扩展 + §6 最小意识三条件 | SKILL.md:55/116；spec-template.md:255；template-spec.md:591-597；domain-knowledge.md:384；exploration-guide.md:1124；generate-skill.sh；`--cognition` 门禁按关键词打分（precheck.sh:2083-2128） | **半活**（软驱动 + 装饰性门禁） |
| 2 | `logic-razor.md`（105） | 对抗审查两步法（隐性解剖→降维输出），审查报告 6 模块，"审查者不得全盘肯定——须挑出至少 10% 严谨性瑕疵"（:3/:105） | 两步法 + 谬误图谱四类 28 条 + 分析框架武器库 5 件 + 协同表 | SKILL.md:55/117；cognition-framework.md:11/126；template-spec.md:594；generate-skill.sh。**spec-template.md 无对应段；precheck.sh 无任何 razor 执法点** | **实质死文档**（仅 checklist 点名，零执法） |
| 3 | `cognitive-bias.md`（146） | "认知偏差是系统性捷径——可预测、可防范"（:3）；五维 20 条偏差 + 思维模型 8 类 | 五维分类 + 工程阶段锚点表 + 8 类清单 + spec §16 模板原文 + 层间协同 | SKILL.md:55/118；spec-template.md:255（§17 段末）；template-spec.md:595；cognition-framework.md:12；domain-knowledge.md:384；`--cognition` 第四层关键词打分（precheck.sh:2100-2109） | **半活**（spec §16 模板直接内嵌其内容） |
| 4 | `domain-knowledge.md`（406） | 领域知识是"分析起点而非复制清单"（:3/:404），防达克效应 | 技术 11 域 + 业务 7 域 + 支付清算 3 域 + 安全合规 2 域 + 架构 4 域 + 管理 2 域 + 运维 3 域（=32）+ 框架迁移声明（:388-394） | SKILL.md:55/119；template-spec.md:496；cognition-framework.md:127；exploration-guide.md:1230；`--domain` 门禁 grep 目标产物证据标记（precheck.sh:2300 附近；domain-knowledge.md:406） | **半活**（含 1 处迁移后悬空引用，见 §五.8） |
| 5 | `exploration-guide.md`（1297） | 探查方法论总纲：三路并行 + 项目知识先读 + §C+ 全量穷举/链路分析/约束推导/计数核验 | 探查策略 → Step -1 知识读取 → Step 0 图谱 → 特征卡工具矩阵 → A/B/C 清单 → §C+.0-C+.5 → 各语言要点 → 16 项特征卡模板 → 兜底默认值 | SKILL.md:10/61/66/71/79/114；template-spec.md 全篇呼应；**57 个框架规则文件全部引用它**（gen-framework-index.sh 向其 §C+.0.5 写入信号索引区块，exploration-guide.md:265-543） | **活**（生成流程的驱动核心） |
| 6 | `template-spec.md`（604） | 六段式填充规范 + 生成后核对清单（验收依据） | meta/workflow(9要素)/reference(16卡映射表)/assets/check/scripts 六段 + 12 组核对清单 | SKILL.md:12/79/115；generate-skill.sh；domain-knowledge.md:392 | **活**（验收清单的唯一来源） |
| 7 | `subagent-orchestration.md`（464） | superpowers spawn-collect 循环：每任务新 subagent + 两阶段审查 + 文件交接 + progress ledger；ECC/Ruflo 扩展 | 核心理念 → 循环 → 交接 → 回报契约 → 两阶段审查 → superpowers 14 skills + comet 5 阶段 → ECC orch-* → Ruflo v3.21/v3.26-32 → ecc.session.v1 契约 | SKILL.md:122；template-spec.md:584；gsd-patterns.md:157；generate-skill.sh | **半活**（纯阅读引用；结构有孤儿行，见 §五.7） |
| 8 | `review-methodology.md`（395） | 5 维度审查 + 两遍清单 + AUTO-FIX/ASK + 严重度分级 + strict focus；ocr/gstack/ECC/gsd 扩展 | 5 维度 → 两遍清单 → 处置启发式 → specialist 并行 → ocr 引用 → gstack v1.58/ocr v1.3 全量 → ECC 审查扩展 → superpowers 模式 | SKILL.md:123；template-spec.md:433/586；logic-razor.md:93；memory-persistence.md:192；`--review` 门禁**代码中不点名本文档**（precheck.sh 全文 grep 无 `review-methodology`） | **半活** |
| 9 | `code-graph-tools.md`（291） | GitNexus/graphify 只引用不复制；图谱替代随机 grep | 两工具安装/命令/IO/集成模式 → ECC hook 治理 → graphify v0.9.13-19 → 对比表 → GitNexus v1.6 + graphify v0.9 全量 | SKILL.md:124；template-spec.md:471/587；exploration-guide.md:86；generate-skill.sh | **半活** |
| 10 | `gsd-patterns.md`（243） | phase-loop（Discuss→Plan→Execute→Verify→Ship）+ goal-backward（"任务完成≠目标达成"，:73）+ 4 类门禁分类 + capability 声明式插件 | 安装/命令 → 五步循环 → 对抗验证 → 门禁分类 → wave 并行 → loop host 12 点 → capability → context-monitor → 5 层架构 → 测试 6 契约 → v1.6 全量 | SKILL.md:125；template-spec.md:588；subagent-orchestration.md 互引；generate-skill.sh | **半活** |
| 11 | `memory-persistence.md`（398） | 记忆三层组合：state-machine 管阶段 + progress ledger 管任务 + claude-mem 管跨会话知识（:148） | claude-mem 引用 → detached observer → 3 层渐进检索 → 双 Session-ID → SQLite 并发 → mode JSON → 协同表 → ruflo/ECC 扩展 → v13 全量 18 skills | SKILL.md:126；template-spec.md:589；review-methodology.md:192；generate-skill.sh | **半活** |
| 12 | `security-spec.md`（311） | OWASP Top 10 / STRIDE / CWE Top 25 三标对齐 + LLM 信任边界 + swarm-yuan 自身三平台兼容 | 应用安全 → 代码安全 → 网络安全 → AI 安全 → 检查清单 → 三平台兼容 → helper 传播签名 | SKILL.md:28-29/121；spec-template.md:132；template-spec.md:300/436/451；exploration-guide.md:104；memory-persistence.md:103；**precheck.sh:1204 唯一直接点名输出**（"完整规范见 references/security-spec.md"） | **活**（唯一被门禁代码点名的方法论文档；但内部有双 §6.5 瑕疵，见 §五.6） |
| 13 | `claude-code-capabilities.md`（556） | Claude Code 全量能力清单（159 版 releases + CLI 调研，:1-3），生成时编织进目标技能 | 工具/Slash/Skills/Hooks/Subagent/Settings/MCP/Plugin/Worktree/Context/Memory/其他/Dynamic Workflows/集成清单/CLI 全量/速查 | SKILL.md:83/120；generate-skill.sh。**无任何门禁引用** | **半死**（纯能力清单知识文档；结构有双"十三、"瑕疵，见 §五.5） |
| 14 | `frameworks/_template.md`（107） | 框架规则集六段式模板 + frontmatter 四字段契约（ruleset_id/适用版本/最后调研/深度门槛，:18-22） | §1 探查信号 → §2 构件枚举 → §3 领域规律 → §4 门禁清单 → §5 跨框架交互 → §6 版本陷阱 | gen-framework-index.sh:30（跳过它）；self-check.sh:447（跳过它）；verify-framework-ruleset.sh 按其契约校验 57 个规则集 | **活**（模板即契约） |

### 1.2 引用驱动分层结论

- **硬驱动（被门禁代码点名）**：仅 `security-spec.md` 一篇（precheck.sh:1204）。
- **门禁关键词驱动**：`cognition-framework` / `logic-razor` / `cognitive-bias`（`--cognition` 对目标产物 grep"逻辑剃刀|谬误图谱"等关键词计分，precheck.sh:2083-2091）、`domain-knowledge`（`--domain` grep 证据标记）。门禁读的是**生成物**而非这些文档本身。
- **流程驱动**：`exploration-guide.md`（SKILL.md Step 1-4 的方法源）、`template-spec.md`（Step 12 + 末尾核对表）。
- **纯阅读软引用**：`subagent-orchestration` / `review-methodology` / `code-graph-tools` / `gsd-patterns` / `memory-persistence` / `claude-code-capabilities` —— 只出现在 SKILL.md 清单与 template-spec checklist 中，AI 读了才算数，无任何机械核验。
- **最弱一环**：`logic-razor.md`——6 模块审查报告、"至少 10% 瑕疵"铁律在 spec 模板、precheck、verifier 中均无落点，只被 template-spec.md:594 一行 checklist 提及。

---

## 二、五层认知基底：学术依据与自洽性

### 2.1 学术渊源（可识别的谱系）

**先给证据：五篇核心方法论文档全文无任何学术引用。** grep 实测：`cognition-framework.md`、`cognitive-bias.md`、`logic-razor.md`、`domain-knowledge.md`、`template-spec.md` 五个文件含 URL 数为 **0**（2026-07-20 实测 `grep -c "http"`）；全库仅出现"图尔敏"（logic-razor.md:13/83）与"奥卡姆剃刀"（cognitive-bias.md:96）两个术语名，无人名/年份/文献号。

可识别的谱系（以下为分析员推断，文档自身均未标注）：

| 构件 | 通行学术/行业出处 | 文档中的位置 |
|------|------------------|-------------|
| 第一层"六阶认知链"（概念→结构→空间→映射→规律→处理）+ "本质的展开" | 黑格尔式本质论与马克思主义认识论的自造综合；无直接对应标准模型 | cognition-framework.md:9/19 |
| "六维动力学"（速度/聚散/趋势/强度/能耗/累积量） | 物理学隐喻的自创映射，**无学术依据**；且 `--cognition` 仅做关键词计分（见 §2.2-c），隐喻未落到真度量 | cognition-framework.md:21 |
| 第二层"三元演化"（认识→价值→方法→实践→矛盾反馈） | 近似《实践论》"实践-认识-再实践"循环 | cognition-framework.md:29 |
| "7×7 双循环"（界定→分解→优先→分析→关键分析→综合→实施） | 近似 McKinsey 七步成诗问题求解法的变体 | cognition-framework.md:35 |
| 七推理（归纳/演绎/溯因/类比/分解/假设检验/辩证） | 标准推理类型学（溯因=abduction，Peirce 谱系） | cognition-framework.md:33 |
| 图尔敏模型 | Toulmin, *The Uses of Argument*, 1958 | logic-razor.md:83 |
| 金字塔原理 | Barbara Minto, 1987 | logic-razor.md:87 |
| 需根解损 | 政策性辩论（policy debate）的"需要-根属-解决-损益"框架 | logic-razor.md:86 |
| 锚定效应 / 规划谬误 / 确认偏误 | Tversky & Kahneman, 1974；Kahneman & Tversky, 1979 | cognitive-bias.md:14/44 |
| 达克效应 | Kruger & Dunning, 1999 | cognitive-bias.md:50 |
| 多元思维格栅 / 反脆弱 | Charlie Munger；Nassim Taleb | cognitive-bias.md:96/90 |
| 第五层 7 对辩证范畴 + 矛盾分析法 | 唯物辩证法教科书范畴体系（本质与现象、内容与形式、原因与结果、必然与偶然、可能与现实 + 实践与认识、真理与谬误、绝对与相对真理）+《矛盾论》主要矛盾分析法 | cognition-framework.md:43-55 |
| §6 "最小意识三条件"（M 积极自我维持 / H 历史适应性 / A 自主能动性） | 最小意识（minimal consciousness）研究的借喻，自创映射 | cognition-framework.md:112-118 |
| SMART | Doran, 1981 | spec-template.md §1.2（经 cognition-framework.md:31 引用） |

**结论**：哲学基底是"唯物辩证法 + 认知心理学 + 论证理论"的**二手综合**，方向自洽，但因零引用，在行业标准评审场景下无法出示依据链；且多处术语被二次定义（如"剃刀"既指奥卡姆又指自创六步审查法）。

### 2.2 自洽性问题（五处硬伤）

a. **层级归属错位**：六维动力学在 §1 列为第一层内部构件（cognition-framework.md:21），在 §3 又被划归"现象"侧（"本质=①-⑥；现象=六维动力学"，:41）——同一构件跨两层复用，关系未说明。

b. **三导向 vs 四导向并存**：§2 说"三导向：问题/目标/结果"（:31），§4 说"四导向：价值/目标/问题/结果"（:63），SKILL.md:44 用四导向——两处口径未桥接。

c. **分数体系与代码不符**：`--cognition` 打印"认知总分 X/11"，实际五维子分为 2+3+3+3+3=**14**（precheck.sh:1887/1908/1922 附近/1947/1991，汇总 :2048-2050）；五层总分打印 X/19（five_layer_max=19，precheck.sh:2125-2126），实际满分为 14+3+2+2+1=**22**。审计文档已确认此错配（docs/2026-07-20-audit-optimization-decisions.md:33）。"≥15/19=完整"的阈值在满分实为 22 时语义漂移。

d. **执法空转**：`check_cognition` 全文 0 个 `fail()` 调用（审计 :33 确认），且 `--cognition`/`--domain`/`--shift-left` 在无项目 spec 时回退对范式自带模板自证判 pass（审计 :35）——第四层"真理↔谬误的边界"（cognition-framework.md:12）在门禁层无裁判。

e. **方法论间直接冲突**：logic-razor 强制"即使方案无懈可击也须挑出至少 10% 严谨性瑕疵"（logic-razor.md:3/:105），而 gsd-core 的 honest verifier 原则要求"spec 信息不足时**弃权**（abstain: insufficient_spec）而非猜测……防止编造验证结果"（review-methodology.md:339-349）。一个强制产出批评，一个禁止无据产出——**强制找茬与诚实弃权不可同时为真**，体系内未裁决。

---

## 三、22 段 spec 模板 ↔ 16 项特征卡的映射完备性

### 3.1 口径核查

- `assets/spec-template.md` 实测含 **25 个 `## ` 二级标题**：§1-§21 + §5.5/§5.6/§5.7 + **重复的 §6**（:151 与 :152 连续两行均为 `## 6. 前端/UI`）。README.md:257/:273 与 docs/USAGE.md:297 均称"22 段"——**口径与实数不符，且 §6 标题重复是模板 bug**。
- 16 项特征卡定义于 exploration-guide.md:1010-1284；映射表在 template-spec.md:206-227——但那是"特征卡→**目标技能文件**"的映射，**不存在**"特征卡→spec 段"的显式映射表。

### 3.2 双向覆盖分析

| 方向 | 覆盖情况 |
|------|---------|
| 卡→段（正向） | 卡13→§14/§15/§16/§17；卡14→§18；卡11→§5.5+§6/§7/§8 复用行；卡4→§5.6；卡7→§5.7；卡3→§3；卡9→§11；卡12→§10；卡8→命名约定。**卡 1/2/5/6/10 无 spec 段**——合理（项目静态事实，属于 codebase/SKILL/precheck 而非单次变更文档） |
| 段→卡（反向） | §1/§2/§9/§12/§13 无卡对应——合理（变更级内容）；**§19/§20/§21 左移三段无任何特征卡对应项**——v3 左移扩充了 spec 与 `--shift-left` 门禁，却没有扩充 16 卡模型（SKILL.md:12 与 template-spec.md:303-307 新增），这是"16 卡认知 DNA"与"22 段 spec"两个版本叙事之间的**模型漂移** |

**结论**：映射是"多对多 + 双向不完备"。缺一张显式 RTM（需求追溯矩阵）和相应的一致性门禁；template-spec.md:482-498 的"16 项全覆盖 checklist"只覆盖到文件级，覆盖不到 spec 段级。

---

## 四、32 领域知识的覆盖与深度

### 4.1 覆盖核实

逐节计数：技术 11（关系型 DB/文档型 DB/缓存/HTTP/WebSocket/安全/并发/前端框架/前端 CSS/分布式/构建 DevOps）+ 业务 7（IM/电商/CRM/监控/DevOps-CI/教育/金融）+ 支付清算 3（境内银行卡/跨境/网络支付）+ 安全合规 2（等保 2.0/ATT&CK）+ 架构 4（DDD/TOGAF/C4/常用模式）+ 管理 2（SAFe/敏捷工程实践）+ 运维 3（SRE/K8s/容灾）= **32**，与 SKILL.md:119 口径一致。

### 4.2 深度评价

- **最强：支付清算三子域**（domain-knowledge.md:189-227）——ISO 8583 报文、冲正幂等且不可被冲正、批次闭环、长短款差错、双边 T+1 对账、OFAC/UN 制裁筛查、JPY=0 位精度等，明显来自真实项目沉淀，专业深度超过一般公开资料。
- **合规锚点正确**：等保 2.0 九维度（:232-244）与 GB/T 22239-2019《信息安全技术 网络安全等级保护基本要求》的控制域结构吻合（安全物理环境/通信网络/区域边界/计算环境/管理中心 + 管理五域；来源：全国标准信息平台通行结构，经 [GB/T 22239-2019 在线资料](https://www.cnblogs.com/hemukg/p/18817035) 2026-07-20 核验）；"日志保存 ≥6 个月"（:242）与《网络安全法》第 21 条第 3 款一致。
- **机制设计自洽**：每条规律带"验证方法"grep 命令；"不可直接复制，直接复制=达克效应"（:404）+ `--domain` grep 证据标记（:406）形成防套用闭环。
- **每条均标明是"分析起点"**，实例化责任在生成侧——与 template-spec.md:323-327 的"成立→附证据/不成立→剔除/版本外→待验证"三态一致。

### 4.3 覆盖缺口（升国标/行业标准的短板）

1. **无管理体系标准域**：ISO/IEC 27001、SOC 2 全文缺席；等保只有速查表，无控制点级映射。
2. **无数据合规域**：PIPL（个人信息保护法）、数据安全法、GDPR 仅在 exploration-guide.md:1173 作关键词出现一次。
3. **无功能安全域**：车规 ISO 26262、医疗 IEC 62304、工控 IEC 62443 全无——若目标"满足国家质量/安全标准"，这是硬缺口。
4. **无质量模型锚**：ISO/IEC 25010 的 8 大质量特性（功能适合性/性能效率/兼容性/易用性/可靠性/信息安全性/维护性/可移植性）与 27 门禁之间无映射表。
5. 其他：无数据仓库/BI 工程域（kettle/paimon 只在框架层）、前端无 a11y、无供应链安全域（SLSA/SBOM，security-spec.md:60-64 只有一句"新增依赖须经审查"）。

---

## 五、方法论体系一致性问题清单（重复/矛盾/漂移）

| # | 类型 | 问题 | 证据 |
|---|------|------|------|
| 1 | 漂移 | **运行时数 9/10/11 三处不一致**：cognition-framework.md:116 写"9 项目运行时自检"；install-offline-win.sh:2 / build-offline-win.sh:3 / install-offline-win.bat:29 写"10 个运行时"；SKILL.md:3/66/69/132、README.md:201、docs/PROMO.md:176、docs/USAGE.md:201、self-check.sh:300 写"11"。审计 :39 已记录但未处置 cognition-framework 一处 | 见各文件行号 |
| 2 | 矛盾 | SKILL.md:3 frontmatter 声称"Integrates 11 runtimes"但括号内只列 **10 个名字**（OpenSpec/superpowers/comet/GitNexus/graphify/gsd-core/claude-mem/ocr/gstack/Ruflo，**漏 ECC**）；README.md:203 列全 11 个（含 ECC） | SKILL.md:3 vs README.md:203 |
| 3 | 漂移 | SKILL.md:106"它整合的方法论"列表只有 7 组（无 Ruflo/ECC），与 frontmatter 及 self-check.sh 实际检测的 11 个（check_openspec…check_ecc，self-check.sh:52-85）不一致 | SKILL.md:104-108 |
| 4 | 错配 | `--cognition` 分数上限标注 /11（实 14）、/19（实 22）；阈值语义漂移 | precheck.sh:2048-2050、:2125-2126；审计 :33 |
| 5 | 重复 | spec-template.md:151-152 连续两行 `## 6. 前端/UI`；"22 段"口径与实测 25 个二级标题不符 | spec-template.md:151-152；README.md:273 |
| 6 | 重复 | claude-code-capabilities.md 出现两个"## 十三、"（:283 Dynamic Workflows、:416 CLI 命令全量），随后才是"## 十四、"（:541）；`/recap` 行重复出现（:40、:49） | claude-code-capabilities.md |
| 7 | 断裂 | subagent-orchestration.md"与目标技能的整合"编号 1-3 在 :111-114，第 4 条孤立于 :323，被 ECC/Ruflo 整章隔断 | subagent-orchestration.md:111-114 vs :323 |
| 8 | 悬空引用 | 框架规则已迁往 `references/frameworks/`（domain-knowledge.md:388-394 明确声明），但 exploration-guide.md:235 仍写"激活 **domain-knowledge.md** 中对应的框架规则集"，template-spec.md:559 仍要求"domain-knowledge.md 含框架特定领域规则表" | 三处行号 |
| 9 | 重复 | security-spec.md 两个"### 6.5"（:237 Windows 进程 spawn 安全、:289 文件系统兼容） | security-spec.md:237/:289 |
| 10 | 矛盾 | logic-razor 强制 10% 瑕疵 vs gsd honest abstain（详见 §2.2-e） | logic-razor.md:3/:105 vs review-methodology.md:339-349 |
| 11 | 漂移 | SKILL.md:3 frontmatter 仍写"3-layer: registration assembly / module dependency matrix / component mount tree"（前端中心链路模型），与 SKILL.md:61"按形态动态适配"（前端/后端/异步/微服务多模型）的现行主张不符 | SKILL.md:3 vs :61 |
| 12 | 口径 | 审计文档与任务口径称"57 框架三件套"（docs/2026-07-20-audit-optimization-decisions.md:8）；实测 `references/frameworks/` 58 个 .md（含 _template.md）= 57 规则集 + 1 模板；framework-gates 与 fixtures 各 57——对外表述宜用"57 规则集（58 文件含模板）" | ls 实测 2026-07-20 |

另有两处"叙事未落地"值得记录：

- **4-Phase SOP 是幽灵方法论**：cognition-framework.md:11 称第三层 = "4-Phase SOP + 逻辑剃刀 6 步"并指向 logic-razor.md，但 logic-razor.md 全文无 4-Phase 定义；SKILL.md:39/97、template-spec.md:594、subagent-orchestration.md:294、claude-code-capabilities.md:19 均引用"概念澄清→破局重构→七步推演→行动落地"四阶段名，**14 篇文档中没有任何一篇给出其完整定义**——引用 6 处，定义 0 处。
- **七推理 / 7×7 双循环仅一行带过**（cognition-framework.md:33/35），声称"每推理在 workflow 节点有落点"但无任何文档记录该落点表。

---

## 六、行业软件工程方法视角的定位与缺口

### 6.1 定位判断

swarm-yuan 的方法论体系实质是：**面向 AI 编码代理的、单变更粒度的"轻量 RUP + CMMI L3 级已定义过程"**——以 spec-driven（OpenSpec）为用例驱动的替代，以门径（stage-gate，27 门禁）为过程控制，以组织级模板资产（六段式 + 57 框架规则集）为过程资产库，以五层认知基底为"组织过程焦点"的哲学包装。其工程化骨架（特征卡立法/门禁执法/模板资产/核对清单）是真的；其量化与学术外衣（六维动力学/认知分数/最小意识）目前是叙事而非度量（§2.2-c/d）。

### 6.2 逐项对照

| 行业方法 | swarm-yuan 的对应物 | 主要缺口 |
|---------|--------------------|---------|
| **RUP** | 8 节点 workflow ≈ 四阶段；OpenSpec proposal/delta ≈ 用例驱动；特征卡 ≈ 架构工件（template-spec.md:177-189） | 无迭代-增量生命周期与风险驱动里程碑；无角色/工件/规程三元分离；架构描述无 4+1 视图规范 |
| **XP** | TDD 左移（spec-template §19）、重构保护（`--stable-diff`）、CI（domain-knowledge.md:160-167）、结对 ≈ subagent 两阶段审查（subagent-orchestration.md:63-71） | 无现场客户/集体所有制/可持续步调节拍；结对审查无真人交叉 |
| **Scrum** | — | **整体缺席**：无 sprint/backlog/速率/DoD 仪式（domain-knowledge.md:333-342 仅有 DoD 一行，作为"被验证对象"）；体系按"单次变更"而非"迭代"运作 |
| **SAFe** | 仅 domain-knowledge.md:319-331 作为领域知识出现 | 自身无 PI Planning/ART/跨团队依赖管理——定位是单仓单技能，规模化敏捷超出边界（可接受，但应对外声明边界） |
| **DDD** | 覆盖最深：`--layer`/`--contract`/聚合只引用 ID/ACL 防腐层/通用语言（`--consistency-cross`）；domain-knowledge.md:269-280 | 无战略设计工作坊（事件风暴/上下文映射图产出物要求）；限界上下文靠 conf 变量声明，无发现流程 |
| **TOGAF** | `--adr`/`--contract`/`--consistency-cross`（BDAT）/`--impact` 四门禁（template-spec.md:415-418）；domain-knowledge.md:282-291 | 无 ADM 周期（预备→愿景→业务/信息系统/技术架构→机会→治理）；无架构合规评审委员会角色；无能力增量规划 |
| **SEI-CMMI** | ≈ L3"已定义级"：组织级过程资产（模板/规则库）+ 验证规程（27 门禁+verifier/v1） | 缺 MA（度量分析）真值——认知分数是关键词启发式（§2.2-c）；缺 CAR 因果分析；缺 OPD/OPF 过程改进闭环（memory distillation 只是对 ruflo/ECC 的引用，memory-persistence.md:194-216，非自实现）；L4/L5 量化管理无从谈起 |
| **GB/T 8566 / ISO/IEC/IEEE 12207（生存周期过程）** | 需求→设计→实现→测试→发布链条齐全（template-spec.md:177-189） | 无过程-产出物-角色三元映射表；无维护/退役过程域；无配置管理过程（版本基线只有 `--deps` 一点） |
| **ISO/IEC 25010 质量模型** | 27 门禁可归入其 8 特性 | 无显式映射表——升国标时必须补"门禁↔质量特性↔度量↔证据"对照 |

### 6.3 总结

- **优势**：DDD/TOGAF 工件级执法、拼装式开发（复用门禁）、左移三件套、框架规则的"探查-激活-实例化-四要素核验"闭环——这些在行业中属于**领先于多数企业内规**的机械化程度。
- **本质缺口**：① 无迭代层（Scrum/SAFe 不在边界内但未声明）；② 无真度量（CMMI MA/ISO 25010 缺锚）；③ 无需求追溯矩阵（spec 段→门禁→测试用例无 trace id）；④ 安全合规停在 OWASP/CWE 层，未到 GB/T 22239-2019 控制点级与功能安全标准。

---

## 七、对 swarm-yuan 的启示（按优先级）

1. **建立"数字单一事实源"**：运行时数（11）、门禁数（27）、conf 变量（146）、框架规则集（57）、spec 段数（实 25 标题）、认知分数上限（14/22）应由脚本从代码计算并回填文档；`check_doc_consistency`（审计 :22 已起步）须扩到 cognition-framework.md、README、frontmatter（修 §五.1-4）。
2. **修复 8 处结构性瑕疵**（§五.5-9 的重复标题/孤儿行/双 §6.5/双"十三、"），均为低成本机械修复。
3. **五层认知基底二选一**：(a) 补学术出处页（每构件给文献锚，至少图尔敏 1958/Minto 1987/Kruger-Dunning 1999/Tversky-Kahneman 1974/《实践论》《矛盾论》），或 (b) 显式降级声明为"工程启发式框架，非学术模型"——当前零引用状态在标准评审中不可辩护（§2.1）。
4. **裁决 razor vs abstain 冲突**：给 logic-razor 加豁免条款"证据不足时按 gsd abstain 输出 insufficient_spec，不强制 10%"（§2.2-e）。
5. **补"16 卡 ↔ 22 段"显式 RTM**：并把 §19/20/21 的左移三要素升格为第 17 项特征卡（或在卡 13 下扩展），消除模型漂移（§3.2）。
6. **认知门禁重新设计**：满分真值（14/22）、fail 语义（目前 0 fail）、去模板自证（审计 :33/:35 已列为刻意不修项，建议升版时处置）。
7. **补 4-Phase SOP 定义页**：6 处引用 0 处定义，要么在 cognition-framework.md 补全，要么从各文档降级为"可选引用 gsd/superpowers 对应物"（§五末）。
8. **领域知识补合规与功能安全域**：等保 2.0 升至 GB/T 22239-2019 控制点级映射、新增 ISO/IEC 27001、PIPL/数据安全法、ISO 26262/IEC 62304 占位域（§4.3）。
9. **补行业标准映射表**：27 门禁 ↔ ISO/IEC 25010 八特性 ↔ GB/T 8566 过程域 ↔ CMMI PA 的四列对照，作为 verifier/v1 验收体系的"标准符合性声明"基础（§6.3）。
10. **logic-razor 补执法点或标注纯阅读**：在 `--review` 中增加 razor 模式（对 spec 论证质量产出 6 模块报告）或在 SKILL.md 清单中显式标注"无门禁，纯方法论阅读"，消除"看似有执法实则没有"的认知错觉（§1.2）。
