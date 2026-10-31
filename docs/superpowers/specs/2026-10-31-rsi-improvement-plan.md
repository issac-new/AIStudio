# AIStudio RSI 改进方案：证据自动化、双体系合一与经验库治理（2026-10-31）

日期：2026-10-31
状态：plan-approved-pending-execution（决策事实源；执行按批次另立 spec。22:10 补记§五回填与 R12 增补；首批执行包已定案见 §二点五/执行 spec）
来源：四切面前沿调研（`docs/reports/2026-10-31-rsi-frontier-survey.md`）＋仓内资产审计（十条差距，逐条 file:line 见各项目行）。用户指示「全面调研当前 RSI 相关综述及技术栈等，为 AIStudio 制定改进方案」。
前置：RRSI 七机制＋D1-D11 十一件已全部落地（截至 2c7ad72ea），本方案是下一阶段的基础设施补全，不是再加机制。

## 变更

### 一、定位与总纲

AIStudio 改进实验台的机制密度已超全部调研对象（27 blocker＋16 warning，loop.ts:485-749）。但前沿调研给出尖锐对照：验证层级理论证明**改进强度受验证信号强度约束**（arXiv 2607.07663〔实测〕）。本仓四类高质量证据（等预算/反事实/噪声/留出）却全部靠手工供给，四个 require 开关默认 false——**门在、证据不在**。因此本阶段总纲只有一句：

把改进回路从「机制最全」推进到「证据全自动供给、两套自改进体系合一、经验库可治理」，机制扩展停止。

三个量化目标（达成即本方案收口）：
1. 任一提案从批准到晋级所需的全部门禁证据（基线/候选/回归/噪声/等预算/反事实）可由一次操作自动产出。手工绑定 runId 的入口保留，但不再必需。
2. RSI 内核的缺口信号能出现在改进实验台的提案来源里；改进台的采纳能回流 capability-graph。双向各至少一条代码通道。
3. 经验库的检索、复核、退役在 100 条规模下仍可操作：加权检索＋批量复核入口。

### 二、分档项目表（R1-R12）

规模档：S=单轮可收口；M=1-2 轮；L=独立立项。每项外部锚=调研依据，内部锚=审计差距。

#### 批次 A：纠偏与证据自动化（P0，正确性优先）

| # | 项目 | 外部锚 | 内部锚 | 落点 | 验收 | 规模 |
|---|---|---|---|---|---|---|
| R1 | rsi-maturity 探针修复 | —（真实缺陷，不涉外部锚） | gap_register 10-12 迁往 life-workbench，探针仍指 `~/.hermes/gap_register.yaml`（rsi-maturity.ts:62/160）→L2/L3 自评输出 null 与「达成」文案矛盾 | 探针改读 watchdog 同源新址（或 env 覆盖 `GAP_REGISTER_PATH`）；自评报告补「探针失效=无法判定」三态而非静默 null | 本机 GET /api/harness/rsi-maturity 恢复 L1-L3 达成且与文案一致；路径缺席时如实 unknown；测试覆盖三态 | S |
| R2 | 三类证据自动供给 | Sage/AutoSaddler 的 dev 泛化门＋自动复测〔实测〕 | auto-run 只跑候选+回归（service.ts:1196-1360）；等预算/反事实/噪声全手工（service.ts:438-476、752-761） | auto-run 扩三档。①基线探测前：自动跑未改动 harness 同集×2，噪声 δ 自动标定。②候选探测后：自动跑等预算基线（同预算参数的未改动 harness）。③反事实：接 R3 产物。三档产物分别写入 proposal.noise、evidence.equalBudgetBaseline、evidence.counterfactual | 单次 auto-run 完成后三字段非空；无网络泄露（沿用物化 home 隔离）；预算上限合并计算 | M |
| R3 | CHASE 协议变换器 | CHASE（2609.18366）：语义保持、协议变换〔实测〕 | 变体集无生产者（types.ts:110-113 自述「由评测域产出」） | eval 域新模块 `counterfactual-variants.ts`：对源集做四类确定性变换：任务 id 重命名、文件名与路径改写、工具返回格式包装、错误注入。变换器输出变换说明＋语义保持自检清单，产物按密封集入库（沿用 eval/store.ts 契约）。语义保持＝人工抽检门（首次与每 N 次再校验，N 可配） | 对示例集产出变体集且 id/断言零泄漏到 harness 面（泄漏批评者复扫通过）；抽检记录留痕；反事实门可消费 | M |
| R4 | 探测多样本 k≥2 | Rethinking（2607.12227）匹配预算口径；Fragility 噪声放大〔实测〕 | auto-run 每题 1 条 evidence（probe-runner.ts:299）；D4（pass@k 诊断）无落点 | probe-runner 支持 `k` 参数（默认 2，预算允许时）；ProbeMetrics.k 如实记录；晋级门新增 warning `pass_at_k_divergence`（pass@1 上升而 pass@k 下降=靠运气而非能力）；statisticallyInsufficient 在 k≥2 后语义收紧 | k=2 全链测试；divergence 用例构造与放行各一 | S |

#### 批次 B：双体系合一（P1）

| # | 项目 | 外部锚 | 内部锚 | 落点 | 验收 | 规模 |
|---|---|---|---|---|---|---|
| R5 | 缺口信号→提案来源 | RRSI proposer 全史注入已是先例；MetaSkill-Evolve 的 Analyzer 角色〔实测〕 | workbench 与 RSI 内核（gap_register/capability-ladder，仓外）零耦合；仓内五步循环零实现 | ①只读适配器 `gap-source.ts`：解析 gap_register 新条目，生成「缺口驱动提案」draft（evidenceRefs 引 gap id，hypothesis=缺口陈述）。②`GET /api/harness/workbench/gap-suggestions`。③采纳晋级后回写一条 capability-gap-suggestions 建议行，不直写手工区（维持 2026-09-18 spec 裁决 1）。不搬内核进仓，只建双向桥 | 端到端一例：真实 gap 条目→draft→（模拟）晋级→建议行落盘；内核文件缺席时 fail-soft null | M |
| R6 | heldout 密封集接晋级门 | 2610.18813 的独立新验证数据准入规则〔摘要级〕；Sage dev/test 隔离〔实测〕 | heldout 防探测契约完好但零消费者；晋级门「留出侧」实为普通回归集（types.ts:104） | Proposal 增 `heldout?: {runId, n, passRate}`（只接受 heldout-store 的 score 形状，内容永不出库）；晋级门：增益>0 且 heldout 无记录→warning `heldout_missing`；heldout 通过率低于 evolve 通过率−δ→blocker `heldout_regression`。`HARNESS2_RSI_REQUIRE_HELDOUT=1` 升硬拦 | 用 heldout-store 造小集走通；两门用例各一；密封契约测试（不出内容）保持绿 | M |
| R7 | advisory 面执行回路（memory/tool_guidance 先行） | Sage「候选+diff 不激活」〔实测〕；本仓 skills 面既有 managed 先例 | 6/8 面 applied=false 纯记账（surface-registry.ts:122-264），无「建议→执行→回读验证」通道 | 对 memory/tool_guidance 两面：晋级产出结构化建议产物（memory=条目增删清单，tool_guidance=工具描述覆盖片段），附「应用到既有管理面」的人审按钮（复用审批收件箱通道）。应用后自动建回读验证探测：下一轮提案基线即新产物生效态。applied 字段扩三态 `false|via-workbench|via-surface` | 两面各走通「提案→晋级→人审应用→回读探测」一例；其余四面维持 advisory 并在 overview 注记 | M-L |

#### 批次 C：经验库治理（P2）

| # | 项目 | 外部锚 | 内部锚 | 落点 | 验收 | 规模 |
|---|---|---|---|---|---|---|
| R8 | 经验加权检索＋批量复核 | HP-7 保鲜派生已有；D11 建议逐条人点 | 起草器取 adopted 前 3 不加权（service.ts:571-574）；50 条展示上限不可扩展 | ①suggestProposal 经验选取改 `confidenceScore×面域匹配` 加权 top-3（freshness 现算已有）。②D11 执行面批量复核：memoryPolicy 折叠块加「全选→批量退役/批量引用到新提案」两操作，逐条通道保留。③stale 经验在起草 prompt 自动附「建议引用以刷新」清单 | 加权选取单测（fresh 优先于 stale 同置信）；批量操作 HTTP+UI 用例；100 条规模渲染测试 | S-M |
| R9 | 技能差分上岗验证 | Agent Skills Can Be Harmful：307 例失效归因，「看似相关」技能引发功能失效〔实测〕 | skills 面晋级后无「有无技能」对照验证 | skills 面晋级流程新增可选「差分探测」：对同一探测集跑 有技能/无技能 两态，回填 `skillDifferential`（增益差）；无差分→warning `skill_undifferentiated`（「装了但不知有没有用」） | 差分字段+门+UI 徽章；与 R2 编排共用 runner | S-M |
| R10 | 任务族评测 | HCAST 范式：族内进化、族外检验〔摘要级〕 | Eval Studio 集无 family 维度；进化报告按面聚合，单任务特化不可见 | eval set 增 `family?` 字段（密封集不变性兼容）；evolutionReport 增「族聚合增益」视图（每族 Δpass@1）；面级增益与族级增益背离>阈值→warning `family_specialization` | 造双族集验证聚合与告警；族字段缺席时面级视图不变 | S-M |

#### 批次 D：规模化与稳健（P3）

| # | 项目 | 外部锚 | 内部锚 | 落点 | 验收 | 规模 |
|---|---|---|---|---|---|---|
| R11 | workbench 持久化与任务态恢复 | —（工程债） | store 单文件 JSON＋进程内串行（store.ts:55-68）；auto-run 态内存 Set 重启失联（service.ts:1093，types.ts:221 自述） | store 迁 SQLite（复用 loop/graph event-log-store 先例：append-only＋版本迁移）；auto-run 任务态落盘（jobs 表），重启后 running 态标记 orphaned 并可一键重发起 | 并发读写冒烟；重启恢复用例；旧 JSON 一次性迁移+备份 | L |
| R12 | 验证信号分级面板 | 2607.07663 验证层级：改进强度绑定验证强度〔实测〕 | 晋级报告不区分「用了哪级验证信号」；LLM judge 与命令式验收器同权重展示 | 每次晋级计算 `verificationTier`（命令式验收器>密封 heldout>普通 eval>LLM judge，按探测证据的证据类型推导）入 PromotionRecord；面板进化表增 tier 列；tier=最弱级的连续晋级触发 warning（进化健康度） | tier 推导单测全覆盖；面板列渲染；与 R6 联动 | S |

### 二点五、首批执行包（已定案）

首批＝R1（探针修复）＋R4（k≥2）＋R8（加权检索＋批量复核）＋R12a（验证信号分级，R12 拆分的 tier 件；R12b 约束消融后置第二批）。实施细节与决策见执行 spec `2026-10-31-rsi-exec-batch1.md`。

### 三、批次路线图与依赖

```
批次A（R1→R4）──R3 产物──▶ R2 反事实档 ─┐
                                        ├─▶ 批次B（R5/R6/R7 可并行）
                                        │        │
                                        │        └─R6 heldout──▶ 批次D R12 tier
                                        └────────────────────▶ 批次C（R8/R9/R10 独立，R9 依赖 R2 runner）
```

R1 先行（真缺陷，S 规模当日可收）；R3 先于 R2 的反事实档；R11 可与任何批次并行但建议最后（迁移风险隔离）。

### 四、不做清单（Non-goals，与既有裁决一并生效）

| 不做 | 理由 |
|---|---|
| 权重层 RSI（SEAL/微调线） | 冻结模型+可编辑 harness 是本仓架构前提；TTT（2604.06169 等）属模型侧，不引入 |
| 递归深度 >1（改进器自改） | L4 属治理决策（rsi-maturity L116-123）；行业实证封顶深度 2 且治理靠隐藏评估，无显式护栏可抄——维持锁 1 |
| 自动采纳/自动退役 | 人审边界是产品差异（调研证实商业侧无一做到可评测自改进，安全叙事升温下是资产） |
| CRDT/外部记忆系统引入 | 无实证开源实现；「记忆即文件」是事实标准，本仓经验库+文件面已覆盖 |
| 生成式基准（LLM 造题） | 实证缺陷（多样性差、难度不可控，2502.01683）；任务族用真实集即可 |
| 外部 eval SaaS 依赖（Braintrust 等） | 零依赖纪律＋离线可运行；其 compare-experiments 交互形态可自实现参考 |

## 五、10 月整月新证据回填（2026-10-31 22:10 补记，SPEC_REBIND 授权修订）

10 月全月 arXiv 拉取（320 命中，详见报告第八至十节）对方案的影响逐项对账。结论：**总纲与 R1-R11 维持不变，R12 一处增补，优先级一档上调**。

| 新证据（证据等级） | 影响的项 | 动作 |
|---|---|---|
| Masked Erosion 2610.38392〔实测〕：接受门只看任务分时冗余护栏被静默侵蚀；40 任务批次全失守、批量越大越敢删 | D5 约束保持门＋**R12（增补）** | R12 增补约束单层消融面：晋级时输出每个约束在当前冠军上的独立贡献清单；连续两轮零贡献的约束进人工复核。防「被其余护栏掩护的静默删除」——这是本方案唯一的实质变更 |
| Policy-is-Harness 2610.37255〔实测〕：部署回报＝harness 上限−策略失配；换 harness 两项都动 | R2 | 理论根基补记：等预算基线即「先量上限再采纳」的实操形态。验收不变 |
| KARMA 2610.39884〔实测〕：删成败对照轨迹则增益腰斩 | R2/R3 | 对照设计参照：变体与源集的成对运行不可省。验收不变 |
| Coding-Agent 自进化实证 2610.34938〔实测〕：自提变更仅 2/7 根治问题、18/43 套模板 | 起草器（已落地的进化史注入） | 证据补强既有设计；evidenceRefs 强制绑定真实事件的 submitReadiness 门槛维持不变 |
| Successive Scale Racing 2610.28815〔摘要级〕：任务池扩大反致退化 | R10 | 负警示入验收注记：族内任务数不贪多，加「族规模敏感性」说明 |
| Harness Evolution Hits a Ceiling 2610.11655〔摘要级〕：按失败构成判断何时停 harness | 方案总纲 | 直接支持「机制扩展停止」判断，无动作 |
| Codex 0.166 skill catalog＋Azure skill improvement＋Claude 技能迭代（产品三线并发，10-27 至 10-31〔实测〕） | R7/R9 | 产品侧验证「技能资产化」方向：R7 执行回路与 R9 差分验证在各自批次内的优先级上调一档（执行顺序提前，不新增项目） |

## 决策记录

| # | 决策 | 理由 | 否决的备选 | 可逆 |
|---|---|---|---|---|
| D1 | 本阶段停止新机制、全面转向证据供给与体系合一 | 验证层级理论＋审计结论：门密度已居调研对象之首，瓶颈在证据断供与双体系割裂 | 继续 D12+ 机制扩展（否决：边际收益递减，机制无证据即空转） | 是 |
| D2 | R2 证据自动化沿用 auto-run 的物化隔离 home，不引入新沙箱 | 隔离边界已实证；断网防作弊（harness2 共识）由物化 home 天然满足 | 独立评测沙箱进程（否决：R11 前先解决任务态恢复，否则复杂度翻倍） | 是 |
| D3 | R3 变换器语义保持用人工抽检门而非自动等价判定 | 自动语义等价无可靠实现；CHASE 原文也依赖 validity check 人工规则 | LLM 判等价（否决：judge 可靠性证据不足，且违反「不造假捷径检验」） | 是 |
| D4 | R5 只建桥不搬家（内核留仓外） | 内核落点=HERMES_HOME 是 2026-09-18 spec 既定架构；搬仓属大重构无对应收益 | 把 capability 链整体迁入 custom/server（否决：范围失控） | 是 |
| D5 | R6/R12 的 heldout 与 tier 先以 warning 落地、env 升硬拦 | 与 D1/D2/D5 三门同款灰度先例（首轮观测假阳性再收紧）；避免一次性把晋级变成全硬墙 | 直接全 blocker（否决：证据供给刚自动化，硬拦会先制造大面积误拦） | 是 |
| D6 | R7 只开 memory/tool_guidance 两面 | 两面风险 medium 且有既有管理面（memories 目录/工具契约）可承接执行；guardrails 等四面 risk=high 维持纯建议 | 八面全开（否决：高风险面自动应用违反执行层强制纪律） | 是 |
| D7 | R1 判定为缺陷修复而非增强，随批 A 首件执行 | 自评失真违反「机制存在≠级别达成」的本模块纪律（rsi-maturity 头注自述），优先级最高 | 列入 P2（否决：诚实性缺陷不排队） | 是 |

## 验证

- gongwen-lint 机械体检（两份文档）：黑话词清零（闭环/沉淀/领先已改具体表述）、>50 字正文长句已拆；残留硬违规 方案 12 处／报告 26 处，构成=表格单元格与 URL 行的并列分号（linter 自注「并列小标题的分号是公文合法格式」豁免类）＋41-49 字句（引文 arXiv 编号与证据等级标注计入字数，再拆即伤引用可核性）——如实声明，不硬改。
- `npx vitest run custom/__tests__/docs-ssot-guard.test.ts`（附录 A 登记）；组件台账四条新框架行计数自洽（§二/§3.2/§七.3 同步 37→41）。
- 22:10 补记为本 spec 首次修订：新增第五节＋R12 增补，随批以 `SPEC_REBIND=1` 显式重绑收据（依据 AGENTS.md 规则 2：已合入 spec 修订须显式重绑）。
- 时效边界：10-30/31 的 arXiv 新投稿在补记时刻（北京 10-31 22:10）尚不可见（周六无 announce，API 最晚 10-29T17:59Z）——本方案基于当前可见的全部前沿；下一波论文落地后由执行批自行复核。
- 各项目验收以表内「验收」列为准，执行批各自落 spec＋测试，不在本批预写。

## 设计文档影响

DESIGN_SYNC: touched

- `docs/superpowers/specs/2026-10-23-swarmstudio-integrated-design.md`：§7.7 RSI 批补记「前沿调研＋改进方案（R1-R12）」指针。
- `docs/superpowers/specs/2026-10-21-swarmstudio-appendix-a-spec-index.md`：本 spec 与调研报告不重复登记（报告归 docs/reports 非 specs 根），本 spec 登记（计数 +1）。
- `team/shared/research/tech-components-ledger-20261027/tech-components-ledger.md`：§3.2 新增四条框架线（harness2/SkillOpt/sia/Sage，首次在册）＋计数同步。
