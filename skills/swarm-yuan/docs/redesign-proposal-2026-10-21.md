# swarm-yuan 结构重构设计方案（2026-10-21）

> **已被取代（2026-10-21）**：本稿的结构诊断（P1–P8）仍有效，但测量值已漂移、范围未覆盖功能债与证据债。最新完整设计与重构方案见 `docs/design-redesign-2026-10-21.md`；冲突以新稿为准。本稿保留作为结构层草案与差异对照。
>
> **定位**：本稿是供拍板的重构设计方案，含完整目标架构（§三）与分期重构优化方案（§四）。它不是实施记录：写完待批，批准后按工作包逐轮实施。
> **受众与读法**：维护者本人与后续实施轮次的 AI 会话。只想拍板看 §一（结论）与 §七（选项）；实施者从 §三.3（列定义）与 §四（工作包）起步。
> **证据基线**：main `bd5ced2`（R129 合入后，sweep 93/0 全绿，commit `b24297f`）；文档结构测量取自 `99c5a2a` 快照；代码结构测量取自 R128 分支快照（`8d8de58`，已随 `acac530` 合入 main），引擎行数在 R129 后复测不变。本稿全部数字带测量命令，见文末附录。
> **硬约束（不可违反）**：bash 3.2 与 BSD 工具兼容；门禁预算 56 冻结；conf 变量预算 200；吸收优先于新增门禁；终态文档不带历史包袱；目标技能侧预算（SKILL.md ≤11264B、随发 ≤614400B）不变。

## 一、结论

swarm-yuan 的功能面已经在冻结预算下饱和：56 门禁、185 变量、81 框架、15 运行时、92 随发文件，连续多轮全量回归全绿。当前主要矛盾不是加能力，是结构偿还：**事实以手抄副本传播、登记表退化成变更日志、分发清单写死在代码里、测试基建按轮次命名各自为政**。这四件事不还，每一次能力维护的成本都会继续上升。

三个决定性发现（均有实测锚点）：

1. **单一事实源正在名存实亡的边缘**。facts.conf 宣称是数字口径单源，但实测 main HEAD 引擎四脚本合计 7164 行，`FACT_SCRIPT_LOC` 仍写 7099——R128 改了门禁文件、没回写该值（self-check 此项 warn-only，sweep 照样全绿）。兜底的 test-doc-numbers 有 127 条断言，但只锁 19 份用户面文档的已知数字，属"已知漂移点的点名防守"，不是结构防御。本分支已把 7099 修正为 7164，这是治标。
2. **upstream-baseline.md 已经是变更日志，不是登记表**。195,571 B、250 行里，46 条头注占 54,555 B（27.9%），三个最长表行分别为 15,061 / 12,633 / 12,079 B——单个"当前基线"单元格携带了完整版本史。后果已实发：2026-10-20 R126 重核只写头注、三行未回写，隔一轮才由台账整理轮补齐（`17fecb3`）。
3. **分发清单三处定义，重资产常驻 git**。UNIVERSAL_FILES 数组（`generate-skill.sh:61`，92 条）内嵌在代码里；离线包清单在 `offline-manifest.conf`（12 行运行时）加 `make-offline-bundle.sh` 自有排除逻辑；源码包白名单又在 `release-src-packages.sh`。同时 `vendor-knowledge/` 24.3 MB（pay-team 304 件，CUP/PBOC/EMVCo 支付规范）占 swarm-yuan 跟踪体积 42.4 MB 的 57%，不随技能分发、仅支付 profile 与离线包消费，却让每次 clone 拉 244 MB 的 `.git`。

**方案一句话**：在不动预算、不换语言、不改目标技能语义的前提下，把"手抄副本"体系改造成"注册表 + 生成视图 + 机器校验"体系，分三期十个工作包，每包有机器验收判据与回滚路径。

需拍板 5 项，见 §七。

## 二、现状诊断

### 2.1 规模快照（全部实测，命令见附录）

| 维度 | 数值 |
|------|------|
| 引擎四脚本（precheck + gates-strict/warn/advisory） | 7,164 行；FACT_SCRIPT_LOC 曾滞留 7099 |
| 生成器 generate-skill.sh | 3,252 行 / 75 函数（R128 已拆 47 子函数，150 行函数锁） |
| self-check.sh | 2,385 行 |
| upstream-baseline.md | 195,571 B / 250 行；头注 46 条 54,555 B；最长表行 15,061 B |
| design-evolution.md | 270,462 B（决策 9–49） |
| design-compendium-full.md | 629,464 B（程序化快照，**仓内无生成脚本**） |
| docs/research/ | 98 份 / 约 1.25 MB |
| usage-manual.md / README.md | 47,862 B / 34,278 B |
| tests/ | 86 个 test-*.sh + tests/scripts/ 1 个（R128 后）；框架夹具 81 组；门禁夹具 48 组 |
| vendor-knowledge/ | 24.3 MB（pay-team 304 件） |
| .git | 244 MB |
| CI | 11 个 job；sweep = 通配 tests/test-*.sh 直跑，两者非同构 |

### 2.2 结构问题清单（现象 → 证据 → 根因）

| # | 问题 | 证据 | 根因 |
|---|------|------|------|
| P1 | 数字口径靠手抄副本同步，已知点靠点名断言防守 | FACT_SCRIPT_LOC 7099 vs 实测 7164；test-doc-numbers 127 断言锁 19 份文档 | 事实没有"权威源 + 生成视图"，只有"权威源 + 手抄 + 对账" |
| P2 | upstream-baseline 携带完整历史，刷新成本高且行级漂移已实发 | 头注 46 条 54.6 KB；表行最长 15 KB；2026-10-20 三行未回写 | 登记表与变更日志两种文体叠在一张表里 |
| P3 | 引擎门禁平铺三文件，按域不可寻址 | 56 个 check_* 分布在 2,217 / 2,042 / 847 行三个文件；`--list-gates` 只能按 flag 列 | 文件边界按 enforce 档划分，不按领域划分 |
| P4 | 惯用法重复，无公共库 | `node_modules` 排除链 57 处（gates-warn 20 / gates-strict 17 / generate-skill 16 / precheck 2 / advisory 2）；conf 文本 grep 式读取 5 处 | 无 lib 层；每处各写各的 |
| P5 | 测试按轮次命名、runner 异构 | test-rNNN-* 轮号命名 42 个，占 86 个的 49%；sweep 通配直跑 vs CI 11 job 手工并列；R126 审计 #11 cli-ab 恒真票、#10 golden 只锁三数字 | 测试组织以"哪轮加的"为单位，不以"什么行为"为单位 |
| P6 | 分发清单三处定义 | UNIVERSAL_FILES 数组（generate-skill.sh:61）/ offline-manifest.conf / make-offline-bundle.sh 排除逻辑 / release-src-packages.sh 白名单 | 清单即代码，无数据化 |
| P7 | 重资产常驻 git | vendor-knowledge 24.3 MB；.git 244 MB | 知识库与代码同仓，无外置通道 |
| P8 | 文档六处重叠 | 同一数字（如门禁 56）在 README 附录 A / usage-manual / CLAUDE.md / AGENTS.md / capability-map / compendium 均出现；compendium 无生成器，数字已实发陈旧（584KiB 事件，2026-10-20 修） | 视图层无生成机制，只能手抄 |

### 2.3 不变量与执法现状（继承决策 9–49）

| 不变量 | 来源 | 机器执法 | 强度 |
|--------|------|----------|------|
| 预算棘轮（门禁 56 / conf 200 / 字节四上限） | 决策 26/38/47 | self-check check_complexity_budget 等断言 | 强制 |
| 吸收优先于新增门禁 | 决策 27 | 无（流程纪律） | 仅文档 |
| 证据分级 A/B/C，C 不进基线 | 决策 39 | upstream-baseline 表头口径 + 轮档纪律 | 部分 |
| 吸收物双向对账（实存必入账） | 决策 42/R50 | self-check G25 | 强制 |
| 门禁可达性双向锁 | 决策 48（R128） | test 层（R128 新增） | 强制 |
| 行为保持式拆分证据标准 | 决策 49（R128） | 基线 diff 零差异 + 反向断言 | 强制 |
| 终态文档不带历史包袱 | 决策 41/45 系列 | test-r68 jargon 门禁 | 强制 |
| draft 不可交付、三关激活 | 决策 13 | generate-skill --mark-active | 强制 |
| 诚实化默认（未执行不得报完成等） | 决策 12/35 | 各门禁 + verifier | 部分 |

设计含义：数字与预算、拆分纪律两类不变量已有机器执法；**清单一致性（P6）与文档视图一致性（P8）仍无执法**，本方案补这两块。

### 2.4 与在途/已合工作的边界

R128（`acac530` 已合入 main）：五大函数拆分、install 卸载四态收口、self-check 缓存、rules.d 递归求值等 16 项。本方案不重做这些，其中"150 行函数锁、基线 diff 零差异纪律"直接复用为 §四工作包的验收手段。R129（`d7bef68` 已合入）已收敛 state-machine 的 `_sm_conf_val` 读取与 spf_conf_val 单引号剥壳。仍未动的 R129+ 候选只剩 docs 内 20 处 `generate-skill.sh:NNNN` 行号引用随拆分漂移，归入 WP3。

## 三、目标架构（完整设计）

### 3.0 总原则

继承 §2.3 全部不变量，新增三条：

- **R1 事实单源，视图生成**：任何有两处以上引用位置的事实，只允许一个权威源（TSV/KEY=VALUE），其余位置一律渲染产物，渲染器带 `--check` 校验。
- **R2 清单是数据不是代码**：分发、装载、安装的范围一律由清单文件驱动，代码只读清单。
- **R3 历史与状态分离**：登记表只存当前值与一条指针；过程史入 append-only 变更账（archive 类文件），两者不同文件。

### 3.1 分层总图

| 层 | 内容 | 关键件 | 依赖方向 |
|----|------|--------|----------|
| L1 事实注册层 | 五张权威表 | `assets/registry/{gates,frameworks,references,runtimes,dist}.tsv` + `scripts/registry-render.sh --check` | 最底，无依赖 |
| L2 公共库层 | 五件 helper | `assets/lib/{conf,files,log,json,hash}.sh` | ← L1 |
| L3 引擎层 | precheck 编排 + 门禁按域分组 | `assets/gates/{security,arch,process,quality,compliance,framework}/*.sh`，按 L1 gates.tsv 装载 | ← L1/L2 |
| L4 生成器层 | 子命令入口 + 生成库 | `scripts/generate-skill.sh` 收敛为入口，实体在 `scripts/gen/` | ← L1/L2 |
| L5 吸收流水线 | 查新探针 + 基线二分 | `scripts/upstream-probe.sh`（三通道 JSON 报告）；upstream-baseline.md=状态表，变更账外移 | ← L1 |
| L6 验证层 | 统一 runner + 覆盖矩阵 | `tests/run.sh --level N --jobs J --format tap`；`tests/coverage-matrix.sh` | ← 全部 |
| L7 分发层 | manifest 驱动 | L1 dist.tsv 派生 UNIVERSAL_FILES / 离线包 / 源码包；vendor 外置 | ← L1 |
| L8 文档层 | 读者面 3 + 机器面 + 档案面 | README（论证）/ usage-manual（操作）/ SKILL.md（入口）；数字由 L1 渲染；compendium 由脚本再生 | ← L1 |

依赖单向自上而下引用 L1/L2，禁止反向。

### 3.2 五张注册表列定义（bash 3.2 可读 TSV，`#` 注释行，制表符分隔）

| 表 | 列（≤10） | 说明 |
|----|-----------|------|
| gates.tsv | id、flag、fn、domain、tier(exec)、enforce、conf_vars、fixture、doc_anchor | 56 行；enforce 为声明值（替代 gen-enforce-level 的 fail 计数启发式，保留启发式作校验器）；fixture 指向 gate-fixtures 目录名，空=缺口 |
| frameworks.tsv | id、rule_doc、gate_script、fixture_dir、signals_key、globs_key、detect_bins | 81 行；与 frameworks/*.md、framework-gates/*.sh、fixtures/ 三向 1:1 对账 |
| references.tsv | id、family、source、evidence(A/B/C)、consumers、distributed(lite/all/gen-only) | 51 行；consumers 为文件名列表，G25 由本表派生；capability-map.md 改为本表渲染产物 |
| runtimes.tsv | id、repo、license、channel(npm/pypi/git)、pkg_name、tag_regex、baseline、lineage_check、wiring(deep/cli/method/source)、notes | 22 行；**通道陷阱编码进字段**：pkg_name 治撞名（如 ocr→@alibaba-group/open-code-review）、tag_regex 治异源旧 tag 诱取、lineage_check 治世系核验（graphify 第十一例） |
| dist.tsv | path、audience(gen/target)、tier(core/optional)、lite(bool)、offline(bool)、src_pkg(bool)、bytes | 从 UNIVERSAL_FILES 数组机械迁移 92 行；离线包排除表与源码包白名单改为本表过滤视图 |

facts.conf 保留，改为"registry 聚合生成物 + 手写预算段"：FACT_GATES_* 等计数由 `registry-render.sh` 从 TSV 重算写入，手抄注释段不动。self-check 与 test-doc-numbers 断言逐步改为对 TSV 生成的视图做 diff，127 条点名断言降为"渲染一致性"少数总断言。

### 3.3 迁移与兼容（每步可回滚）

1. 先建 TSV 并由脚本从现状**机械导出**（不手抄），diff 确认与现值一致后提交。
2. 消费方逐个切换（一次一个：facts 聚合 → capability-map 渲染 → UNIVERSAL_FILES 读取 → 离线包过滤），每个消费方切换前先加"双读比对"（新旧两路都算，不一致 fail），稳定一轮后删旧路。
3. 任何一步不合入未全绿的 sweep。回滚 = revert 对应消费方切换提交，registry 表本身无害。

## 四、重构优化方案（三期十个工作包）

### 期一：治理与可见性（低风险，预计 2–3 轮）

| WP | 内容 | 触碰面 | 机器验收 | 风险与回滚 |
|----|------|--------|----------|------------|
| WP1 registry 五表 + 渲染器 | §3.2 五张 TSV 从现状导出；registry-render.sh 生成 facts 计数段与 capability-map 总表，--check 模式入 self-check | 新增 registry/ + 1 脚本；改 self-check 2 断言 | `--check` 对 56/81/51/22/92 五组计数零差异；test-doc-numbers 全绿 | 纯新增，回滚删目录 |
| WP2 upstream-baseline 二分 | 表行只留当前值 + 最近一次变更 + 指针；46 条头注与行内"前值"史迁入 `docs/research/upstream-changelog.md`（append-only）；`scripts/upstream-probe.sh` 按 runtimes.tsv 三通道查新出 JSON | upstream-baseline.md（195K→目标 <60K）、新 probe 脚本、research 新档 | baseline_status= 22 锚不变；probe 对当前 22 行输出"零漂移"与 2026-10-21 实测一致（ruflo 3.58.1 等）；self-check 轻量忠告改读状态表 | 表行瘦身不可逆风险低（历史完整保留在变更账）；probe 只读网络 |
| WP3 compendium 生成器入仓 + 行号锚替换 | 把 design-compendium 生成脚本入库（scripts/build-compendium.sh）；docs 内 20 处 `generate-skill.sh:NNNN` 改函数名锚 | 1 新脚本 + 20 处文档行 | 生成结果与现 compendium diff 仅含预期变更；CI 加 regen-check（工作区脏即 fail） | 纯文档 |
| WP4 vendor-knowledge 外置 | pay-team 移出 git 跟踪（先存档 tar + SHA256 入 release 附件或对象存储），MANIFEST + 校验和留仓；`sync-vendor-knowledge.sh` 改按需拉取；离线包把 vendor 列为可选件 | vendor-knowledge/ 304 件、make-offline-bundle、industry-profile-payment 引用路径 | clone 后 `install.sh` 零 vendor 依赖可跑（支付档诚实降级提示已有）；离线包含 vendor 件 SHA256 校验通过 | **需拍板**（§七-3）；存档可回滚 |

### 期二：引擎内聚（中风险，预计 3–4 轮，全部行为保持式）

| WP | 内容 | 触碰面 | 机器验收 | 风险与回滚 |
|----|------|--------|----------|------------|
| WP5 lib 层五件 helper | conf（`_conf_effective` 合成视图，收编 5 处文本 grep；R129 已先收敛 state-machine 一处）、files（共享文件清单缓存 + find 排除链 57 处收敛为 1 helper）、log、json、hash | 新 lib/；四脚本替换调用点 | 决策 49 基线 diff 零差异；R126 登记的"--all 在 3.5 万文件仓 3.66s"不劣化（加缓存应改善，记录前后值）；FACT_SCRIPT_LOC 只许降不许升（预算） | 每文件单独一切换提交，revert 单文件 |
| WP6 门禁按域分目录 | 56 个 check 从三档平铺文件迁 `gates/{六域}/`，precheck 按 gates.tsv 装载；gates-strict/warn/advisory 保留为兼容入口（source 域文件） | 56 门禁物理位置 + 装载器；enforce 声明进 gates.tsv | 全部 48 组 gate-fixture + 81 框架夹具逐字节同输出；`--list-gates` 输出不变 | 物理迁移不改逻辑，冲突面=装载顺序（registry 顺序显式化后消解） |
| WP7 enforce 声明化 | gen-enforce-level 的 fail 计数启发式降级为校验器（发现声明与实现不符即 fail），级别改 gates.tsv 声明 | gate-enforce-level.conf 转生成物 | R126 G8 盲区（`&& fail` 漏计）实测用例转正：5 个曾误分级门禁按声明归位，六键 FACT_ENFORCE_* 由渲染重算 | 与 WP6 同轮或随后一轮 |

### 期三：验证与体验（预计 2–3 轮）

| WP | 内容 | 触碰面 | 机器验收 | 风险与回滚 |
|----|------|--------|----------|------------|
| WP8 统一 runner | `tests/run.sh --level 0-4 --jobs J --isolated --format tap`；每个测试加元数据头（层级/依赖/并行安全/耗时预算）；sweep 与 CI 都改调 run.sh（CI 11 job 收敛为按 level 矩阵） | 87 个测试头部 + run-sweep.sh + ci.yml | 同机同参输出 TAP 与现 sweep 结论一致；--jobs 并行总时长缩短（记录前后值）；单实例锁保留 | runner 与旧 sweep 双跑一轮后切换 |
| WP9 覆盖矩阵清零 | `tests/coverage-matrix.sh` 由 gates.tsv/frameworks.tsv 生成缺口清单；补齐：14→0 组门禁 violating 样本缺口（R128 后重测数为准）、框架 compliant 负向断言、golden 向量从三数字扩为"rc+发现清单"摘要 | 缺口对应的 fixtures + golden | 矩阵零缺口成为 CI 门（新增门禁/框架无夹具直接 fail） | 只增不删 |
| WP10 文档收敛与上手路径 | README 与 usage-manual 重叠段收敛（数字全部改渲染占位）；"30 分钟新用户路径"实测脚本化（临时目录 → install → 生成样例技能 → 激活 → 一次门禁拦截），作为 e2e 一员 | 两文档 + 1 e2e | 路径 e2e 全绿且真实耗时 ≤30 分钟（CI 计时断言）；gongwen-lint 两文档硬违规 ≤ 基线减半 | 文档可回滚 |

### 顺序与依赖

WP1 →（WP2、WP3、WP4 可并行）→ WP5 → WP6+WP7 → WP8 →（WP9、WP10 可并行）。期一全部为纯治理；期二依赖 WP1 的 gates.tsv；期三依赖 WP8 先行。并行会话协调：每个 WP 独立 worktree，沿决策 49 的归属切分纪律，一轮一收口。

### 预期收益（可测量）

- "新增一个门禁"触碰文件从约 8 处（四脚本 + facts + 两文档 + 夹具 + 断言）降到 3 处（gates.tsv 一行 + 域文件一个函数 + 夹具）。
- 运行时刷新轮的手写面从"头注 + 表行 + 离线清单 + facts"降为"runtimes.tsv 一行 + 变更账一条"，probe 脚本出漂移报告。
- upstream-baseline 195K→<60K；compendium 可再生，杜绝 584KiB 类陈旧。
- clone 体积：.git 244MB 随 vendor 外置显著下降（量化待 WP4 实测）。

## 五、Non-goals

不换语言（保持 bash 3.2）；不增减门禁与 conf 预算；不改目标技能九节点、spec-first 四层、三档 profile 语义；不引入外部测试框架（自建轻量 runner）；不做 v2 数据迁移式"大爆炸"重写——一切走决策 49 行为保持式。

## 六、风险与对策

| 风险 | 对策 |
|------|------|
| 并行会话撞期 | 每 WP 独立 worktree + 轮号让位惯例；本方案实施期间 R129+ 号位按工作包优先 |
| registry 又成新的手抄面 | 渲染器 --check 入 self-check 强制断言；TSV 只允许脚本导出或明确格式提交 |
| 行为保持拆分引入隐性差异 | 沿决策 49：基线 diff 零差异 + 反向断言；WP6 附 48+81 夹具逐字节同输出验收 |
| bash 3.2 限制（无关联数组） | TSV + awk/grep 读取；registry-render 输出仍为 KEY=VALUE，消费方零改造 |
| probe 依赖网络与 GitHub API 限流 | 只在刷新轮手跑；离线时 registry --check 不联网 |

## 七、待拍板选项（编号 + 一句代价）

1. **分期顺序**：A 先期一治理（建议，先立 registry 再动引擎，每步可验）/ B 先期二引擎（收益先到代码侧，但 registry 缺位时 WP5/6 验收只能临时拼）。
2. **upstream-baseline 历史注记**：A 迁 `docs/research/upstream-changelog.md`（建议，状态表瘦身）/ B 原地保留（零迁移，但 P2 成本延续）。
3. **vendor-knowledge 24.3MB**：A 移出 git，release 附件 + 按需同步（建议，clone 减重；离线包仍可含）/ B git-lfs（git 端轻，但引入 lfs 依赖）/ C 保留现状（零动作）。
4. **测试 runner**：A 自建 run.sh（建议，约 200–300 行，零依赖）/ B 引入 bats-core（生态成熟，但新增运行时依赖与 CI 改造面）。
5. **门禁按域分目录（WP6）**：做（结构收益最大，回归面=56 门禁装载）/ 缓（等 WP8 统一 runner 后再做，更稳但收益推迟一期）。

## 附：本稿测量锚点（A 级，于快照与 worktree 实测）

```text
wc -l swarm-yuan/assets/{precheck,gates-strict,gates-warn,gates-advisory}.sh   # 7164
wc -l swarm-yuan/scripts/generate-skill.sh                                    # 3252
grep -c '^[a-z_][a-z0-9_]*()' scripts/generate-skill.sh                        # 75 函数
wc -c docs/upstream-baseline.md                                               # 195571
grep -c '^> \*\*' docs/upstream-baseline.md                                   # 46 条头注
grep '^> \*\*' docs/upstream-baseline.md | wc -c                              # 54555 B
awk '{print length($0)}' docs/upstream-baseline.md | sort -rn | head -3       # 15061/12633/12079
du -sk swarm-yuan/vendor-knowledge/*                                          # pay-team 24268K/304 件
grep -c node_modules {precheck,gates-*}.sh generate-skill.sh                   # 合计 57 处
grep -rho 'generate-skill\.sh:[0-9]\+' docs/                                   # 20 处行号引用
ls swarm-yuan/tests/test-*.sh | wc -l                                          # 86（R128 后；另 tests/scripts/ 1 个）
ls swarm-yuan/tests/ | grep -c '^test-r[0-9]'                                  # 42 个轮号命名
git cat-file -s <tag>:docs/upstream-baseline.md                                # 各版本字节
```

另：本分支随稿修正 `FACT_SCRIPT_LOC` 7099→7164（R128 改动后未回写的实测欠账，self-check 此项 warn-only 故未拦）。
