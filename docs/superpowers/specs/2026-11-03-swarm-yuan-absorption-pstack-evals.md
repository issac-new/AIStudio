# 2026-11-03 swarm-yuan 吸收批：pstack 全量＋addyosmani/mattpocock 漂移刷新（12 项）

## 变更

用户令「深入调研 mp.weixin.qq.com/s/ID4YttTLPTimippMOFNyLA 提到的 skill（源码级别调研），完善 swarm-yuan skill」。文章点名三套技能包：addyosmani/agent-skills、mattpocock/skills、pstack（cursor/plugins）。源码级调研（2026-11-03，三仓浅克隆实读）确证三类差距：

- **pstack 零覆盖**：swarm-yuan 全仓无一处提及。
- **addyosmani 漂移**：已吸收基线 `df1edb2`（2026-08-14，24 技能）→ 上游 `301b02b`（2026-11-01，25 技能）。期间 `evals/` 从雏形长成三档评测体系，`constraint-driven-development` 新增 floor guard（降标守卫）与 `quality-gate.mjs`。
- **mattpocock 漂移**：基线 `5beb35b04`（2026-10-19）→ 上游 `4ae2317`（2026-10-31）。新增 software-factory 技能、「子代理用新上下文窗口而非 fork」跨技能规则；`grilling` 从"一次一问"改为"依赖分层前沿轮次"。

本批按用户裁决「全做 12 项、N05 一并」落地，分三层：

### 第一层：文档与基线（吸收账本，不改运行时）

| 编号 | 变更 |
|---|---|
| N11 | 新增 `references/pstack-methodology.md`（pstack 十三机制档：verify skill 五段/arena vs swarm/blast-radius 五级证据/原则卡引用契约/决策日志 TSV/overnight 契约/attack-the-premise 等），登记 `assets/registry/references.tsv` 与 `references/capability-map.md`；`FACT_REFERENCES` 58→59 |
| N11 | 重写 `references/agent-skills-methodology.md`：补三档评测体系（Tier1 结构/Tier2 词法路由/Tier3 行为）、floor guard 五类降标、doubt 协议（ARTIFACT+CONTRACT 不传 CLAIM）、interview-me 的 95% 操作化判据；两处纠错见决策 D7；HEAD 锚升 `301b02b` |
| N11 | 重写 `references/mattpocock-skills-methodology.md`：纠错 grilling 为"依赖分层前沿轮次"（非一次一问）、fog of war 只在 wayfinder；补 fresh-context 子代理规则、ticket 原子性三重判据、ADR 追加式更新、out-of-scope 拒答库；HEAD 锚升 `4ae2317` |
| N06 | `references/subagent-orchestration.md` 增「swarm 与 arena 的分工」+「缺口不计为通过」两条：覆盖型任务用 swarm（切片/竞速+单一汇总），判断型任务用 arena（同题多候选+跨家族只读 judge+选底+嫁接）；缺 brief 点名证据的结果记缺口，缺口不折算通过 |
| N12 | 同上文档增「子代理一律新上下文窗口，不 fork 父会话」跨技能纪律 |

### 第二层：门禁（4 个新门禁，56→60）

| 编号 | 门禁 | 判据 |
|---|---|---|
| N01 | `check_skill_routing` | `assets/evals/cases.tsv` 定义正例/反例 prompt；零依赖 bash+awk 复刻词法路由（TF-IDF 余弦）：正例须排进 `ROUTING_TOP_K`、反例不得排第一且必须带 `owner`（否则判 vacuous pass）、两技能描述余弦 ≥`ROUTING_COLLISION_ERROR` 判碰撞；`ROUTING_MIN_RANK1` 为棘轮下限 |
| N02 | `check_rationalization` | 目标技能 SKILL.md 必含「## 常见合理化借口」段，位置在红旗段之前；数据行 ≥ `RATIONALIZATION_MIN_ROWS`；每行 Reality 列须含可核锚点（门禁名/命令/`file:line`/`tests/` 路径）之一 |
| N04 | `check_floor_guard` | diff 范围内只报**降标**五类：阈值下调、测试变松（新增 skip/删除测试文件/删除断言）、静默检查器（新增抑制注释）、未完成工作（桩/空 catch）、新增例外行；退出码 2（无法判定）绝不读成 0 |
| N13 | `check_skill_budget` | 目标技能 SKILL.md ≤ `SKILL_LINE_BUDGET` 行；`references/*.md` ≤ `SKILL_SIDECAR_MAX` 份；每份被 SKILL.md 引用的 sidecar 首 3 行须含「何时读我」条件句 |

### 第三层：流程与生成物（5 项）

| 编号 | 变更 |
|---|---|
| N05 | 目标技能新增第七类产物 `verify-<project>/SKILL.md` + `features/`：五段 Launch/Doctor/Drive/Evidence/Cleanup + 功能地图四固定 H2；生成器交付前须自己完整跑一遍（"从未执行过的生成物是草稿"）；「证明它能失败」写入交付判据 |
| N07 | 目标技能新增 `.swarm-yuan/out-of-scope/<概念>.md` 拒答库，三段模板（陈述 / 为什么界外 / 历史请求）；①需求理解先按概念相似度匹配并呈现；「因为已经实现所以关闭」禁入库（防去重检查被假拒绝毒化） |
| N08 | ①需求理解由「复述+确认」升级为「依赖分层前沿轮次」：一轮问完当前前置已定的全部问题、每问附推荐答案、环境事实派子代理查不阻塞整轮；spec 每节新增「本节依据：Q<n>」字段，L3 门禁可查 |
| N09 | `assets/plan-template.md` 由平铺清单升级为四区：已决 / 前沿（可精确陈述且未阻塞）/ 待明确（须写明卡在哪个未决问题）/ 界外 |
| N10 | 目标技能新增 `principles/p-*.md`（4-6 张，每张 ≤25 行，固定四段：适用时机/理由/模式/自检问句）；交付模板增强制字段「原则引用：<卡名> → 改变了 <具体决定>」；配结构校验防残片（pstack 自身有 4 张卡被发布流程截断而无校验） |

## 决策记录

- **D1（全做 12 项，N05 一并；2026-11-03 用户裁决）**：选项含「只做验证三件」「轻件 8 项」「轻件+重件 11 项」「全做 12 项」，用户选全做且要求 N05 不单独立项。代价：单批验证链最长，需在生成器自测（生成一个真实 fixture 技能并跑全套）上多花一轮。
- **D2（评测器用 bash+awk，不引入 node/jq）**：swarm-yuan 的硬纪律是「三平台兼容，bash 硬前置」，`scripts/` 下无 `.mjs`/`.js`，门禁亦无 jq 依赖。上游 `run-evals.js` 是零依赖 JS，本批只移植**算子**（分词/词干/IDF/余弦/排序）不移植语言；用例改 TSV（与 `assets/registry/*.tsv` 同风格）而非 JSON，避免为读用例再引入 jq。
- **D3（N01 落成门禁而非独立工具）**：上游把 Tier 2 放在 CI 的独立脚本里；swarm-yuan 的门禁是单一执行面（`ALL_GATES_*` 序列 + `gate-deny.jsonl` 可复盘），独立工具会绕开拦截留痕。故新增 `check_skill_routing` 入 arch 序列，评测脚本 `scripts/eval-routing.sh` 由门禁调用（也可单跑）。
- **D4（N02 补上游只查标题的洞）**：上游 `skill-lint` 只断言 `## Common Rationalizations` 这一行存在，空章节也能过 CI。本批三条判据（存在/行数/锚点）是**加严**，不是复刻。行数下限取"核心步骤数的一半、且不少于 4"，理由：上游 24 技能中位 6 行、最少 4 行，4 是可复现的下界。
- **D5（N04 只报降标，绝对宽松动作不报）**：「收紧是静默的，放宽是响亮的」。阈值上调、新增测试、新增断言一律不报——报噪音会让守卫被忽略。退出码 2（无 merge base / 非 git 仓）单独一档并 fail，禁止读成 0。
- **D6（N05 改变生成物产品面，判据写死在生成步骤）**：新增产物不是"建议"，是 `--verify-completeness` 的检查项之一。同时明确边界：verify 技能验的是**目标项目运行中的行为**，precheck 验的是**代码结构与规范**，两者不重叠、不互相替代。
- **D7（一处上游认知纠错 + 一处自纠，写入文档并留锚点）**：(a) 文章称 pstack 有"五轴 arena 评审"——全仓检索 `axis/axes/five` 无对应机制，pstack 刻意反对固定轴（rubric 现场生成 3-6 条），最接近的是 `blast-radius` 五级证据阶梯与 `architect` 的 10 条候选比较轴；(b) 本批开工时的初判"Matt 的 /grill-me 是一次一问"经复核为**误判**——文章未如此表述，且 swarm-yuan 2026-10-03 首轮吸收时已按上游实况记录了"前沿轮次制"（`mattpocock-skills-methodology.md` §一.2）。真正的上游漂移是另两项：子代理一律新上下文窗口（`7739eae`，2026-10-29）、implement-spec 每票一个全新 implementer。文档按上游实况写，不按二手转述写。
- **D8（N10 原则卡必须配结构校验才允许引入）**：pstack 自身有 4 张原则卡在发布流程中被截断成残片（正文只剩 bullet 或半句），仓库无任何校验能发现。故本批把「每张卡 ≥12 行且含 Why/Pattern/自检三要素」写成 `check_skill_budget` 的同族断言，不做无校验的抄形。
- **D9（N08 的 spec 依据字段可机检）**：Matt 的原文判据是「spec 若陈述了你没说过的事，那是缺陷」，但不可执行。本批落成 spec 模板字段「本节依据：Q<n>」+ L3 门禁查该字段非空且问题号存在于本轮问答记录，把散文判据变成可查断言。
- **D10（不改 vibe/不新增运行时计数）**：本批不新增外部运行时，`FACT_RUNTIMES` 三档不变；新增能力全部落在既有方法论档与门禁层。

## 验证

按仓库纪律，改完跑：

1. `bash scripts/registry-render.sh --check`（六表 ↔ 代码 ↔ 夹具三向一致）
2. `bash scripts/registry-render.sh --gates`（由 `assets/gates/` 源聚合三个 enforce 文件）后复跑 `--check`
3. `bash scripts/self-check.sh --check-only`（文档口径、references 计数、conf 变量计数、门禁闭合方程）
4. `bash scripts/precheck.sh --all` 与 `--all-full`（新门禁入序列后仍全绿；fixture 双态退出码）
5. `bash tests/run.sh`（既有测试面不回归）
6. 目标技能端到端：在 `tests/fixtures/` 选一个既有项目 fixture 跑 `generate-skill.sh` → 核对新产物（verify-<project>/、out-of-scope/、principles/、plan 四区、spec 依据字段）生成且 `--verify-completeness` 通过
7. `npm test`（仓级全量，合并前）

未覆盖即如实登记：N01 的 `ROUTING_MIN_RANK1` 初值需要先对生成物实测一轮再定，初版取 90（上游 CI 用 95，考虑生成物措辞差异留余量），实测后按结果调整并在 `facts.conf` 逐例登记。

## 设计文档影响

**DESIGN_SYNC: none** —— 技能面方法论、门禁与生成物增强，不触及仓级整合正本与数字总账。swarm-yuan 自身的数字单一事实源 `skills/swarm-yuan/assets/facts.conf` 随批更新并由 `self-check.sh` 自证（技能内闭环，非仓级总账）。
