# 三系统能力边界设计（hermes agent teams / SwarmStudio / swarm-yuan）

日期：2026-09-25
状态：已实施（治理批第一期落地 2 项，见 §5）；裁决经用户确认方向（Matrix 跨集群协作，见 §6-D2 关联）
受众：overlay 实施者与评审者、hermes 集群维护者
姊妹篇：《多机多用户分布式交付网络设计》（`2026-09-18-distributed-delivery-network-design.md`，下称"分布式设计"）

## 0. 三句话主旨

本机三套系统（hermes agent teams 运行时、SwarmStudio 桌面应用、swarm-yuan 技能生成器）与 overlay 二开层在多用户/多机协作场景下能力重叠、互踩事件频发（推演问题台账 10 项双写点、6 类干扰事件）。本设计按"每类数据一个写者、每类动作一个入口、每个维度一处立法"给出能力域归属终表与治理工单，配合分布式设计的"Matrix 传协调、git 传制品、本机管执行"三层事实源，构成集群协作的完整边界。读毕应能回答：某项能力归谁、某类数据谁写、发现新重叠时按什么裁决。

## 1. 裁决总表：四干系人 + 三层事实源

实际格局是 4 个干系人，不是 3 个（初版分析遗漏 overlay 编排运行时与 ekko-agent，见 §4 纠偏记录）：

| 干系人 | 定位 | 唯一写者的数据 | 明令禁止 |
|---|---|---|---|
| hermes-agent（Python 运行时） | 执行与协作数据平面 | kanban 板库、cron jobs.json、审批 allowlist、agent 记忆文件、gateway 房间事件 | 可视化界面；第二任务调度器（`kanban_swarm.py` 自觉声明） |
| SwarmStudio（含 ekko-agent） | 观察与人工驾驶平面 | studio 侧 UI 状态、approval rules.json（仅 IDE coding-agent 域，见 §3-E2）、运行监管（gateway 子进程 spawn） | 绕过 hermes CLI/内核直写板库与 jobs.json；与 gateway cron 双调度同一负载 |
| swarm-yuan（技能生成器） | 方法论与立法平面 | 项目认知资产（组件清单/关系边集/配方）、门禁规则（rules.d 三值） | 直接操作运行时；持有运行态数据 |
| overlay 二开层 | 集成与编排平面 | Loop 图引擎运行态、矩阵协议扩展（matrix-teams/delivery）、qgate 交付门禁 | 跨机编排直发消息（必须走协议事件）；第二任务库 |

三层事实源（分布式设计 §4，已由用户确认 D2）：Matrix 房间事件=跨集群协调唯一真值；git 中央仓=制品唯一真值；各机本地（kanban/cron/审批/留痕）=本机执行唯一真值。**禁止把本机数据面做成跨机共享**，跨机诉求一律翻译成协议事件。

## 2. 能力域归属终表

| 能力域 | 归属（写者） | 消费方 | 边界规则 |
|---|---|---|---|
| 任务状态（kanban 9 态） | hermes `kanban_db.py`（唯一序列化器） | studio 视图、harness、agent 工具 | studio 只经 `execHermes kanban` 中转（`kanban-service.ts:627` 合规）；禁止直写板库文件 |
| 调度（cron/heartbeat/goal） | hermes gateway tick（60s + 文件锁） | 各 profile | 一负载一登记处；studio loop cron 仅登记为 provider（工单 T3）；跨机工作由 owner orchestrator 派工，不存在共享 job |
| agent 编制名册 | `agent-roster.yaml`（hermes） | mx-setup fleet-manifest（派生） | fleet-manifest 派生自名册，禁止反向硬编码（工单 T5） |
| 审批-hermes 命令 | `command_allowlist`（`tools/approval.py`） | hermes agent 执行体 | — |
| 审批-IDE coding agent | `/api/approval` rules.json（`approval-store.ts`） | zcode/mimo 执行体 | 与上一行是**分域正确**而非缺陷（执行体不同）；localStorage 仅提示缓存非规则源 |
| 审批-跨机人工裁决 | Matrix HumanGate 事件（delivery 协议） | owner orchestrator | sender 必须人类账号；bot 冒人忽略并告警 |
| 跨集群协作消息 | matrix-teams/delivery 协议事件（协议单源） | 各机 agent bot | REST 直连限初始化（建群/邀人/派发摘要，`raci-matrix.ts`）；agent bot 只应答 mention |
| 事件真值 | 跨机=Matrix `$event_id`；本机=五套留痕各自明细 | 审计聚合 | 本机留痕（hosted_rooms/loop event-log/run-trace/kanban `_append_event`/approved.events）对外引用一律锚定 `$event_id`+git commit |
| 记忆三文件（MEMORY/USER/SOUL.md） | hermes memory 工具（agent 侧）；studio 编辑走原子写+`expected_mtime` CAS（patch 412） | 双方 | 冲突 409 拒写，不静默覆盖 |
| cron jobs.json | hermes cron CLI（唯一序列化器，patch 411） | gateway 调度器 | provider/model 一律 `cron create/edit --model/--provider`；base_url 无 CLI 面保留窄道直写（上游缺口 R1） |
| 项目认知资产 | swarm-yuan（`.swarm-yuan/` 每 checkout 一份） | 目标技能执勤 | 多机漂移是已知态；跨机同步走 git 制品层，不做运行态同步 |
| ekko-agent（studio 内置 TS 运行时） | studio 内嵌场景自治（自带 memory/审批仅自用） | studio 内嵌体验 | **不进入多 agent 协作面**：不入名册、不派单、不收发 task.assign/receipt（§6.1 裁决） |
| 调度负载登记 | 负载台账（`2026-09-25-scheduled-loads-registry.md`） | 全部定时负载 | 一负载一登记处；重复登记=双调度缺陷 |
| 治理注册表族 | overlay 仓库评审流（`runtime/governance/` 四份：capability-ledger/metrics/action-contracts/admission-checklist） | `/api/governance/*` 只读投影、治理中心视图、vitest 守门族 | 写者只有 git 评审流，不引入运行时写路径；GOVERNANCE_DIR 覆盖仅改读路径（spec《4A 治理层》§2 裁决 1） |
| 派发结果台账 | `dispatch-ledger.ts` appendDispatchOutcome（单一写者；两调用点=引擎单例 onOutcome+列编排执行半环） | `/api/governance/usage` 派发统计与消费关系 | append-only+fail-soft（台账故障不阻派发主链路）；CAP 2000 截尾原子写；GOVERNANCE_DISPATCH_LEDGER 覆盖 |

## 3. 双写台账（推演实测 + 代码核验）

| # | 目标数据 | 双写点 | 风险 | 处置 |
|---|---|---|---|---|
| E1 | cron/jobs.json | `jobs.ts writeJobs` vs hermes cronjob 工具 | 高 | **已修**：patch 411（provider/model 入 CLI + 原子写；base_url 窄道登记 R1） |
| E2 | 记忆三文件 | `memory.ts save` vs hermes memory 工具 | 高 | **已修**：patch 412（原子写 + mtime CAS，客户端接线） |
| E3 | config.yaml | `controllers/config.ts` vs `mx-lib.sh` 重生成 | 误判为高 | **伪重叠（2026-09-25 复核关闭）**：mx-lib 写的是 sim 独立数据根 `$HERMES_ROOT/config.yaml`（以真实 config 为只读源），与 studio 写的真实 `~/.hermes/config.yaml` 是不同文件；处置=头部归属声明（已落），T6 根治无对象 |
| E4 | 审批规则 | `command_allowlist` vs `approval/rules.json` | 误判为高 | **纠偏**：两平面分域（执行体不同），非缺陷；保持现状，见 §2 |
| E5 | 运行真值五套 | 五处事件日志无统一 eid | 高 | 裁决已定（§2 事件真值行），实现走协议扩展在途工作（工单 T4，避让 delivery-protocol v2） |
| E6 | Matrix 消息 | `raci-matrix.ts` REST vs 平台插件 vs `mx-scenario-lib.sh` | 中 | REST 限初始化+派发摘要（守门测试随 411/412 轮落地）；消息发布走协议（工单 T2） |
| E7 | kanban 任务创建 | UI/CLI vs `loop kanban-persistence.ts` | 中低 | 实测 loop 走同一 `kanban-service`→CLI，合规；保留"只 enqueue"约束（工单 T3） |
| E8 | 编制 | `agent-roster.yaml` vs fleet-manifest | 中 | 工单 T5 |
| E9 | 门禁 | swarm-yuan rules.d vs qgate | 中 | 分域（开发纪律 vs 交付门禁）；同次提交双拦属预期冗余，规则不重复立法 |

## 4. 纠偏记录（初版分析的四处错误，防再犯）

1. "studio 只读聚合"错：studio 对 kanban 读写双向（经 execHermes CLI）。单写者定义是**序列化器唯一**（hermes CLI/内核），不是调用方唯一。
2. "审批状态机唯一在 hermes"错：`approval-store.ts` 独立状态机存在，但与 `command_allowlist` 执行体不同，属分域正确；真正缺陷只剩 localStorage 命名易误导（已改注释定位为提示缓存）。
3. "全人工驱动"错：0:00 crontab 已删，但 gateway cron tick、kanban watcher daemon、RunSpawner 30s、daily-brief 自轮询均在跑。"自动化入口"清单见 §2 调度行。
4. "one-gateway-per-host 不可退"有口子：`standalone:true` shim 与 `--force` 存在，锁作用域实为 per-host-per-OS-user（`host_rendezvous.py:15-19`）。

## 5. 本期落地（治理批第一期）

1. patch 411-cron-jobs-single-writer.patch：`jobs.ts` provider/model 改走 `hermes cron create/edit` CLI；`writeJobs` tmp+rename 原子替换；base_url 窄道直写保留并登记。
2. patch 412-memory-atomic-cas.patch：`memory.ts` 原子写 + `expected_mtime` CAS（冲突 409 带 `current_mtime`）；`skills.ts`/`MemoryView.vue` 接线，保存失败自动重载。
3. raci-matrix REST 白名单守门测试 + 模块边界注释；`approval-store.ts`/`approvalLearning.ts`/`mx-lib.sh` 头部归属与分域声明。

第二期（同日，"完成所有"授权推进）：T1/T2/T3 主体/T5/T7/T8 完成、T4 部分（approved.events 双 eid）、T6 关闭（伪重叠）、R1/R2 根治（patch 450-453）——逐条状态见 §6；新增 task-protocol.ts 服务端协议镜像、调度负载登记台账、loop 板库边界守门、fleet-manifest roster 对账。

## 6. 缺口登记与待办工单

上游缺口（改 upstream 代码须走 patch；两条已于 2026-09-25 第二期根治）：

- R1 ✅ 已根治（patch 450/451）：`hermes cron create/edit` 补 `--base-url` 参数面（存储层本就支持），jobs.ts 直写窄道（patchJobFields/writeJobs）整体删除——jobs.json 单写者收口完成。
- R2 ✅ 已根治（patch 452/453）：`hermes memory set <section> --file <path> [--expect-mtime]` 子命令（原子写 + mtime CAS，冲突 exit 3），memory.ts 保存改走 CLI 单写者（双层 CAS 防 TOCTOU），不再直写记忆文件。runtime 分发已登记（overlay/runtime + runtime-manifest 4 文件，deploy-agent-runtime 同步）。

工单（按优先级，标注避让原因；2026-09-25 第二期收口状态见各条；P0/P1 完善批 2026-09-28 收口见 §8）：

- T1（高）✅ 已完成：REST 直连全量白名单守门（custom/server 扫 `_matrix/client/v3`、sim harness 扫 REST 封装）+ `com.swarmstudio.` 字面量唯一源守门。
- T2（高）✅ 已完成：`custom/server/matrix/task-protocol.ts` 服务端协议镜像（v1 稳定面）+ raci-dispatch 派发发 `task.assign` 协议事件（每 responsible 一发）+ 镜像对账守门（客户端常量漂移即 fail）；m.text 摘要降级为人读通知。**v2 四字段已接线（P1 批 2026-09-28）**：`parseRaciMeta` 提取 task body 顶层 parentId/phase/capability/dependsOn 透传 task.assign（此前镜像已同步、派发侧未用）。
- T3（中）✅ 完成（含 T3b，2026-09-25 第三期）：调度负载登记台账（`2026-09-25-scheduled-loads-registry.md`，13 负载全量盘点）+ CentralizedScheduler 退役头注（生产零接线，仅测试消费）+ loop 板库边界守门（kanban.db 仅只读投影可引用）。**T3b 桥接已实施**：`LOOP_SCHEDULER=cron` 时 RunSpawner 不启内部 interval，hermes cron no-agent 脚本（每分钟回调 `/api/loop/cron-bridge/tick`，token fail-closed + loopback 限源，patch 472）成为唯一 timer——spec 见 `2026-09-25-loop-cron-bridge-design.md`，默认关闭零行为变化。gateway 侧 cron provider 插件路线仍为非目标（spec §1）。
- T4（中）✅ 完成（含 T4b，2026-09-25 第三期；v2 镜像同步于第五期）：五处留痕的 eid 锚点约定全部落地——approved.events 双 eid（`<请求event_id> <回执event_id> <账号> <ts>`）；run-trace 四类 span 可选 `collab.event_id` 属性（payload.collab_event_id 透传）；loop graph_events 顶层 `matrix_event_id` 列（照 eid 先例 ALTER 容错，往返测试）；hosted_rooms `append_event` 可选 `collab_event_id`（并入 payload，patch 470）；kanban `_append_event` 可选 `collab_event_id`（patch 471）。约定：本机留痕对外引用一律锚定 Matrix `$event_id`+git commit。**协议 v2 收口后（45/45 守门绿）task-protocol.ts 服务端镜像已同步 v2 四可选字段（parentId/capability/phase/dependsOn），对账守门双侧校验。**
- T5（中）✅ 已完成（语义收窄）：fleet-manifest 嵌入 agent-roster.yaml 快照 + `extraRoles` 游离角色显式声明（冒烟实测）。原词"完全派生"经复核不可行——sim 编制是场景数据，从 9 角色目录派生会毁掉场景；对账防漂移即治理目标。
- T6（低）❌ 关闭：E3 复核为伪重叠（不同文件），根治无对象。
- T7（低）✅ 已裁决（§6.1）：ekko-agent 仅服务 studio 内嵌场景，不进入多 agent 协作面。
- T8（低）✅ 已成文（§6.2，2026-09-26 修订消解）：当前声明单机拓扑；初版三前置按 D2 全部消解，真实前置=入网 runbook+Synapse 可达+M3/M4 里程碑（M3 已于 2026-09-27 run14 收官：26 步+delivery 事件马拉松 exit 0，六 stage/六 gate/终态 P6 断言全过）。

## 6.1 T7 裁决：ekko-agent 定位（2026-09-25，随"完成所有"授权按推荐项定案，可推翻）

ekko-agent（SwarmStudio 内置 TypeScript 运行时）**仅服务 studio 内嵌场景**（studio 内嵌 agent 体验、JEV 记忆评估），**不进入多 agent 协作面**：不注册进 agent-roster、不占 kanban 派单、不接 task.assign/收 receipt、不参与 HumanGate 派工。理由：其自带 memory/delegation/approvals 全套协作件若入协作面，与 hermes 运行时构成第二套执行/记忆/审批平面，正是本设计要消除的重叠形态。过渡对照需要（如 Ycode P1 对照）只读观察，不写协作数据。若未来要让它入协作面，必须先经 §7 裁决流程走"消费 hermes 同一套 kanban/审批/记忆内核"改造。

## 6.2 T8 裁决：多机前置条件成文（2026-09-25）

当前拓扑声明为**单机拓扑**：单 gateway 多路复用（:8801）+ 单 studio（:8802）+ 单 Synapse。跨机只保证 Matrix 通信层协作（分布式设计 §4）。

**2026-09-25 修订（初版三前置按 D2 裁决全部消解）**：初版列的"板库共享/job 租约/身份映射"三前置，是在 D2（协作唯一事实源=Matrix 房间事件）尚未完全内化时写的，与已批准架构相悖，逐项裁决如下：

1. **板库共享——不需要**：D2 下跨机任务事实源是房间事件（delivery.case/stage/gate + task.assign/receipt），本机 kanban 只是本机执行态（节点自治）。"多机任务协作"不要求任何两机共享板库；SQLite no-distributed-locks 由此从障碍降为无关项。若未来出现"中央看板聚合"诉求，走只读投影（各机事件→聚合视图），不走共享库。
2. **跨机 job 租约——不需要**：跨机不设共享 job（分布式设计 §6：owner orchestrator 经 task.assign 派工，各机只跑本机 cron）。"多 gateway 重复触发"只在共享 root 时成立，节点自治下不存在。
3. **跨机身份映射——已有**：Matrix 账号即全局身份（agent bot `@<user>-agent` 命名约定 + HumanGate sender 校验）；`/p/<profile>/` Bearer 只是本机 API 面，不承担跨机身份。

**多机任务协作的真实前置（修订后）**：①各机按分布式设计 §8 runbook 入网（bootstrap→登 Matrix→clone 中央仓→冒烟）；②Synapse 全员可达（含 TLS/域名，M4 首项验证）；③六阶段编排面按 M1-M4 推进（协议 v2 已收口：45/45 守门绿，2026-09-25；M3 sim 第4轮与 M4 双真机为剩余里程碑）。

## 7. 风险与验证

- 本期改动验证：patch 经 `git apply --check` 可应用性 + overlay vitest 全量 + tsc；上游行为验证（cron CLI 回环、CAS 冲突路径）以单测与代码核验为主，未装机实测——如实登记。
- 并行开发碰撞：本期在共享树被并行会话切分支（main 又前进 2 提交），已按 worktree 隔离恢复；patch 编号 411/412 无撞车（核验过 series）。
- 新重叠裁决流程：先查 §2 归属终表→表内无项则按"数据写者唯一"裁→裁决入本文件 §4/§6 并编号。

## 8. P0/P1 完善批与 B 线根治（2026-09-28，复盘驱动）

复盘（真浏览器走查+run14 终局）驱动的两批完善，全部合入推送（dd3b1115→dc43926b）：

**P0 批（推演健壮性+面板状态）**
1. 单驱动锁：aipay-scenario.sh `mkdir` 原子锁（macOS 无 flock）+ 陈锁 pid 死检测接管 + EXIT 随退清理——双会话双开推演互踩（本会话实录最高频互踩源）的硬闸。
2. 凭证闸续跑键 `analysis_verified`：断点重跑先复验已成立凭证即秒过——run10 类"已完成态被要求重报"死循环根治。
3. 案例面板完成态：`completed = P6+G6 pass` 分色卡（绿边+透明+徽标）；网络读数新口径（completed 不计在途/待审——此前 6 个中断案例把待审人工门虚高到 6）；房间 ID 深链（ia2.commsRoom）。

**P1 批（实时性+总览+协议接线）**
4. 事件驱动实时刷新：store 挂 `Room.timeline`（review-center 同款模式），delivery.* 落房 500ms 去抖重投影；30s 盲轮询退役降为 60s 兜底。
5. 总览网络读数条：IaGlobalTop chip 流（在途/阶段分布/待审人工门/已完成），零在途零待审整条隐藏（零噪音），点击深链 /app/cases。浏览器实证：`In flight 7 · P2 6 P1 1 · Pending human gates 8 · Completed 1`。
6. raci-dispatch v2 接线（见 T2 增补）。

**B 线双根治（此前"绕开未根治"的两项）**
7. **B1（patch 477）studio kanban API 整板返空**：根因=Mux admin 自动建号（auth createFromMatrix）不写 user_profiles 行 → controller 空 visible Set 把整板滤光（此前误判 tenant 面）。修复：空映射集合不限制（admin 应见全部板）。活体 HTTP 验证随全量注入到位（当时被并行 490 补丁冲突挡在 mid-cycle）。
8. **B2（patch 478）gateway dispatcher "卡死"误报**：根因=预算闸（max_spawn/max_in_progress）与 per-profile cap 拒绝不进 describe_suppression——满载"忙"被误报"卡死"（N=600+ 告警零后缀）。修复：`budget_capped=(running,cap)` 遥信字段进 suppression；runtime 镜像 manifest 15 文件。活体 venv 单元证：`concurrency_capped(6/6)=1, per_profile_capped=2`。

**UI 完成标准（本批确立）**：浏览器可感知三层验法——构建产物 grep + HTTP 200 + 真浏览器登录走查（截屏入档）；后续所有 UI 交付照此收账。
