# swarm-yuan 重构总设计：从“吸收 + 接线”到“可证明的能力组合”（2026-10-21）

> **实施状态（2026-10-24）**：本稿不再是“待拍板”状态。决策 50/51 已落地注册表平面、按域门禁、统一 runner；WP1/WP3/WP5/WP6/WP7/WP8 已执行，WP2（上游状态/历史分离）于 2026-10-24 收口；WP4（vendor 外置）、WP9（覆盖矩阵）与 WP10–WP12（文档收敛/交付路径）仍有剩余。剩余项的当前口径、验收与实施顺序以 `docs/design-refactor-2026-10-24.md` 为准；冲突以新稿为准。本稿保留为 2026-10-21 时的完整设计论证与工作包清单。
>
> **定位**：本稿是供拍板的完整设计与重构优化方案，含目标架构（§三）与分期实施方案（§四）。它不是实施记录：批准后按工作包逐轮实施。
> **取代关系**：本稿取代 `docs/redesign-proposal-2026-10-21.md` 作为唯一待拍板方案。旧稿的结构诊断（P1–P8）仍成立，但其测量值已漂移、工作包未覆盖功能债与证据债；冲突以本稿为准，差异见附录 E。
> **证据基线**：main `9ae57c0`（R129 后；全绿验证提交为 `b24297f`，sweep `93/0`）。结构性数字于 2026-10-21 在当前工作树复测；耗时（3.66s）、R126 审计计数（96 项/25 死键）与宿主安装数引用对应轮档。命令见附录 A。
> **硬约束（不可违反）**：bash 3.2 + BSD 工具兼容；门禁预算 56 冻结；conf 变量预算 200；目标技能上下文预算不变（SKILL.md ≤11264B、随发 ≤614400B、组件库清单 ≤32768B、生成期必读 ≤194560B）；吸收优先于新增门禁；终态文档不带历史包袱。
> **读法**：拍板看 §0 与 §六；实施看 §3.3、§四；复核看附录 A/D。

---

## 0. 结论

swarm-yuan 已经不是“一个生成器”那么简单。它是一套**项目专属开发契约的生产系统**：生成器负责认识项目、立规矩、装技能；目标技能负责在日常研发中约束 AI；证据系统负责证明约束真的在工作。能力面已经饱和——56 门禁 / 197 变量 / 81 框架 / 15 接线运行时 / 51 档方法论 / 92 随发文件（变量数含并行测试质量轮 +12），连续多轮全量回归全绿。当前的主要矛盾不是继续加能力，而是**让已有能力可寻址、可证明、可退役**。

四个根因，对应四类债务：

| 根因 | 债务 | 典型证据 |
|------|------|----------|
| 事实靠手抄副本传播 | 真值债 | `FACT_SCRIPT_LOC` 曾滞留 7099；顶层规范文档 22 处 `generate-skill.sh:行号` 已漂移（全 docs 40，其余为档案）；汇编 1.74MB 无生成器 |
| 边界按历史而非领域划分 | 结构债 | 56 门禁按 enforce 平铺三文件；conf 四种读法；生成器 3252 行 75 函数、子命令在共享初始化前 exit |
| 能力只进不出 | 治理债 | 25 个零消费 FACT 键；9 门禁无夹具、13 门禁仅 compliant；78/81 框架无负向断言；无退役台账 |
| 宣称未绑定证据 | 证据债 | 5 宿主“已渲染未实证”与“支持”混用；行业 8 档不在生成主链路；预算只量 references，不量执行复杂度 |

**方案一句话**：把“手抄副本 + 历史边界 + 只进不出”改造成“**注册表 + 生成视图 + 能力生命周期 + 证据等级**”，用三阶段十二个工作包完成，每个工作包都有机器验收与回滚路径。

**目标架构一句话**：**一内核、三平面、六注册表、五级证据、四闭环**。

| 构件 | 内容 |
|------|------|
| 一内核 | 生成 → 使用 → 成长的生命周期；语义不变，只把入口、状态、证据收拢 |
| 三平面 | 知识面（references / frameworks / runtime）、执行面（生成 / 门禁 / 验证）、治理面（注册表 / 预算 / 证据 / 决策） |
| 六注册表 | `gates.tsv`、`frameworks.tsv`、`references.tsv`、`runtimes.tsv`、`hosts.tsv`、`dist.tsv` |
| 五级证据 | M0 登记 / M1 接线 / M2 双态验证 / M3 环境实证 / M4 持续回归 |
| 四闭环 | 生成闭环、使用闭环、成长闭环、吸收闭环 |

**如果只记三句话**：

1. 任何有两处以上引用的事实，只允许一个权威源，其余一律生成并带 `--check`。
2. 任何能力都必须有入口、消费点、降级路径、证据等级和退役条件；没有证据的“支持”一律降级表述。
3. 重构走绞杀者模式：先双读、再切换、后删旧路；行为保持以基线产物逐字节 diff 为准，不以测试全绿代替（决策 49）。

---

## 一、重新分析：台账与汇编告诉我们什么

### 1.1 能力面：已经饱和，强在证据，弱在结构

全功能台账（`docs/research/2026-10-20-absorption-ledger-and-capability-inventory.md`）给出的能力面，按“生成器六层 + 分发治理”重排如下：

| 层 | 能力 | 关键计数 | 现状判断 |
|----|------|----------|----------|
| 认知 | 组件库清单、关系边集、任务配方、特征卡、领域知识、框架识别、行为统计 | 17 特征卡 / 32 领域 / 81 框架 / 3 路探查子代理 | 强；清单三道检查（计数、路径、稳定性）是真正的差异化 |
| 规范 | spec 25 节、三值规则、框架规则、conf 三件套、标准映射、行业档 | 185 变量 / 81 规则 / 8 行业 | 强；但 conf 有四种读法，patch 层可见性有缺口 |
| 装配 | 13 步生成、六段骨架、四档 profile、状态机、升级 | 92 随发 / 46 lite / 13 步 / 9 节点 | 强；但生成器单体化，子命令在共享初始化前 exit |
| 门禁 | 56 门禁、五条执行序列、四层 spec-first、hooks 族、SARIF | 核心 11 / 架构 18 / 合规 19 / 显式 6 / FULL 尾 2 | 强；但按 enforce 平铺，域不可寻址，夹具缺口明显 |
| 验证 | 独立验证器、双态夹具、golden、真实项目矩阵、trace 链 | 48 门禁夹具 / 81 框架夹具 / 88 锁定测试 / 11 CI job | 强；但 sweep 与 CI 不同构，负向断言覆盖不足 |
| 成长 | 指纹感知、局部重探查、last-good、知识生命周期、记忆写回 | 3 记忆后端 / 6 状态阶段 | 良好；缺目标技能自描述清单 |
| 分发 | 8 宿主、离线包、源码包、安装器 | 1 深度 + 7 CLI / 3 宿主 L1 实证 + 5 已渲染 | 良好；但宿主检测语义有缺陷，行业加载不在主链路 |
| 吸收 | 22 项上游登记、15 项接线、51 档方法论、三层接线 | 深度 4 / CLI 6 / 方法论 5 / 未接线 7 | 治理强；但 baseline 已退化成变更日志，宣称等级不统一 |

**三个真实优势，重构必须保住**：

1. **证据纪律**：A/B/C 分级、G25 双向对账、能力地图、决策史、R126/R128 的行为级回归锁。这不是文档装饰，是本项目最稀缺的资产。
2. **负向预算**：门禁 56、变量 200、上下文四上限、预算例外台账。它让“帮项目降复杂度的工具自己不能失控”成为可执行约束。
3. **真实项目回归**：JS 全栈、Java 企业栈、cross-stack、真实工具链全绿。它补上了 fixture 无法证明的外部效度。

**三个饱和信号**：

- 56/56 门禁已顶格，新增必须等额删除；但**没有退役机制**，预算冻结只挡住了“增”，没解决“该删谁”。
- 185/200 变量，user 面必配约 20 项；但**物理变量与消费方式脱节**，四种读法让“配置正确”难以证明。
- 目标技能上下文预算已多次逐例登记；但**执行面复杂度没有预算**——81 份框架门禁 18,344 行，是引擎四文件 7,164 行的 2.56 倍，注入目标技能后只受运行时约束，不受任何预算约束。

### 1.2 历史面：五次重心迁移，下一步是“组合治理”

汇编（`docs/design-compendium-full.md`）与决策史（`docs/design-evolution.md`，决策 9–49）显示，项目经历了五次重心迁移：

| 阶段 | 代表轮次 | 主题 | 留下的结构 |
|------|----------|------|------------|
| 自设计与门禁引擎 | R1–R2 | 把“认知 → 规范 → 装配 → 使用 → 成长”写成闭环 | 六段目标技能、门禁引擎、三权分立叙事 |
| 标准与框架 | R4–R8 | 把质量/安全标准与框架最佳实践变成可执行规则 | 81 框架规则、标准映射、行业档 |
| 吸收与整合 | R11–R88 | 从“调研很多”到“吸收 + 接线 + 可达” | 51 档 references、15 运行时、capability-map |
| 可靠性与预算 | R119–R129 | 输入保真、失败传播、证据恢复、行为保持拆分 | R125 预算棘轮、R126 完整性三原则、R128 拆分纪律、R129 收敛 |
| 现在 | 本稿 | 从“能力堆积”到“能力组合与证据治理” | 六注册表、能力生命周期、双预算、宣称矩阵 |

五条决策主线仍然有效，且直接约束本设计：

- **接线真实化**（决策 9/15/16/10）：声明有 ≠ 真实跑。
- **诚实化**（决策 12/35/38）：未创建、未执行、未实证的机制不得声称。
- **轻重自适应**（决策 18/20–24/30/31）：profile 按信号分档，只升不降且信号明确才升。
- **预算与吸收纪律**（决策 26/27/33/34/41–47）：吸收优先于新增；预算是恒等式；分发面与生成器侧档分离。
- **外部参照与整合**（决策 28/29/39/40/42–46）：证据分级；机制级吸收；建档必接线、接线必可达、可达必随发。

五条历史教训，写进本设计的验收：

1. **测试全绿不等于行为不变**（决策 49）：生成器这类“输出即产物”的程序，必须做基线产物逐字节 diff。
2. **声明集中不等于消费闭环**（决策 48）：每个 FACT 键必须有执行面消费者或豁免登记。
3. **预算不贴真实税基就会被绕过**（决策 47）：量仓内档体积，不如量分发产物；量 references 字节，不如同时量执行时间。
4. **吸收没有消费点就是剪贴**（决策 46）：两问答不上，只记轮台账，不入库。
5. **并行会话必须按文件归属切分**（决策 49）：主题切分会撞车，文件切分不会。

### 1.3 复测：旧稿数字已漂移，诊断仍有效

旧稿 `docs/redesign-proposal-2026-10-21.md` 的结构诊断（P1–P8）成立，但测量值已经漂移。本稿以当前工作树复测：

| 指标 | 旧稿值 | 本稿复测 | 说明 |
|------|--------|----------|------|
| `design-compendium-full.md` | 629,464 B | **1,738,722 B** | 汇编包含卷九 97 份轮档全文，体量随轮次增长；无生成器是根因 |
| docs 内 `generate-skill.sh:行号` 引用 | 20 处 | **40 处**（顶层 22，其余在 research/reviews） | 行号锚随拆分持续漂移 |
| `tests/test-*.sh` | 86 个 | **87 个**（另 `tests/scripts/` 1 个，sweep 共 88 个锁定测试） | R129 后新增 |
| `docs/design-evolution.md` | 270,462 B | **273,833 B** | 决策 47–49 落笔 |
| 引擎四脚本 | 7,164 行 | **7,164 行** | 与 `FACT_SCRIPT_LOC` 一致；旧稿已修正 |
| CI job | 11 个 | **11 个** | 未变 |
| `.git` | 244 MB | **246 MB** | 历史体积；外置 vendor 只能止增，不能回收既有历史 |
| 追踪文件总大小 | 未测 | **46 MB**（vendor 24 MB，占 52%） | 新 clone 的工作树税 |

这张表本身就是 P1/P8 的证据：**派生文档没有生成器，就会一边变长一边漂移**。本稿因此不再引用旧稿的测量值作为验收基线，全部以附录 A 的命令重新测。

### 1.4 结构问题清单（P1–P12）

| # | 问题 | 证据（A 级） | 根因 |
|---|------|--------------|------|
| P1 | 数字口径靠手抄副本同步 | `FACT_SCRIPT_LOC` 曾 7099 vs 实测 7164；test-doc-numbers 127 条点名断言只锁 19 份文档 | 事实没有“权威源 + 生成视图”，只有“权威源 + 手抄 + 对账” |
| P2 | upstream-baseline 是变更日志，不是登记表 | 195,571 B / 250 行；46 条头注 54,555 B（27.9%）；最长表行 15,061 B | 登记表与版本史两种文体叠在一张表 |
| P3 | 门禁按 enforce 平铺，域不可寻址 | 19/22/15 分布在 strict/warn/advisory 三文件；40 次 `find`、14 条独立排除链；无域目录 | 文件边界按“多严”划分，不按“查什么”划分 |
| P4 | conf 四种读法，patch 层可见性缺口 | source 链、文本 grep、conf-render 追加、mark-active 预查各一套；121 处直接 `${VAR:-}`；`_conf_effective` 不存在 | 无访问器层；合成视图没有被单一实现 |
| P5 | 生成器单体化，子命令早退 | 3,252 行 / 75 函数；独立子命令在共享初始化前 exit；`create` 流内联 572 行 emit 段；无目标技能清单 | 子命令按“加功能”生长，没有入口契约 |
| P6 | 分发清单多处定义，装配内联 | `UNIVERSAL_FILES` 92 条内嵌代码；离线包打包整树后排除；源码包只有 3 个运行时名；六段目录在 create 内联 mkdir | 清单即代码，没有数据化；装配没有独立模块 |
| P7 | 重资产常驻 git | `vendor-knowledge/` 24 MB / 304 件，仅支付 profile 消费；追踪总量 46 MB；`.git` 246 MB | 知识库与代码同仓，无外置通道 |
| P8 | 文档视图重叠且不可再生 | 汇编 1.74 MB 无生成器；顶层规范文档 22 处行号引用（全 docs 40 处，其余为历史档案）；同一数字在 README/usage/CLAUDE/AGENTS/SKILL/capability-map 重复 | 视图层没有生成机制，只能手抄 |
| P9 | 测试按轮次命名，runner 异构 | 87 个 test-*.sh 中 43 个 `test-rNNN-*`；sweep 通配直跑，CI 11 job 手工并列；两边各有对方没有的项 | 测试组织以“哪轮加的”为单位，不以“什么行为”为单位 |
| P10 | 证据缺口：无夹具、仅正向、golden 太弱 | 9 门禁无夹具；13 门禁仅 compliant；78/81 框架无负向断言；golden 只锁 3 个数字；cli-ab 在干净 checkout 恒真 | 夹具被当成“补测试”，没有被当成能力准入条件 |
| P11 | 能力只进不出，死键无退役 | 25 个零消费 FACT 键；6 门禁不在任何序列（其中 5 个仅显式 flag）；无退役台账；零命中门禁不进入评审 | 预算只管上限，不管组合质量；没有能力生命周期 |
| P12 | 宣称、证据、预算三者脱节 | 5 宿主“已渲染未实证”与“支持”混用；3 宿主 L1 实证；行业 8 档不在生成主链路（`generate-skill.sh` 零 `industry` 引用）；预算只量 references 字节，不量框架注入后的执行复杂度 | 能力等级没有统一口径；预算维度不完整 |

> 口径注：P10 的“9 门禁无夹具”指无独立 `tests/gate-fixtures/<id>/` 目录；其中 `framework` 走 81 组框架夹具、`spec_first` 走行为测试，其余 7 个确无独立夹具。R126 #8 列出的 14 组“无 violating 样本”中，13 组对应门禁，`summary` 是 `--all-full` 输出特例而非门禁；门禁级按 13 计。本稿把“有专用执行器”与“无任何证据”分开看，记分卡暂按保守口径计 M1，WP8 校准。

补充：R126 深度复盘共产出 96 项发现，33 项已修、63 项待批（`docs/research/R126-audit-findings.md`）；本稿的 P9–P12 与 WP8/WP9/WP11 覆盖其中跨文件结构、测试覆盖与分发自检类余量。

### 1.5 根因收敛：一条主矛盾

四类债务可以收敛成一条主矛盾：

> **预算冻结了“数量”，但没有冻结“条件复杂度”；上下文预算量了“读多少字”，但没有量“跑多少扫描、注入多少代码、证明到什么程度”。**

于是系统出现一种不对称：门禁数量被冻结在 56，但框架门禁 18,344 行、条件分支、宿主适配、吸收档案仍在增长；references 字节被计量，但执行面的框架注入、全树扫描、跨宿主差异没有预算。**能力组合的质量**因此无法被机器评价，只能靠人逐轮审计。

本设计的所有结构，都是为了让“组合质量”变成可测量、可执法的东西。

---

## 二、设计目标与原则

### 2.1 产品定义：不变的部分

本设计不改变 swarm-yuan 的产品语义：

- 仍然是一个**生成器**：对任意代码仓库跑一次 13 步生成流程，产出一个项目专属开发技能。
- 目标技能仍然是**六段目录**：`SKILL.md` + `workflow` + `references` + `assets` + `scripts` + `rules.d`（按 profile 增减 hooks/commands）。
- 仍然使用**九节点工作流**：需求 → 探查 → spec → plan → 编码 → 测试 → 审查 → 合入 → 发布。
- 仍然保持 **spec-first 四层拦截**：L1 写时 / L2 提交时 / L3 门禁时 / L4 流程准入。
- 仍然使用 **lite / standard / compliance + auto** 四档 profile，语义不变。
- 仍然保持**门禁与验证分工**：门禁管“不懂规矩”，验证管“想错逻辑”。
- 仍然保持**生成器厚、目标技能薄**；预算不因本设计上调。

### 2.2 设计目标：四个可验收结果

| 目标 | 可验收结果 | 对应问题 |
|------|------------|----------|
| G1 事实可生成 | 六张注册表是唯一权威源；facts、capability-map、upstream 状态、覆盖矩阵、宣称矩阵、汇编全部由脚本生成；`--check` 进 CI | P1/P2/P8 |
| G2 能力可证明 | 每个门禁/框架/运行时/宿主都有 M0–M4 等级；公开文档的“支持/实证/整合”与等级一致；覆盖矩阵零缺口或有豁免 | P10/P12 |
| G3 结构可寻址 | 新增一个门禁只碰 3 处（注册表一行 + 域文件一个函数 + 夹具）；新增运行时只碰 2 处（注册表一行 + 变更账一条） | P3/P4/P5/P6 |
| G4 演进可退役 | 每个能力有退役条件；零命中/低价值能力进入季度评审；退役有台账、有替代指针、有回归证据 | P9/P11 |

### 2.3 Non-goals（明确不做）

1. 不换语言：保持 bash 3.2 + BSD 工具，不引入 Python/Node 运行时依赖。
2. 不增减门禁与 conf 预算：56 / 200 不变；不为重构申请预算上调。
3. 不改目标技能九节点、六段目录、三档 profile、spec-first 四层的语义。
4. 不引入外部测试框架（bats 等）：自建轻量 runner，零依赖。
5. 不做“大爆炸”重写：全部走绞杀者迁移与行为保持式拆分。
6. 不做云端服务、守护进程、Web 控制台；本项目的交互面是 CLI + 文件。
7. 不自动安装未经核验的运行时；npm 裸名陷阱已实证，自动安装列保持撤销。
8. 不为了“整齐”批量重命名 43 个轮号测试；用元数据与映射表解决可寻址性。
9. 不把全部 research 轮档搬进目标技能；归档面与消费面继续分离。
10. 不引入新的“概念体系”到目标技能；目标技能概念数仍 ≤5。

### 2.4 设计原则

**产品原则（继承 README 四条，措辞不变）**：

1. 拼装式开发：新功能 = 既有稳定单元拼装 + 最小新增胶水。
2. 特征卡立法、门禁执法、验证器司法。
3. 诚实降级：运行时没装就显式披露；权限边界 fail-closed。
4. AI 全自动、零手动配置；bash 命令只是排查与 CI 的备份通道。

**架构原则（本稿新增五条）**：

| # | 原则 | 含义 | 执法 |
|---|------|------|------|
| A1 | 事实单源，视图生成 | 任何有两处以上引用位置的事实，只允许一个权威源；其余是渲染产物 | `registry-render.sh --check` 入 self-check / CI |
| A2 | 清单是数据，不是代码 | 分发、装载、安装、宿主适配的范围由表驱动；代码只读表 | dist/hosts 表；代码里不得再出现第二份清单 |
| A3 | 历史与状态分离 | 登记表只存当前值与一条最近变更；过程史进 append-only 变更账 | upstream 状态表 + changelog；表行不得携带版本史 |
| A4 | 宣称与证据绑定 | 每个用户可见的“支持/整合/实证”必须对应 M 等级与证据指针；没有证据就降级表述 | 宣称矩阵 + test-r68 术语门禁扩展 |
| A5 | 能力有生命周期 | 进入、激活、验证、观察、退役五态；没有退役条件的能力不得新增 | gates/frameworks 注册表 `claim`/`status`；季度评审 |

**重构纪律（继承决策 49，不新增）**：

- 行为保持式拆分：拆前基线产物归一化后逐字节 diff 零差异。
- 一个提交只做一件事：行为保持与缺陷修复不混在一起。
- 并行会话按文件归属切分，重文件独占 worktree，worktree 总数 ≤3。

### 2.5 不变量与执法矩阵

| 不变量 | 来源 | 机器执法 | 强度 |
|--------|------|----------|------|
| 门禁预算 56 | 决策 26/26.2 | self-check `check_complexity_budget` | 强制 |
| conf 变量预算 200 | 决策 26 | self-check 同上 | 强制 |
| 上下文四上限 | 决策 32/38/47 | self-check 预算断言 + gen-e2e | 强制 |
| 吸收优先于新增门禁 | 决策 27 | 流程纪律 + 评审清单 | 文档 |
| 证据分级 A/B/C，C 不进基线 | 决策 39 | upstream 表头口径 + 轮档纪律 | 部分 |
| 吸收物双向对账 | 决策 42/G25 | self-check G25 | 强制（warn） |
| 门禁可达性双向锁 | 决策 48/R128 | test 层 | 强制 |
| 行为保持拆分证据 | 决策 49 | 基线 diff + 反向断言 | 强制 |
| 终态文档不带历史包袱 | 决策 41/45 | test-r68 jargon 门禁 | 强制 |
| draft 不可交付、三关激活 | 决策 13 | `--mark-active` | 强制 |
| **注册表 ↔ 代码 ↔ 夹具三向一致** | 本稿 A1/A2 | 新增 G26 | 强制 |
| **每个能力有 M 等级与证据** | 本稿 A4 | 宣称矩阵 + 覆盖矩阵 | 强制 |
| **零消费 FACT 键 = FAIL 或豁免** | 决策 48 推广 | G26 + facts 豁免表 | 强制 |
| **执行面预算（时间/扫描数/注入行数）** | 本稿 A5 | 参考仓基准 + 趋势 | 强制（先 warn 后 fail） |

### 2.6 拟议决策 50–54（待拍板后编号入史）

| 拟议编号 | 决策 | 与既有决策的关系 |
|----------|------|------------------|
| 50 | **注册表平面**：六张权威表 + 生成视图；派生产物不得手改；G26 三向一致性 | 决策 38（版本口径机器锚）、47（计量贴真实）、48（声明-消费闭环）的推广 |
| 51 | **能力生命周期与证据等级**：M0–M4；宣称不得高于证据；每项能力有退役条件 | 决策 12/35（诚实化）、39（证据分级）、46（吸收判据）的推广 |
| 52 | **内核/三平面分层**：知识面、执行面、治理面；门禁按域组织；生成器入口契约化 | 决策 33/34（去抽象化、概念问责）、49（行为保持拆分）的工程化 |
| 53 | **双预算**：上下文字节 + 执行时间/扫描数/注入行数；结构预算看重复实现数与单次改动触碰面 | 决策 26（负向预算）、32（上下文预算）、38（例外登记）的补全 |
| 54 | **文档三档**：规范面、派生面、档案面；派生物生成；全文汇编移出常驻追踪；锚点用符号不用行号 | 决策 41/45（知识生命周期、平实语言）的文档化 |

---

## 三、目标设计（完整）

### 3.1 总图：一内核、三平面、六注册表、五级证据、四闭环

```text
                         ┌──────────────────── 治理面 ────────────────────┐
                         │ 六张注册表 · facts/预算 · 证据/宣称 · 决策史      │
                         │ gates / frameworks / references / runtimes       │
                         │ hosts / dist                                     │
                         └───────────────┬─────────────────────────────────┘
                                         │ 渲染视图 / 一致性校验（G26）
        ┌────────────────────────────────┼────────────────────────────────┐
        │ 知识面                          │ 执行面                          │
        │ references（方法论 51 档）       │ 生成：13 步 → 目标技能           │
        │ frameworks（81 规则 + 81 门禁）  │ 使用：9 节点 → 门禁/验证         │
        │ runtime（2 物化）/ vendor（外置）│ 成长：指纹 → 局部更新 → 记忆     │
        └────────────────────────────────┴────────────────────────────────┘
                                         │
              四闭环：生成闭环 / 使用闭环 / 成长闭环 / 吸收闭环
```

**一内核**：生成、使用、成长三个阶段共享同一套状态、证据与预算模型。内核不包含具体领域知识；领域知识通过注册表与能力包接入。

**三平面**：

- **知识面**：references、frameworks、runtime、vendor。回答“AI 该读什么、该按什么规律做事”。
- **执行面**：生成器、目标技能、门禁、hooks、状态机、验证器。回答“怎么生成、怎么拦、怎么证明”。
- **治理面**：注册表、facts、预算、证据、宣称、决策史。回答“凭什么说它是真的、它值多少、什么时候退役”。

**依赖方向**：执行面 → 知识面 / 治理面；知识面只依赖治理面；治理面不依赖任何一面。禁止反向引用（目标技能不得依赖生成器仓）。

**生成器侧目标布局**（只列变化面，未列文件保持原位）：

```text
swarm-yuan/
  assets/
    registry/{gates,frameworks,references,runtimes,hosts,dist}.tsv   # 六张权威表
    lib/{conf,files,log,json,hash,run}.sh                              # 公共库
    gates/{security,architecture,process,quality,compliance}/*.sh      # 门禁源
    gates/{_lib.sh}                                                    # 聚合时前置
    gates-{strict,warn,advisory}.sh                                    # 生成视图（勿手改）
    precheck.sh                                                        # 编排器（装载协议不变）
    facts.conf                                                         # 手写预算段 + source 生成段
  scripts/
    registry-render.sh                                                 # 表 → facts/视图/聚合
    build-docs-views.sh / build-compendium.sh                          # 文档派生
    upstream-probe.sh                                                  # 供应链查新
    gen/{create,upgrade,inject,verify,activate,render,refresh,globals}.sh
    generate-skill.sh                                                  # dispatcher
  tests/
    run.sh                                                             # 统一 runner
    index.tsv                                                          # 轮号 → 行为 → 层级
```

### 3.2 能力模型：从“功能列表”到“可证明的能力组合”

#### 3.2.1 能力记录

每一项能力（无论是一个门禁、一个框架规则、一档方法论、一个运行时还是一个宿主）都必须能回答八个问题：

| 字段 | 问题 | 例 |
|------|------|----|
| `id` | 它叫什么，全局唯一吗 | `security` / `spring-boot` / `graphify` |
| `kind` | 它是哪类能力 | gate / framework / reference / runtime / host / industry |
| `trigger` | 什么时候激活 | 核心序列 / 探测到框架 / 宿主存在 / 显式 flag |
| `consumer_node` | 谁在哪个节点消费 | 生成 Step 9 / 使用节点 ⑤ / `check_security` / `--diagram` |
| `fallback` | 没装、没配、没命中时怎么办 | 静态扫描 / 本地落盘 / 诚实跳过 / 降级提示 |
| `claim_level` | 证据到什么等级 | M0–M4 |
| `budget_cost` | 它占什么预算 | 上下文字节 / 执行毫秒 / 注入行数 / conf 变量数 |
| `retire_condition` | 什么情况下退役 | 连续两季度零命中 / 被新能力完全覆盖 / 上游归档 |

这张表是“能力契约”。没有消费点、没有降级路径、没有退役条件的能力，不允许进入注册表（A5）。

#### 3.2.2 六类能力与激活信号

| 类别 | 当前规模 | 激活信号 | 目标技能侧影响 | 证据要求 |
|------|----------|----------|----------------|----------|
| 门禁 gate | 56 | 执行序列 / 显式 flag / 宿主 hook | 脚本随发、按需执行 | 双态夹具 + golden + （建议）变异检查 |
| 框架 framework | 81 | `ACTIVE_FRAMEWORKS` / 文件 glob / 依赖探测 | 规则文档按需读 + 门禁片段注入 | 81 组框架夹具 + 真实项目至少 1 例 |
| 方法论 reference | 51 | 任务分派表 / 节点引用 / 按需加载 | 分发子集（lite/standard/生成器侧） | 消费节点可达 + 至少 1 处正文引用 |
| 运行时 runtime | 22 登记 / 15 接线 | `command -v` / 物料化探测 / 显式调用 | 不随发或物化随发 | 降级路径 + 版本/许可证/世系登记 |
| 宿主 host | 8 | 目录/命令探测 | 适配器渲染 hooks/规则 | 至少 1 台活体实证；未实证标 rendered |
| 行业 industry | 8 | `--industry` / 合规信号 | `precheck.industry.conf` + 法规映射 | 8 档真实加载 e2e |

> 行业是**组合能力**：`references.tsv` 的 industry 族 + `dist.tsv` 的 `precheck.industry.conf` + `gates.tsv` 的合规门禁共同构成，不单设第七张表。

#### 3.2.3 五级证据（M0–M4）

| 等级 | 定义 | 必须有的证据 | 允许的对外表述 |
|------|------|--------------|----------------|
| M0 | 登记 | 注册表一行 + 来源/许可证/证据分级 | “已登记”“已调研”，不得说“支持” |
| M1 | 接线 | 代码路径存在；至少一条正向执行记录 | “已接线”“已生成配置”，不得说“实证” |
| M2 | 双态验证 | violating + compliant 两侧夹具通过；断言包含发现 ID | “已通过双态验证” |
| M3 | 环境实证 | 真实宿主/真实项目跑通，留 run_id 与日志 | “已实证”（限定环境与版本） |
| M4 | 持续回归 | 进入 CI/真实项目矩阵，连续 ≥3 轮全绿 | “持续验证” |

**“双态”按类别解释**：门禁/框架 = violating + compliant 夹具；运行时 = 可用 + 缺失降级两态；宿主 = proven 配置 + rendered/缺失对照；行业 = 加载 + 不加载两态。M2 不强制所有类别都用夹具，但必须有可重复的对照证据。

**硬规则**：

- 用户面文档的“支持 / 整合 / 已实证 / 持续验证”必须能回指等级；没有回指就降级措辞。
- `FACT_RUNTIMES=15` 只说明“接线数”，不说明“实证数”；发布说明必须同时给出 M 分布。
- 宿主能力表必须分 `proven` / `rendered` 两列；5 个已渲染宿主不得与 3 个已实证宿主混写。
- 新增门禁/框架默认 M1；没有双态夹具不得升 M2；没有真实项目/宿主证据不得升 M3。
- 季度评审把 M0/M1 超过 N 轮的能力列入“补证据或退役”清单。

#### 3.2.4 当前能力记分卡（按现有夹具/实证记录机械推算，WP3/WP8/WP11 校准）

| 类别 | 总数 | M0 | M1 | M2 | M3 | M4 | 说明 |
|------|------|----|----|----|----|----|------|
| 门禁 | 56 | 0 | 22 | 34 | 0 | 0 | 22 = 9 无夹具 + 13 仅 compliant；framework/spec_first 走专用执行器；summary 特例不计入门禁，WP8 校准 |
| 框架 | 81 | 0 | 78 | 3 | 0 | 0 | 仅 dotnet/php/ruby 有 compliant 负向断言 |
| 运行时 | 22 | 7 | 15 | 0 | 0 | 0 | 15 接线，M1/M2 未逐项校准；WP3 按探针与实测重定 |
| 宿主 | 8 | 0 | 5 | 0 | 3 | 0 | 3 宿主 L1 活体实证；5 宿主已渲染未实证 |
| 行业 | 8 | 0 | 8 | 0 | 0 | 0 | conf 可渲染，但不在生成主链路；WP2/WP7 接线后升 M2 |

这张表故意不好看。它的价值在于：**把“我们以为的能力”变成“我们能证明的能力”**。本设计的验收不是把所有格子刷绿，而是让每个格子有等级、有证据、有退役条件。

#### 3.2.5 退役

- 统一退役台账 `assets/registry/retired.tsv`：`kind, id, reason, replacement, retired_at, evidence`。
- 触发条件（任一）：连续两季度零命中；被新能力完全覆盖；上游归档/许可证不可接受；维护成本超过收益；真实项目连续误报且无法修复。
- 退役不是删除历史：规则文档、门禁实现、夹具移入 `archive/`，注册表保留一行 `status=retired`，替代指针必填。
- 门禁预算 56 的“等额删除”从此有数据依据：退役一个才能新增一个。

### 3.3 注册表平面：六张权威表 + 生成视图

#### 3.3.1 六张表

所有表为 UTF-8 TSV，`#` 开头为注释，制表符分隔，字段内禁止制表符与换行；id 用 ASCII kebab-case。

| 表 | 行数 | 列（≤10） | 说明 |
|----|------|-----------|------|
| `gates.tsv` | 56 | `id, flag, fn, domain, tier, enforce, conf_vars, fixture, claim, notes` | `tier` = core/arch/compliance/full_tail/explicit，决定执行序列；`enforce` = 声明有效级，决定派生文件与阻断强度；两者正交。`fixture` 为空表示缺口；`notes` 记 override 理由 |
| `frameworks.tsv` | 81 | `id, family, rule_doc, gate_script, fixture_dir, signals_key, globs_key, detect_bins, claim, status` | `family` 用于共享规则与组合；`status` = active/watch/retired |
| `references.tsv` | 51 | `id, family, source, evidence, consumer_node, distributed, claim, overlap_group` | `distributed` = lite/standard/compliance/gen_only/none；`consumer_node` 必须可回指工作流节点或生成步骤 |
| `runtimes.tsv` | 22 | `id, repo, license, channel, pkg_name, tag_regex, baseline, wiring, claim, status` | `channel` = npm/pypi/git/plugin/materialized；`pkg_name` 治撞名；`tag_regex` 治异源旧 tag；`status` = synced/watch/license-risk/retired |
| `hosts.tsv` | 8 | `id, detect, install_path, hooks_schema, adapter, support, evidence_state, claim, notes` | `detect` 写命令或路径契约；`support` = deep/cli；`evidence_state` = proven/rendered；`claim` = M0–M4 |
| `dist.tsv` | 92（WP7 后 93） | `path, audience, tier, mode, offline, src_pkg, requires, bytes` | `audience` = gen/target；`mode` = copy/distill；`requires` 指向能力 id 或空；离线/源码包是过滤视图。WP7 新增 manifest 行后同步 `FACT_UNIVERSAL_FILES` |

**为什么是六张而不是五张**：旧稿的五表遗漏了宿主。宿主是 8 个适配器、8 套 hooks schema、5 个已渲染未实证能力的真实边界；把它折进 `dist.tsv` 会让“文件清单”和“能力等级”混在一起。单列 `hosts.tsv` 是低风险、高收益的补全。

#### 3.3.2 权威源与派生视图

| 类型 | 文件 | 谁写 | 谁读 | 校验 |
|------|------|------|------|------|
| 权威 | 六张 `.tsv` | 人/脚本导出，评审后提交 | 渲染器、self-check、测试 | G26 |
| 权威 | `facts.conf` 的手写预算段 | 人 | 全仓 | 现有断言 |
| 派生 | `assets/facts.generated.conf` | `registry-render.sh` | docs/self-check | `--check` |
| 派生 | `references/capability-map.md` | 渲染器 | SKILL.md / 人 | G25 改为对账注册表 |
| 派生 | `docs/upstream-baseline.md` | 渲染器 | 人 / probe | `--check` |
| 派生 | `docs/coverage-matrix.md` | 渲染器 + 夹具扫描 | CI / 人 | `--check` |
| 派生 | `docs/claim-matrix.md` | 渲染器 | 发布说明 / 人 | `--check` |
| 派生 | `docs/design-compendium.md` / `-full.md` | `build-compendium.sh` | 人 | `--check` |
| 派生 | `assets/conf-index.tsv` | 解析 conf 注释 | `conf` 库 / 人 | `--check` |

**规则**：

- 派生文件头三行必须含 `GENERATED by <script> from <source> at <commit>`；手改即被 `--check` 判脏。
- `facts.conf` 拆成两段：手写预算段（人维护）+ 生成计数段（`# >>> generated` 标记区块）。生成段不得手改。
- `facts.conf` 继续作为唯一入口；末尾在 `assets/facts.generated.conf` 存在时 `source` 之，避免改造 40+ 处既有 `source facts.conf` 调用点。
- 任何“同一事实”只允许出现在权威源；文档正文引用键名，不写死数字。

#### 3.3.3 关系模型

```text
runtimes 1 ── n references        （来源 → 方法论档）
runtimes 1 ── n dist              （物化/适配文件）
frameworks 1 ── 1 references      （规则文档）
frameworks n ── 1 gates           （81 个框架片段 → 1 个 check_framework 调度器）
gates 1 ── n conf_vars            （门禁 → 配置变量）
gates 1 ── n dist                 （门禁脚本随发）
hosts 1 ── n dist                 （适配器/hooks 文件）
references 1 ── n dist            （方法论档随发子集）
```

G26 校验器（新增 self-check 断言）检查：

1. **计数**：六表行数与 facts 生成段一致（56/81/51/22/8/92；WP7 新增 manifest 后 dist 为 93）。
2. **唯一性**：id / flag / fn / path 无重复。
3. **外键**：`dist.requires` 指向存在的能力；`references.consumer_node` 可解析；`frameworks.gate_script` 实存且被 `check_framework` 调度器引用（81 个片段对应 1 个 gate 行，不是 81 个独立门禁）。
4. **代码反查**：源码里的 `check_*` 函数、`framework-gates/*.sh`、`runtime/*` 必须全部入表；入表项必须实存（双向零孤儿）。
5. **夹具**：`fixture` 非空则目录存在；空则必须在 `docs/coverage-waivers.md` 登记理由。
6. **宣称**：`claim` 只能是 M0–M4；M2+ 必须有夹具证据；M3+ 必须有环境证据指针。
7. **死键**：每个 `FACT_` 键要么被脚本/测试/文档消费，要么在 `docs/facts-waivers.md` 登记。

#### 3.3.4 格式与兼容

- bash 3.2 无关联数组：读取统一用 `awk -F '\t'`，不 `source` TSV；字段数校验由渲染器做。
- 不使用 YAML/JSON 作为权威源，避免引入解析器；JSON 只用于运行时输出（probe/run 记录）。
- TSV 可以被人直接编辑，但必须过 `registry-render.sh --check`；新增行的格式错误在 CI 即红。

### 3.4 内核：生成、使用、成长

#### 3.4.1 生成：入口契约与目标技能清单

**入口契约**：`generate-skill.sh` 收敛为 dispatcher，所有子命令先完成共享初始化，再分派；禁止“在初始化之前 exit”。

```text
generate-skill.sh
  ├─ lib/init.sh          共享路径、版本、ASSETS_DIR、profile、锁
  ├─ gen/create.sh        创建（含 profile/industry 选择、骨架、模板渲染）
  ├─ gen/upgrade.sh       升级（暂存副本、保留项目特定文件、回滚）
  ├─ gen/inject.sh        框架注入/回滚/变量补齐
  ├─ gen/verify.sh        完整性/占位符/路径/计数三关
  ├─ gen/activate.sh      mark-active 三关 + 清单写入
  ├─ gen/render.sh        --render-tools 八宿主适配
  ├─ gen/refresh.sh       指纹 diff / --commit-fp
  └─ gen/globals.sh       --check-framework-globs
```

**13 步映射到 6 个阶段**（语义不变，只把阶段边界显式化）：

| 阶段 | 步骤 | 产物 | 证据 |
|------|------|------|------|
| S1 自检与读知识 | 1–2 | 运行时/环境清单、项目知识摘要 | 自检输出、读取记录 |
| S2 探查 | 3 | 组件库清单、关系边集、配方 | 计数核验、路径验真 |
| S3 形态与框架 | 4 | profile、ACTIVE_FRAMEWORKS、框架证据台账 | 探测输出、框架夹具 |
| S4 特征卡与骨架 | 5–6 | 17 特征卡、六段骨架、conf 初稿 | 特征卡 schema、骨架 diff |
| S5 AI 填充与装配 | 7–9 | 正文、规则、hooks、行业层 | 占位符清零、行业 e2e |
| S6 验证与激活 | 10–13 | 审查记录、记忆写回、active 清单 | verifier、三关、run_id |

**目标技能清单**：新增 `skill-manifest.json`（约 1–2 KB，生成物，不手改），字段：

```json
{
  "schema": 1,
  "name": "<skill-name>",
  "version": "<generator-version>",
  "generated_at": "<UTC>",
  "run_id": "<uuid-ish>",
  "profile": "lite|standard|compliance",
  "industry": "none|finance|gov|medical|telecom|automotive|energy|industrial|payment",
  "active_frameworks": ["spring-boot", "mybatis"],
  "gate_set": {"total": 56, "core": 11, "enabled": ["..."]},
  "hosts": ["claude-code", "codex"],
  "claim_levels": {"gates": "M2", "frameworks": "M2", "hosts": "M3"},
  "files": {"count": 93, "bytes": 0}
}
```

用途：`--upgrade` 判断哪些文件是生成物、哪些是项目特定；`--refresh` 判断指纹基线；`--render-tools` 判断宿主集合；发布审计判断能力等级。`SKILL.md` frontmatter 仍是人/宿主入口（profile/status），manifest 是机器元数据，两者由生成器同源写入，禁止手改不一致。**预算处理**：新增 1–2 KB 必须从目标技能既有重复注记中删掉等额内容，否则不上调预算；若无法等额删除，本项暂缓（列入 horizon）。

**profile 与行业选择**：

- `auto`：合规信号 → compliance；<80 文件 → lite；其余 standard（语义不变）。
- `compliance` 必须显式选择 `--industry <name>` 或 `--industry none`；不得静默缺省。
- `create` / `upgrade` 统一调用 `conf-render.sh --industry`，行业层只由这一条路径生成；禁止手工 `cat` 追加（usage-manual 同步改）。
- 8 档行业各有一条 e2e：生成 → `precheck.industry.conf` 存在 → 对应门禁/变量生效。

#### 3.4.2 门禁引擎：域与档正交，注册表驱动

**关键澄清**：`domain` 回答“查什么”，`tier` 回答“什么时候跑、多严”。两者正交，不能互相替代。

| 域 | 门禁数 | 代表门禁 | 说明 |
|----|--------|----------|------|
| security | 10 | security / authz / privacy / crypto / sbom / sast_deep / oss_eval / cwe_audit / skill_supply_chain | 安全与供应链 |
| architecture | 18 | layer / stable_diff / link_depth / adr / contract / consistency_cross / impact / service / api / state / frontend / method_size / cognition / domain / knowledge / diagram / shift_left / framework | 结构与设计约束 |
| process | 11 | branch / scope / spec_first / reuse / deps / decision_audit / state_phase / learnings / operate / loop_oracle / upstream_baseline | 流程与留痕 |
| quality | 6 | build / test / review / review_record / consistency / pr_quality | 交付质量 |
| compliance | 11 | compliance / dengbao / pia / cert_audit / release_sign / requirements / rtm / docs_pack / test_evidence / quality_model / metrics | 合规与证据 |

> 计数为按函数名/注释/fixture 的自然归属；`cert_audit`/`cwe_audit` 同时在 compliance tier，域归属以“查什么”为准。WP6 首次落表时逐项校准，校准结果进 `gates.tsv`。

**源与派生的边界**：

- **源**：`assets/gates/{security,architecture,process,quality,compliance}/*.sh` + `assets/gates/_lib.sh`。一个门禁一个函数，域目录按“查什么”组织。
- **派生**：`assets/gates-strict.sh` / `gates-warn.sh` / `gates-advisory.sh` 由 `registry-render.sh --gates` 按 `gates.tsv` 的 `enforce` 分组、按行序聚合生成；禁止手改。`tier` 决定执行序列，`enforce` 决定聚合到哪个派生文件，两者正交。
- **装载不变**：`precheck.sh` 仍 source 三个派生文件，再按 `tier` 组装序列并分派。WP6 阶段目标技能侧仍是 `precheck.sh` + 三个 gates 文件，92 文件计数与装载协议不变；WP7 新增 manifest 后为 93，另行同步。
- **公共库内联**：`assets/gates/_lib.sh` 由聚合器前置到三个派生文件，目标侧不新增文件；重复定义是生成物内的幂等冗余，不产生第二份手写源。
- **副作用保持**：聚合器保留每个域文件的头注与 source 时副作用（如 `gates-advisory.sh` 的 `_AI_JUDGMENT=1`）；这些全局设置单源化到 `_lib.sh`，行为 diff 必须为零。
- **兼容入口**：三个派生文件保留原文件名，`install.sh` 与既有目标技能不破。
- 装载顺序由 `gates.tsv` 行序显式化；`memory-backends.sh` 等前置依赖用 `# requires:` 注释声明，装载器做拓扑校验。

**扫描上下文（scan context）**：

- 每次 `precheck` 运行只建一次文件索引：`source_roots`、排除链、扩展名、mtime/size。
- 门禁通过 `sc_files` / `sc_grep` / `sc_first` 查询；禁止再各写 `find ... -not -path '*/node_modules/*'`。
- `--changed` 模式用 git diff 缩小索引；`--all` 用全量索引。
- 目标：全树枚举次数从 O(门禁数) 降到 O(1)；内容扫描按门禁实际需要执行。

**结果模型**：

```text
{ "run_id": "...", "gate": "security", "status": "fail|warn|pass|skip|advisory",
  "findings": [{"id": "SEC-001", "file": "...", "line": 42, "message": "..."}],
  "evidence": {"fixture": "...", "runtime_ms": 123, "scanned_files": 456},
  "claim_level": "M2" }
```

- 人面输出保持现有格式；机器面统一 JSONL + SARIF。
- `gate-runs.jsonl` 每条带 `run_id`；`gate-deny.jsonl` 带拦截原因与替代方案。
- advisory 门禁在隔离子 shell 中运行，重定义 `fail/warn/pass/skip` 只影响自身；不得污染主计数。

**enforce 声明化**：

- `gates.tsv` 的 `enforce` 是唯一有效级；`gate-enforce-level.conf` 改为生成视图。
- `gen-enforce-level.sh` 从“生成器”降级为“校验器”：扫描真实 `fail()` 调用形态（含 `&& fail`、`*) fail`、helper 内 fail），与声明比对；**未登记不一致 fail，已登记待批项 warn**；登记表 `docs/enforce-waivers.md`，`notes` 记理由。
- 修复 R126 #1 的 G8 盲区：校验器现在能看见真实 fail 数。发现的 5 个错分级（authz/reuse/crypto/sensitive/requirements）登记待批，**不在本包改级**；默认声明 = 当前有效级，保持 20/18/18 不变。改级须单独立项，更新 golden/usage/发布说明。

**门禁生命周期**：

- `active`：在某个序列或有明确 hook 调用点；有夹具或豁免。
- `watch`：可达但证据不足；不阻断，进入季度评审。
- `retired`：移入 `retired.tsv`，替代指针必填；代码移入 `archive/gates/`，不再随发。
- 显式 flag-only 门禁必须登记 `tier=explicit` 与调用点；无调用点的“孤儿”不得留在 active。

#### 3.4.3 spec-first 与状态机：语义不变，证据统一

- 四层拦截不变：L1 写时（3 宿主实证 + 5 宿主 rendered）、L2 提交时、L3 门禁时、L4 流程准入。
- 判据单一事实源仍是 `spec-first-lib.sh`；新增“宿主能力矩阵”从 `hosts.tsv` 读，不再在 8 个适配器里各写一套检测。
- 状态机六阶段不变；`verify_result` / `verify_evidence` 与 phase 绑定，回滚时作废（决策 48）。
- 每次 phase transition 落 `decisions.jsonl`，带 `run_id` 与 evidence 指针；`trace-log.sh --verify-chain` 语义不变，但明确边界：`cksum` 是意外篡改取证，不是密码学防篡改；如需抗对抗，另立 HMAC 可选档（horizon，不在本次范围）。

#### 3.4.4 验证：一个 runner，六层证据

| 层级 | 内容 | 代表件 | 失败含义 |
|------|------|--------|----------|
| L0 静态 | `bash -n`、ShellCheck、BSD/GNU 兼容、三平台语法 | CI shellcheck / windows-syntax | 代码不可移植或语法错误 |
| L1 门禁双态 | violating 必须检出指定 ID；compliant 必须零指定 ID | 48 组 gate-fixtures | 门禁检测逻辑失效或误报 |
| L2 框架双态 | 81 组框架夹具正反例 | tests/fixtures/ | 框架规则与项目代码不匹配 |
| L3 生成链路 | create 三档 / upgrade / inject / verify / mark-active / render-tools | gen-e2e + 行为级锁 | 生成器产物或状态机回归 |
| L4 独立验证 | verifier golden、cli-ab、SARIF | verifier/v1 | 门禁本身可能形同虚设 |
| L5 环境与持续 | 真实项目矩阵、宿主活体、连续运行 | real-project-smoke / host harness | 外部效度不足 |

**夹具政策**：

- 每个 active 门禁必须有 violating + compliant 两侧；只有一侧 = M1，不得宣称 M2。
- 每个框架必须有 violating + compliant 两侧；`expected-fail-ids` / `expected-pass-ids` 必填。
- 新门禁/框架没有双态夹具不得合入（或走 `coverage-waivers.md` 显式豁免，附补证期限）。
- 变异检查：对新增门禁与每季度抽样的 5 个门禁，注入一个已知缺陷，要求对应夹具变红；防止“断言恒真”。

**golden 与 cli-ab**：

- golden 从“rc + 3 个数字”扩为“rc + 发现 ID 集合 + 计数摘要”；输出内容漂移可见。
- cli-ab 必须在“有真实差异”的输入上比较（例如基线 tag vs 工作树，或注入一个已知改动），干净 checkout 的恒真比较降级为冒烟。

**runner**：

- `tests/run.sh --level 0-5 --jobs J --isolated --format tap`；每个测试头部有元数据：`level`、`owner`、`since`、`depends`、`parallel_safe`、`budget_s`。
- `run-sweep.sh` 变为 runner 的封装；CI 调同一 runner，按 level 分 job。
- 现有 43 个轮号测试不批量改名；加元数据 + `tests/index.tsv` 映射“轮号 → 行为 → 层级”。
- 日志目录按 `run_id` 隔离，禁止固定 `/tmp` 名；单实例锁保留。

#### 3.4.5 证据与完整性：run_id 贯穿

- 一次生成/门禁/验证 = 一个 `run_id`；所有日志、报告、决策、SARIF 都带 `run_id`。
- 证据目录：`.swarm-yuan/runs/<run_id>/{summary.json,gate-runs.jsonl,deny.jsonl,decisions.jsonl,trace.jsonl}`。
- 目标技能侧同样使用该模型；`skill-manifest.json` 记录生成 run_id，便于“这份技能是怎么来的”追溯。
- 诚实边界写进 README/usage：本地链只能发现意外漂移；无外部锚时不能宣称防篡改；恢复不恢复源码；SIGKILL/断电不在 trap 保证内。

#### 3.4.6 成长：指纹、last-good、知识生命周期

- 指纹感知不变：结构变化 → 局部重探查 → 单条更新 → 落新基线；条目骤降 >50% 拒写保留旧版。
- 知识生命周期三态不变：续期 / 降级标注 / 归档保留。
- 升级改为“读 `skill-manifest.json` → 计算差异 → 暂存副本 → 发布/回滚”；旧目标技能没有 manifest 时，从 frontmatter + conf 推导一次并补写。
- 记忆后端仍是 3 个，经 `memory-backends.sh` 适配；新增后端必须过同一契约测试。

### 3.5 知识面与吸收流水线

#### 3.5.1 吸收五步

```text
查新 probe → 分诊 triage → 吸收 absorb → 证据 evidence → 宣称/退役 claim/retire
```

1. **查新**：`upstream-probe.sh` 按 `runtimes.tsv` 走 npm/pypi/git 三通道，输出漂移 JSON；只读网络，按需运行，不进 CI 必需路径。
2. **分诊**：两问（决策 46）——哪个环节缺它、谁在什么场景消费；答不上只记轮台账。
3. **吸收**：三层接线（深度/CLI/方法论）；机制源不进 15 项分层计数；方法论引用不 vendor，运行时调用不重实现。
4. **证据**：运行时刷新必须回写 `runtimes.tsv` 一行 + 变更账一条；不能只写头注（R126 三行未回写的教训）。
5. **宣称/退役**：更新 M 等级；许可证/撞名/世系异常进 `status=watch/license-risk`；上游归档则退役。

#### 3.5.2 供应链状态与变更账分离

- `docs/upstream-baseline.md`（文件名不变，内容瘦身为状态表）：22 行当前值 + `baseline_status=` 机器锚；目标 <60 KB。
- `docs/research/upstream-changelog.md`：append-only，逐轮记录“谁、何时、从什么到什么、证据级别、是否复核”；46 条头注与行内前值史全部迁入。
- 当前 22 项 = 19 synced + 2 watch（claude-mem、codegraph）+ 1 license-risk（GitNexus）。
- `upstream-probe.sh` 输出：`{id, repo, channel, pkg_name, baseline, latest, drift, lineage_ok, license, checked_at, evidence}`。
- 撞名与世系规则：
  - `pkg_name` 必须是 registry 真名；裸名一律拒绝（ocr/comet/openspec/gsd-tools/codex-security 五连教训）。
  - `tag_regex` 限定本仓 tag 形态；异源旧 tag（graphify v1.0.0 类）必须被世系核验拦截。
  - `license` 变更即 `license-risk`，不自动追新；PolyForm Noncommercial 类保持钉版。

#### 3.5.3 框架包契约

81 个框架规则 + 81 个门禁片段是最大知识面（18,344 行门禁 + 1.5 MB 规则）。契约如下：

- **规则文档**必须有：探查信号、构件枚举、领域规律（每条五要素）、门禁清单（id/级别/实现/依赖 conf）、跨框架交互、版本陷阱。
- **门禁片段的文件头**必须有 `# ruleset:`、`# requires_conf:`、`# gates:` 三行；`# gates:` 声明的每个 id 必须能在函数内找到，且必须有夹具。
- **共享原语**：`_fw_resolve_globs`、`_fw_report`、`_fw_strip_comments_*` 等进公共库；新片段不得复制排除链/JSON/计数逻辑。
- **组合**：`family` 相同的框架共享语言基线规则；框架只写 delta。先做校验器与共享库，不批量重写 81 份（horizon WP14）。
- **证据**：每个框架至少 1 组 violating + 1 组 compliant；进入真实项目矩阵的框架升 M3/M4。

#### 3.5.4 方法论档的合并与退役

- 每档 `references.tsv` 一行：`consumer_node` 必须是真实节点，`overlap_group` 标出同主题档（如多篇架构方法论）。
- 同 `overlap_group` 且消费节点相同的档，进入合并评审；合并后保留 redirect 指针，避免路由断链。
- G25 从“档名双向存在”升级为“注册表 ↔ 实存 ↔ 路由 ↔ 随发”四面对账；R76 教训写进校验器注释：消费节点真实性由评审判据守，机器只能对账存在性。

### 3.6 分发与宿主

#### 3.6.1 一份清单，三个视图

- `dist.tsv` 是唯一文件清单。三个消费视图：
  - **目标技能视图**：`audience=target` + `tier` 过滤 → `UNIVERSAL_FILES`（生成时读表，不再内嵌数组）。
  - **离线包视图**：`offline=yes` 过滤 → 打包清单；`vendor` 单列可选件。
  - **源码包视图**：`src_pkg=yes` 过滤 → release 白名单。
- `offline-manifest.conf` 只保留运行时安装信息，从 `runtimes.tsv` 生成；不再手工维护文件清单。
- `make-offline-bundle.sh` 不再“打包整树后排除”；按视图打包，排除逻辑消失。
- `install.sh` 只按视图拷贝；`docs/`、`research/`、`vendor-knowledge/` 不在目标视图。

#### 3.6.2 宿主矩阵

| 宿主 | 支持级 | 检测契约 | hooks schema | 当前证据 |
|------|--------|----------|--------------|----------|
| Claude Code | deep | 命令 + 配置目录 | hooks.json deny JSON | M3 活体实证 |
| Codex | cli | 配置目录 + `.codex/hooks.json` | exit 2 | M3 活体实证 |
| ZCode | cli | 插件目录 + config.json | 嵌套 hooks.json | M3 活体实证 |
| Cursor | cli | 目录探测 | hooks.json v1 扁平 | M1 已渲染 |
| Gemini | cli | 目录探测 | settings.json hooks 嵌套 | M1 已渲染 |
| Windsurf/Devin | cli | 目录探测 | hooks.v1.json bare | M1 已渲染 |
| OpenCode | cli | 目录探测 | 插件目录 | M1 已渲染 |
| Kimi-Code | cli | 父目录探测（修正不一致） | config.toml [[hooks]] | M1 已渲染 |

- 检测统一读 `hosts.tsv`，禁止 adapter 内各自写 `~/<host>/skills` 存在性判断（R126 #4 根因）。
- 安装失败必须传播；`--all` 不得因一个宿主失败静默中止后续；重装先暂存后发布，失败回滚。
- 未实证宿主在文档中统一标 `rendered`，不得写“支持写时拦截”。

#### 3.6.3 重资产外置

- `vendor-knowledge/` 24 MB / 304 件移出 git 追踪：保留 `MANIFEST` + SHA256 + 拉取脚本 `sync-vendor-knowledge.sh`；离线包把 vendor 列为可选件。
- 支付 profile 在 vendor 缺失时诚实降级：提示“法规原文未同步”，不阻断其他档。
- **诚实说明**：外置只能阻止新 clone 继续变大；已有 `.git` 历史中的 24 MB 不会自动消失。要回收历史需 shallow clone 或历史重写；本设计不推荐历史重写。

### 3.7 文档系统：三档分离，派生不手改

| 档 | 文件 | 读者 | 是否手写 | 真值来源 |
|----|------|------|----------|----------|
| 规范面 | `swarm-yuan/README.md`（设计论证）、`docs/usage-manual.md`（操作）、`swarm-yuan/SKILL.md`（运行时入口） | 人 / AI | 手写 | 正文引用注册表键名 |
| 派生面 | `docs/design-compendium.md`（仓内导读）、`design-compendium-full.md`（默认 release 附件，按拍板）、`docs/upstream-baseline.md`、`capability-map.md`、`coverage-matrix.md`、`claim-matrix.md`、facts 生成段 | 人 / CI | 生成 | 六表 + 轮档 |
| 档案面 | `docs/design-evolution.md`、`docs/research/R*.md`、`docs/reviews/`、`CHANGELOG.md` | 维护者 | 手写 / append-only | 过程记录，不承载当前真值 |

**规则**：

- 派生面文件头带生成标记与源提交；`build-docs-views.sh --check` 进 CI。
- 全文汇编（卷九 97 份轮档全文）默认作为 release 附件，不常驻 git；仓内保留 `design-compendium.md` 导读 + 生成脚本。若拍板保留全量，则只允许生成，不允许手改。
- 文档中的代码定位一律用“文件 + 符号”（如 `generate-skill.sh::create`），禁止行号；CI 扫描 `\.sh:[0-9]+` 即 fail。
- 数字只允许两种形态：引用 `FACT_*` 键名，或由渲染器注入占位符；正文不写死计数。
- README 与 usage-manual 的分工：README 回答“为什么这样设计”，usage-manual 回答“命令怎么用”；同一机制不在两处各写一遍，用交叉链接。

### 3.8 目标技能侧：更薄，但更自描述

- 六段目录、九节点、五概念不变。
- 新增 `skill-manifest.json`（见 3.4.1），是“自描述”的唯一新增物；文件数 92→93，同步 `FACT_UNIVERSAL_FILES`；字节预算必须等额置换，否则暂缓到 WP13。

```text
<target-skill>/
  SKILL.md                      # 入口；frontmatter profile/status 不变
  skill-manifest.json           # 新增：机器元数据（profile/industry/frameworks/claims/run_id）
  references/                   # 组件库清单、配方、workflow、方法论随发子集
  assets/                       # spec 模板、conf、标准映射等
  scripts/
    precheck.sh                 # 装载协议不变
    gates-strict.sh             # 生成视图（enforce 分档聚合）
    gates-warn.sh
    gates-advisory.sh
    ...                         # 其余工具脚本
  rules.d/                      # 三值规则
  hooks/ + commands/ + settings # 非 lite 档
```
- 目标技能中的能力说明按 M 等级标注：`门禁 56（M2 34 / M1 22）`，不再只写“56 门禁”。这是**生成器全量口径**；目标技能按 `manifest.gate_set` 取实际启用子集，不得把全量口径写成目标技能已启用数。
- 行业选择写入 manifest；`--refresh`/`--upgrade` 读 manifest 恢复上下文，不再靠猜。
- 目标技能不得引用生成器仓路径；所有方法论档要么随发，要么标【生成器侧】；G25 ⑥ 继续守。

### 3.9 预算体系：从单维字节到三维

| 维度 | 指标 | 现状 | 目标 | 执法 |
|------|------|------|------|------|
| 上下文 | SKILL.md / 随发 / 地图 / 生成期必读 | 11264 / 614400 / 32768 / 194560 B | 不变 | 现有断言 |
| 执行 | 参考仓 `--all` P50/P95；全树枚举次数 | 3.66s（R126 实测）；O(门禁×全树) | 不劣化；枚举 O(1) | 新增 `scripts/exec-bench.sh`；先 warn 后 fail |
| 执行 | 框架注入行数 / 激活框架数 | 18,344 行总量；无上限 | 每次注入 ≤ 基线 +10%，超出需理由 | `--inject-frameworks` 输出统计 |
| 结构 | 排除链重复实现 / conf 读法 / JSON 编码器 | 14 / 4 / 3+ | 1 / 1 / 1 | grep 断言 + 代码评审 |
| 结构 | 新增能力触碰文件数 | 门禁约 8 处；运行时约 4 处 | ≤3 / ≤2 | 工作包验收 |
| 结构 | 引擎 LOC / 生成器 LOC | 7,164 / 3,252 | 期二结束不高于基线 +5%，之后只降不升 | `FACT_SCRIPT_LOC` + 新键 |

**税基定义**：上下文税只计每次会话必读/预读面——`SKILL.md`、references 分发产物、组件库清单、生成期必读三件套，以及被宿主预读的 manifest（按 1–2 KB 计）。`scripts/`、`hooks/`、`rules.d/` 是按需执行/匹配，计执行税，**不计上下文税**——否则会把 18,344 行框架门禁误算成“每会话加载”，得出错误结论。执行税另按耗时、扫描次数、注入行数计量。

**注意**：上下文预算与执行预算回答不同问题。脚本是按需调用工具，不占 AI 上下文；但占 CPU、I/O 与维护认知。两者都要有上限，不能用一个替代另一个。

### 3.10 安全与供应链

- **供应链**：许可证、包名、tag 世系、来源证据四件事进 `runtimes.tsv`；`license-risk` 不自动追新；自动安装保持撤销直到逐包核验。
- **SBOM**：`--sbom` 输出运行时与许可证清单；离线包附 `SHA256SUMS`，覆盖入口脚本（修 R126 #31 自举盲区）。
- **宿主 hooks**：路径/命令进 JSON 必须转义；deny 消息带替代方案；命令解析器明确是有限词法器，不是 Shell 解释器/沙箱。
- **证据链**：`cksum` 防意外漂移；文档明确不宣称抗对抗。若要抗对抗，后续可选 HMAC（密钥管理独立评审）。
- **权限边界**：fail-closed；只有“还有下层兜底”的地方允许 fail-open（如 hooks 失败后仍过门禁）。

### 3.11 稳定性契约：本设计不改变什么

1. 13 步生成流程的步骤语义与编号。
2. 九节点工作流。
3. 六段目标技能目录。
4. lite/standard/compliance/auto 四档语义。
5. spec-first 四层与判据库。
6. 门禁 56 的数量与执行序列语义（域重组不改变“跑哪些、什么顺序”）。
7. conf 变量 185 的物理键名与默认值（只统一读法，不重命名）。
8. 81 框架的 1:1 规则/门禁配对。
9. 目标技能四上限。
10. 8 宿主支持范围（只修检测与证据表述，不新增宿主）。

---

## 四、重构优化方案：三阶段十二工作包

### 4.0 迁移方法论：绞杀者，不搞大爆炸

每个工作包按同一节奏：

```text
0. 基线：记录当前产物/计数/耗时；跑全量 sweep
1. 导出：从现状机械导出注册表/清单，diff 必须为零
2. 双读：新旧两路都算，不一致 fail；稳定一轮
3. 切换：消费方逐个切到新路；一次一个
4. 删除：旧路删除；全量回归 + 基线 diff
5. 收口：更新文档/变更账/发布说明
```

**硬规则**：

- 行为保持式改动与缺陷修复不混在一个提交（决策 49）。
- 每个 WP 独立 worktree；重文件（`generate-skill.sh`）独占 worktree；并行 worktree ≤3。
- 任何一步不合入未全绿的 sweep；回滚 = revert 对应切换提交，注册表本身无害。
- 每个 WP 结束时更新 `CHANGELOG.md` 与 `docs/design-evolution.md`（若形成决策）。

### 4.1 期一：事实与清单（WP1–WP4，低风险，2–3 轮）

#### WP1 注册表平面与生成视图

**目标**：六张 TSV 成为唯一权威源；facts 计数、capability-map、覆盖矩阵、宣称矩阵由渲染器生成；G26 入 self-check/CI。

**改动面**：

- 新增 `assets/registry/{gates,frameworks,references,runtimes,hosts,dist}.tsv`。导出分两类：结构字段（id/path/fn/flag/计数）机械导出；语义字段（`consumer_node`/`conf_vars`/`wiring`/`claim`/`family`）以 capability-map、规则文档、facts 为源一次校准，之后变更需评审。
- 新增 `scripts/registry-render.sh`：`--export` / `--check` / `--facts` / `--capability-map` / `--coverage` / `--claims` / `--gates`（`--gates` 由 WP6 消费，生成三个 enforce 聚合文件）。
- `assets/facts.conf` 拆手写预算段 + `# >>> generated` 计数段。
- `scripts/self-check.sh` 新增 G26 三向一致性；G25 改为对账 `references.tsv`。
- 新增 `docs/facts-waivers.md`、`docs/coverage-waivers.md`、`docs/enforce-waivers.md`（空表起步）。

**机器验收**：

```bash
bash swarm-yuan/scripts/registry-render.sh --export --check   # 六表计数 56/81/51/22/8/92，零差异
bash swarm-yuan/scripts/self-check.sh --check-only             # G26 通过
bash swarm-yuan/tests/test-doc-numbers.sh                      # 现有 127 断言不回归
# 代码反查：源码 check_* / framework-gates / runtime 与表双向零孤儿
```

**回滚**：纯新增 + 生成段；删目录/还原 facts 即回滚，消费方尚未切换。

**风险**：TSV 解析（bash 3.2）；语义字段一次校准工作量大。对策：先导结构字段，语义字段允许空值但 G26 对空值 fail（防遗忘），按表分批补齐后再切换消费方。

#### WP2 分发清单化、宿主表与重资产外置

**目标**：`UNIVERSAL_FILES` 数组消失，生成器读 `dist.tsv`；离线/源码包改为过滤视图；宿主检测读 `hosts.tsv`；vendor 外置。本包可拆两批：2A 清单/宿主/行业，2B vendor 外置（依赖拍板）。

**改动面**：

- `generate-skill.sh` 的 `UNIVERSAL_FILES` 改为 `dist_load`（读表 + profile 过滤）。
- `make-offline-bundle.sh` 按视图打包；`release-src-packages.sh` 按 `src_pkg` 过滤。
- `install.sh` 八宿主检测统一读 `hosts.tsv`；本包完成检测语义与 Kimi 路径修正（R126 #4 的检测面）。重装回滚、子 shell 静默、WSL 盘符等生命周期硬化归 WP11。
- `vendor-knowledge/` 移出追踪，新增 MANIFEST/SHA256/同步脚本；离线包 vendor 可选。
- `create`/`upgrade` 增加 `--industry` 并调用 `conf-render.sh`；usage-manual 删除手工 `cat` 指引。

**机器验收**：

```bash
# 三档 create 产物逐字节一致（归一化时间戳/版本/临时路径）
bash swarm-yuan/tests/run-e2e.sh
# 离线包：build → SHA256SUMS → 临时目录 install → 生成样例技能 → 一次门禁拦截
bash swarm-yuan/scripts/make-offline-bundle.sh --no-vendor
# 本包先加最小离线冒烟；完整离线 e2e 在 WP10 落地
bash swarm-yuan/tests/test-offline-smoke.sh
# 八宿主检测：本机 5 已装不误判、3 缺失不误判；--all 单宿主失败不静默
bash swarm-yuan/install.sh --list
# 行业 e2e：8 档各生成一次，precheck.industry.conf 存在且生效
```

**回滚**：`dist.tsv` 保留旧数组一份作为 fallback 一轮；确认零差异后删除。vendor 外置可回滚为 git 跟踪（但需拍板）。

**风险**：安装链路是高风险区；先加双读比对，再切换。

#### WP3 供应链状态/变更账分离与 probe

**目标**：`upstream-baseline` 只留当前值；历史迁 append-only；`upstream-probe.sh` 三通道查新；刷新轮有机器报告。

**改动面**：

- `docs/upstream-baseline.md`（文件名不变，内容瘦身）到 22 行 + 最近变更指针；46 条头注/行内前值迁 `docs/research/upstream-changelog.md`。
- `scripts/upstream-probe.sh`：读 `runtimes.tsv`，查 GitHub/npm/pypi，输出 JSON + 人面摘要；含包名撞名、tag 世系、许可证检查。
- `self-check` 轻量基线忠告改读状态表；`test-r118-release-hardening` 的清单↔baseline 对账改读注册表。

**机器验收**：

```bash
bash swarm-yuan/scripts/upstream-probe.sh --offline --check   # 无网络时输出 skipped，不 fail
bash swarm-yuan/scripts/upstream-probe.sh --json > /tmp/probe.json
# 当前 22 行零漂移（ruflo 3.58.1 / gstack c580561e8 / semantica 0934ae800 等）
grep -c 'baseline_status=' docs/upstream-baseline.md              # 22
wc -c docs/upstream-baseline.md                                   # <60,000
```

**回滚**：历史已完整保留在 changelog；状态表可由注册表重新生成。

**风险**：网络/API 限流；probe 只按需运行，不进 CI 必需路径。

#### WP4 文档三档与汇编生成器

**目标**：派生文档不再手抄；汇编可再生产；行号锚清零；全文汇编按拍板决定是否外置。

**改动面**：

- 新增 `scripts/build-compendium.sh`、`scripts/build-docs-views.sh`；生成 `design-compendium.md` / `-full.md` / `upstream-baseline.md` / `claim-matrix.md` / `coverage-matrix.md`（状态表 schema 由 WP3 定义，本包只接渲染管线）。
- 顶层规范文档的 22 处 `generate-skill.sh:NNNN` 改符号锚；CI 只扫描规范面（README / usage-manual / SKILL.md / design-compendium 导读）。`docs/research/`、`docs/reviews/` 是历史快照，保留原行号并加“行号可能漂移”头注，不改写历史。
- README/usage-manual 的数字改为键名/占位符；重复段落用交叉链接收敛。
- 全文汇编若外置：release 附件 + 仓内导读；若保留：只允许生成。

**机器验收**：

```bash
bash swarm-yuan/scripts/build-docs-views.sh --check        # 派生面零差异
bash swarm-yuan/scripts/build-compendium.sh --check
! grep -rE '\.sh:[0-9]+' docs/ swarm-yuan/README.md        # 零行号引用
```

**回滚**：文档可还原；生成脚本保留。

**风险**：文档 churn 大；按“先生成、后删旧”两步走。

### 4.2 期二：内核收敛（WP5–WP7，中风险，3–4 轮；结构迁移行为保持，行为变更单列）

#### WP5 公共库与扫描上下文

**目标**：消灭四类重复实现；conf/files/log/json/hash/run 六件 helper；门禁共享一次文件索引。

**改动面**：

- 新增 `assets/lib/{conf,files,log,json,hash,run}.sh`。
  - `conf`：`conf_get` / `conf_filled` / `conf_effective`（patch 合成）/ `conf_require`；收编 5 处文本 grep。
  - `files`：`sc_init` / `sc_files` / `sc_grep` / `sc_first`；收编 40 次 `find` 与 14 条排除链。
  - `log`：pass/fail/warn/skip/advisory + JSONL/SARIF 聚合；收编 advisory 子 shell 重定义。
  - `json`：转义/对象/数组，零 Python 依赖；收编 3 套实现。
  - `hash`：cksum/sha256 + 链规范化；语义不变。
  - `run`：run_id、临时目录、锁、trap、清理。
- 四脚本逐文件切换；每切一个跑一次基线 diff。

**机器验收**：

```bash
bash swarm-yuan/tests/run-sweep.sh
# 决策 49 基线：create 三档 + inject + verify + mark-active 产物归一化 diff 零差异
grep -rc 'node_modules' swarm-yuan/assets/*.sh | awk -F: '{s+=$2} END {print s}'   # 目标 1（lib 内）
grep -h '^check_[a-z_]*()' swarm-yuan/assets/precheck.sh swarm-yuan/assets/gates-*.sh | wc -l  # 56 不变
# 执行基准：本仓 --all 3.66s 基线，不劣化；万文件仓扫描次数 O(1)
```

**回滚**：每文件单独提交；revert 单文件即可。

**风险**：`set -euo pipefail` 与 `find|head` 的 SIGPIPE 族；用现有回归锁 + 同族清剿。

#### WP6 门禁按域重组 + 声明式 enforce

**目标**：五域目录；注册表驱动装载；enforce 声明与校验；完成 6 个孤儿门禁的归属裁决（注册/降级/退役）。夹具补齐归 WP8，不在本包展开。

**改动面**：

- 56 个 check 迁 `assets/gates/{security,architecture,process,quality,compliance}/`；`gates-strict/warn/advisory.sh` 改由 `registry-render.sh --gates` 按 enforce 聚合生成，保留原文件名。
- `precheck.sh` 装载方式不变（仍 source 三个 gates 文件），序列按 `tier` 组装；目标技能侧文件数与装载协议不变。`# requires:` 拓扑校验。
- 聚合器保留头注与 source 时副作用（`_AI_JUDGMENT` 等全局设置单源化到 `_lib.sh`）；逐字节行为 diff 验收。
- `gen-enforce-level.sh` 改校验器；修 `&& fail` / `*) fail` / helper fail 漏计。默认声明 = 当前有效级；5 个错分级（authz/reuse/crypto/sensitive/requirements）登记 `enforce-waivers.md` 待批，不在本包改级。
- orphan 裁决：注册进序列 / 降级为显式调用并登记 / 退役；裁决结果写 `gates.tsv` 与 `retired.tsv`。若裁决改变执行序列，属显式行为变更，单独提交并在发布说明列出，不与物理迁移混在一起。双态夹具补齐在 WP8，本包只保证既有夹具仍绿。
- 聚合器把跨 enforce 档共享的 helper 上移 `_lib.sh`；聚合后做 `bash -n` 与未定义函数静态检查。
- `--list-gates` 输出保持字段兼容，新增 domain/claim 列。

**机器验收**：

```bash
bash swarm-yuan/assets/precheck.sh --list-gates > /tmp/after.txt
# gate/flag 两列提取后 diff 为空（新增 domain/claim 列不算行为变化）
diff <(awk '{print $1,$2}' /tmp/before.txt) <(awk '{print $1,$2}' /tmp/after.txt)
bash swarm-yuan/tests/run-gate-fixture.sh all      # 48 组逐字节同输出
bash swarm-yuan/tests/run-framework-fixture.sh all # 81 组逐字节同输出
bash swarm-yuan/scripts/self-check.sh --check-only  # FACT_ENFORCE_* 六键 20/18/18（本包不改级）
# 生成的三个 gates 文件与现状逐字节 diff（仅头注/source 路径归一）
```

**回滚**：物理迁移不改逻辑；shim 保留一轮；revert 装载器即可。

**风险**：装载顺序/全局变量；注册表顺序显式化后风险可控。

#### WP7 生成器拆分 + 目标技能清单 + 行业接线

**目标**：dispatcher + 共享初始化 + 子命令模块；修 MED-8 根因；新增 `skill-manifest.json`；行业 8 档进主链路。

**改动面**：

- `generate-skill.sh` 收敛为入口；实体迁 `scripts/gen/`；所有子命令先 init 再 dispatch。
- `skill-manifest.json` 生成/读取/校验；`--upgrade` 兼容无 manifest 的旧技能（推导一次）。
- `create`/`upgrade` 增加 `--industry`；8 档 e2e。
- `dist.tsv` 增加 `skill-manifest.json` 一行（92→93），`FACT_UNIVERSAL_FILES` 同步；字节预算等额置换，否则暂缓。
- `detect-frameworks` 的 3 次全仓扫描收敛为 1 次（R126 #19），复用 WP5 的扫描上下文。
- 函数尺寸沿用 150 行锁；`_fg_emit_workflow` 等超限函数按决策 49 拆。

**机器验收**：

```bash
bash verifier/v1/run-verifier.sh all
bash swarm-yuan/tests/run-e2e.sh
# 基线 diff：create 三档 / upgrade / inject / verify / mark-active / render-tools
# manifest schema 校验：JSON 合法、字段齐全、run_id 可追溯
# 行业 8 档 e2e：conf 存在、变量生效、对应门禁可触发
```

**回滚**：拆分按文件/函数分批；每批基线 diff 零差异才继续。

**风险**：生成器是最高风险区；单独 worktree、单独轮次，不与门禁迁移并行改同一文件。

### 4.3 期三：验证与交付（WP8–WP12，3–4 轮）

#### WP8 门禁组合治理与证据补齐

**目标**：能力记分卡可计算；覆盖矩阵零缺口；退役台账可用；季度评审有数据。

**改动面**：

- `coverage-matrix` 由注册表 + 夹具扫描生成：每门禁/框架的 M 等级、violating/compliant、expected IDs、golden、最后验证 run_id。
- 补 9 个无夹具门禁的最小双态；补 13 个仅 compliant 的 violating；补 78 个框架的 compliant 侧 `expected-pass-ids` 负向断言（按家族分批）。
- `retired.tsv` + 季度评审脚本 `scripts/portfolio-review.sh`：零命中、M0/M1 超期、误报率、维护成本。
- 变异检查脚本：新增门禁必跑；季度抽样 5 个。

**机器验收**：

```bash
bash swarm-yuan/scripts/coverage-matrix.sh --check    # 零缺口或豁免齐全
bash swarm-yuan/scripts/mutation-check.sh --sample 5  # 注入缺陷必须变红
bash swarm-yuan/scripts/portfolio-review.sh --report  # 输出退役候选清单
```

**回滚**：只增夹具/台账；门禁数量不变。

**风险**：补 78 个框架负向断言工作量大；按 family 分批，先 Java/JS/Python 主流。

#### WP9 统一测试 runner 与 CI/sweep 同构

**目标**：一个 runner，本地与 CI 同构；测试元数据可寻址；并行加速；日志隔离。

**改动面**：

- `tests/run.sh`：level/jobs/isolated/format；每个测试头部元数据；`tests/index.tsv` 映射轮号→行为。
- `run-sweep.sh` 变封装；CI 11 job 收敛为 level 矩阵（保留平台矩阵）。
- 固定 `/tmp` 路径改 run_id 目录；单实例锁保留。

**机器验收**：

```bash
bash swarm-yuan/tests/run.sh --level all --jobs 4 --format tap
bash swarm-yuan/tests/run-sweep.sh
# 同一测试集结论一致；并行总时长下降（记录前后值）；无固定 /tmp 冲突
```

**回滚**：runner 与旧 sweep 双跑一轮；结论一致后切换。

**风险**：runner 自身缺陷；用自举测试锁。

#### WP10 证据矩阵、golden 与离线 e2e

**目标**：证据不只“跑过”，而是“能证明抓得住”；golden 锁发现 ID；cli-ab 有真实差异；离线全链路实跑。

**改动面**：

- golden 从 3 数字扩为 rc + 发现 ID 集合 + 计数摘要。
- cli-ab 改“基线 tag vs 工作树”或注入已知改动；干净 checkout 降级冒烟。
- 离线包 e2e：build → SHA256 → install → 生成 → 门禁拦截。
- verifier 与 sweep 同构；`verifier/runs/` 恢复逐次留档。

**机器验收**：

```bash
bash verifier/v1/run-verifier.sh all
bash swarm-yuan/tests/test-offline-e2e.sh
# 人为注入一个门禁漏检，golden 必须红；恢复后绿
```

**回滚**：测试基线可重建；golden 重建脚本纳入版本。

**风险**：golden 重建成本；用脚本化。

#### WP11 安装/宿主/离线/源码包端到端硬化

**目标**：8 宿主安装矩阵可重复；升级不混版本；离线/源码包可自举；3 实证 + 5 rendered 表述一致。

**改动面**：

- install 生命周期硬化：重装回滚、子 shell 失败传播、WSL 盘符、离线入口（R126 #4 余项、#34）。检测数据化已在 WP2 完成。
- 升级暂存副本 + 发布/归档/回滚；失败不留混合版本。
- SHA256SUMS 覆盖入口三件；版本三处写入统一源。
- 宿主 harness：3 实证宿主可重复；5 rendered 宿主提供配置校验与手工验证清单。

**机器验收**：

```bash
bash swarm-yuan/tests/test-install-matrix.sh      # 8 宿主×缺失/已装/重装
bash swarm-yuan/tests/test-upgrade-reliability.sh # 失败恢复原目录
bash swarm-yuan/tests/test-offline-e2e.sh
```

**回滚**：安装链路按函数提交；保留旧路径一轮。

**风险**：外部 CLI 不可得；rendered 宿主只做配置校验，不宣称实证。

#### WP12 文档收敛、宣称矩阵与新人路径

**目标**：文档不再互相抄数字；每个宣称有等级；30 分钟新用户路径可实测。

**改动面**：

- README/usage-manual 重叠段收敛；数字全部引用键名/渲染占位符。
- `claim-matrix.md` 生成：能力、等级、证据、最后验证、限制。
- 发布说明模板加“M 分布”段。
- 30 分钟路径 e2e：临时目录 → install → 生成样例技能 → 激活 → 一次门禁拦截；CI 计时。
- jargon 门禁扩展：`支持/整合/实证/持续验证` 必须能回指等级。

**机器验收**：

```bash
bash swarm-yuan/tests/test-onboarding-30min.sh
bash swarm-yuan/scripts/build-docs-views.sh --check
bash swarm-yuan/tests/test-doc-numbers.sh
# 两文档重复数字/段落基线减半（脚本统计）
```

**回滚**：文档可还原；e2e 保留。

**风险**：文档工作量大；按“数字→段落→结构调整”三步走。

### 4.4 后续候选（不在本次批准范围）

| 候选 | 内容 | 前置 | 预期收益 |
|------|------|------|----------|
| WP13 能力选择编译 | profile + 信号 → 选择能力集合；目标技能只带可达子集；manifest 驱动 | WP1/WP2/WP7 | 目标技能体积与认知负担下降；A/B 三样例验证 |
| WP14 框架包组合化 | 家族共享规则 + delta；共享原语；81 份逐步迁移；schema 校验 | WP5/WP6/WP8 | 框架门禁 LOC 下降 ≥30%；新增框架成本下降 |
| WP15 证据抗对抗（可选） | HMAC 链 / 外部锚；密钥管理独立评审 | WP10 | 从“意外篡改取证”升级到“可验证完整性” |

### 4.5 依赖与顺序

```text
WP1 ──┬── WP2 ── WP11
      ├── WP3
      ├── WP4
      └── WP5 ──┬── WP6 ── WP8 ── WP9 ── WP10
                └── WP7 ──────────────┘
WP12 依赖 WP4/WP8/WP10/WP11（最后收口）
WP13/WP14 依赖期二/期三完成
```

期一可并行：WP1 先行；WP2/WP3/WP4 在 WP1 导出后并行。期二：WP5 先行；WP6/WP7 分 worktree 并行（WP7 独占生成器文件）。期三：WP9 先行；WP8/WP10/WP11 可并行；WP12 最后。

### 4.6 验收与回滚总表

| WP | 核心验收 | 回滚单位 | 风险 |
|----|----------|----------|------|
| WP1 | 六表计数零差异；G26 通过；127 断言不回归 | 删新增目录 | 低 |
| WP2 | 三档产物逐字节；离线/源码视图；8 宿主检测；行业 e2e | 单消费方切换提交 | 中高 |
| WP3 | 22 锚 + 状态表 <60K + probe 零漂移 | 状态表可重生成 | 低 |
| WP4 | 派生面 `--check`；行号引用 0 | 文档还原 | 低 |
| WP5 | 基线 diff 零差异；重复实现归零；执行不劣化 | 单文件 revert | 中 |
| WP6 | 48+81 夹具同输出；`--list-gates` 兼容；enforce 20/18/18 | 装载器 revert | 中 |
| WP7 | verifier + e2e + 基线 diff；manifest schema；行业 8 档 | 分批拆分提交 | 高 |
| WP8 | 覆盖矩阵零缺口；变异检查；退役台账 | 只增不删 | 中 |
| WP9 | runner 与旧 sweep 同结论；并行加速 | 双跑后切换 | 中 |
| WP10 | golden 抓得住注入缺陷；离线 e2e | 基线可重建 | 中 |
| WP11 | 8 宿主矩阵；升级回滚；离线自举 | 按函数提交 | 高 |
| WP12 | 30 分钟路径；宣称矩阵；数字零漂移 | 文档还原 | 低 |

### 4.7 预期收益（可测量）

| 指标 | 现状 | 目标 | 度量 |
|------|------|------|------|
| 新增一个门禁触碰文件 | 约 8 处 | ≤3 处（gates.tsv + 域函数 + 夹具） | 工作包演练 |
| 运行时刷新手写面 | 4 类（头注/表行/离线清单/facts） | 2 类（runtimes.tsv + changelog） | 一轮刷新 diff |
| `upstream-baseline` 体积 | 195,571 B | <60,000 B | `wc -c` |
| 门禁证据缺口 | 22（9 无夹具 + 13 仅正向；summary 特例不计） | 0 或显式豁免 | coverage-matrix |
| 框架负向断言缺口 | 78/81 | 0 | coverage-matrix |
| 零消费 FACT 键 | 25 | 0 或豁免 | facts-waivers |
| 规范面行号引用 | 22（全 docs 40，其余为历史档案） | 0（档案保留并标记） | grep 规范面 |
| 文档派生面 | 手抄/无生成器 | 全部 `--check` | CI |
| 参考仓 `--all` | 3.66s；O(门禁×全树) | 不劣化；枚举 O(1) | exec-bench |
| 追踪工作树 | 46 MB | ~22 MB（vendor 外置后） | `git ls-files` |
| 测试 runner | sweep 与 CI 不同构 | 同一 runner | CI 对照 |
| 宣称覆盖率 | 无矩阵 | 100% 能力有等级/证据/限制 | claim-matrix |

### 4.8 轮次与发布

| 批次 | 内容 | 版本 | 兼容性 |
|------|------|------|--------|
| R130–R131（2–3 轮） | WP1–WP4 | v2.89.0 “治理底座” | 旧目标技能不受影响；生成器行为不变 |
| R132–R133（3–4 轮） | WP5–WP7 | v2.90.0 “内核收敛” | `--upgrade` 兼容无 manifest 旧技能；一次性补写 |
| R134–R136（3–4 轮） | WP8–WP12 | v2.91.0 “验证与交付” | 目标技能语义不变；新增 manifest/等级说明 |
| 后续（R137+） | WP13–WP15 | v2.92+ | 按能力选择编译单独评审 |

合计 8–11 轮；并行会话可压缩到约 6–8 个日历轮。

**发布门**：sweep 全绿 + verifier all + 基线 diff 零差异 + 文档 `--check` + 至少 2 个真实项目回归。单次全绿只是准入；连续三次全绿才算稳定（沿用项目评测纪律）。

### 4.9 并行会话协调

- 每个 WP 一个 worktree，命名 `<type>/<wp-id>`；重文件独占；worktree ≤3。
- 文件归属：WP6（门禁）与 WP7（生成器）不共享文件；WP5 的 lib 文件由主会话统一收口，避免多代理同时改。
- 子代理报告不直接入账：主会话复跑测试、核对 `git diff --name-only` 是否越界、抽查关键断言后再提交（决策 49）。
- 轮号让位：实施期间工作包编号优先于例行 R 号；例行刷新合并进相邻轮。

---

## 五、风险与对策

| 风险 | 概率/影响 | 对策 |
|------|-----------|------|
| 注册表又成新的手抄面 | 中/高 | 只允许机械导出；派生文件生成标记；G26 `--check` 入 CI；表行变更必须伴随消费方或豁免 |
| 行为保持拆分引入隐性漂移 | 中/高 | 决策 49 基线 diff + 反向断言；拆一个验一个；缺陷修复单独提交 |
| 绞杀者迁移期双源不一致 | 中/中 | 双读比对一轮；不一致 fail；切换提交可 revert |
| bash 3.2/BSD 限制 | 高/中 | TSV + awk；不 source 数据文件；三平台 CI；`bash -n` + ShellCheck |
| 框架负向断言补齐工作量大 | 高/中 | 按 family 分批；先主流 Java/JS/Python；未补的显式豁免 + 期限 |
| 宿主实证不可得 | 中/中 | 3 实证 + 5 rendered 分列；rendered 只做配置校验；不宣称写时拦截 |
| vendor 外置导致支付档不可用 | 中/中 | MANIFEST + SHA256 + 按需同步；缺失时诚实降级；离线包可选 |
| 文档外置后读者找不到全文 | 低/低 | 仓内保留导读 + 生成脚本 + release 附件链接；索引不删 |
| probe 依赖网络/API 限流 | 中/低 | 只按需运行；离线 `--check` 不联网；失败输出 skipped 不 fail |
| 预算冻结被“重构”绕过 | 中/高 | 结构预算（重复实现数/触碰面/LOC）与上下文/执行预算同时执法；例外逐例登记 |
| 并行会话撞车 | 中/中 | 文件归属切分；重文件独占 worktree；worktree ≤3；主会话统一收口 |
| 宣称矩阵暴露大量 M0/M1，影响对外表述 | 高/低 | 这是设计目的：先诚实，再补证；发布说明按 M 分布表述，不用“支持”一概而论 |

---

## 六、待拍板（7 项）

| # | 决策 | 选项 | 建议与代价 |
|---|------|------|------------|
| 1 | 重构范围与顺序 | A. 期一–期三 12 WP（先治理底座，再内核，再验证）；B. 只做旧稿 10 WP 的结构层；C. 连同 WP13–WP15 一次批准 | **A**：收益与风险平衡；B 留下证据债，C 战线过长 |
| 2 | vendor-knowledge 24 MB | A. 移出 git（release 附件 + 按需同步）；B. git-lfs；C. 保留 | **A**：工作树减重、离线包可控；历史体积不会自动回收，需接受 |
| 3 | 全文汇编 1.74 MB | A. 生成 + release 附件，仓内留导读；B. 生成 + 继续跟踪；C. 保持现状 | **A**：止住文档膨胀；B 可接受但 clone 继续变大 |
| 4 | 门禁域划分 | A. 五域（security/architecture/process/quality/compliance）；B. 六域（旧稿含 framework 独立）；C. 保持三档平铺 | **A**：与自然归属一致，framework 作为 architecture 的调度器；B 多一层但边界更显式 |
| 5 | 注册表边界 | A. 六表（含 hosts）；B. 五表（hosts 折进 dist） | **A**：宿主证据与文件清单是两类事实；B 会让 M 等级与文件清单混表 |
| 6 | 能力证据等级 | A. 采用 M0–M4 并公开宣称矩阵；B. 只内部使用；C. 不引入 | **A**：解决“已渲染未实证”混写；代价是发布说明要带 M 分布 |
| 7 | 目标技能清单 | A. 新增 `skill-manifest.json`（预算等额置换）；B. 只用 frontmatter 扩字段 | **A**：升级/刷新/审计有单一入口；若无法等额置换，暂缓到 WP13 |

---

## 七、附录

### 附录 A：测量锚点（2026-10-21，当前工作树）

```bash
# 引擎与生成器
wc -l swarm-yuan/assets/{precheck,gates-strict,gates-warn,gates-advisory}.sh   # 2058/2217/2042/847 → 7164
grep -h '^check_[a-z_]*()' swarm-yuan/assets/precheck.sh swarm-yuan/assets/gates-*.sh | wc -l  # 56
wc -l swarm-yuan/scripts/generate-skill.sh swarm-yuan/scripts/self-check.sh    # 3252/2408

# 资产
ls swarm-yuan/references/*.md | wc -l                                          # 51
ls swarm-yuan/references/frameworks/*.md | grep -vc _template                  # 81
ls swarm-yuan/assets/framework-gates/*.sh | wc -l                              # 81
cat swarm-yuan/assets/framework-gates/*.sh | wc -l                             # 18344
ls swarm-yuan/tests/test-*.sh | wc -l                                          # 87
find swarm-yuan/tests/gate-fixtures -mindepth 1 -maxdepth 1 -type d | wc -l    # 48
find swarm-yuan/tests/fixtures -mindepth 1 -maxdepth 1 -type d | wc -l         # 81

# 文档与资产体积
wc -c docs/design-compendium-full.md docs/design-evolution.md docs/upstream-baseline.md \
      docs/usage-manual.md swarm-yuan/README.md                               # 1738722/273833/195571/48404/34278
grep -rho 'generate-skill\.sh:[0-9]\+' docs/ | wc -l                           # 40
git ls-files -z | xargs -0 du -ch | tail -1                                    # 46M
git ls-files -z swarm-yuan/vendor-knowledge | xargs -0 du -ch | tail -1        # 24M
du -sh .git                                                                    # 246M
du -sh swarm-yuan/dist                                                         # 125M（未跟踪）

# 运行时/宿主
grep -c 'baseline_status=' docs/upstream-baseline.md                           # 22
grep -n 'FACT_RUNTIMES=\|FACT_RUNTIMES_DEEP=\|FACT_RUNTIMES_CLI=\|FACT_RUNTIMES_METHOD=' swarm-yuan/assets/facts.conf
grep -n 'FACT_SPEC_WRITE_HOOK_HOSTS=\|FACT_HOST_HOOKS_RENDERED=' swarm-yuan/assets/facts.conf
```

### 附录 B：注册表列定义与示例行

```text
# gates.tsv（示例）
id	flag	fn	domain	tier	enforce	conf_vars	fixture	claim	notes
security	--security	check_security	security	core	strict	SECURITY_TOOL,SENSITIVE_TOOL	security	M2	core sequence
requirements	--requirements	check_requirements	compliance	compliance	warn	REQUIREMENTS_FILE	requirements	M2	R126 G8: static count was 4

# frameworks.tsv（示例）
id	family	rule_doc	gate_script	fixture_dir	signals_key	globs_key	detect_bins	claim	status
spring-boot	java	references/frameworks/spring-boot.md	assets/framework-gates/spring-boot.sh	spring-boot	FRAMEWORK_SIGNALS_SPRING_BOOT	SPRINGBOOT_SRC_GLOBS	mvn	M2	active

# runtimes.tsv（示例）
id	repo	license	channel	pkg_name	tag_regex	baseline	wiring	claim	status
ocr	alibaba/open-code-review	Apache-2.0	npm	@alibaba-group/open-code-review	^v[0-9]+\.[0-9]+\.[0-9]+$	v1.13.2	deep	M2	synced

# dist.tsv（示例）
path	audience	tier	mode	offline	src_pkg	requires	bytes
references/exploration-guide.md	target	lite	copy	yes	yes	exploration-guide	0

# hosts.tsv（示例）
id	detect	install_path	hooks_schema	adapter	support	evidence_state	claim	notes
claude-code	command:claude	~/.claude/hooks.json	hooks.json	claude	deep	proven	M3	live proven
```

### 附录 C：能力宣称矩阵模板

```markdown
| 能力 id | 类别 | 等级 | 触发 | 消费点 | 降级 | 证据（run_id/夹具/项目） | 限制 | 最后验证 | 退役条件 |
|---------|------|------|------|--------|------|--------------------------|------|----------|----------|
| security | gate | M2 | core | check_security | 静态扫描 | gate-fixtures/security | 仅模式层 | 2026-10-21 | 连续两季零命中 |
| spring-boot | framework | M2 | 探测 | fw_spring_boot_check | 未激活跳过 | fixtures/spring-boot | 3.4/4.0 | 2026-10-21 | 上游归档 |
| claude-code | host | M3 | 命令 | hooks deny | rendered 配置 | 活体实测 | v2.1.304 | 2026-10-21 | 上游 hooks 变更 |
```

### 附录 D：WP 验收命令清单

```bash
# 全局基线
bash swarm-yuan/tests/run-sweep.sh
bash verifier/v1/run-verifier.sh all
bash swarm-yuan/scripts/self-check.sh --check-only

# WP1
bash swarm-yuan/scripts/registry-render.sh --export --check

# WP2
bash swarm-yuan/tests/run-e2e.sh
bash swarm-yuan/install.sh --list
bash swarm-yuan/tests/test-offline-e2e.sh

# WP3
bash swarm-yuan/scripts/upstream-probe.sh --offline --check
grep -c 'baseline_status=' docs/upstream-baseline.md

# WP4
bash swarm-yuan/scripts/build-docs-views.sh --check
bash swarm-yuan/scripts/build-compendium.sh --check

# WP5–WP7
bash swarm-yuan/tests/run-gate-fixture.sh all
bash swarm-yuan/tests/run-framework-fixture.sh all
bash swarm-yuan/tests/run-e2e.sh

# WP8–WP12
bash swarm-yuan/scripts/coverage-matrix.sh --check
bash swarm-yuan/scripts/mutation-check.sh --sample 5
bash swarm-yuan/tests/run.sh --level all --jobs 4 --format tap
bash swarm-yuan/tests/test-onboarding-30min.sh
```

### 附录 E：与旧稿的差异

| 项 | 旧稿 | 本稿 |
|----|------|------|
| 范围 | 结构层 P1–P8，三阶段 10 WP | 结构 + 功能 + 证据 + 文档，三阶段 12 WP + 3 候选 |
| 注册表 | 五表（gates/frameworks/references/runtimes/dist） | 六表（+hosts）；明确权威源/派生视图 |
| 能力模型 | 无 | M0–M4 + 能力契约 + 退役 |
| 预算 | 上下文字节 + 结构 | 上下文 + 执行时间/扫描数 + 结构 |
| 门禁 | 按域分目录（六域） | 五域 + tier/domain 正交 + 声明式 enforce |
| 生成器 | 拆分 + 统一 init | 拆分 + 统一 init + 目标技能 manifest + 行业接线 |
| 文档 | compendium 生成器 + 行号锚 | 三档分离 + 派生面 `--check` + 全文汇编外置（待拍板） |
| 证据 | 覆盖矩阵 + golden | 覆盖矩阵 + 变异检查 + 宣称矩阵 + M 等级 |
| 数字 | 汇编 629,464 B；引用 20 处；测试 86 | 汇编 1,738,722 B；引用 40 处；测试 87 |
| vendor | 外置并暗示 clone 减重 | 外置止增；明确历史体积不自动回收 |

### 附录 F：溯源

| 本稿内容 | 来源 |
|----------|------|
| 能力清单与计数 | `docs/research/2026-10-20-absorption-ledger-and-capability-inventory.md` §2–§3 |
| 历史阶段与决策主线 | `docs/design-compendium.md` §五；`docs/design-evolution.md` 决策 9–49 |
| 结构诊断 P1–P8 | `docs/redesign-proposal-2026-10-21.md` §2.2 |
| P9–P12 与证据缺口 | `docs/research/R126-audit-findings.md` #1–#34；本次实测 |
| 行为保持拆分 | `docs/design-evolution.md` 决策 49 |
| 预算棘轮/分发面分离 | 决策 47 |
| 状态完整性/消费闭环 | 决策 48 |
| 吸收判据两问 | 决策 46 |
| 双态夹具/verifier | `verifier/v1/`；`swarm-yuan/tests/` |
| 宿主实证状态 | `facts.conf` `FACT_SPEC_WRITE_HOOK_HOSTS=3` / `FACT_HOST_HOOKS_RENDERED=5` |

### 附录 G：术语

| 术语 | 含义 |
|------|------|
| 注册表 | 机器可读的权威表（TSV），一行一个能力或文件 |
| 派生视图 | 由注册表生成的文档/配置，不得手改 |
| 能力契约 | id/触发/消费点/降级/等级/预算/退役条件七件事 |
| M0–M4 | 登记/接线/双态验证/环境实证/持续回归 |
| 宣称矩阵 | 对外表述与证据等级的对照表 |
| 绞杀者迁移 | 新旧两路并存 → 双读比对 → 切换 → 删旧路 |
| 基线 diff | 拆前产物归一化后的逐字节比较（决策 49） |
| 上下文预算 | 目标技能每次会话加载的字节上限 |
| 执行预算 | 门禁运行的耗时/扫描次数/注入行数上限 |
| 结构预算 | 重复实现数/单次改动触碰面/LOC 趋势 |

### 附录 H：R126 余量与工作包映射

| R126 项 | 主题 | 本稿处置 |
|---------|------|----------|
| #1 | G8 fail 计数盲区 / enforce 分级 | WP6：校验器修盲区；5 个错分级登记待批，不在本包改级 |
| #2 | conf 四消费方合成视图 | WP5：`conf_effective` 统一读法 |
| #3 | 门禁文件清单缓存 | WP5：扫描上下文 |
| #4 | install 宿主检测/回滚 | WP2：检测数据化；WP11：生命周期硬化 |
| #5 | trace 链对抗性 | 3.4.5 诚实边界；WP15 可选 HMAC |
| #6 | generate-skill 单体/子命令 init | WP7 |
| #7 | 4 个孤儿门禁 | WP6：归属裁决；WP8：证据 |
| #8 | 14 组无 violating | WP8（13 门禁 + summary 特例） |
| #9 | 78 框架无负向断言 | WP8：补 `expected-pass-ids` |
| #10 | golden 只锁三数字 | WP10 |
| #11 | cli-ab 恒真票 | WP10 |
| #12 | 离线包零实跑 e2e | WP10 |
| #13 | sweep 与 CI 不同构 | WP9 |
| #14 | verifier/runs 停摆 | WP10 |
| #15–#22 | 生成器低危项 | WP7：触碰即修 + 回归；不单独开轮 |
| #23–#30 | 门禁低危项 | WP6/WP8：同族清剿；不单独开轮 |
| #31–#32 | 分发/SHA/版本/死键 | WP2/WP11；死键由 WP1 G26 治 |
| #33 | 测试日志隔离 | WP9 |
| #34 | Kimi 检测口径 | WP2/WP11 |

---

## 八、实施进度（2026-10-21 当日落地记录）

> 本节随实施更新；正文分析数字为动笔时快照，以本节与 `facts.conf` 为准。

| WP | 状态 | 已落地 | 未完成 / 交接 |
|----|------|--------|----------------|
| WP1 注册表 | ✅ | 六表（56/81/51/22/8/92）+ `registry-render.sh --check/--facts/--dist/--gates/--dead-facts` + G26 入 self-check + `facts.generated.conf` 挂载 + `docs/facts-waivers.md` 外移豁免 | capability-map 渲染器（归 WP4） |
| WP2 分发/宿主 | ✅（主体） | `dist.tsv` 权威 + `UNIVERSAL_FILES` 生成块（G26 校验）+ `hosts.tsv` 驱动检测（common.sh 数据化）+ `--industry` 主链路（create/upgrade + e2e）+ vendor SHA256SUMS + 离线包 `--with-vendor` | vendor 实际 untrack（待 release 通道）；离线/源码包改过滤视图（归 WP11） |
| WP3 供应链 | ✅（主体） | `upstream-probe.sh --offline --check / --json`（npm/pypi/git 三通道）+ 离线契约测试 | baseline 瘦身与 changelog 迁移（表头 46 条注记仍在） |
| WP4 文档生成 | ◐ | `build-compendium.sh --check` 汇编新鲜度检查（实测抓到 usage-manual 陈旧）；规范面计数已同步。汇编双版本裁决（2026-10-21 接管轮）：1.7MB 含卷九版回落 629KB 无卷九版（卷九与 docs/research 冗余、触发活文档行号零残留锁；1.7MB 留历史提交可找回），卷一/四/五手工同步真值 | 全量汇编重建；capability-map 渲染化 |
| WP5 公共库 | ✅（主体） | `assets/lib/{conf,files,log,json,hash,run}.sh` 六件全部有真实消费者；`detect-frameworks` 8 次全树扫描收敛为 1 次（fixture 探测结果与旧版逐字节一致） | 引擎四脚本 40 处 find/57 处排除链的全面收编 |
| WP6 门禁域重组 | ✅ | `assets/gates/{五域}/56 源文件 + _lib.sh`；三个 `gates-*.sh` 改为 `--gates` 生成视图（G26 校验逐字节一致）；目标技能装载协议与文件数不变；enforce 分层同步（check_test warn→strict，21/20/15）+ G26 新增「声明 enforce = 有效分层」对账（含变异必红测试） | `gen-enforce-level.sh` 从生成器降级为纯校验器 |
| WP7 生成器 | ✅（切片） | `skill-manifest.json` 生成（create/upgrade，含 profile/industry/框架/证据计数）+ 行业主链路 + manifest e2e | 3252 行拆分为 `scripts/gen/` 模块 |
| WP8 证据补齐 | ✅ | 框架 81/81 `expected-pass-ids` 负向断言；20 个门禁夹具补齐（55 组夹具 0 失败）；3 个框架门禁真实误报修复（harmonyos 注释误报/sentinel 嵌套 auth/TDengine KEEP 语法）；learnings 解析缺陷修复（RECENT 尾部吞串→set -u 崩溃）；门禁 M2 53 / M1 3（豁免登记 `docs/coverage-waivers.md`） | `coverage-matrix.sh` / `portfolio-review.sh` 生成器 |
| WP9 统一 runner | ✅ | `tests/run.sh`（level/jobs/format/list/隔离/单实例锁）+ `index.tsv` 107 条 + 契约测试 + `run-sweep.sh` 与 CI self-check job 切换到 runner（同构达成）。**并行安全调度（2026-10-21 接管轮）**：旧调度读了 parallel_safe 元数据但未消费——改双队列（safe 按 jobs 批并发 / no 逐个独占）+ 契约测试沙箱互侦测锁 + sweep 默认 jobs=4；实测整场 3322s→1444s（55→24 分钟）两轮全绿，锁测试 108 个 | macOS/Windows 矩阵 job 的 runner 化 |
| WP10 golden/离线 e2e | ⬜ | — | golden 扩发现 ID；离线全链路 e2e |
| WP11 安装硬化 | ⬜ | 宿主检测已数据化（WP2） | 重装回滚/子 shell 传播/WSL 盘符/SHA256 入口覆盖 |
| WP12 文档收敛 | 部分 | 本节实施记录；README/usage/CLAUDE 计数同步（197 变量、21/20/15 enforce） | 宣称矩阵生成、30 分钟路径 e2e、重叠段收敛 |
| WP13–15 候选 | ⬜ | — | 能力选择编译 / 框架包组合 / HMAC |

**当日验证终值**：统一 runner 全量 **107 通过 / 0 失败**（jobs=2）；`self-check --check-only` 全绿；`test-doc-numbers` 190 断言 0 失败；门禁夹具 55 组 0 失败；框架夹具 81 组 0 失败；`registry-render --check` 全绿（gates/dist 生成块逐字节一致 + enforce 声明对账）。中途修复 5 个回归（2 个钉死物理文件位置的断言按域源化改造、并行会话契约测试 test-registry 以真实 schema 满足、r104 排除清单断言、注册表 README 术语合规）。

**并行会话整合**：当日另一会话在引擎内落地"测试质量/覆盖率"能力（gates-warn +418 行、conf +12 变量、check_test 升 strict）。本轮未回退其改动，而是：注册表/facts/文档全部吸收（185→197、20/21/15→21/20/15）、修复其引入的 1 处 G22 可移植性违规与 learnings 解析缺陷。

**接管收口补记（2026-10-21 深夜）**：全量接管后三合一合流入 main——origin/main（R131 三提交）合入；汇编双版本裁决（见 WP4 行）；WP8 遗留分支收敛增量合入（bats 库级单测示范 + r118 断言联动 + probe 死变量清理；其"run.sh 退役"裁决以净零改动编码，合并自动保留 main 统一 runner）。终值：sweep 6 段全绿（锁测试 108）/0 两轮、registry/self-check/doc-numbers/compendium 全绿、origin 同步 f5d7231、零 worktree/stash/在途分支。决策 50（注册表平面与生成视图）、51（统一测试入口与并行安全调度）已入 `docs/design-evolution.md` 决策史。

