# AIStudio 设计事实与容量基线

> 本文是《AIStudio 终态设计文档》的数字附录，不是独立设计正本。
> 核实日：2026-11-17（run31 方案同步批——§C 七行随载体真值进位）。
> 口径：区分稳定设计参数、参考部署和版本快照。
> 用途：防止同一数字在多处定义，不滚动记录开发轮次。

## A、稳定设计参数

以下数字来自已冻结的需求或现行架构契约。
变更这些数字需要先变更对应设计依据。

| 项 | 数值 | 权威依据 |
|---|---:|---|
| 功能需求 / 非功能需求 | 14 / 8 | `2026-10-16-swarmstudio-requirements-analysis.md` |
| 工作模式 | 3 | 日常、IDE、全流程推演 |
| 日常工作阶段 | 6 | 搭台、需求、设计、开发、验收、治理 |
| 推演主链步骤 / 质量门 | 26 / 6 | `2026-10-05-mux-v8-fullflow-plan.md` |
| 人工介入点 | 14 | 冻结需求与推演责任契约 |
| 运行时组件 | 5 | 驾驶舱、Matrix、hermes agent、Ycode、swarm-yuan |
| 跨域契约 | 5 | 技能、能力委托、任务证据、治理审批、推演验证 |
| 发布形态 | 4 个模块包＋1 份整体源码包 | `RELEASE-MANIFEST.json` |
| spec 强制层数 | 4 | L1 写时 / L2 提交 / L3 门禁 / L4 准入（`spec-first-lib.sh`） |
| spec 机检段落 | 4 | 变更、决策记录、验证、设计文档影响 |
| spec 校准样本下限 | 1 条 F2P | 本批 spec 决策 6（证据级校准，非执行级） |
| 命令验收器超时上限 | 30 s | 本批 spec 决策 7（默认关闭） |
| 模型波动交付防线 | 4 层 | A 完成契约（门在 complete_task 内核边界，2026-11-01 下沉）/ B 判定网 / C 能力路由 / D 补偿止损（`2026-10-31-model-resilience-hardening.md`＋`2026-11-01-dod-kernel-gate-lineage-reclaim.md`） |
| 改进实验目标数 | 2 或 3 | 质量/成本恒在，安全读数由评测 risk 断言聚合（`riskRate` → `safetyRate`）后升三目标；无 risk 断言即缺席不猜（`2026-11-03-harmony-multiobjective.md`） |
| 增益保留率阈值 | 30% | 留出增益/演化增益低于该值告警（`HARNESS2_RSI_REQUIRE_RETENTION=1` 升硬闸）；缺留出基线不给数 |
| 改进实验验证信号层级 | 5 档 | 命令验收 > 密封留出 > 历史回归 > 仅裁判判分 > 无；连续 3 轮停在裁判层即告警（`2026-10-19-harness2-improvement-workbench.md` §14.2） |
| 改进实验独立证据 | 3 类 | 噪声 δ（半极差）／等预算基线／语义等价反事实；均须真实运行，禁手填（同上 §14.1） |
| 介入决策档 | 7 | 投递／延后／合并／抑制／升级／澄清／优雅不动；四门顺序＝置信→价值成本→时机→风险，critical 必达，安全告警不接该层（`2026-11-03-proactive-intervention-governance.md`） |
| 组件库身份 | 面 key＋文件名 | `id=<kind>:<name>@<digest8>`；同 digest 幂等，同组件版本递增且旧版保留；空内容不入库（`2026-11-03-component-library.md`） |
| 四挡→七档权限映射 | 4 项 | plan/build/guarded/yolo → plan/default/acceptEdits/bypassPermissions；唯一声明在 earned-autonomy，测试锁表（`2026-11-15-proactive-deferrals.md`） |
| 会话溯源覆盖边界 | 3 源 | 审批账＋standing agenda＋evidence（含 delivery_snapshot diff）；会话档案与 fork 血缘未接入（如实声明，不冒充完整） |
| 收缩衰减诊断 | 3 档 | 各面未回滚的正增益轮估 γ̂：<0.5 几何衰减／0.5–0.85 中度／≥0.85 未衰减；增益落进噪声带判到顶，建议元改进（`2026-11-23-rsi-recursive-theory.md`） |
| 选择偏差诊断 | 2 口径 | 最优-次优间隔对噪声带；最优-留出缺口（混有分布迁移）；期望乐观值仅在显式给 σ 时算 |
| 代理-真实背离 | 连续 2 轮 | 代理涨、留出读数不动或跌连续两轮判过拟合倾向；单轮只观察 |
| 后继轨迹联合判定 | 3 角色 × 3 态 | 改进有效性／约束保持／有效监督各记满足、不满足、未评估；任一后继不满足即不通过，证据不全记未评估；时间线含已回滚的后继（`2026-11-26-trustworthy-rsi-fulltext.md`） |
| 评估条件变更比较 | 相邻后继对 | 同一面内逐字段比较试卷指纹与裁判指纹；缺指纹记无法比较，不按相同；换了评估器的后继两侧各算一处（同上） |
| 回滚到达派生物 | 3 条 | 来源已回滚的零件不再提供给起草器（同内容另有现存冠军的除外）；起点建立在已回滚产物之上的提案可见（冠军链＋起点摘要，在途也列），不自动撤回；多文件回滚先全部校验再恢复（同上） |
| 主张层级证据图 | 8 × 3 格 | 八组要求 × 更新、后继、元改进三层；格态已评估／部分／未评估，随 `/api/harness/rsi-lifecycle` 返回 |
| 主张回执判定 | 3 类未验证 | 无引用／解析不到／跨任务引用；空主张不判通过（`2026-11-03-claim-receipts-and-dispatch-capacity.md`） |
| 派单并发准入 | 缺省不拦 | `ZCODE_MAX_CONCURRENT_RUNS` 未配（=0）即放行；饱和按 `ZCODE_CAPACITY_POLICY=reject|queue`；排队截止 `ZCODE_CAPACITY_QUEUE_TIMEOUT_MS` |
| 验收断言家族 | 6 | `file_exists/file_readable/file_min_bytes/file_contains/command_ok/test_passed`；不可判定落 unchecked 且整体不放行（`2026-11-03-acceptance-checks.md`） |
| 命令行退出码 | 5 态 | 0 成功／1 业务结论为负／2 环境或前置不满足／3 用法错误／4 部分成功；错误对象固定 `category`＋`reason`＋`remediation` 三字段；词表正本 `config/cli-contract.json`（`2026-11-06-ai-friendly-cli-contract.md`） |
| 交接回合口径 | 认领起、终态止 | `claimed`→`completed/gave_up/crashed/reclaimed/archived`；运行中不进分母；`reclaimed` 只关上一回合（`2026-11-03-handoff-quality-ledger.md`） |
| 探测并发缺省 | 2（上限 8，另按单元数与预算超支二次收敛） | 调度面 `probeConcurrency`：>1 时按有界池并行「题×样本」，预算按在途估值预扣，并发下证据只认 stream-json（`2026-11-03-harmony-multiobjective.md`） |
| 断点推断缺省阈值 | 边界 3 分／间歇 20 分／节奏钳 5-120 分 | 看板生命周期事件推断断点：状态边界或长间歇判为断点，否则按事件间隔中位数推测下一断点；缺证据判非断点（`2026-11-03-proactive-intervention-governance.md`） |
| 注意力偏好缺省 | 日 8／时 3／冷却 30 分／退避 12h／安静 22:00-08:00 | 同上；`attention.json` 可改，反馈不自动改写 |
| 改进实验证据门缺省档 | 5 门告警 | `HARNESS2_RSI_REQUIRE_{NOISE,ATTRIBUTION,CONSTRAINTS,COUNTERFACTUAL,HELDOUT}` 逐门升硬闸；缺省不阻断（同上 §6.2） |
| 反事实预演预算 | 单 sync 上限 5 条；`ANTICIPATION_PREVIEW=off` 关闭 | 干预收益双通道：预演差值优先（置信减权融合），失败/关闭回静态启发式表（`2026-11-14-proactive-ai-round2.md` P2） |
| earned autonomy 建议阈值 | 冷启动 <20 hold／收紧：人介入 >30% 或积压 >50%／放宽：≥50 样本零介入且自动放行 >90% | advisory-only 不动档；放宽永须人确认（同上 P4） |
| 发现测试判据 | 无锚点判 unsupported／正确沉默＝对已解决集零重复报告／验证负担＝超 maxFindings 比例 | discovery 形态评测四指标，指纹并入 discovery 字段且存量逐字节兼容（同上 P1） |
| 偏差复利信号阈值 | 同话题高不确定投递 ≥3 次＝1 信号 | evidenceChain.uncertainty 驱动，机制层读数；无链不倒填（同上 P5） |
| Run 收口三态 | outbox／silence／deferred 三态闭集＋11 个 reasonCode；JSONL 环形 2000 | 每个后台 Run 只允许三种结局，沉默必须点名原因；chat 回合不入三态（`2026-11-16-always-on-agents-absorption.md` P1） |
| 发件箱队列 | 环形 500；dedupeKey 幂等 6h；退避 30s/120s×3 转死信；合并上限 10 条 | 派发时复检注意力预算（日 8/时 3/安静时段），critical 豁免；matrix 通道仅 `OUTBOX_MATRIX_ROOM` 配置时启用（同上 P2） |
| follow-up 定时器 | watcher 节拍 15s；到期只提交 admission，不直接跑 agent | 唤醒原会话（不是 cron 新开会话）；CLI/TUI 无路由时拒绝（同上 P3） |
| 进度文件轮终写节流 | 10 分钟/task；预算触顶与中断不受节流 | 轮终写 reason=`turn_end`/`interrupted`；`HERMES_SESSION_CHECKPOINT_TURN_END=off` 关闭（同上 P4） |
| 空闲 dreaming 预算 | 1 次/24h；空闲 ≥30 分钟；`HERMES_MEMORY_DREAMING=off` 关闭 | 只读最近 24h 会话摘要，产出 tag `dream` retain；失败 fail-soft（同上 P5） |
| 延迟工具调用 TTL | 24h；仅无人值守 principal 默认 defer | 超时→挂起落 `deferred.jsonl`→结束本轮；用户回复经 `responses/<request_id>.json` 唤醒（同上 P6） |
| 卡级验证三档 | standard／independent／strict:pr | 等级不满足 fail-closed 拒完成（判定器异常也拒）；行级乐观锁 `expected_version` CAS 不匹配 409 `version_conflict`；迁移 envelope 五字段事务级落账（`2026-11-14-superagent-contract-batch2.md`） |

页签、路由、工具、检测器和专题页面属于实现清单。
其数量由注册表、代码和守门测试给出，不在本文手工维护。

## B、全流程推演参考编制

以下数字来自全流程推演方案，描述推演环境的参考编制。
它们不是产品硬上限，也不等于 `team/` 当前的 profile 数量。
实际部署以目标环境的团队资产与配置为准。

| 项 | 参考值 | 含义 |
|---|---:|---|
| 人类岗位 | 15 | 推演 roster 的主管与交付职能 |
| Matrix 账号 | 30 | 15 个人类账号与 15 个 AI 助理账号 |
| 智能体配置 | 42 | 推演环境的 profile 配置总量 |
| 看板 | 28 | 每人两块，主管不建板 |
| 任务并发 | 30 | 推演运行参数，不是跨环境保证 |

当前仓库 `team/profiles` 有 30 个 agent profile（含 orchestrator，不含 `_shared`）。
`profiles.yaml` 等注册表可能保留历史条目，活动编制以 `team/profiles`
和组织注册信息为准。看板按领域注册表配置，不能把推演编制当成产品部署数量。

容量、时延和资源消耗必须在目标环境重新测量。
推演参考数字不能用于推断其他机器的可用容量。

## C、版本基线

版本号以各自载体为准。本表只做汇总，不替代载体。

| 对象 | 核实值 | 版本载体 |
|---|---|---|
| hermes-studio 基线 | v0.8.30 | `vendor/VENDOR.md` |
| hermes-agent 基线 | v0.23.4 | `vendor/VENDOR.md` |
| zcode 基线谱系 | 4.0.0 线（包版本 4.0.0 @a4b44451，2026-11-23 同步批，与 tag v4.0.0 同一提交），同步跟随上游 main | `vendor/VENDOR.md` |
| 驾驶舱模块 | 0.8.30-studio.3 | `RELEASE-NOTES.md` |
| agent teams 模块 | v0.23.4-team.1 | `team/VERSION` |
| Ycode 模块 | 4.0.0 | `vendor/zcode/package.json` |
| Electron 桌面 runtime | 独立钉版，不与 agent teams 模块互推 | `vendor/hermes-studio/packages/desktop/build/runtime-release.json` |
| yuan skill 模块 | v2.103.0 | `skills/swarm-yuan/CHANGELOG.md` |
| 整体源码包 | 1.0.21-overlay | 仓根 `package.json` 与发布清单 |
| 平台重写批次（2026-11-05~06） | P0 身份/执行/证据＋P1 注入/交付/发布门＋P2 推演/文档三域核心；补丁 757/758 两枚平台载体（原拟 755/756，让号后落 757/758；755 为 readpool 批占用）；分文未升模块版本号（随下个发布轮进位） | `docs/superpowers/specs/2026-11-05-platform-rewrite-design.md` 及其三段「实施验证」小节 |

zcode 的基线谱系、包版本和补丁序列是三个不同口径。
不得把其中任意一个字段单独改写成另外两个字段。
2026-11-01 核对：hermes-studio 已升级至 v0.8.0（44 处补丁冲突处置完毕，全量与构建绿）；hermes-agent 最新稳定仍 v0.22.5（本表即当前钉版）；zcode 已同步 3.17.1（8/8 补丁，引擎构建绿）。本表所记即当前钉版，不以「上游最新」替代基线。
2026-11-03 台账刷新批核对：全表六行随载体真值对齐（studio v1.0.9／agent v0.22.6／zcode 3.17.2 @a9fe401e／cockpit studio.9／teams team.1 底座段随 v0.22.6 归 1／yuan v2.99.1）——前三行此前随各自升级批进位，本批补 zcode 同步并清偿 §C 滞留的模块行旧值；各值以载体文件为准。
2026-11-18 热修回灌批核对：v0.23.2 批挂账 N-4' 清偿（宿主 7 热修提交回灌为补丁 794/798/799/800，795/796/797 全吸收退役；runtime 终对账 56/0/6；spec 2026-11-18-agent-hotfix-backport-deploy）；版本行不动（v0.23.2-team.1 持平，仅补丁面扩 492→496）。
2026-11-24 v0.23.4 换血批核对：agent 行随基线升 v0.23.4（8fc0374447，1143 提交/1316 文件 +96,873/−6,703；5 补丁手解重锚（391/612/732/741/786）、探查致死交集 0、clean+inject 511/511 幂等二连）、teams 行随底座升级归 v0.23.4-team.1（spec 2026-11-24-vendor-upgrade-agent-v0234；runtime 对账 197/0/0，watchdog hostile-load 热修保 runtime 载体，宿主部署面挂账 N-1）。2026-11-25 手册同步批核对与勘误：版本行不动；v0.23.4 提交哈希更正为 8fc0374447（原记 3ac54e1012 是 annotated tag 对象哈希，非提交）；宿主基线已到 v0.23.4，覆盖层 31/194 件未跟上、其中 18 件本仓补丁未生效，挂账转 H-1（spec 2026-11-25-manual-sync-host-v0234）。2026-11-20 v0.23.3 换血批核对：agent 行随基线升 v0.23.3（caafe5389a，1675 提交/3948 文件，上游 state 层 breaking 大重构 60+ hermes_state_*.py 合并 persistence/ 包；10 补丁手解重锚＋485/755 锚迁 persistence 新家＋路由表扩 persistence/；clean+inject 489/489 幂等二连）、teams 行随底座升级归 v0.23.3-team.1（spec 2026-11-20-vendor-upgrade-agent-v0233；runtime 对账 194/0/0，宿主部署面挂账 N-1）。2026-11-21 merge 2630458c2 收口：rebase 集成 main 侧 806/807/809 三枚零重锚直过、clean+inject 492/492 幂等二连、蓝军独立审查 PASS 零 P0/P1（整树 tree hash 字节级=v0.23.3^{tree}）。N-5 后续清偿（2026-11-21 dispatch-tier 批）：5 枚 missing_grant 红根因=批二未标层 T2 立法时 dispatch 族测试未适配（非上游漂移），732/419 测试卡补 tier=T1 后 13/13 绿、全清单 14→9；N-6 同日卫生批闭环（14 件 runtime .tmp 删除，规则 e8a3e616f 兜底）。N-1 宿主收口同日闭环（基线 v0.23.3＋热修回灌两批入库＋deploy complete＋网关重启稳定）；N-2 对象消失（SIM 已归档拆除，重建即新面）。2026-11-18 v0.23.2 换血批核对：agent 行随基线升 v0.23.2（ae2a81ccc，8154 提交/5211 文件史上最大差量、16 补丁手解重锚、clean+inject 491/491）、teams 行随底座升级归 v0.23.2-team.1（spec 2026-11-17-vendor-upgrade-agent-v0232；runtime 覆盖层 20 件重镜像、宿主部署面挂账 run31 在途）。2026-11-10 v0.23.1 换血批核对：agent 行随基线升 v0.23.1（3b4215785，2 补丁手解重生成、级联假阳性归因解除、clean+inject 461/461）、teams 行随底座升级归 v0.23.1-team.1（spec 2026-11-10-vendor-upgrade-agent-v0231；合入实录 spec 2026-11-10-vendor-agent-v0231-merge-closeout——pre-commit merge 误伤基线面显式提交清偿、台账补齐、投影块摇摆归位 121 真值，终态 origin/main ad5b400bf）。2026-11-06 v0.23.0 换血批核对：agent 行随基线升 v0.23.0（2bd378ed1，6 补丁重生成＋742 退役，clean+inject 零告警幂等二连）、teams 行随底座升级归 v0.23.0-team.1（spec 2026-11-06-vendor-upgrade-agent-v0230）。2026-11-06 结构重排批核对：驾驶舱行随 v1.0.13 发布批归 studio.12、yuan skill 行归 v2.99.3、整体源码包行归 1.0.13-overlay，三行旧值（studio.9／v2.95.0／1.0.0-overlay）同批清偿；平台批次行补丁号校正为 757/758（原拟 755/756，让号后落位）。各值以载体文件为准。
2026-11-07 版本更新批核对：studio 行随基线升 v0.8.17（35a7158a1，v1.0.9 谱系前进 53 提交、tag 命名回归 0.8.x 线非降级，spec 2026-11-07-vendor-upgrade-studio-v0817）、驾驶舱行随底座换血归 0.8.17-studio.1（扩展序归 1，包不重发）；agent/zcode 行持平（v0.23.0 稳定 tag 口径／a9fe401e=main 同步）。同日风险清单收口（用户令「完成未做」）：zcode-acp-server 引擎面升 0.82.1（coding-delegate 真机冒烟全绿、注记更新，本机 npm 面不入库）；组件台账 openagentontology 转 RETIRED＋ATT&CK v20.1 企业域 STIX-diff 零差量刷新。
2026-11-09 台账刷新批核对：studio 行随基线升 v0.8.20（cedaceaef，v0.8.17→v0.8.20 三 tag 连发 10 提交，spec 2026-11-09-runtime-deps-refresh）、驾驶舱行随底座换血归 0.8.20-studio.1（扩展序归 1，包不重发）；agent/zcode 行持平（v0.23.0 稳定 tag／a9fe401e=main 同点）。顺带清偿 v1.0.14 发布轮未回写的三行存量漂移：teams team.1→team.2、yuan v2.99.3→v2.100.1、整体包 1.0.13→1.0.14（载体核对 2026-11-09 实测）。
2026-11-11 v1.0.15 发布轮核对：驾驶舱 studio.1→studio.2（identity-chat/执行内核 P0b-P1/技能存储合一/IDE 收窄等 custom 23 文件＋patches 17 文件实质变更，声明前进包不重发）、teams team.1→team.2（补丁 763-766＋runtime 技能存储＋acp-client P0b）、yuan v2.100.2→v2.100.3（技能根统一批收编＋门禁注释修正）、整体包 1.0.14→1.0.15；zcode/ycode 行持平（3.17.2，活跃补丁 9）。同批清偿 identity-chat 批2 守门债（K19 双棘轮＋raci 白名单，spec 2026-11-10-identity-chat-matrix-batch2 域内）。
2026-11-17 run31 方案同步批核对：studio 行随基线升 v0.8.21（312425cca，2026-11-13 双升级批）、zcode/ycode 行随同步升 3.18.2（fec97590，同批；**VENDOR.md zcode 表行当批被 merge 撤出漏入**——b8b6202c0 第三次清偿只救回 studio 行，本批随 VENDOR_SYNC=1 第四次清偿补 zcode 行）、驾驶舱/teams/yuan/整体包四行随 v1.0.16 发布轮进位（0.8.20-studio.3／v0.23.1-team.3／v2.100.4／1.0.16-overlay，载体 RELEASE-NOTES/team/VERSION/CHANGELOG/package.json 实测）；agent 行持平 v0.23.1。此前核实日停在 2026-11-09，本批清偿设计导读先行于总账本体的漂移。
2026-11-23 台账最新版与兼容升级批核对：studio 行随基线升 v0.8.30（8a51d1bcf，v0.8.28→v0.8.30 为 16 提交/117 文件，5 枚补丁适配、clean+inject 510/510 零失败幂等二连）、驾驶舱行随底座换血归 0.8.30-studio.1（扩展序归 1，声明前进包不重发）；agent/zcode/ycode/teams 行持平（v0.23.3／3.18.2 @fec97590／v2.103.0／v0.23.3-team.2）。Ycode 宿主 RPC 复制面同批同步 fec97590（旧 pin 872ad96 清偿，守门废除全文件豁免）。安装版快照 ZCode.app 3.19.1 属另账事实源，公开源码未发布，不入基线行。spec 2026-11-23-tech-ledger-latest-compat。
2026-11-26 全面复盘与发版批核对（spec `2026-11-26-release-v1.0.21-overlay.md`）：驾驶舱行同底座进 0.8.30-studio.3、整体源码包行进 1.0.21-overlay；hermes-agent 行已于 v0.23.4 换血批升 v0.23.4（agent teams 载体 v0.23.4-team.1）；studio／zcode／yuan 行持平（v0.8.30／4.0.0 @a4b44451／v2.103.0）。补丁在册由 510 增至 518（patches 504＋zcode 14）。回归矩阵全量档 23 面在 199a18ad1 首跑、标签提交 806ddd183 独立检出复跑同过（发版后加固与文档清偿见挂账台账 N36）。本表只汇总当前载体值，此前核对段保留其成文时点，不回写历史。
2026-11-23 ZCode 4.0.0 同步发版批核对：zcode/ycode 行随基线升 4.0.0（a4b44451＝tag v4.0.0＝上游 main 头，差量 2209 文件含未发布源码的 3.19.x 全部变更；补丁 11 条零退役，004/006/009/011 重做、其余原样应用；clean+inject 510/510 零失败幂等二连）、驾驶舱行同底座进 0.8.30-studio.2、整体源码包行进 1.0.20-overlay；studio/agent/teams 行持平（v0.8.30／v0.23.3／v0.23.3-team.2）。上一段「安装版另账」的口径自本批作废：上游源码已公开，本机安装版 4.0.0 与源码基线合一。Ycode 宿主 RPC 复制面同批同步 a4b44451。spec 2026-11-23-zcode-400-upgrade-release。
2026-11-09 培训刷新批核对（成文时点在同日台账刷新批之前，所记载体值为当时快照）：hermes-studio 基线维持 v0.8.17；v1.0.14 发布载体已将驾驶舱、agent teams、yuan skill 与整体源码包分别进位到 0.8.17-studio.2、v0.23.0-team.2、v2.100.1、1.0.14-overlay，Ycode 维持 3.17.2。本表只汇总当前载体值，此前核对段保留其成文时点，不回写历史。
Electron 桌面 runtime 另有独立钉版，不与 agent teams 模块版本互推。
桌面安装身份与产物名中的 SwarmStudio 属于兼容标识，
不改变主产品 AIStudio 的命名。

## D、不纳入总账的数字

以下数字随代码或运行变化，不再由本文维护：

- 补丁、路由、页签、端点、组件和 spec 数量。
- 测试文件、测试用例、通过与失败数量。
- 调研轮次、吸收批次和挂账数量。
- 单次推演的耗时、问题单和证据数量。

补丁数量从 `patches/series` 与 `zcode-patches/series` 计算。
文档数量从 `docs/superpowers/specs/` 计算。
测试结果以当次命令输出为准。
推演结果以对应 run 的证据和复盘档案为准。

## 维护规则

1. 同一数字只在权威载体定义，本表保留必要引用和口径说明。
2. 稳定参数变化时，同批变更设计依据、本文和守门测试。
3. 版本变化时，先更新版本载体，再更新本表核实值与核实日。
4. 动态实现计数不写入设计正文，也不追加到本表。
5. 缺少可靠来源时删除数字或标明未核实，不用旧值冒充现状。

2026-11-11 zcode 同步批核对：zcode 基线谱系行与 Ycode 模块行随基线升 3.18.0（b95ebaff，单 sync 提交 5099 文件，spec 2026-11-11-zcode-3180-sync-and-qwen-absorb）；补丁 002/006 重生成、010 直放、新增 011（Qwen Code 1.0 吸收：MCP inputSchema 参数名消毒＋调用回译），活跃补丁 9→10。studio/agent/驾驶舱/teams/yuan 行持平。

2026-11-11 同日收口修正（「完成未做」批）：bootstrap plugins.test **56/56 全绿**——同步批验证段初判「documents 两失败=上游存量债」系误判，真因=直跑 vitest 绕过 turbo 构建前置（test dependsOn build；office 族四插件＋node-repl-host/browser-use/zcode-site 产物缺位时 seed 完整性检查按设计拒发插件），补建后全绿；主检出引擎重建完成（pnpm install 刷新＋server 3.18.0 构建＋闭包补建）。基线行与版本值不受影响。
