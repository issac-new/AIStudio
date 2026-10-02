# QGate 上游 quality-gate v1.24.0 调研报告

日期：2026-10-01
状态：调研闭环（五路并行源码级调研 + 本机 CLI 冒烟实测）
调研对象：`lazyzhsh/quality-gate` @ v1.24.0（MIT），本机只读副本 `/Volumes/nvme2230/lab/research/quality-gate`，下文锚点以 `<upstream>/` 指代该根目录，`plugins/quality-gate` 简写为 `plugin/`
受众：QGate 移植实施者与评审者
姊妹篇：《QGate v0.3 移植设计》（`2026-10-01-qgate-v0.3-port-design.md`）

## 三句话主旨

上游 v1.24.0 就是本项目 v0.1 设计文档的直系演进：其 `docs/context/original-design-v0.1.md` 与本地 `ncwk/docs/universal-delivery-gate-zcode-design-v0.1.md` 逐字节相同（diff 实测）。八天二十四版之后，v0.1 的 Claim/Evidence/Gate/Risk/Exception 五元模型没有死，而是被收紧为 fail-closed 判定纪律并配上 37 种门、配置生命周期与防伪核验基建。本地实现与上游的差距不在理念，在工程深度：13 门对 37 门、52 测试对 615 项回归、单点 Stop 对四事件软形态钩子面。

## 1. 血缘与版本线

2026-09-23 同一份 v0.1 设计在两个方向落地：ncwk 侧按本地修正案（v0.2，D1-D5 裁定）实现为 `overlay/custom/qgate/`（TypeScript）；原作者侧连续迭代至 v1.24.0，于 2026-10-01 在 GitHub 首次开源。

演进主线（据 `docs/history/` 与 `docs/release/` 归档逐版归纳）：

| 版本 | 关键决策 |
|---|---|
| v0.1 | 五元证明链 + 六域模型 + ZCode 插件首发形态定案（ADR-0001~0004） |
| v0.2 | persistence 独立回读协议（ADR-0013），真实 HTTP→SQLite 三模式矩阵 |
| v0.3 | FIBO 固定版本钉扎本体 provider（ADR-0005 雏形） |
| v0.4–v0.9 | 逐域小步补齐 L0 RTM→L2 本体约束→L3 行为→L4 指标→L5 交付 |
| v0.9 设计基线 | 新增"Agent 对齐失效防护"维度：意图漂移、上下文遗忘、技术幻觉、范围蔓延 |
| v1.0 | 六域可运行原型，9 种门，Exception 仅登记阻断 |
| v1.3/v1.4 | FIBO vendored 双模块；内建 OWL 子集推理（ADR-0006）；双轨并行迭代（ADR-0012） |
| v1.5 | 防伪判定收归内核（ADR-0007）+ F2P/P2P（ADR-0008）+ 证据纪律（ADR-0009）+ 示例清单单一事实源（ADR-0011） |
| v1.7.x | 引导初始化（ADR-0014）→ 配置生命周期分权 + registries 集中（ADR-0015）→ 分级报告 |
| v1.8.0 | 功能裁剪 35→32 kinds（砍掉 migration/operational-readiness/四类扫描） |
| v1.9.x | 信任边界收敛 W1–W5（空登记阻断/自引用保护/观察可信度/登记完备性） |
| v1.14.0 | Stop 摩擦优化：归档复用、SessionStart 基准行、new-only 降级 |
| v1.16.0 | 统一语言治理（ADR-0016），协议键 domain→level，schemaVersion 0.2 |
| v1.17–v1.21 | v0.9 四轨道收官：task-intent 登记+软钩子（1.17）、AC 结构化 Gherkin/EARS（1.18）、convention-alignment（1.19）、symbol-grounding（1.20）、trace-continuity+replayBaseline（1.21） |
| v1.22–v1.23 | SHACL 引擎原生化、多语言术语、OWL 更大子集（等价/并类/属性注册表） |
| v1.24.0 | 首次开源：11 组审查问题修复，615 项回归 0 SKIP |

## 2. 架构总览

运行时形态：纯 ESM `.mjs`，零 npm 依赖，Node ≥ 20，不联网，唯一直调外部程序是 git（`plugin/package.json:6-8`；ADR-0010）。YAML 不真解析（ADR frontmatter 只支持平面 key: value 子集，`plugin/lib/decisions.mjs:6-26`），TAP/JUnit XML 用手写正则解析器（`plugin/lib/raw-evidence.mjs:1-213`）。

三层结构与 v0.1 一致：内核（`plugin/lib/kernel.mjs` + 37 个门模块）/ CLI（`plugin/bin/qgate.mjs`，247 行手写分发）/ ZCode 插件面（hooks + commands + skill）。判定权全部收在内核（ADR-0007）：runner 进程只做观察（stdin 收 `{schemaVersion,runId}`，stdout 回 JSON），永不自判通过；凡可纯算术复核的结论（审计链哈希、F2P/P2P 基线、预算守恒、零和账本）内核独立重算，自报与重算不符即 ERROR。

与 v0.1 最大的形态差异：门不再是"executor 组合的声明式工作流"，而是 **37 种白名单 kind**（`plugin/lib/kernel.mjs:48` `GATE_KINDS`），每种 kind 一个内核模块，配置只声明参数。这牺牲了 v0.1 的自由组合，换来每种门的判定逻辑可审计、可内核算术复核。

## 3. 判定模型：四态 fail-closed

证据状态机为 PASS/FAIL/ERROR/SKIP（外加内部 PENDING 占位），无 CONDITIONAL、无 INCONCLUSIVE（`plugin/lib/kernel.mjs:211`）。ADR-0002 定案：一切证据不可得、工具缺失、格式错误、超时、观察与重算不符，一律 ERROR，退出码 2；SKIP 仅两种情形（门未启用/阶段未选中；invariant 全部断言条件不满足）。WAIVED 只是已审批例外的呈现态，不改变任何门的判定（`kernel.mjs:182-190,315`）。

这与本地六态（PASS/FAIL/CONDITIONAL/INCONCLUSIVE/WAIVED/NOT_APPLICABLE）是哲学分歧，不是功能差距：上游认为"不确定"不该是一种判定结果，只能是阻断。本地为承接 ncwk 交付标准 G4 的 conditional 语义保留第六态，两模型在映射层换算（见 v0.3 设计）。

run 报告模型（`kernel.mjs:167-320`）：`{schemaVersion, id, root, stage, startedAt, configSha256, evidence[], claims, risks, exceptions, status, levelCoverage, missingRequiredLevels, unmetRequiredLevels, riskEvidence, inputsStable, inputSnapshot, finishedAt}`，落盘 `.quality-gate/runs/<uuid>.json`，`{flag:'wx'}` 防覆盖。逐条 evidence：`{id, gateId, claimId, kind, level, startedAt, finishedAt, status, details}`。五元模型在报告层完整保留：claims 与 risks 是配置必填数组，每门必须挂 claimId，每条 risk 声明该门的残余风险（示例见 `plugin/examples/six-domain-demo/.quality-gate.json:172-209`）。

## 4. 配置与生命周期

单文件清单 `.quality-gate.json`（schemaVersion `"0.2"`）：`claims[]`、`gates[]`（1..32 门）、`risks[]`、`exceptions[]`（≤20）、`requiredLevels{stage:[L0..L5]}`、可选 `ontology`、`stop{blockMode,inputs}`、`intent{capture,hooks}`、`template{id,generatedAt}`（校验在 `kernel.mjs:57-102`）。门字段：`id/kind/level/enabled/stages(edit|close|pr|release)/claimId`，runner 类加 `argv[]+timeoutMs`（上限 60 秒，纯 pr/release 的 command 300 秒）。

CLI 子命令（`plugin/bin/qgate.mjs`）：

| 命令 | 语义 |
|---|---|
| `<root> [edit\|close\|pr\|release]` | 执行门禁运行（默认 close）；stdout JSON，stderr 人读摘要；退出码 PASS 0 / FAIL 1 / ERROR·SKIP 2 |
| `templates [lite\|pro\|max]` | 7 模板 × 3 档 + 6 个 add-on 库，附 FIBO 钉扎哈希提示 |
| `init <root> <answers> [--force] [--fresh]` | 确定性装配：占位符残留拒绝、validate 通过才写盘、写后登记引用预检 |
| `update <root> <changes>` | 增量演进：addOns/disable/substitutions/requiredLevels/migrateRegistries/ontology 六个白名单键 |
| `inspect <root>` | 只读：有效性、阶段预算用量、模板漂移、登记文件存在性、基于 git 变更面的 add-on 建议 |
| `report <root> [runId]` | 不重跑，重渲染归档 run；runId 前缀歧义 fail-closed |
| `intent <root> [answers] [--revise]` | 登记/修订任务意图基准，重绑 change-scope spec 哈希 |
| `proposals <root>` | 审计"accepted 但未 pin"的本体映射提案漂移 |
| `leftovers <root>` | 只读扫描重初始化残留 |

阶段预算：edit/close 60 秒、pr/release 300 秒（`kernel.mjs:44` `STAGE_BUDGET_MS`）。

登记文件集中于 `.quality-gate/registries/`（ADR-0015，v1.7.1 起）：assumptions.json、decisions.json、scope.json、requirements.json、conventions.json、debt.json、rerun.json、api.expected.json、catalog.json、budget.json、task-intent.json，各由对应门消费（对照表见 `<upstream>/docs/CONFIG-GUIDE.md:157-175`）。

## 5. 37 种门清单

按层级归组（kind → 一句话检查逻辑，锚点均为 `plugin/lib/` 下同名模块）：

**L0 需求与决策（5 种）**

| kind | 检查逻辑 |
|---|---|
| traceability | RTM 元门：逐验收条件核验 codeFiles 存在、链接门 PASS、requiredTypes 覆盖、prdRef 存在；v1.18 起 AC 可走 Gherkin/EARS 结构校验 |
| assumptions | 登记核验：全部假设 confirmed、结构化引用真实、空登记须显式 `none:true` |
| decisions | 决策 resolved（L0 可 allowDeferred 但须 revisitBy 未逾期）；ADR frontmatter 状态对账、supersedes 互指核验 |
| change-scope | git 变更集对账 allowedPaths/requiredPaths/protectedPaths；spec 自哈希防篡改、pinnedBase 锚定、contentCheck runner、taskIntent 交集对账 |
| convention-alignment | conventions.json 规则扫描（路径/行/词命中），severity=fail 命中即 FAIL |

**L1 工程验证（2 种）**

| kind | 检查逻辑 |
|---|---|
| engineering | 1..6 个子检查 runner（static/build/unit/mutation/structure/convention 六角色）；rawOutput（TAP/JUnit）内核重解析交叉核验；F2P/P2P 逐用例六类违规审计 |
| symbol-grounding | 纯内核词法分析：import 说明符三分类解析、命名成员对账导出面、apiSurface 端点/env 键对账、跨语言观察双向对账防瞒报 |

**L2 数据与契约（6 种）**

| kind | 检查逻辑 |
|---|---|
| persistence | runner 真实调 API + 独立会话回读；`$RUN_ID` 防重放；逐字段深度相等；requireSnapshots 默认强制 before/after 快照与 delta |
| alignment | runner 观察 vs 期望契约 JSON Pointer diff；scope=contract-diff 消费 oasdiff 类 breaking 结论 |
| consumer-matrix | 逐消费者期望 vs provider 当前契约，产出兼容矩阵与破坏归因；usage 分 scanned/contract-test/declared 三级 |
| consistency | 支付数据五类型：zero-sum（BigInt 借贷平衡）/append-only/reconciliation（账龄分桶）/dlq/audit-chain（内核重算哈希链） |
| invariant | runner 观察领域值，内核按 eq/neq/le/lt/ge/gt 断言（含 when 条件）判定 |
| semantic-profile | SHACL 十组约束组件内核原生判定（minCount/datatype/nodeKind/pattern/closed 等）；pyshacl 可选第二实现并集核对 |

**L3 行为与语义（12 种）**

| kind | 检查逻辑 |
|---|---|
| behavior | 用例 expected vs runner actual 结构化 diff；rawTranscript 交叉核验；replayBaseline 基线回放；F2P/P2P |
| journey | smoke/integration/e2e 场景逐步骤比对，未声明步骤出现即 FAIL；支持 transcript 回放 |
| property | 固定 seed 性质测试：断言 + allowedTransitions 状态转换白名单，反例入证据 |
| visual | actualFile 与 baselineFile sha256 严格字节比对，或 runner 自报像素 diff 按阈值判定 |
| semantic-alignment | 代码符号→IRI 映射核对：strict/subsumed 匹配、互斥冲突、runtime 来源强制、目录哈希过期阻断 |
| semantic-consistency | 目录构建期核验（互斥×包含矛盾、环、悬垂）；可选外部 reasoner 双实现一致性核对 |
| semantic-constraint | 目录概念上声明的约束在 runner 观察案例上执行 |
| semantic-state | 概念 lifecycle 状态机 vs 观察实例转换：未知状态/非法转换 FAIL |
| semantic-exposure | 概念 exposure:public/internal 策略 vs 观察公共面 |
| semantic-instance | 实例样本类型解析：互斥多类型/不可比较类型 FAIL |
| semantic-relation | 期望关系三元组 vs 观察注解，含子属性/逆属性/传递链 OWL 推理 |
| terminology | SKOS 完整性：prefLabel/altLabel 按（语言,值）唯一性 + 术语解析歧义 |

**L4 非功能与安全（7 种）**

| kind | 检查逻辑 |
|---|---|
| metrics | runner 回报数值指标，内核按 1..20 个 {min,max} 阈值判定 |
| scan | 示例扫描器（SAST 性质），L4 限定 |
| budget | 纯文件算术：上游预算 ≥ Σ(各跳 timeout×(retries+1))，重试预算 >20% 即 FAIL |
| resilience | 故障注入演练核验：恢复时长、终态、log/metric/trace/alert 信号齐全、熔断序列 |
| trace-continuity | 调用对两端 span 核验：traceId 连续性、parentSpanId 匹配、W3C traceparent |
| topology | 声明式拓扑 R1–R4：故障域分散、副本阈值按 stateModel 分型、最小割集、leader 租约 |
| rerun | 幂等重跑证据：同 seed ≥2 次输出 sha256 一致、idempotencyKeyStrategy 必填、可选复式恒等式 |

**L5 治理与收口（5 种）**

| kind | 检查逻辑 |
|---|---|
| configuration | 多环境配置扁平化逐键比对：missing-key/type-mismatch/未声明差异/秘密键明文（值一律脱敏） |
| documentation | code/api/user/operator 四角色制品路径真实、版本一致、requiredTopics 齐全 |
| debt | 技术债登记簿：open+high/critical 阻断、dueDate 过期阻断、resolved 须结构化证据引用 |
| convention-alignment | （见 L0，跨层规则引擎） |
| decisions | （限 L0/L5） |

四个容易误判的事实：ac-structure、task-intent、baseline、dependencies 不是独立门 kind，是协议库（分别服务 AC 结构校验、意图登记读写、基线来源核验、外部工具预检提示）。trace-continuity 属 L4 而非 L3。scan 属 L4 而非 L1。

## 6. 新鲜度与防伪核验

这是上游超出 v0.1 最多的工程层，四件套：

1. **输入快照**：运行前对全部输入文件取 sha256 存 `inputSnapshot`，运行后再取一次记 `inputsStable`（`kernel.mjs:317-319`）；"结论是否还有效"成为确定性判定而非约定。
2. **结论复用**：Stop 钩子只在配置一致且输入未变时复用归档 run，且仅限 ontology-map/semantic-profile/semantic-consistency/configuration 四种纯文件门（`plugin/lib/freshness.mjs:99-115`）。
3. **rawOutput 交叉核验**：runner 声明 `rawOutput:{format,file}` 后，内核独立解析 TAP/JUnit 重算计数，与自报不符即 ERROR（`plugin/lib/engineering.mjs:82-89`）；基线报告同样重算逐用例状态。
4. **F2P/P2P**（ADR-0008）：fail-to-pass 用例必须在基线上失败、当前通过（防伪修复），pass-to-pass 双版本通过（防回归）；基线 commit 经 `git rev-parse --verify` 核验真实存在，可选文件内容哈希比对（`plugin/lib/baseline.mjs:37-60`）。

## 7. 插件集成面

`plugin/hooks/hooks.json` 注册四事件，全部走单进程适配器 `plugin/hooks/adapter.mjs`：

| 事件 | 超时 | 逻辑 |
|---|---|---|
| SessionStart | 5s | 注入纪律声明；配置三态分支（缺失/残留/损坏）；依赖安装提示；最近归档结论基准行；写 session-baseline.json 供 Stop 判定 |
| UserPromptSubmit | 5s | 仅当 task-intent 登记存在才激活，注入意图基准行（登记即 opt-in） |
| PreToolUse | 5s | Write/Edit 目标做 scope glob 匹配，越界只发软提示，不拦截 |
| Stop | 55s | 先尝试复用归档结论，否则以 50 秒声明预算执行 close；非 PASS 时支持 new-only 降级（既有 FAIL 且声明输入无变更才放行） |

55 秒宿主死线 vs 50 秒执行预算：适配器自留 5 秒做核验与落盘。适配器自身异常输出非阻断提示：框架故障 fail-open，门禁判定 fail-closed（`adapter.mjs:150`）。命令面四个：`/quality-gate`、`/quality-gate-init`、`/quality-gate-intent`、`/quality-gate-update`，纪律统一为"agent 只问询与转述，写入只经 CLI"（ADR-0014）。SKILL.md 明示：Stop 是反馈回路，ZCode 有三轮重试上限，强制准出走 CI 退出码。

## 8. 本体体系

catalog.json 是统一语义载体：`{id, version, concepts[{iri,label,altLabels,subClassOf,equivalentClass,unionOf,disjointWith,relations,constraints,lifecycle,exposure}], properties[{predicate,subPropertyOf,inverseOf,transitive}]}`（校验在 `plugin/lib/ontology.mjs:12-29`）。内建 OWL 子集推理（ADR-0006）：subClassOf DAG（环 fail-closed）、equivalentClass 对称物化、unionOf 并类、disjointWith 沿继承传播、属性注册表（subPropertyOf/inverseOf/transitive）、subsumption BFS 最短链。边界如实写明：无开世界、无反例推理、非完整 OWL reasoner。

FIBO 信任链三级：代码常量 pin 目录哈希 → 目录记录每源文件哈希 → 与 vendored RDF 逐字节核对（`plugin/lib/ontology.mjs:176-187`）。`scripts/import-fibo.py` 离线重生成目录并登记出集丢弃边；`scripts/ontology_diff.py` 把目录演进分类为 breaking/additive，升级后必须人工重审并更新各门 `acknowledgedOntology`。SHACL 十组约束组件内核原生判定（v1.22.1），pyshacl 只是可选第二实现做并集核对，未安装不影响默认判定。

## 9. 测试与验收基建

自身回归：`node --test tests/*.test.mjs`，77 个测试文件，615 项检查 0 SKIP（`PROJECT-HANDOFF.md:27`）。46 个示例由 `examples/examples.manifest.json` 单一事实源驱动（ADR-0011），测试强制六项不变量。验收基建三层：`acceptance/expense-approval-fixture/`（真实报销审批小项目，13 门 × 12 种 kind × 六域 + 负例矩阵 + 生命周期 10 步脚本，v1.24.0 复验 8/8、13/13、13/13、10/10）；`acceptance/zcode-v11/v15-*`（故意 FAIL 态供 Stop 复演）；`docs/history/LIVE-ACCEPTANCE-*.md`（ZCode 客户端实机装包验收记录，按版本轮次收尾）。发布物为可复现 zip + sha256，解包重跑全量回归才算产出（ADR-0010）。

## 10. 与本地实现对照

| 维度 | 上游 v1.24.0 | 本地 `overlay/custom/qgate/` |
|---|---|---|
| 语言与依赖 | 纯 ESM .mjs，零依赖，Node ≥ 20 | TypeScript，依赖 yaml，vitest |
| 配置 | 单文件 `.quality-gate.json`（schemaVersion 0.2） | `.qgate/` 目录：qgate.yaml + profiles/ + gates/*.yaml（qgate/v1alpha1） |
| 判定 | PASS/FAIL/ERROR/SKIP，fail-closed | 六态（多 CONDITIONAL/INCONCLUSIVE/NOT_APPLICABLE） |
| 门数量 | 37 种 kind | 13 门 / 6 种 executor |
| 新鲜度 | inputSnapshot + inputsStable + 限定复用 | treeHash/commit/路径三锚 isFresh + 五要素缓存 |
| 防伪 | 内核重算 + rawOutput 交叉核验 + F2P/P2P | 无（command 看退出码） |
| 意图域 | task-intent 登记 + 漂移对账 + 软钩子 | 无 |
| 本体 | OWL 子集 + SHACL + FIBO 钉扎 + 9 语义门 | fibo-mini 12 概念 + 1 语义门（三查） |
| 钩子 | 4 事件单适配器，Stop 复用 + new-only | 6 事件，Stop 预算降级阶梯（MAX_BLOCKS=2） |
| 测试 | 77 文件 / 615 检查 / node --test | 52 例 / vitest |
| 示例 | 46 demo + manifest 单一事实源 | 7 demo |
| 本地独有 | — | CONDITIONAL 第六态、tier 映射、Matrix 桥、llm executor、persistence sqlite 场景、脱敏、evidenceCommit |

## 11. 16 篇 ADR 结论

| ADR | 一句话结论 |
|---|---|
| 0001 six-domain-model | L0–L5 六域 × edit/close/pr/release 阶段正交裁剪，SKIP 不计 PASS |
| 0002 proof-chain | 五元证明链定案，例外只登记阻断，模糊态全部归并 fail-closed |
| 0003 platform-agnostic-kernel | 判定全在零宿主依赖 CLI 内核，Stop 只是反馈回路、CI 退出码才是准出 |
| 0004 deterministic-first | 判定 = 真实工具 + 结构化比较，LLM 只许提取/解释、不得放行 |
| 0005 replaceable-ontology | 本体是可替换 provider，FIBO 固定版本离线钉扎 + 升级强制重审 |
| 0006 builtin-owl-subset | 内建纯 JS OWL 子集推理 fail-closed，外部 reasoner 只做双实现核对 |
| 0007 kernel-authority | 凡可纯算术复核的声明判定一律收归内核 |
| 0008 f2p-p2p | f2p 基线必败 + p2p 双版本过，六类违规全指名 |
| 0009 evidence-discipline | 证据有效性/新鲜度/冻结基线/来源分级四件套 |
| 0010 zero-dep-packaging | 运行时零依赖不联网，打包自含，解包重跑全量回归 |
| 0011 manifest-single-source | examples.manifest.json 为全部示例单一事实源 |
| 0012 parallel-tracks | 允许双轨并行会话共树迭代 + 文档五层治理 |
| 0013 persistence-readback | 持久化必须真实调用 → 独立回读已提交存储 → 逐字段比对 |
| 0014 guided-onboarding | 首运行 = 静态模板库 + CLI 确定性装配，agent 只问询不代写 |
| 0015 config-lifecycle | init/update 入口分权，重初始化 = 列表确认后删除，登记集中 registries/ |
| 0016 ubiquitous-language | GLOSSARY 唯一登记处 + 协议键迁移 0.2 + lint 防回归 |

## 12. 本机冒烟实录（exercised 级证据）

2026-10-01 在本机副本实测（Node v24.21.0）：

- `qgate.mjs <demo> close`：PASS，2/2 门，证据落 `.quality-gate/runs/<uuid>.json`。
- `qgate.mjs <six-domain-demo> close`：PASS，7/7 门（rtm/syntax/profile/behavior/metrics/technical-debt/rollback-drill），层级覆盖 L0–L5 全 ✓。
- `qgate.mjs templates`：输出 7 模板 × 3 档与 add-on 库。
- run 文件结构核验：含 claims/risks/exceptions/inputSnapshot/inputsStable 字段，与本文 §3 一致。

## 附：已知边界（据 OPEN-SOURCE-STATUS 与 PROJECT-HANDOFF 如实转录）

v1.24.0 未做新实机验收；SHACL 是 JSON 子集、OWL 非完整开放世界 reasoner；示例扫描器不构成生产认证；RTM 仍有 7 条部分需求；R13 拓扑推导、签名、仓库自有 CI、双人核准为永久出范围项。根仓 close 只跑 2 门（command + convention-alignment），全量回归移到 pr/release 阶段。
