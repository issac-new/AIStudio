# Harmony 多目标演化吸收：分解搜索、增益保留率与整块重写警示

日期：2026-11-03
状态：implemented
触发：用户「继续深入调研 https://mp.weixin.qq.com/s/QOJ6jCIa25ZuVSjB8uocFA 完善AIStudio」。论文《Harmony Harness: Multi-Objective Self-Evolution of Agent Harnesses》（arXiv 2610.15150）指出单目标爬山会让安全被最省事的路径挤掉，给出分解搜索与「保留率」口径；本仓改进实验台此前只有质量×成本帕累托，缺安全目标、缺分解、缺保留率。调研见 `docs/reports/2026-11-03-harmony-harness-survey.md`。

## 变更

- 新增 `custom/server/harness/workbench/multi-objective.ts`（纯函数）：权重向量生成（双/三目标单纯形）、加权 Tchebycheff 打分、分解搜索报告（理想点＋每子问题代表解＋互不支配前沿）、增益保留率、行为多样性诊断（标注「只能当监测」）。
- `custom/server/harness/workbench/types.ts`：`ProbeMetrics` 增可选 `safetyRate`、`heldoutBaselinePassRate`（安全读数与留出基线由评测方回填，缺席即退化，不猜）。
- **安全读数生产者（2026-11-03 补做）**：`custom/server/eval/aggregate.ts`＋`types.ts` 增 `RunAggregates.riskRate`——已判定 risk 断言里守住红线的比例（无 risk 断言或全 unknown 时 null）；`workbench/evidence.ts` 把它回填成 `safetyRate`。此前 `safetyRate` 只是位子无生产者，现由内置回归集的 risk 断言直接供给。
- **探测并发编排（2026-11-03 补做）**：`probe-runner.ts` 改为有界并发工作池（`concurrency`，1-8）——「题×样本」为单元，预算按在途估值预扣（最多多花 (c-1)×单题估值），首个单元无条件放行（与旧串行「先跑一题再按真实成本停」一致）；进度按「已出样本的题数」报；并发下证据只认 stream-json（jsonl trace 是「目录里最新一份」，多路并行会张冠李戴，宁可报错）。`AutoProbeJob.peakInFlight` 如实呈现并发有没有真的起来。
- **并发缺省与收敛（2026-11-03 缺省评估）**：`probeConcurrency` 缺省 2（墙钟减半，超支 ≤1 份单题估值≈5 美元上限的 10%，只占 2 个 agent 子进程）；执行器再按「单元数（题×k）」与「预算允许的超支（剩余 10%）」二次收敛，配置只表达上限。trace 归因改为**每单元独立 trace 目录**，并发下不再串题，trace-only 环境也能并发。
- **调度面（2026-11-03 补做）**：新增 `schedule-policy.ts` 与 `harness-schedule.json` 真实产物（probeMaxTasks/probeK/probeConcurrency/retryBackoffSeconds）；`surface-registry` 第九面 `scheduling`（managed，可写白名单只放行该文件）；一键探测按策略取每题上限与 k（实测：策略 2 题 → 预算预估按 2 题算，默认按 5 题）。端点 `GET /schedule`、`POST /schedule/bootstrap`、`POST /schedule/validate`。
- `custom/server/harness/workbench/loop.ts`：新增 `gain_retention_low`（保留率 <30% 告警，`HARNESS2_RSI_REQUIRE_RETENTION=1` 升硬闸）与 `whole_harness_rewrite`（单候选改 ≥8 文件告警）两道门。
- `custom/server/harness/workbench/service.ts`：`derived.search` 下发 `{ decomposition, retention, diversity }`（视图现算不落盘）。
- 设计同步：正本 §5.8 增「多目标与保留率」约束；总账 §A 增两行（目标数、保留率阈值）；附录 A.1 登记本 spec 与报告。

## 决策记录

| # | 决策 | 理由 | 否决的备选 | 可逆 |
|---|---|---|---|---|
| D1 | 分解只出报告，不改晋级裁决 | 「代表解」是搜索结构，不是上线许可；论文也让分解负责方向、门禁负责准入 | 让代表解自动晋级（否决：等于取消人工批准） | 是 |
| D2 | 安全做成可选第三目标，缺席退化为双目标 | 仓内没有真实安全基准，硬凑安全值等于造假 | 强行要求 safetyRate（否决：会把所有提案卡死） | 是 |
| D3 | 保留率缺基线时返回 null 并说明 | 论文的保留率是「增益之比」，没有基线算出来的是伪指标 | 用水平比值（heldout/evolve）替代（否决：会被基线水位污染） | 是 |
| D4 | 整块重写只告警不拦 | 论文消融显示整块重写更差，但确有需要大改的场景；限流已有编辑预算 | 直接 blocker（否决：会误伤合法大重构） | 是 |
| D6 | 安全读数用既有 risk 断言聚合出 `riskRate`，不新建安全基准 | 仓内已有 risk 断言（红线负例）在跑；新增一套安全基准是另一个项目，且没有真值来源就是假数据 | 新造安全数据集（否决：无标注来源，等于自造真值） | 是 |
| D8 | trace 归因改为每单元独立目录（原方案是并发时禁用 trace） | 串题根因是「共享目录取最新一份」，隔离目录即可根治；禁用通道会让 trace-only 环境失去并发 | 并发时加锁串行（否决：等于废掉并发） | 是 |
| D7 | 调度面做成真实文件而非只挂名字 | 论文的调度是影响执行的一块；假面（无人读）等于自欺 | 只登记 advisory 面（否决：不可演化，白占一面） | 是 |
| D5 | 结构多样性显式标注「禁止当优化目标」 | 论文实测结构距离与目标空间相关仅 +0.030，且可被改写刷高 | 用作候选淘汰依据（否决：可被 game） | 是 |

## 验证

- `custom/server/harness/workbench/__tests__/multi-objective.test.ts`：权重向量和为一、Tchebycheff 取最大项、安全缺席不参与、三候选各有擅长时代表解分化、支配关系、读数排除、保留率三态（55% 口径/未留住/缺基线）、多样性监测口径（13 例）。
- `loop.test.ts` 增 Harmony 三例：保留率告警与升闸、缺留出基线不报门、整块重写告警（全套 55 例）。
- `workbench-http.test.ts`：视图下发 `derived.search` 三面（全套件 177 例）。
- 全量 `npm test` 与 `npm run typecheck:harness`。

## 设计文档影响

DESIGN_SYNC: touched

- `docs/superpowers/specs/2026-10-23-swarmstudio-integrated-design.md`：§5.8 增多目标与保留率约束。
- `docs/superpowers/specs/2026-10-23-swarmstudio-design-ledger.md`：§A 增目标数与保留率阈值两行。
- `docs/superpowers/specs/2026-10-21-swarmstudio-appendix-a-spec-index.md`：登记本 spec，计数递增。
