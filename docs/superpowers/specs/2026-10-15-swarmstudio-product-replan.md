# SwarmStudio 产品功能重规划（驾驶舱＋推演引擎＋研发治理）

> **文档定位**：产品功能正本候选。依据＝方案正本 §1.5 产品范围声明（2026-10-15 用户裁定：推演程序是 SwarmStudio 产品能力的一环）。回答：按三件产品定位，SwarmStudio 应该有哪些功能模块、现在各在何处、按什么路线收敛到产品形态。
> **一句话产品定义**：SwarmStudio 是 AI 研发组织的「飞行模拟器＋驾驶舱」——用全流程推演验证组织能力，用研发治理保证交付质量，人在驾驶舱里指挥与把关。

## 一、三件产品与功能地图

| 产品件 | 含义 | 现状实存（带锚） |
|---|---|---|
| 驾驶舱 | 人机协同工作台：看板/沟通/审批收件箱/运行中心/IDE 画布/账户 | 已是产品：/app 双视图+六功能区、board 12 页签、inbox/runs/cases/eng/gov/accounts/history、bpa/ontology/eval/skillgov 工作台、custom/server 百余组件 |
| 推演引擎 | 全流程推演的执行与观测：场景编排、姿态体系、代偿台账、证据采集、报告链、监督面 | 引擎能力**已在产品者**：autosched 排期源（636）、orgloop 闸修复与受控合并（636）、humansim 审批模拟通道（631）、observability 运行状态端点（631）、dispatcher 健康+sleeping-workers 探针（634/635）；**仍在 harness 者**：26 步场景驱动（aipay-scenario.sh）、姿态旋钮与台账 CLI、帧采集链、报告生成器、监督器/哨兵/看守人、prelaunch 十六项 |
| 研发治理 | 质量与问责机制：六道关卡、问题单体系、代偿清偿门、审计、复盘 | **已在产品者**：approvals 审批体系、cluster-inspector 巡检、gov 治理页签、QGate 门禁（qgate 插件）；**仍在 harness 者**：六闸判据执行、问题单 100% 处置对账、清偿门、报告审计器 |

## 二、重规划后的产品功能架构

### P0 驾驶舱（既有，继续演进）

不重规划，维持六功能区与工作台扩展（BPA/本体/评测/技能治理按既路线）。

### P1 推演引擎（产品化的核心增量，四个模块）

**E1 场景编排（Scenario Engine）**
- 场景注册表：26 步主链、六闸序列、角色编制从 bash 脚本升级为产品内的场景定义（数据而非代码）；换需求单=换场景数据。
- 运行执行器：运行中心（/app/runs）从「展示运行」升级为「承载执行」——开轮/断点续跑/姿态声明（strict/standard/demo）作为产品运行参数。
- 环境装配：账号/看板/群/记忆库的搭台流程产品化（mx-up 语义进产品装机流程）。

**E2 证据链（Evidence Chain）**
- 证据库：帧、问题单、代偿台账、审批事件、监督 journal 统一进产品证据库（observability 端点扩展为 evidence API）；按轮次归档、按锚点反查。
- 报告服务：报告生成器（mx-report-gen）迁为产品「治理报告」功能——推演报告=产品输出物（姿态页/净额对账/监督实录/产品端点快照四新节已就位）。
- 采集策略：UI 帧拍摄位注册表（capture-plan）产品化为采集策略配置。

**E3 监督面（Supervision）**
- 检测：哨兵的真做判据/停滞检测进产品（sleeping-workers 探针已落，635）；dispatcher 健康（634）扩为运行健康面板（运行中心页签）。
- 观察编排：workflow 影子观察层（四角色+接棒员+journal）产品化为「推演监督」功能——每窗一跑的观察、研判、判词进产品监控面板。
- 自愈边界：监督器/看守人的进程自愈保留机械层（launchd 托底不产品化——保不死的归机器）。

**E4 治理回路（Governance Loops）**
- 闸工作流：闸 FAIL→派修→复审→放行的产品内状态机（orgloop 已落首版，636）。
- 清偿门：代偿台账 resolve/waive/check-clearance 从 CLI 升级为产品审批流（与 inbox 集成）。
- 问题单对账：100% 处置结论的产品化对账（gov 页签承载）。

## 三、收敛路线（harness 能力逐件迁产品面，bash 原件逐件退役）

| 阶段 | 内容 | 状态锚 |
|---|---|---|
| A 通道面 | PR-0~7：humansim/observability/orgloop/autosched+四 agent 补丁 | ✅ 已落（631-636，2026-10-15 部署） |
| B 证据与报告 | 证据库 API（observability→evidence）＋报告服务迁产品＋采集策略配置化 | 下一批（报告四新节已备好数据面） |
| C 场景与执行 | 场景注册表＋运行执行器＋prelaunch 产品化；驱动 bash 退化为薄壳（真机操作/帧采集触发） | C 是分水岭：完成后「开一轮推演」=SwarmStudio 一键功能 |
| D 监督与治理 | 哨兵检测进产品监控、清偿门进审批流、问题单对账进 gov | 与 C 并行可推 |

**退役判据**：一件能力在产品面有正身（带端点/界面/测试）且一轮全量推演经产品面走通，对应 bash 原件退役（先影子对照一轮再删）。

## 四、版本与缺陷体系统一

- 引擎版本与 studio 版本保持一致（harness 不再独立演进版本叙事；引擎缺陷=产品缺陷，进同一台账与清偿体系——branch_fresh 崩溃类按产品缺陷记账）。
- 推演方案正本（V8.x）与产品方案互引：方案条款变更同步本文件的功能地图。

## 五、合并一致性与避免分叉（2026-10-16 用户裁定：推演中心功能与代码同 SwarmStudio/hermes agent 尽可能合并，保持一致）

**铁律：一处实现，处处消费。**每项能力只允许一个实现正身（产品代码=studio custom 组件或 hermes-agent 模块）；驱动 bash、workflow 编排、UI、报告链一律是消费方（API/CLI 调用），不得出现第二份同语义实现。**发现双实现=产品缺陷**，进清偿门台账开单（与代偿同体系）。

### 单一事实源表（能力 → 唯一实现 → 消费方 → bash 原件处置）

| # | 能力 | 唯一实现（正身） | 消费方 | bash 原件处置 |
|---|---|---|---|---|
| 1 | 运行状态查询 | studio observability 端点（631，读 state.env/台账） | 驱动/workflow/推演中心 UI | mx-state-query.sh 降级为端点的 CLI 客户端（文件面留端点缺席时降级档） |
| 2 | 代偿台账 | 产品存储+API（orgloop 族扩展：list/resolve/waive/check-clearance） | prelaunch ⑯/报告/inbox 审批/工单员 | mx-compensation-ledger.sh 变 API 客户端；TSV 迁产品存储（迁移窗一次性搬） |
| 3 | 派发器健康 | hermes-agent dispatcher 模块（634 snapshot+报警） | 运行观测卡/哨兵/巡检 | 哨兵内联判活段退役，改调 635/634 CLI |
| 4 | 休眠/真做判据 | hermes-agent kanban_sleeping（635） | 哨兵/监督面板/mx-hb | 哨兵 _realwork_ts 内联副本退役（同语义第二份=分叉违例） |
| 5 | 闸工作流 | orgloop 闸修复状态机（636） | 驱动闸段（读状态不放行）/治理中心 UI | 驱动内闸判读逻辑逐步改为读 orgloop 状态 |
| 6 | 排期 | autosched schedule-generator（636） | 派发词生成/编排面 | 步 17 排期脚本段退役改调端点 |
| 7 | 审批模拟（人类角色动作） | humansim 通道（631，受控+审计） | 驱动全部人类角色发信 | 驱动内 14 处裸 curl/直调 synAPI 逐处替换 |
| 8 | 受控合并 | orgloop merge-run（636） | V8.30 兜底段/lead 合并面 | 兜底段 git 子壳退役改调端点 |
| 9 | 报告 | 产品治理报告服务（Phase B 迁 mx-report-gen） | 步 26/报告中心/多格式衍生 | mx-report-gen.py 迁 custom/server 后原位退役 |
| 10 | 帧采集 | 产品采集服务（capture 策略配置化） | 驱动步触发 | r18-frames.mjs 迁产品侧，capture-plan.env 变策略配置 |
| 11 | 场景编排 | 产品场景注册表+执行器（Phase C） | 推演中心/开轮 | aipay-scenario.sh 26 步主体退役，留真机操作薄壳（环境装配/进程守护） |

### 落地守卫

- 新能力一律先落产品面（overlay custom/hermes-agent 补丁），harness 只写消费代码——本表即 Phase B/C 的工单分解依据。
- 迁移窗内新旧并存时，**bash 侧只允许透传不允许重写语义**（透传=调端点/CLI；重写=分叉违例）。
- run20 在跑期间上述 bash 原件一律不动（活进程增量读取风险），统一在下轮开跑前的部署窗执行；执行顺序按表行号（1-4 低风险先行，5-8 中，9-11=Phase B/C 正件）。

## 六、不做什么

- 不把 launchd 机械看守产品化（保不死的归机器，产品只做「看得见」）。
- 不在产品内做第二套推演语义（26 步/六闸的单一事实源仍在方案正本，产品只是承载与执行）。
- 不追求无人值守全自动化（审批点永远有人——question 必须有人答是既定边界）。
