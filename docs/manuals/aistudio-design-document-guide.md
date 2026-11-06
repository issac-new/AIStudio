# AIStudio 设计文档导读

本导读写给讲师和文档维护者，帮助读者选择正确事实源、按稳定机制授课，并在正本、专题 spec 与实现不一致时作出可核对的表述。它不承担第二份设计正本的职责；系统结构以整合正本为准，实际行为以当前代码、配置、测试和真实运行证据为准。

- 快照基线：`30e975f32`。
- 当前版本：`1.0.13-overlay`。
- 核实日期：2026-11-06。
- 配套清单：[《AIStudio 设计文档机械索引》](aistudio-design-document-index.md)覆盖当前工作树 specs 根目录 594 份 Markdown 与 `archive/` 2 份 Markdown。该索引是动态快照，不代表全部文件都是现行依据。

## 1. 应该先读哪份，冲突时听谁的

先读[《设计文档导航》](../superpowers/specs/2026-10-21-ncwk-unified-product-design.md)确定文档角色，再读[《AIStudio 终态设计文档》](../DESIGN.md)理解稳定结构。终稿的标识是文件名本身：`docs/DESIGN.md`（固定名、不带日期）；`specs/` 下的同名旧文件只是旧址指针。其余带日期的 spec 是变更档案，不是设计稿；旧稿保留当时的自述，角色以现行导航为准。`docs/superpowers/specs/2026-10-21-ncwk-unified-product-design.md:3-4,40-56`

### 1.1 正本、附件与历史档案各承担什么职责

| 文档或目录 | 当前角色 | 讲师与维护者怎样使用 |
|---|---|---|
| [设计文档导航](../superpowers/specs/2026-10-21-ncwk-unified-product-design.md) | 角色导航，不保存第二份设计事实 | 先查现行、附件、历史三种角色；品牌冲突也按此处 AIStudio／SwarmStudio／NCWK 的层级处理 |
| [AIStudio 终态设计文档](../DESIGN.md) | 唯一整合设计正本（固定文件名 `docs/DESIGN.md`） | 讲理念、产品、架构、核心机制和工程边界；不把它当作逐轮变更史或测试总数账本 |
| [全流程推演方案](../superpowers/specs/2026-10-05-mux-v8-fullflow-plan.md) | 推演步骤、质量门、责任和运行判据的专题事实源 | 讲 26 步推演及其实施细节时使用；总体协作的 15 个编号消息不在这里展开 |
| [设计事实与容量基线](../superpowers/specs/2026-10-23-swarmstudio-design-ledger.md) | 数字附录，不是独立正本 | 查稳定参数与推演参考编制；版本表以核实日为准，当前值仍回到版本载体核对 |
| [附录 A](../superpowers/specs/2026-10-21-swarmstudio-appendix-a-spec-index.md) | specs 根目录的逐份人工摘要与角色分类 | 查单份文档主旨；计数随批次滚动，不能替代文件系统盘点 |
| [附录 B](../superpowers/specs/2026-10-21-swarmstudio-appendix-b-plans-research.md) | 55 份实施计划与 32 份研究／复盘的历史索引 | 查决策来路和事故背景，不把历史“已实施”直接当作当前仍有效 |
| [附录 C](../superpowers/specs/2026-10-21-swarmstudio-appendix-c-capability-corpus.md) | swarm-yuan 方法论、早期决策与研究索引 | 查能力层语料；当前数字改读 `skills/swarm-yuan/assets/facts.conf`，决策全文读技能根的设计演进正本 |
| [附录 D](../superpowers/specs/2026-10-21-swarmstudio-appendix-d-lessons-rules.md) | 历史根因、证伪假设、否决项和工作规则 | 用于风险讲解与复盘；否决项保留当时适用范围，不扩成跨领域永久禁令 |
| hermes 集群设计、上游架构与组件 ADR | 组件内部事实源和决策凭证 | 总体结构仍归整合正本，内部实现细节回到这些专题材料 |
| [产品交付团队培训手册](aistudio-training-and-user-guide.md) | 面向六团队的操作手册 | 产品需求、项目管理、研发、测试、运维、安全审计各有交付路径，不替代设计正本与实现证据 |
| [swarm-yuan 研发交付指南](aistudio-swarm-yuan-developer-guide.md) | 研发核心工具技能指南 | 项目技能生成、九节点、precheck、hooks、变异验证与真实 ACP 链 |
| [run25 推演案例](aistudio-run25-simulation-case.md) | 最新方案与真实报告的对照案例 | 讲解 26 步、六闸、G4-E、UAT、补流和未做项的时点与口径差异 |
| [设计文档机械索引](aistudio-design-document-index.md) | 当前文件名的机械覆盖清单 | 用于查漏和跳转，不用于判定现行性、批准状态或实施状态 |
| 旧 NCWK 正本、旧 SwarmStudio 完整设计、退役拼接册、`archive/` | 历史档案、历史证据库或兼容指针 | 只用于还原需求、决策与否决理由，不指导新实现 |

导航明确“附件不是第二套设计正文”，历史文件不再指导新实现。附录 B 的 55＋32、附录 C 的历史快照和附录 D 的根因数都有各自口径，不能拼成一个“当前文档总数”。`docs/superpowers/specs/2026-10-21-ncwk-unified-product-design.md:28-56`；`docs/superpowers/specs/2026-10-21-swarmstudio-appendix-b-plans-research.md:1-4`；`docs/superpowers/specs/2026-10-21-swarmstudio-appendix-c-capability-corpus.md:3-6`；`docs/superpowers/specs/2026-10-21-swarmstudio-appendix-d-lessons-rules.md:1-5`

### 1.2 事实冲突按什么顺序裁决

整合正本 §1.7 给出的顺序是：

1. 当前代码、配置、测试和真实运行证据决定实际行为。
2. 已冻结需求与有效 spec 决定设计意图和验收口径。
3. 整合正本汇总稳定设计，但不覆盖前两类事实源。
4. 组件内部实现由专题文档和 ADR 提供证据。
5. 旧设计稿只用于理解来路。

无法核实就写“未验证”，不能把“终态”解释为所有环境均已交付。`docs/DESIGN.md §1.7`

版本与发布还要加两条专用规则：模块、整体包、产物和安装方式以 `RELEASE-MANIFEST.json` 及各自版本载体为准；上游钉版以 `vendor/VENDOR.md` 的当前表格为准。数字总账是正本的汇总附录，不能反过来覆盖这些载体。`docs/DESIGN.md §5.5`；`vendor/VENDOR.md:5-15`

### 1.3 推荐阅读顺序是什么

共同路径如下，先建立角色和边界，再进入专题细节：

1. 读 `docs/README.md` 与设计导航，分清现行入口、附件、报告和归档。
2. 读整合正本第 1—2 章，掌握五组件、设计原则、三模式、产品边界和文档冲突顺序。
3. 读第 3—4 章，掌握分层与组件职责、交付机制、证据、主动性和数据契约。
4. 读第 5—6 章，掌握注入、命令行契约、发布、使用、验证分层与开放问题。
5. 按课程主题读全流程推演方案、G5/UAT、HumanGate、主动性、工具策略等专题 spec，并回读本导读第 4 章的当前差异。
6. 最后查 `RELEASE-MANIFEST.json`、`vendor/VENDOR.md` 和机械索引，核对当前版本与文件覆盖；附录 B-D 只按需追溯历史。

角色重点与正本 §6.2 一致：主管与产品读第 1—2 章与 §3.9；架构与研发读第 3—5 章；测试与安全读 §2.5、§4.4、§4.9；运维与审计读 §3.9、§4.5—4.6、第 6 章。讲师另需读培训手册的环境依赖和完成判据，不能把页面打开或模拟审批当成功能验证。`docs/DESIGN.md §6.2`；`docs/manuals/aistudio-training-and-user-guide.md:13-50,832-903`

## 2. 稳定设计机制应该怎样讲

### 2.1 五组件与三模式分别解决什么问题

五个运行时组件是 AIStudio 驾驶舱、Matrix、hermes agent、Ycode 和 swarm-yuan。驾驶舱承接人的全景与审批，Matrix 传递协作消息，hermes agent 运行智能体团队，Ycode 执行任务导向编码，swarm-yuan 从目标仓库生成项目技能。它们服务分布式需求分析、研发协作、实施交付和测试验证四条主线。Matrix 是外部基础设施，不是本项目的独立发布模块，因此“五组件”不等于“五个发布包”。`docs/DESIGN.md §1.1、§3.5`

| 工作模式 | 入口 | 核心用途 | 必须讲清的边界 |
|---|---|---|---|
| 日常工作台 | `/app` | 组织、需求、设计、协作、审批、验收与治理 | 页面从权威来源取数，写操作回到权威来源，不另建任务真值 |
| IDE 工作区 | `/app/ide` | 围绕任务编码、审查、运行命令和查看变更 | 任务锚不是聊天锚；电脑操作默认关闭，插件存在不等于获得授权 |
| 全流程推演 | `/app/sim` | 在独立运行根演练完整交付并保存证据 | 设计目标是隔离，但当前批量操作和注意力入口尚未完全排除 SIM 任务 |

模式切换改变工作视图，不改变对象真值；跨日常与推演链接必须标明目标环境。当前不能把推演称为已经完全隔离的安全沙箱。`docs/DESIGN.md §2.1、§2.4、§4.10`

### 2.2 “15 步”与“26 步”是不是矛盾

不是。它们描述两个层级。

总体协作顺序图有 15 个编号消息：第 1—6 步形成并下发任务，第 7—12 步提供技能并汇聚证据，第 13—15 步完成独立复审、状态回流和治理升级。Matrix 位于可选协作分支，跳过可选分支时编号不重排，也不是所有任务都必须经过 Matrix。`docs/DESIGN.md §3.1`

全流程推演主链另有 26 个步骤和六道质量门，由全流程推演方案定义。导演 run 与 26 步 run 分流，不能混用轮次。授课时应说“15 个总体协作消息”和“26 个推演步骤”，不要简称为两个互相竞争的“总流程”。`docs/DESIGN.md §2.5`；`docs/superpowers/specs/2026-10-23-swarmstudio-design-ledger.md:13-20`

### 2.3 看板、G5 与 UAT 各用什么状态机

**看板状态。** 当前默认工作流有八列，另有归档状态：`triage`、`todo`、`scheduled`、`ready`、`running`、`blocked`、`review`、`done`，以及 `archived`。`scheduled` 表示等待时间而非等待人，不可派发；`running` 由内核认领进入，`review` 和 `scheduled` 不是普通拖拽目标。手工迁移还要经过依赖、完成证据等动词门禁，不能只看状态名推断可执行。`runtime/hermes_cli/kanban_workflow.py:27-28,110-142`；`runtime/hermes_cli/kanban_db.py:4259-4285`

正本 §4.2 的概念表未列 `scheduled`，这是已确认的正本缺项，详见第 4 章。授课和界面讲解应采用当前默认工作流的完整集合，同时说明各板可以配置列门，机制存在不等于每块板都已启用。`docs/DESIGN.md §4.2`

**G5 发布门。** SIM 的 G5 采用 `draft → pending → approved → released` 主路径，`submit`、`approve`、`reject`、`release` 是动作，`rejected` 是另一终态。新记录追加到 `evidence/release-gate.jsonl`，非法迁移返回 409，同态重复动作幂等返回；旧台账允许直接批准及改判兼容读取。批准必须带证据锚，驳回必须写理由；启用鉴权后，批准、驳回和发布只开放给 `super_admin` 或 `release` 角色。`custom/server/governance/lifecycle/release-state.ts:17-19,49-58,75-101,139-191`；`custom/server/simcenter/simcenter-controller.ts:943-1019`

**UAT。** UAT 按验收标准逐条判定，不是一次整包按钮。每条 AC 有 `pending`、`pass`、`conditional`、`reject`；记录采用 append-only，最新判定胜出，历史完整保留。`conditional` 必须写说明，并二选一携带 `acknowledged:true`（真人认可）或 `pending:true`（机器评估待认可），两者互斥；`reject` 必须写理由并阻断该 AC。`custom/server/governance/lifecycle/uat-state.ts:6-15,69-111,114-151`

看板 `done`、UAT 通过和 G5 批准是三件不同事实。任务完成不替代用户验收，用户验收也不替代发布授权；发布类任务还要经过实施后观察窗。`docs/DESIGN.md §4.2、§4.5`

### 2.4 G1—G6 与 UAT 在交付链中怎样衔接

| 质量门 | 核心判断 | 讲师应强调的误判防线 |
|---|---|---|
| G1 需求冻结 | 范围、验收标准、非目标和敏感面 | 建过任务卡或聊过需求不等于冻结 |
| G2 架构评审 | 设计、影响面、备选方案和验证计划 | 有文档不等于评审通过 |
| G3 编码门禁 | 实现来自批准设计，并带任务与测试证据 | 日志存在不等于执行成功，完成声明要回到双凭证 |
| G4 独立测试 | 测试独立，缺陷修复并复验 | 开发自测不能替代独立验证 |
| G5 发布准出 | 发布证据、人工授权和回滚条件 | 三条取证线只取证，终判走单一出口 |
| G6 复盘 | 问题、行动项与经验回到治理系统 | 报告写完不等于经验已进入下一轮准入 |

质量门失败的准出只有“登记修复单、完成真修复、复审通过”这一条出口。非准出检查项可以按规则豁免，准出门失败、证据不足或存在反证不得豁免。G5 与 UAT 使用独立 append-only 台账，不修改 run-state 闸键；每轮证据只能属于该轮。`docs/DESIGN.md §2.5、§4.4`

UAT 不是 G5 的同义状态。G5 关注是否获准发布，UAT 关注验收标准是否被用户接受；二者可以相互提供证据，但不能互相代替。

### 2.5 HumanGate 与各种“严格模式”怎样区分

HumanGate 把发布或任务的人审请求放进审批收件箱，使批准可以先于最终评判决词发起，解除“评审等批准、批准等评审”的环形依赖。权威状态保存在 HumanGate store，审计日志和 `HUMAN_GATE_EVENTS` 是投影；投影失败会返回 warning，不回滚已经持久化的决定。任务授权还绑定任务修订、层级、选择、有效期和策略版本，避免拿旧批准执行新内容。`docs/superpowers/specs/2026-10-22-owner-nudge-and-humangate.md:18-34`；`custom/server/approval-inbox/human-gate.ts:77-102,323-379`

“严格”不是一个全局开关。当前至少有四类独立语义：

| 开关或姿态 | 当前行为 | 缺省行为与授课边界 |
|---|---|---|
| `HUMAN_GATE_DECIDER_ROLES` | 配置后，裁决角色不在白名单即拒绝 | 未配置时不做角色白名单校验；不要沿用旧 spec 中“默认 admin,super_admin,local_operator”的说法 |
| `HUMAN_GATE_REQUIRE_HUMAN_DECIDER=1` | 注册人与裁决人相同则拒绝自批 | 缺省允许同主体代批，但标为 `delegated`；只有不同主体才记为 `human` 并签发 `explicit` 强度 |
| SIM `posture=strict` | G5 驱动等待 HumanGate `status=approved` 或对应批准事件，默认等待 900 秒；超时不置 `g5_ready` | 缺省是 `standard`。standard/demo 可由驱动代批，但 actor 写 `director-proxy` 并记问题单，不计真人净额。当前产品回读只看 approved／decidedBy，不检查 deciderMode，所以 SIM strict 本身不等于已强制第二名真人 |
| `ORCHESTRATOR_STRICT_POLICY=1` | 策略版本不匹配时拒绝旧授权 | 缺省放行并警告，用于兼容存量凭证；它与 HumanGate 自批拒绝不是同一件事 |

前两项的代码锚点是 `custom/server/approval-inbox/human-gate.ts:295-314`，旧 spec 对照见 `docs/superpowers/specs/2026-10-31-superagent-domain-auth.md:43-48,68-74`。SIM G5 双态见 `docs/superpowers/specs/2026-10-26-g3-g5-hard-gates.md:7-13` 与 `simharness/aipay-scenario.sh:2060-2107`。策略版本边界见 `custom/server/approval-inbox/decision-grant.ts:154-164`。

HumanGate store 还有历史兼容边界：可识别的旧版裸 grant 行会升级为请求信封并归一化回写，grant 内容不重算；无法识别的形状继续 fail-closed，不能猜成空审批。`custom/server/approval-inbox/human-gate.ts:123-190`

### 2.6 证据五档怎样决定结论强度

| 档位 | 分数上限 | 能支持的结论 |
|---|---:|---|
| missing / unobserved | 59 | 没有证据或未观测，不得交付 |
| present | 74 | 只能说明资产存在，不能宣称可用 |
| wired | 84 | 已接入工作流，但未证明真实用过 |
| exercised | 94 | 真实用过并留下本轮结果 |
| outcome-supported | 100 | 有后续结果支撑，可以支持效果结论 |

退出码、阈值和证据档位回答不同问题，不能互相替代。零用例是空跑，不确定不是通过，未执行不是零问题。证据自评不高于 74 分不得交付；只有自产自验时，即使达到 exercised，也要补独立来源。研发完成声明还必须同时携带提交号与任务卡号，报告文字不能替代双凭证。`docs/DESIGN.md §4.4`

### 2.7 主动性为什么不能只看“自治等级”

当前设计同时看三组约束：

1. T1／T2／T3 决定评审强度与责任层级。T1 是常规自动化，T2 由人拍板，T3 涉及重大后果并需要执行前人审。
2. 主动性两轴决定能否越过指令继续行动。横轴是 L1 指令、L2 时间规则、L3 事件触发、L4 目标差距、L5 推断目标；纵轴是告知、建议、起草待确认、可逆执行、不可逆对外执行。L5 只能告知，L4 没有目标与验收契约只能起草。
3. 失败代价按能否撤回、影响到谁、结果能否验证压低执行上限。高风险动作还要叠加 staged 提案与人工确认。

三者取最严，高自主性不能绕过 T3，低风险 T1 也不能绕过目标未确认。长期目标默认超过 7 天未复核时压回起草，目标漂移不能由单次审批豁免。当前主动性执法门默认关闭，页面能演算不等于执行链已拦截。`docs/DESIGN.md §4.8、§6.4`

### 2.8 部署与发布怎样保持单一事实源

运行拓扑的目标与默认收敛形态是每个运行节点一个 hermes gateway，复用该节点多个 profile。多机通过受控 peer API、Matrix 和 Git 制品协作，不设全网唯一中央网关，也不允许产品功能绕过本机 gateway 另起执行链。`docs/DESIGN.md §4.2`

代码改造分两类：A 类只新增 `custom/`、注册表或配置；B 类改变上游行为，必须进入补丁序列。`vendor/` 的 git 跟踪内容保持 pristine，注入后的脏态是构建结果，不是新基线。hermes-studio 补丁应用失败会中止，hermes-agent 与 Ycode 补丁应用失败可以告警跳过，series 登记文件缺失仍会中止；`appliedPatches` 清单不是逐补丁成功凭证。`docs/DESIGN.md §5.1`；`vendor/VENDOR.md:1-15`

交付部署按四步走：检查准入资料和回滚，技术评审与运维评审独立投票，按批准路径实施，进入观察窗并完成机械复验与回访。发布动作不等于任务可以立即收口。`docs/DESIGN.md §4.5`

日常开发与走查以浏览器 Web 版为主，Electron 是可选发布能力。单仓桌面构建须显式设置 `OVERLAY_UPSTREAM_ROOT` 指向仓内 `vendor/`，mac arm64 与 win x64 分别构建、安装和启动验收；未做逐平台验收就保持未验证。`docs/DESIGN.md §5.5、§6.1`

### 2.9 安全边界应该怎样讲才不夸大

严格策略覆盖的高风险执行面采用 fail-closed：权限缺失、策略加载失败、路径越界或必要配置缺席时拒绝。当前工具执法总闸和 strict 均为显式配置，默认仍存在观察与 fail-open 区域，因此不能说“全系统默认失败即关闭”。只读聚合采用 fail-soft，但必须明确源缺席和受影响范围，不能把缺源显示成零待办。`docs/DESIGN.md §4.9、§4.10`

其余必讲边界如下：

- IDE 会话默认关闭电脑操作，实际执行还受会话环境、broker 凭据和操作系统权限约束。
- 密钥只通过受管环境或凭据通道提供，审计不保存敏感原值；输入校验和路径穿越防护属于端点硬边界。
- 用户、任务、身份和会话按授权边界隔离，跨用户或跨租户不得交叉可读，隔离由服务端强制而非界面隐藏。
- 模型、MCP、技能和知识库需要来源检查与准入控制；技能注册扫描、执行拦截和输出审核分别留痕。
- 紧急处置必须留下 `[BREAK-GLASS]` 记录，不能拿紧急通道当作常设绕行路径。
- SIM 批量操作和注意力入口的隔离缺口尚未闭合，不能用“独立运行根”替代全入口审查。

`docs/DESIGN.md §2.4、§2.6、§4.4、§4.9、§4.10、§6.4`

## 3. 当前版本与两件发布资产怎样核对

### 3.1 当前版本以哪些载体为准

| 对象 | 当前值 | 权威载体 |
|---|---|---|
| 整体源码包 | `1.0.13-overlay`，tag `v1.0.13-overlay` | `RELEASE-MANIFEST.json` 的 `packaging.fullPackage`，仓根 `package.json`／`package-lock.json` 同步 |
| 驾驶舱模块声明 | `1.0.9-studio.12` | `RELEASE-MANIFEST.json` 与 `RELEASE-NOTES.md` 版本节首行 |
| agent teams | `v0.23.0-team.1` | `team/VERSION`，机器载体 `team/version.json` |
| Ycode | `3.17.2` | `vendor/zcode/package.json` |
| yuan skill | `v2.99.3` | `skills/swarm-yuan/CHANGELOG.md` |

这些值可直接在 `RELEASE-MANIFEST.json:18,47-66,68-101,109-115` 与 `RELEASE-NOTES.md:44-46` 对账。驾驶舱在 v1.0.13 轮随内容变化声明前进到 studio.12，但按两件资产政策不重发 cockpit 模块包；版本前进不等于该模块包已重新上传。

上游基线另看 `vendor/VENDOR.md`：hermes-studio 为 v1.0.9、`dad736a93`；hermes-agent 为 v0.23.0、`2bd378ed1`；zcode 包版本为 3.17.2、`a9fe401e`。zcode 的谱系、包版本和补丁序列是三个口径，不互相推算。`vendor/VENDOR.md:5-15`

### 3.2 每版只发哪两件资产

当前两件主资产是：

1. `aistudio-full-1.0.13-overlay-src.tar.gz`。
2. `swarm-yuan-offline-v1.0.13-overlay-everything.zip`。

两件主资产附配套 SHA256SUMS 校验件。GitHub Release 只挂这两件主资产；ModelScope 的 `aistudio/` 只替换 full 包，仓根放置 everything zip 与 `SHA256SUMS-v<版本>.txt`，旧版本保留。四模块源码包和 DMG/zip 构建物不再上传远端，也不再作为默认打包目标。`RELEASE-MANIFEST.json:104-134`；`docs/superpowers/specs/2026-11-03-release-asset-policy-twopackage.md:3-15`

默认 `npm run release:packages` 只打整体包；确需本地生成四模块加整体的 4+1 全量时，必须显式使用 `--all-modules`。模块边界和 `packageIncludes` 仍保留，用于发布检查与改动归属，不因上传面收窄而删除。`scripts/make-release-packages.mjs:38-50`；`docs/superpowers/specs/2026-11-03-release-asset-policy-twopackage.md:11-15`

## 4. 已发现的正本与实现差异怎样讲

以下不是让讲师自行改口径的清单，而是备课时的核对清单。表述顺序仍是先讲当前实现，再讲正本的稳定意图，最后把需要修订正本或补验证的事项标明。

### 4.1 日常 G5/UAT 与 SIM G5/UAT 是否共用一套页面和台账

不共用同一写入面。

- 日常 G5 面板读取 `workspace.dailyTasks` 中的 review／近期 done 任务，并嵌入发布类 `ApprovalPanel`；文件注释明确“推演 release-gate 台账回到全流程推演，不在日常页写入”。`custom/client/ia2/views/stage/DailyG5Panel.vue:1-2,17-23,30-47`
- 日常 UAT 面板只把 review 任务列为待判，动作回到任务卡或审批系统，不写推演 UAT 台账。`custom/client/ia2/views/stage/DailyUatPanel.vue:1-2,19-45`
- SIM G5/UAT 才按 run 读写 `runs/<run>/evidence/release-gate.jsonl` 与 `uat-verdicts.jsonl`，并套用上述状态机与权限。`custom/server/simcenter/simcenter-controller.ts:752-883,886-1019`

因此，不能用 SIM 的 G5/UAT 状态机截图证明日常任务已经验收，也不能把日常 `done` 当成 SIM UAT 或 G5 通过。正本把 G5 与 UAT 独立 append-only 作为稳定契约是对的，但讲解时必须补上日常与 SIM 两条产品入口的差别。`docs/DESIGN.md §2.5`

### 4.2 UAT 专题 spec 是否覆盖当前全部条件通过语义

没有完全覆盖。2026-10-21 的专题 spec 只写 `conditional = note + acknowledged:true`；当前实现已增加 `pending:true` 作为机器评估待认可路径，并要求与 `acknowledged` 互斥，聚合中另列 `pendingAck`。授课应以当前代码为准，不能说所有 conditional 都已获真人认可。`docs/superpowers/specs/2026-10-21-g5-uat-state-machine.md:21-31`；`custom/server/governance/lifecycle/uat-state.ts:32-51,69-111,133-150`

### 4.3 看板状态表少了什么

正本 §4.2 列了 triage、todo、ready、running、review、blocked、done／archived，漏掉 `scheduled`。当前默认工作流明确把 `scheduled` 放在 todo 与 ready 之间，且它不可派发，unblock 时才重新计算就绪状态。培训材料若只按正本表格讲，会让学员漏掉“等待时间”与“等待人”的区别。`docs/DESIGN.md §4.2`；`runtime/hermes_cli/kanban_workflow.py:114-142`；`runtime/hermes_cli/kanban_db.py:3951-3981,4259-4285`

### 4.4 HumanGate 严格模式是否默认拒绝自批并限制角色

不是。当前代码只有在 `HUMAN_GATE_REQUIRE_HUMAN_DECIDER=1` 时拒绝同主体自批；缺省允许代批并记录 `delegated`。角色白名单也只有显式配置 `HUMAN_GATE_DECIDER_ROLES` 后才生效。2026-10-31 spec 的变更范围表写“默认 admin,super_admin,local_operator”，与当前代码不一致，应按代码修订讲解。SIM strict、日常 HumanGate 严格和 orchestrator 策略版本严格是三个不同面，不能合并成一个“已开启严格模式”的结论。`docs/superpowers/specs/2026-10-31-superagent-domain-auth.md:43-48,68-74`；`custom/server/approval-inbox/human-gate.ts:295-314`

还要特别注意，SIM `posture=strict` 不会自动设置上述产品变量。当前 G5 产品回读只筛选 `status=="approved"` 并取 `decidedBy`，没有检查 `deciderMode`；因此“等待到批准”不必然证明“第二名真人已批准”。需要第二人硬保证时，应同时开启产品 HumanGate 自批拒绝并核对裁决主体与 store，而不是只看 SIM 姿态名。`simharness/aipay-scenario.sh:2064-2088`；`custom/server/approval-inbox/human-gate.ts:306-314`

### 4.5 旧版本注记哪些已经不能当作当前值

2026-11-06 结构重排批已把三处旧值修齐，当前不再需要主动避开：

1. 数字总账 §C 全表随载体对齐（hermes-studio v1.0.9／hermes-agent v0.23.0／zcode 3.17.2／驾驶舱 studio.12／agent teams v0.23.0-team.1／yuan v2.99.3／整体包 1.0.13-overlay），核实日 2026-11-06。`docs/superpowers/specs/2026-10-23-swarmstudio-design-ledger.md:67-90`
2. 整合正本 §5.4 已把 2026-10-31 起的升级长注记收敛为「升级规则＋当前基线表」，历史来路归 git 与对应 spec；当前钉版以 `vendor/VENDOR.md` 为准。`docs/DESIGN.md §5.4`；`vendor/VENDOR.md:7,13`
3. `RELEASE-MANIFEST.json` 的 cockpit notes 与 `vendorBaseline` 摘要已更正为 hermes-studio v1.0.9。维护时应保留这项修正，不要从旧报告把旧值复制回来。`RELEASE-MANIFEST.json:45,134`；`vendor/VENDOR.md:7-13`

历史报告与历史 spec 中仍会出现成文时点的旧值（v0.8.0、studio.1、team.1、v2.95.0、1.0.0-overlay、zcode 3.17.1）。识别规则是：版本一律以当前载体与 VENDOR 表格为准，文档里的版本只代表其成文时点，不能当作现行值。

### 4.6 发布文字的历史口径怎样处理

整合正本 §5.5 已写入当前口径：默认 `release:packages` 只打整体包，`--all-modules` 才是 4+1 逃生通道；对外只发整体包与 yuan everything 两件主资产，GitHub 与 ModelScope 双通道。`docs/DESIGN.md §5.5`；`scripts/make-release-packages.mjs:38-50`

`RELEASE-NOTES.md` 的历史条目保留其成文时的口径（含“只在本机构建留存”的早期说法），当前口径以发布清单与正本 §5.5 为准；维护时不要从历史条目恢复 local-only 或四模块包上传。`RELEASE-NOTES.md:40-45`；`RELEASE-MANIFEST.json:131-132`

### 4.7 附录计数为什么看起来互相矛盾

多数差异来自日期和分母，不应直接判为错误：

- 当前工作树根目录实际 594 份，附录 A 的 A.1 当前收 585 份专题设计／规格／决策，另有 9 份导航、正本、数字总账、A-D、合并地图与退役指针，合计同为 594；`archive/` 2 份另计。`docs/superpowers/specs/2026-10-21-swarmstudio-appendix-a-spec-index.md:1-4`；`docs/manuals/aistudio-design-document-index.md:5-11`
- 附录 B 的 55＋32 是 2026-10-23 历史计划与研究索引，不是 specs 根目录总数。`docs/superpowers/specs/2026-10-21-swarmstudio-appendix-b-plans-research.md:1-6,66-68`
- 附录 C.1 收 57 份方法论，C.2 的 51 是补入前的历史快照；当前数字应读 `facts.conf`，不能拿 51 当现行总数。`docs/superpowers/specs/2026-10-21-swarmstudio-appendix-c-capability-corpus.md:70-72,166-180`
- 附录 D.1 的 43 是运行与方案复盘根因条数，文件头的 21 是推演轮次数，两者不是同一分母。`docs/superpowers/specs/2026-10-21-swarmstudio-appendix-d-lessons-rules.md:1-5`

数字总账已经规定 spec 数、补丁数和测试数由工具或当次输出给出，不纳入滚动总账。新机械索引按这一原则提供文件级快照，但仍不替文档判定现行性。`docs/superpowers/specs/2026-10-23-swarmstudio-design-ledger.md:79-90`

### 4.8 哪些开放边界不能被讲成已交付

正本 §6.4 仍明确列出：SIM 批量与注意力入口未完全只读，ACP 编码前技能装载与真实回合未完整验证，桌面双平台未逐平台验收，长期记忆全链未验证，真实长任务与断点恢复未复验，真实多轮图运行未复验，主动性执法默认关闭，性能首载与聚合时延未在当前版本复测。另有四项 2026-11-06 新增边界：总监派发待 run28 首跑、黄金集门检活体判分未跑、帧二态待下一轮采集核验、跨轮指标需累计两轮后才启用判据。讲师应把这些作为环境依赖或待验证项，不用既有测试数量替代目标环境证据。`docs/DESIGN.md §6.4`

## 5. 文档维护者怎样守住后续一致性

1. **先判角色再改文档。** 稳定结构改整合正本，单项变更写带日期 spec，历史档案不改写来路。新 spec 必须包含“变更、决策记录、验证、设计文档影响”四段；触及正本或数字总账时声明 `DESIGN_SYNC: touched` 并同批兑现。
2. **当前行为先回读实现。** 状态、权限、默认开关和路由必须给当前 `file:line`，旧 spec 只用于解释设计意图。发现正本滞后时，不用新文档悄悄覆盖，应在对应 spec 记录差异并修订正本。
3. **版本先看载体。** 更新版本时先改版本载体，再核对发布清单、发布说明与总账；基线以 VENDOR 表格为准，不能复制旧摘要。
4. **文件覆盖按文件系统验收。** 新增、删除或移动 spec 后，同时更新附录 A 的人工摘要和机械索引的链接与计数。机械索引只证明“收进了”，不证明“仍现行”。
5. **讲师预演区分模拟与真人。** HumanGate 代批必须说明 delegated／director-proxy，严格模式要显式配置；没有第二名会签人、真实 ACP、多机或桌面环境时，对应课程保持未验证。
6. **每次发布复核旧口径。** 重点检查本导读第 4 章列出的状态表、日常／SIM 入口、严格模式、版本摘要、发布资产与附录分母，避免新事实与旧注记同时自称当前。
