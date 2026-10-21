# NCWK 整体产品与设计正本

> 三域合一：SwarmStudio（产品面）× hermes agent teams（运行面）× swarm-yuan（能力层）
> 版本：2026-10-21 汇编 R1｜数字核实日：2026-10-21
> 上游基线：hermes-studio v0.7.38；hermes-agent v0.22.2；zcode 源码 3.16.1／安装版 3.16.2；swarm-yuan v2.88.1

## 0、怎么读这份文档

### 0.1 一页纸结论

这套系统不是三个产品，而是一套三层结构：人用什么、AI 怎么干、项目知识怎么长，各自有唯一载体，靠同一套证据纪律串起来。

| 层 | 载体 | 一句话职责 | 主要产物 |
|---|---|---|---|
| 产品面 | SwarmStudio（`overlay/` 注入 hermes-studio） | 人干活的驾驶舱：日常、推演、IDE 三模式 | 89 条路由、33 个阶段页签、382 条注入补丁 |
| 运行面 | hermes agent 运行时 + Matrix + kanban | AI 团队真正执行：编制、授权、派发、催办、审计 | 42 个 profile、28 块看板、审批与证据流 |
| 能力层 | swarm-yuan 生成的目标技能 | 把项目知识变成写代码前必须通过的约束 | 六段技能目录、56 个门禁、9 节点工作流 |

三条断言贯穿三层，任一层都可以拿它验收：

1. **证据先于声明**：完成=提交号+卡号双凭证；门禁、评审、发布都要可反查的锚。
2. **未配置不等于已治理**：inactive／partial／unavailable 如实标注，不拿“存在”冒充“生效”。
3. **只迁不删、只补不覆盖**：能力在归属面有正身才退役；技能供给、任务台账、决策记录只增不改。

三个数字先给结论：编制 15 人展开为 30 个 Matrix 账号、42 个 profile；SwarmStudio 累计 140 条用户决策；swarm-yuan 累计 50 条编号决策文本、56 个门禁。

### 0.2 与三份专题正本的关系

本档是**总纲与对账**，不是第四份细则。三域各自的细则正本如下，冲突时以专题正本为准，本档只保证索引正确、口径一致。

| 域 | 细则正本 | 本档承担 |
|---|---|---|
| 产品面 | `overlay/docs/superpowers/specs/2026-10-21-swarmstudio-complete-design.md`（约 175K，§0-§15+附录） | 摘要、跨域接线、总量对账 |
| 运行面 | 无单一正本：21 份 spec 分散在 `overlay/docs/superpowers/specs/`（团队、能力、供给、安全、编排） | **首次汇编为第 3 章**（本档新增价值） |
| 能力层 | `~/lab/Swarm-yuan/swarm-yuan/README.md`＋`docs/design-evolution.md`（决策正本）＋`assets/facts.conf`（数字真值） | 摘要与跨域接口 |

维护规则：细则改动写专题；产品形态、跨域接口、总量数字变动回写本档。两处同时写同一细节，视为双源违例。

### 0.3 三条阅读路径

- 做决策：§0.1 → §8 未闭环缺口 → §9 路线。先看风险再排优先级。
- 做维护：§5 三域接口 → §6 合并台账 → §7 验证账。接口与台账决定改动边界。
- 做审计：附录 D 数字总账 → 附录 B 端点地图 → 附录 C 文档索引 → 回各专题锚点。

### 0.4 阅读约定

- **三域固定名**：产品面＝SwarmStudio，运行面＝hermes agent teams，能力层＝swarm-yuan。全文只用这三个称谓，不再用“前中后台”“技能系统”等旧称。
- **锚点三档**：文件:行号、提交号、端点或组件名。无锚点的陈述视为推断，本档不写。
- **数字口径**：同一数字只在附录 D 定义一次。历史上出现过的多代口径（如用户决策 108／134／138／140 条、profile 47/49 与 49/50）在附录 D 并列并写明采纳哪一套。

---

## 1、系统定位

### 1.1 三句话

**产品面的目标是把“现状”变成一眼可读的画面。** 人不再在聊天框、终端、看板之间来回找，而是在一个驾驶舱里看到谁在干什么、卡在哪一步、证据在哪。

**运行面的目标是把“AI 干活”变成可编制、可授权、可追责的组织行为。** agent 不是聊天对象，是有岗位、有权限边界、有在途任务、有审计记录的团队成员。

**能力层的目标是把“项目知识”变成机器可执行的约束。** 组件在哪、依赖怎么连、这类任务该怎么拼，不靠人记，也不靠 AI 猜，写成清单、配方和门禁。

### 1.2 三层结构

三层之间是单向消费关系，不是并列的三个子系统。

```
产品面（人看与操作）
   │ 只读运行面数据：看板 / 审批 / 团队 / 运行态 / 证据
   ▼
运行面（AI 执行）
   │ 消费能力层产物：项目技能（约束、配方、门禁）
   ▼
能力层（知识生成）
```

| 维度 | 产品面 | 运行面 | 能力层 |
|---|---|---|---|
| 代码位置 | `overlay/custom/{client,server}`＋补丁 | `upstream/hermes-agent` 运行时＋Matrix | `~/lab/Swarm-yuan` 与安装态 `~/.zcode/skills/swarm-yuan` |
| 状态存储 | 读模型＋少量本地配置 | kanban SQLite、Matrix 房间、证据 JSONL | 目标项目内的 `.swarm-yuan/`、技能目录、门禁账 |
| 变化速度 | 周级（每轮 spec） | 日级（派发与执行） | 月级（版本与决策） |
| 权威判据 | 用户决策与走查 | 卡状态与证据 | facts.conf 与决策史 |

### 1.3 为什么是三层而不是三个产品

三条边界判据，用来判断一个新功能该放哪层：

1. **写入口唯一**：任务真值只在 kanban；技能只在能力层生成；UI 不建第二份任务表或第二份技能库。
2. **读模型不复制**：产品面通过端点读运行面，不在客户端存一份“影子数据”。团队、审批、看板、证据全部如此。
3. **不反向依赖**：能力层不知道产品面存在；运行面不引用 UI 组件；产品面可换皮而不动运行面。

违反任一条，就是历史事故的形态：双入口、双事实源、幽灵状态。§8 的缺口大多可归到这三类。

### 1.4 五条贯穿纪律

这五条不是理念，是每轮验收都能查的机械规则。

1. **证据先于声明**：双凭证（提交号+卡号）、四类锚点（事件 `$`／提交／卡 `t_`／房间 `!`）、append-only 台账。
2. **未配置不等于已治理**：策略未配置是 inactive、检测器缺数据显示 unavailable、静态能力标 partial。禁止“仪表盘显示已治理”。
3. **单一事实源**：manifest、阶段路径投影、工具契约、价目表、FIBO 正本，每个横切维度只有一处定义。
4. **执行面 fail-closed，读模型 fail-soft**：权限与沙箱边界拒绝优先；坏数据跳过并记名，不让一个坏文件拖垮整页。
5. **只增不改**：技能供给只补缺失、用户改过不覆盖；任务台账 append-only；决策记录保留被推翻的旧条并标注。

---

## 2、产品面：SwarmStudio

### 2.1 定位与要解决的三类问题

SwarmStudio 用**模式隔离 + 机制约束**解决三类问题：人找不到东西、推演与日常互相污染、完成声明不可信。三条断言与兑现方式（正本 §0.1）：

| 断言 | 兑现方式 | 复核入口 |
|---|---|---|
| 日常与推演共享能力，不共享导航与写入口 | 三模式切换、`/app/sim*` 独立导航域、`useDailyStageProgress` 只读看板、`domain-split` 结构守门 | 正本 §3／§5.5 |
| 一切“完成”都要证据 | 双凭证、四类锚点、append-only 台账、hash 链证据 | 正本 §5.2 |
| 判断权不交给执行者 | 六道质量门、FAIL 唯一出口、人工介入留痕、执行层 fail-closed | 正本 §5.3-§5.4 |

### 2.2 三模式信息架构

| 模式 | 入口 | 壳 | 侧栏 | 数据源 |
|---|---|---|---|---|
| 日常工作台 | `/app` | `IaShell` | 常用 5＋六阶段＋专题 4＋设置 | 看板／审批／Matrix／治理读模型 |
| IDE 工作区 | `/app/ide` | IDE 独立壳 | 任务栏／会话／文件／终端／审查／插件 | zcode 会话内核＋hermes 会话 |
| 全流程推演 | `/app/sim` | `IaShell` 推演侧栏 | 导演台／监督面板／运行监控／证据库／运行编排／推演设置 | 图运行时＋run-state＋journal＋证据 |

顶栏工作视图切换只改路由不改组件树；跨模式跳转必须显式标注“在推演中查看／回日常处理”。

### 2.3 日常：六阶段与治理域

六个阶段沿一次交付的时间轴排列：①搭台 → ②需求 → ③设计 → ④开发 → ⑤验收 → ⑥治理，共 33 个单层页签。页签级归属分三态：单阶段、多阶段、全程。

⑥治理八签承载运营记录与处置（发生了什么、要处理什么）；设置七域承载配置写入（改什么）。2026-10-21 用户裁定后，GovOverlay 七区退役，能力入口直达归属面，三治理面收敛为两面（spec `2026-10-21-governance-surface-closure.md`）。

### 2.4 全流程推演

26 步全流程＋六道质量门是运行面的执行协议在 UI 上的投影：

- G1 需求冻结 → G2 架构评审 → G3 编码门禁 → G4 独立测试 → G5 发布准出 → G6 复盘。
- 14 个人工介入点全部进审批收件箱，批准／打回留痕。
- 导演台（`/app/sim`）建真实看板任务并 3 秒轮询；导演 run 与 26 步 run 详情分流（`/app/sim/director` 走图运行时，26 步走原详情），不再静默跳转。
- G5/UAT 已建真状态机：G5 走 submit→approve/reject→release，事件落 `evidence/release-gate-events.jsonl`；UAT 按 AC 逐条判定，conditional/reject 必填理由。

**run22 在途**：2026-10-21 10:01 起跑，0.7.38 首轮，smoke 5/5 通过；收官后回填终态。

### 2.5 IDE 工作区

IDE 不是聊天页，是任务导向的工作区：双模式（编程／工作）、21 个页签、zcode 内核会话＋hermes 会话分流、模型与思考档双源对齐、CUA 完整回路。

2026-10-21 新增两条数据面能力：

- **本机 zcode 用量账本**（Phase 1）：只读消费 `~/.zcode/cli/db/db.sqlite` 的三张用量表（model/tool/turn），四端点（summary/sessions/rounds/tools），CLI 会话账单＋状态栏账本分区＋价目补录。实测 135,152 次模型调用、2,936 个会话。
- **会话内上下文趋势与构成**（Phase 2）：逐请求 token 为精确值（input+缓存写+缓存读），六类构成为估算，压缩事件 289 条；修掉侧栏注入模式下用量徽缺席的缺陷。

### 2.6 专题四岛

BPA／本体／评测／技能治理四个独立工作台。本体岛在 2026-10-21 完成 FIBO 全链：

- 单一事实源 `ontology-fibo.ts`：37 个概念、21 个对象属性、16 条公理；qgate 索引降为派生产物，逐字节守门。
- 官方参照：12 个 FIBO 域导航、4 个 EXMP 场景、逐条 RDF 来源链接、中英文窄屏适配。
- 活体导入幂等：37+21+16 三批，跨重启持久（53 类型）；运营页 `/fibo/ops`。

### 2.7 当前规模与验证

规模：

| 维度 | 数字 |
|---|---|
| 模式／阶段页签／推演入口／专题岛 | 3／33／6／4 |
| 路由 | 89 条 |
| 客户端一级目录／服务端域目录 | 19／约 140 |
| 注入补丁（studio／zcode） | 382／8 |
| M3 全量走查 | 65 个页面态 |
| 用户决策／调研吸收轮 | 140／27 |

验证：全量 vitest 5,574 通过／0 失败／8 跳过（10-21 用量账本轮）；0.7.38 净树全序列重放 310 个 studio 补丁全过、官方 inject 382 applied；构建 rc=0、verify-dist 通过。

---

## 3、运行面：hermes agent teams

本章是首次汇编，来源为 21 份分散 spec（团队、能力、供给、安全、编排），细则以各 spec 为准。

### 3.1 团队模型：15／30／42／28

团队是“编制表 + 账号 + 智能体配置”三层展开，不是一堆散装 agent：

| 维度 | 数字 | 含义 |
|---|---|---|
| 编制 | 15 人 | 主管／业务分析／产品／架构／研发×4／测试×2／安全／运维／审计 |
| Matrix 账号 | 30 个 | 每人一个人类账号＋一个 AI 助理账号 |
| 智能体配置 | 42 个 profile | 14 个调度器＋28 个执行 agent，共用一个网关 |
| 看板 | 28 块 | 每人 2 块独立看板（admin 不建板） |

角色来源单一：编制表定义岗位，`role-boundary-registry.json` 定义四维能力模板（analyst／dev／reviewer／tester／governance／generic），org 注册表承载账号级能力声明。任务责任一律以卡上的 assignee 为准，板只是视图。

协作基础设施是 Matrix：团队注册房管组织（账号树／值守／领导权），案例房管个案（阶段／门禁／阻塞），bot 只应答 mention，HumanGate 必须由人类账号发起。团队注册用 account_data `com.swarmstudio.registry` 存房间 ID，跨重载保持。

### 3.2 能力装配四层

四层各有唯一事实源，任何一层都不允许“未配置即已治理”。

| 层 | 机制 | 唯一事实源 |
|---|---|---|
| 委托 | 每个 profile 声明四维能力（交付物类型／VCS 范围／领域范围／集成权限）；边界用否定式合成，只收窄不提权 | org 注册表 `capabilities`＋`role-boundary-registry.json` |
| 身份裁决 | 身份 `toolAllowlist` ∧ 活跃委托白名单双检查；未登记身份不改变既有行为 | `~/.hermes-web-ui/agent-identity/identities.json` |
| 能力目录 | 每机上报“profile×角色×技能数”；聚合为舰队发现面 | 中央仓 `capability-reports/<machine>.json` |
| 技能供给 | 按 manifest 从主机全局库补缺失技能；只增不改、默认干跑、可回滚 | 中央 `_shared/skill-provisioning.json` |

2026-10-21 工具策略引擎在这条链上追加一层声明式策略：优先级 identity/sandbox/budget → policy → ladder/mode，硬边界永远先赢。strict 模式无命中即拒；策略加载失败 fail-closed；裁决与批单带 `policyRuleId`。同日 AGT 吸收轮续落六件：姿态对账、审计链防篡改、shadow agent 进程扫描发现、MCP 漂移检测、紧急停止、strict 姿态。

### 3.3 多机舰队

跨机纪律一句话：**Matrix 传协调、git 传制品、本机管执行，跨机零新增服务。**

- 中央仓 `~/lab/hermes-shared.git`（bare）＋`_shared` 挂 origin，承载 manifest、能力上报、技能与 profile 分发包。
- 每机每日 06:40 由 launchd／计划任务跑 `provision-pull.sh`：pull 中央仓 → 生成 `capability-reports/<host>.json` → 有差异则 commit+push；失败 fail-soft 保留上次态。
- 新鲜度阈值 48h（容忍一个周期失败＋一个周末）；`GET /api/skillgov/provision/fleet` 聚合，机器卡片可展开 profile 表。
- 单机多用户 Fleet：三实例共享一份应用与约 1.4G 运行时，每用户独立 HOME 沙箱，端口按 user_index 编址；三实例验收 45/45。
- 跨机进度：`[progress:event]` 进联邦 Matrix 房，60 秒心跳；`/api/progress/machines` 聚合；`machine.silent` 在“24h 有心跳但静默 >15min 且在途任务 >0”时报 warn。

### 3.4 编排与派发

派发已从“人发长指令”收敛为“图或流水线触发 + 契约定锚 + 催办升级 + 单点终判”。

- **图→卡→spawn**：图节点建卡（assignee／RACI／estimate_days／parents=图入边）→ 派发器 `hermes -p <profile> chat -q "work kanban task <id>"` → 轮询卡状态 → 完成信号。卡状态是唯一完成真值，图引擎不自己 spawn。
- **并行安全三条款**（DISPATCH_SAFETY）：独立 worktree 隔离／互不等待／做完即止不展开；沉在引擎常量里，一处改全局生效。
- **任务契约里程碑化**：开发 5 个途中位点、测试首个用例即 commit、报告首片先推；催办按契约说“缺什么+格式+单步指令”。
- **NUDGE 升级链**：卡死唤醒 → 真做验证账本 → 按 1→2→3 重催 → 3 次仍零交付建议换档案。
- **V8.33 持续流水线**：持续集成（单分支落地即触发域评审合并）、持续测试、持续交付、持续改进（派发词带上轮关注点）。
- **G5 并行评审**：三腿固定取证（集成真值／缺陷闭环／安全条件），各回一行，只取证不判，终判单源。
- 容量：并发上限 30（峰值实测 13 路）；阶段扇出 系分 4／编码 6／测试+集成 3。

### 3.5 安全边界

现状是“先预警、后阻断”，这是用户 2026-10-16 的裁定，不是遗漏。

- 安全检查 20 项：4 项不符合、15 项部分、1 项不适用，无一完全符合。三重症：宿主 profile 全挂全量工具集、文件系统无边界、run-trace 大面积零 span。
- 硬边界已生效：身份 allowlist ∧ 委托白名单（只能收窄）、opt-in 沙箱路径/域名、审批凭证 scope/expiresAt、执行面 fail-closed。
- 十项阻断挂起，逐项“数据阈值+人工复核”双条件、观察期至少 4 个完整周才提请。清单：审批档位显式化、toolsets 裁剪、执法门总闸、绑定地环、文件黑名单、稳定层红线、权限衰减、默认绑定值、服务账号切换、凭证轮换台账。
- 结构性事实：执法门是 studio server 进程内 TypeScript 钩子，agent teams 是 Python 子进程，hermes-agent 无 `HERMES_TOOL_ENFORCE` 消费点。teams 管控目前只能走配置与工具集，纳入执法面需在 Python 侧创建钩子，属独立立项。
- run-trace 空壳根因已定位：插件回调签名与核心 kwargs 约定不符，TypeError 被 fail-open 静默吞；已按“(ctx,payload)”签名修复。
- 告警落治理中心面板，不发 Matrix 群（用户裁定）；security 事件路由到 security 域；工具黑名单默认空集。

### 3.6 运行数据面

产品面消费的运行面数据只有这几类，逐类有唯一端点或文件：

| 数据 | 载体 | 消费方 |
|---|---|---|
| 任务与依赖 | kanban SQLite，`task_links` 按 id 分桶挂 parents/children | 看板、工作台、任务协同图、容量分析 |
| 审批 | `/api/approvals/*`＋`pending-summary` 单一契约 | 审批收件箱、工作台“待我出手” |
| 团队与组织 | Matrix 注册房＋`/api/governance/registry/org` | ①搭建组织/团队页签、团队管理面板 |
| 运行态与证据 | graph runs/specs、journal、`evidence/*.jsonl` | 推演四签、监督面板、证据库 |
| 技能与能力 | `/api/skillgov/provision/{report,manifest,apply,rollback,fleet}` | 技能治理岛、供给对账页签 |
| 安全与策略 | `/api/harness/*`、`/api/governance/tool-policies`、`/api/governance/secaudit/*` | ⑥治理、Harness 运行区 |

### 3.7 验证账

- Fleet 三实例验收 45/45；119 条房间消息；6 个房间成员。
- 技能供给对账：18 项测试通过；“一仓多角色按子目录装”闭环实测 rc=0。
- 能力上报首跑：`capability-reports/m5u.json`（50 profile），launchd kickstart exit 0 并自动推送。
- 15 个 AI 员工身份全部注册成功（此前宿主身份册仅 2 个）。
- 工具策略引擎：78/78＋362/362＋全量 5,572/0/8；浏览器走查覆盖未配置态、起步策略、strict 切换。

---

## 4、能力层：swarm-yuan

### 4.1 定位：生成器，不是技能市场

swarm-yuan 是一个生成器：对任意代码仓库跑一次，产出一个项目专属的研发能力技能（目标技能）。此后 AI 在该项目里写代码，先查组件、依赖和规矩，再动手。

它卖的不是可复用技能内容，而是“先懂项目、再写代码”的认知与约束生成流程。与技能市场的差别：技能市场分发别人写好的通用技能；swarm-yuan 按仓库现场生成专属技能。

失败分两类，工具分两件对应：不懂规矩 → 门禁（词法/结构模式）；想错逻辑 → 验证（真跑测试＋独立审查）。

### 4.2 八环链与三份实物

```
①认知项目结构与关系 → ②整理工程规范 → ③结合框架最佳实践与既有业务实现
→ ④形成组件库与拼装式开发模式 → ⑤吸收开发者实际研发习惯 → ⑥装配成目标技能
→ ⑦用目标技能完成日常研发/测试/验证/交付 → ⑧使用中按具体问题迭代成长 →（项目演进回①）
```

①的产出是三份可核验实物，这是整个能力层的地基：

- **组件库清单**：组件/接口/数据三类，两列表（路径 + 说明与约束）。
- **关系边集**：import 边＋声明式映射边＋AI 补语义边；字符串耦合（SQL 列名、消息端点、bean 名）单独设防。
- **配方**：业务功能清单＋高频任务拼装序列，每配方五要素（触发场景/前置查询/复用件/胶水/门禁与验证）。

### 4.3 目标技能六段目录与九节点工作流

目标技能是薄产物：`SKILL.md`＋`workflow`＋`references`＋`assets`＋门禁配置＋`scripts`；随发文件 92 个（lite 档 46 个）。

九节点开发工作流：①需求理解 → ②探查 → ③设计 spec → ④实施 plan → ⑤编码 → ⑥测试 → ⑦独立审查 → ⑧合入 → ⑨发布。每节点四要素：入口／参与方／门禁／产出物与调用追踪。

六阶段状态机与之映射：open=①②；design=③④；build=⑤；verify=⑥⑦；archive=⑧；operate=⑨。状态转移有守卫：build 需批准 spec，archive 需 verify pass 且证据非空；AI 自我声明不改变持久状态。

### 4.4 门禁四层纵深

写时、提交时、门禁时、状态机四种拦截，判据单一事实源 `scripts/spec-first-lib.sh`：

| 层 | 位置 | 机制 |
|---|---|---|
| L1 写时 | 宿主 hooks | 统一判据 `spec-first-bridge`，命中阻断（exit 2）；已实测 Claude Code／Codex／ZCode 三家，另 5 家已渲染未实测 |
| L2 提交时 | git pre-commit | `core.hooksPath`，与宿主无关；候选与批准正文都取实际暂存区 |
| L3 门禁时 | `check_spec_first` | 入核心门禁序列 |
| L4 流程准入 | 状态机 build 守卫 | 无批准 spec 不得进 build |

门禁本体 56 个：核心 11、架构 18、合规 19、advisory-only 6；标准档 29、全量档 50；闭合方程 56 = 50 + 6，50 = 29 + 19 + 2。三档 enforce（strict 21／warn 20／advisory 15 静态），四种结果（pass／fail／warn／skip），skip 明示跳过、不计 pass。advisory 门禁在子 shell 内把 fail/warn 重定义为纯 echo，永不进阻断计数。

### 4.5 自演进纪律

能力层能长期不膨胀，靠四条机械纪律：

1. **负向预算**：门禁总数 56 冻结、conf 变量 197/200；新增须等额删除。
2. **预算棘轮**：生成器侧档与分发面分离，分发面只保留消费面，由净化脚本裁剪。
3. **证据分级**：A=本机实测、B=官方一手、C=二手转述；C 级未经核实不得写入引用基线。
4. **决策史只增不改**：被推翻的旧决策保留并标状态；决策=选择+反选择都留痕。

概念也受预算约束：范式作为条件而非内容，概念落地要问责（未创建且未运行不得声称）。

### 4.6 数字与版本

- 版本：v2.0（R13 去抽象化）→ v2.79（mattpocock 27 技能）→ v2.86（图表能力）→ v2.88.1（最新发布）；当前仓库已推进到 R130（覆盖补齐＋CI 失明面轮），未发版。
- 决策：编号 1-49（8 号为建议表不构成决策；另 26.1/26.2 两个子决策），共 50 条决策文本。
- 结构化资产：特征卡 17（P0 6＋P1 11）；运行时整合 15；领域知识 32；框架规则集 81；references 51 份；research 98 份；reviews 1 份；spec 模板 25 节。
- 规模：门禁四脚本合计 8,694 行；上下文预算 614,400B；目标 SKILL.md 预算 11,264B；组件库清单预算 32,768B。
- 已知口径债：汇编稿写“39 条决策（9-47）”“research 97”，均为陈旧，以 facts.conf 与实测为准。

---

## 5、三域接口

### 5.1 五条契约

三域之间只有五条缝，任何新功能若跨越两域，必须落在其中一条上，否则就是私自搭线。

| # | 契约 | 上游 | 下游 |
|---|---|---|---|
| 1 | 技能供给链 | swarm-yuan 生成的目标技能 | profile／推演树 |
| 2 | 能力发现与委托 | 能力上报＋身份/委托双清单 | 派发器与执法门 |
| 3 | 任务与证据 | kanban 卡＋证据 JSONL | 产品面看板/审批/推演 |
| 4 | 治理与审批 | approvals／policy-decisions／reviewgov／secaudit | ⑥治理与审批收件箱 |
| 5 | 推演验证 | 图运行时＋26 步＋G5/UAT | 导演台、监督面板、证据库 |

### 5.2 技能供给链

一条链四个环节，期望源只有一个：

```
swarm-yuan 生成项目技能（如 aipaydev-dev）
   → simharness/skills/（推演装载清单）
   → 中央 manifest skill-provisioning.json（唯一期望源）
   → hermes profile install / skills install（git 分发包）
   → _shared/ops/provision-pull.sh（每日 06:40 多机同步）
```

关键纪律：

- manifest 匹配优先级：精确名 > 最长后缀 `*x` > 最长前缀 `x*` > `*`；缺失时报告 `source=builtin`，供给端点拒绝执行。
- 供给只补缺失、默认干跑、执行需 `confirm:true`、写台账、可回滚；用户改过的副本绝不覆盖。
- 两种 manifest 不可混淆：技能自带的 `skill-manifest.json` 是产物元数据（profile/industry/frameworks/evidence 计数）；`skill-provisioning.json` 是“角色→期望技能”的供给期望源。
- 扫描口径只数 `SKILL.md`、跟随符号链接、按真实目录去重。早期“中位 6 个技能”的误判正是手工数不跟随链接造成的；实测中位 296（范围 8-563），orchestrator 309。

### 5.3 能力发现与委托

- 每机每日生成 `capability-reports/<machine>.json`（单机约 340KB，含全量技能清单），commit+push 进中央仓；>48h 标 stale。
- 委托前查目录（把目录摘要注入委托词）尚未做，是明确挂账。
- 委托边界用否定式合成：任务要求 ∩ 未授权维度 → 自动注入“禁写/需转交”；委托只能收窄。
- 身份与委托双清单同时放行才放行；未登记身份沿用既有链，不追溯。

### 5.4 任务与证据

- 卡是唯一真值：assignee 填账号短名（不带域名后缀），填错则永远认领不到；板外 assignee 拒认领。
- 依赖用 `task_links`（DAG），`recompute_ready` 推进 ready；认领走 CAS。
- 完成双凭证：提交号＋卡号；报告类卡无锚定级 warn（治理类合法无锚占多数，告警不值钱=没有告警）。
- 证据四类锚点：事件 `$`、提交、卡 `t_`、房间 `!`。发布门与 UAT 判定 append-only。

### 5.5 治理与审批

- 审批单一契约 `GET /api/approvals/pending-summary`：`{total,command,review,enforce,byRisk,ts}`；客户端合并 orgloop 介入点与清偿计数。
- 裁决独立落 `policy-decisions` JSONL，带 `policyRuleId`，避免把每次工具裁决写进 govbus 冲掉真实安全事件。
- 评审治理：按改动内容分风险档、审批绑定 head commit、互审 ≤3 轮、24h 回滚率熔断、夜间扫描显式开关。
- 安全审计（2026-10-21 新增）：六阶段流水线——侦察地图 → 覆盖账本 → 覆盖引导狩猎 → 对抗性候选验证 → 结构化 findings（confirmed/needs_validation/rejected）→ 独立记录复核 → 目标中立报告。硬约束：自证拒绝 409，复核人≠发现人，记录哈希绑定。
- 评测判分纪律：S0 轨迹规则（必需工具／无死循环／冗余步上限），死循环按“同名同参”判定（新增 `argsSig` 参数指纹）。

### 5.6 推演验证

- 图运行时三态 `GRAPH_ENGINE=legacy/shadow/on`；事件日志 SQLite 是单一事实源；REST `/api/graph/{runs,specs}`＋`/graph` socket。
- 26 步与六闸由 harness 驱动；G6 键统一 `retro_done@步24`。
- 发布门与 UAT 事件独立 append-only，不改 run-state 闸键（闸键仍由 harness 判定）。
- 导演 run 与 26 步 run 分流：导演详情复用 `/api/graph/runs/:id`＋replay，不造第二份 run 视图。

### 5.7 接口清单

| 域 | 端点/文件 | 用途 |
|---|---|---|
| 供给 | `GET /api/skillgov/provision/report` | 每 profile 四列对账 |
| 供给 | `GET/PUT /api/skillgov/provision/manifest` | 唯一期望源读写 |
| 供给 | `POST /api/skillgov/provision/{apply,rollback}` | 执行/回滚（默认干跑） |
| 发现 | `GET /api/skillgov/provision/fleet` | 舰队能力聚合 |
| 组织 | `PUT /api/governance/registry/org`、`GET ...?expand=capabilities` | 账号能力声明与派发解析 |
| 策略 | `GET/PUT /api/governance/tool-policies`、`POST .../lint` | 声明式策略 |
| 审计 | `/api/governance/secaudit/*` | 六阶段安全审计 |
| 任务 | `/api/kanban/*`、`fetchKanbanOverview` | 看板与跨板聚合 |
| 审批 | `/api/approvals/*`、`/pending-summary` | 收件箱与汇总 |
| 推演 | `/api/graph/{runs,specs}`、`/api/hermes/sim/{release-gate-state,uat-verdict}` | 运行态与门 |
| 团队 | Matrix 注册房 `com.swarmstudio.registry` | 组织发现 |
| 进度 | `/api/progress/machines` | 跨机心跳聚合 |
| 用量 | `/api/ide/zcode-usage/{summary,sessions,rounds,tools,context}` | 本机 zcode 账本 |

---

## 6、合并台账

### 6.1 决策台账

三域决策体系形态不同，但纪律相同：选择与反选择都留痕，被推翻的旧条保留。

| 域 | 主键 | 总量 | 存储 |
|---|---|---|---|
| 产品面 | 用户决策总表 | 140 条（另常设原则 30、纠正 27） | 正本 §8.2 |
| 运行面 | spec 决策记录 | 144 条 / 21 份 spec | 各 spec「决策记录」节 |
| 能力层 | 编号决策 | 50 条决策文本（编号 1-49，8 号为建议表） | `docs/design-evolution.md` |

**跨域关键决策合并摘录（各域挑对全局形态有决定性影响的条目）：**

| 域 | 决策 | 影响 |
|---|---|---|
| 产品 | 三模式隔离：日常/推演共享能力不共享导航 | 决定整个 IA |
| 产品 | 治理面收敛为“⑥运营+设置配置”，GovOverlay 退役 | 三面收敛两面 |
| 产品 | 导演详情按 run 类型分流，不静默跳转 | 消除“点一个签到另一个签” |
| 产品 | G5/UAT 建真状态机，不造通用工作流引擎 | 治理门可执行 |
| 运行 | 协作单一事实源=Matrix 房间事件 | 不自建中央服务 |
| 运行 | 跨机零新增服务：Matrix 派活回执 + git 交付真值 | 多机可复制 |
| 运行 | 委托 scope 只认结构化工具列表，只能收窄 | 防提权 |
| 运行 | 沙箱 opt-in，未配置不拦截 | 不假装有沙箱 |
| 运行 | 安全整改先预警后阻断，十项挂起配数据阈值 | 不阻断现有用法 |
| 运行 | 策略是附加约束层，不能放宽既有硬边界 | 策略引擎三层优先级 |
| 运行 | DISPATCH_SAFETY 沉引擎常量 | 并行安全一处生效 |
| 能力 | 从内容驱动重构为两体系统（厚生成器+薄生成物） | 决定产品形态 |
| 能力 | 声称的机制必须能被创建且被运行 | 反“文档机制” |
| 能力 | 生成器侧档与分发面分离，分发只留消费面 | 根治预算棘轮 |
| 能力 | 未创建且未运行不得声称；概念落地问责 | 反概念膨胀 |
| 能力 | 证据分级 A/B/C，C 级不得进基线 | 反拼贴 |
| 能力 | 行为保持式拆分以逐字节 diff 为证据 | 拆分不靠“测试全绿” |
| 跨域 | 技能供给 manifest 为唯一期望源，只增不改 | 供给链纪律 |
| 跨域 | 能力目录走中央仓文件而非 Matrix 房 | 可 diff 可回滚 |
| 跨域 | 单一事实源优先于并行实现 | FIBO/价目/工具契约等 |

### 6.2 调研吸收台账

三域的调研吸收是同一套方法在不同层上的投影：先盘点差距，再做机制级吸收，最后用门禁与测试把吸收物固定下来。

- **产品面**：25 个吸收轮（从上游组件盘点到文章调研），最近三轮为工具策略引擎（微软 AGT）、zcode 用量账本（dsh-context）、安全审计+评测判分（Cloudflare/OpenAI 两文）。
- **运行面**：吸收集中在 harness 可靠性、身份/权限、并行编排三条线；最近为 AGT 续轮（姿态/审计链/shadow agent/MCP 漂移/急停/strict）。
- **能力层**：130 轮（R1-R130），98 份 research、1 份 review；最新为 R130 覆盖补齐与 CI 失明面。

吸收判据三域一致：内容与方法分离；只搬概念不拷受限代码；落不到消费面就不算吸收。

### 6.3 版本演进

三条线并行推进，节奏不同：

| 线 | 当前 | 关键节点 |
|---|---|---|
| 产品面 | overlay 0.7.30-overlay-2.38，上游 0.7.38 | 0.7.36→0.7.37→0.7.38 净树三段式；382 补丁 |
| 运行面 | hermes-agent v0.22.2；zcode 3.16.1/3.16.2 | 0.21.x→0.22.x 干跑断裂清单；zcode 基线逐版推进 |
| 能力层 | swarm-yuan v2.88.1（仓库 R130） | v2.0 两体系统→v2.79 运行时整合→v2.86 图表→v2.88.1 |

### 6.4 数字总账与口径裁决

完整数字见附录 D。此处只裁决历史上出现过的口径冲突：

| 项 | 旧口径 | 采纳口径 | 理由 |
|---|---|---|---|
| 用户决策条数 | 108／134／138 | **140** | 108 为研究代理合并计数；134 为 R2 表行实数；R3 +3、R4 +2 后表行 140 |
| profile 数 | 47／49 | **42 配置；宿主 49/50 可用；sim 45** | 三个不同口径：编制配置、宿主目录、推演树 |
| 决策记录份数 | 84 份 spec | **84（至 10-20）+20（10-21 业务 spec）=104** | 按日增量累加，不重算历史基数 |
| 技能中位 | 6 | **296（8-563）** | 手工数不跟随符号链接是误判根因 |
| swarm-yuan 决策数 | 39（9-47） | **50 条文本（1-49）** | 汇编稿陈旧 |
| swarm-yuan research 份数 | 97 | **98** | 目录实测 |
| 检测器数 | 15 | **31** | 10-21 实测 |

---

## 7、验证与验收

### 7.1 验证方式分层

三域验证形态不同，但都遵循“真实工具链先行”。

| 层 | 主验证 | 补充 |
|---|---|---|
| 产品面 | `npm test` 全量 + 定向守门 + 构建 rc=0 | 浏览器热更新走查（默认不装机） |
| 运行面 | 真实推演（run）+ 端点探针 + 卡状态对账 | 真机 fleet 验收 |
| 能力层 | 门禁自检 + fixture + CI + 真实项目全栈回归 | verifier 独立验证器 |

### 7.2 当前验证账

- 产品面：全量 5,574 通过／0 失败／8 跳过（10-21）；0.7.38 补丁净树重放 310/310 全过、inject 382 applied；M3 65 页走查；FIBO 逐字节守门＋活体导入幂等。安全审计域与评测纪律测试随分支落地。
- 运行面：fleet 45/45；供给对账 18 项；策略引擎 78/78＋362/362＋全量 5,572/0/8；能力上报首跑 exit 0。
- 能力层：56 门禁闭合；R130 为 8 个零覆盖脚本加行为锁；98 份 research、1 份 review 入档；真实项目回归覆盖 Java/FastAPI/NestJS 等栈。
- 跨域：run22 smoke 5/5；G2/G3/G4 已在途中过闸。

### 7.3 未验与环境性失败

- diagram-export×3：Playwright Chromium 版本缺口/CDN 下载失败。
- cua×5：0.7.38 zcode 树清理后转绿；新环境仍可能复现。
- tool-waterfall-gate×1：注入态 patch 顺序基线。
- IDE 超时：并发负载敏感，单跑通过。
- Matrix 分享房活体：本环境无凭据，未验。
- swarm-yuan 5 家宿主 L1：配置已渲染、未活体实证。
- swarm-yuan 外部效度：未达 verifier 阈值前不得宣称“守护代码合规”。

---

## 8、未闭环缺口

缺口按域分列，每条给影响与下一步。这是本档最该被逐项打勾的部分。

### 8.1 产品面

| # | 缺口 | 影响 | 下一步 |
|---|---|---|---|
| P1 | 约 3000 行死视图、10 个零引用组件未清 | 维护噪音、误读风险 | 按引用分析分批删除，先存档 |
| P2 | 工作台首载 3.8s（仅加 Suspense 骨架） | 体感慢 | 数据面预取与分片 |
| P3 | Matrix 分享房活体未验；gateway-env 回落仍 localhost | 分享链路未证 | 补凭据环境验证 |
| P4 | run22 step13 skill 过程帧无拍摄位；报告 PNG 未接 | 证据链缺口 | 定拍摄位与出图 |
| P5 | IDE 权限模式仍 localStorage；附件/截图未完全对标 | 配置可丢失 | 迁服务端配置 |
| P6 | `ia2.gov.*` 死词条未清 | i18n 冗余 | 随 i18n 批 |
| P7 | Harness² 六项未做（LLM Proposer/匿名选择器/成本账/显著性/沙箱探测/重启续跑） | 改进台能力不全 | 按价值排序 |

### 8.2 运行面

| # | 缺口 | 影响 | 下一步 |
|---|---|---|---|
| R1 | 安全阻断十项挂起（观察期≥4 周） | 边界靠配置纪律 | 逐项数据阈值+复核 |
| R2 | 执法门对 Python teams 结构性不可达（M3） | teams 无法被进程内执法 | 独立立项：Python 侧钩子 |
| R3 | 委托前自动查能力目录未做 | 派发靠人记 | 委托词注入目录摘要 |
| R4 | Matrix 目录房未上 | 规模大时文件不便 | 规模触发再上 |
| R5 | 技能缺口：内置清单 104 期望未装/53 全局无源；中央种子 274/182 | 供给不全 | 补全局库来源 |
| R6 | 事故十要素 5 项依赖 hermes telemetry | 事故报告不完整 | 上游补埋点 |
| R7 | 25 个 profile 挂 `acp`、2 个挂 `messaging`（无效工具集名） | 27 个 profile 工具面与声明不符 | 先改名再裁 toolsets |

### 8.3 能力层

| # | 缺口 | 影响 | 下一步 |
|---|---|---|---|
| C1 | 重构 WP10/11/13-15 未落地（golden e2e/安装硬化/能力编译/框架包/HMAC） | 分发与能力选择未闭环 | 按 WP 序排期 |
| C2 | R126 96 项发现：33 已修、63 待批 | 可靠性尾账 | 分批裁定 |
| C3 | enforce 分级 5 项待批（authz/reuse/crypto/sensitive/requirements） | 门禁强度未定 | 人工裁定 |
| C4 | 证据双态缺口 3 项豁免（期限 2026-12-31） | 证据链不完整 | 到期前补 |
| C5 | FACT 键执行面豁免 14 项 | 数字无消费方 | 逐项接线或删 |
| C6 | 5 家宿主 L1 配置未活体实证 | 写时拦截覆盖未证 | 逐家实测 |
| C7 | 口径债：决策数、research 数、LOC 注记、dist.tsv 与 facts 漂移 | 审计时误读 | 随下轮对齐 |
| C8 | `skill-manifest.json` 与 dist.tsv/facts 计数不同步 | 发布审计口径 | 生成时同步 |

### 8.4 跨域

| # | 缺口 | 影响 | 下一步 |
|---|---|---|---|
| X1 | 两个 manifest 名称相近、语义不同 | 易混用 | 本档 §5.2 已固定称谓；代码层可改名 |
| X2 | 能力目录未接委托、技能供给未接推演安装管线 | 供给链断一环 | 两处接线 |
| X3 | 价目表服务端/客户端双源 | 成本口径可能分叉 | 收敛为单一源 |
| X4 | 团队/组织数据面分散在 Matrix、org 注册表、roster、capability-reports | 对账需跨四处 | 创建统一视图（只读） |

---

## 9、路线

### 9.1 短期（一周内）

1. run22 收官：G5/UAT 状态机真实走一遍，报告与证据归档。
2. 安全观察期数据累积：十项阻断的阈值数据先跑起来，不急于切换。
3. 策略引擎收尾：outcome 检查（审计记结果不记尝试）补上。
4. 文档口径对齐：能力层三处陈旧数字（决策数/research/LOC）本轮修完。

### 9.2 中期（一月内）

1. 能力发现接委托：委托词生成时注入目录摘要，减少“人记谁有什么能力”。
2. M3 立项：Python 侧执法钩子，或明确“teams 永不走进程内执法”的边界声明。
3. 死视图清理与工作台首载优化：两项都直接改善日常体感。
4. 供给链补齐：把 53 个全局无源技能补进全局库或从 manifest 删除。

### 9.3 长期

1. 一键开轮：把驱动脚本退化为薄壳，推演在底层不稳定前不上线。
2. 自组织与代偿台账闭环：人工补位记净额，清偿门机械核验。
3. 经验回流：处置单关闭即回流回归库，默认开、可关、可回退。

---

## 附录 A：术语表（三域统一）

| 术语 | 定义 | 所属 |
|---|---|---|
| 三模式 | 日常工作台／IDE 工作区／全流程推演 | 产品面 |
| 六阶段 | 搭台/需求/设计/开发/验收/治理 | 产品面 |
| 专题四岛 | BPA／本体／评测／技能治理 | 产品面 |
| 双凭证 | 完成声明必须同时带提交号与卡号 | 跨域 |
| 四类锚点 | 事件 `$`／提交／卡 `t_`／房间 `!` | 跨域 |
| 编制表 | 15 人岗位与角色定义 | 运行面 |
| profile | 一份 agent 配置（SOUL/config/skills/cron/MCP） | 运行面 |
| 认领围栏 | 板级白名单，板外 assignee 拒认领 | 运行面 |
| 委托白名单 | 结构化工具列表，只能收窄 | 运行面 |
| 能力上报 | `capability-reports/<machine>.json` | 运行面 |
| 舰队发现面 | `/api/skillgov/provision/fleet` 聚合 | 运行面 |
| DISPATCH_SAFETY | 并行安全三条款（隔离/不等/做完即止） | 运行面 |
| NUDGE 升级链 | 唤醒→验证账本→1/2/3 重催→换档案 | 运行面 |
| G5 三腿 | 集成真值/缺陷闭环/安全条件，只取证不判 | 跨域 |
| 能力层 | swarm-yuan 生成的目标技能 | 能力层 |
| 组件库清单 | 组件/接口/数据三类清单（唯一称谓） | 能力层 |
| 关系边集 | import+映射+语义三类边 | 能力层 |
| 配方 | 业务功能清单+任务拼装序列（五要素） | 能力层 |
| 特征卡 | 项目特征与档位选择依据（17 张） | 能力层 |
| 四层拦截 | 写时/提交时/门禁时/状态机 | 能力层 |
| 负向预算 | 新增门禁或变量须等额删除 | 能力层 |
| 证据分级 | A 实测/B 一手/C 转述 | 能力层 |

## 附录 B：端点与目录地图

**产品面路由主干**：`/app`（流程总览）、`/app/collab`、`/app/board`、`/app/inbox`、`/app/stage/{setup,reqs,design,build,accept,govern}`、`/app/sim`（导演台）、`/app/sim/{supervision,ops,evidence,orchestration,settings,director}`、`/app/ide`、`/app/{bpa,ontology,eval,skillgov}`、`/app/not-found`。

**运行面目录**：`~/lab/hermes-shared.git`（中央 bare 仓）、`~/.hermes/profiles/`（profile 与 `_shared`）、`~/.hermes/skills/`（主机全局库）、`~/.hermes-web-ui/agent-identity/`（身份）、`~/.hermes-web-ui/tool-policies/`（策略）、`~/.zcode/cli/db/db.sqlite`（zcode 用量）。

**能力层目录**：`~/lab/Swarm-yuan/swarm-yuan/`（生成器本体）、`assets/{precheck.sh,gates-*.sh,state-machine.sh,spec-first-lib.sh,facts.conf}`、`docs/{design-evolution.md,usage-manual.md,upstream-baseline.md}`、目标项目内 `.swarm-yuan/{tasks.md,decisions.jsonl}`。

## 附录 C：文档索引（本档汇编来源）

**产品面**：
- `2026-10-21-swarmstudio-complete-design.md`（唯一设计正本）
- 10-21 专题：`ia-projection-sim-subpage-canonicalization`、`sim-visibility-and-ide-task-surface`、`logout-entry-fix`、`ide-devtools-zcode-dsh`、`backlog-closure`、`governance-surface-closure`、`tool-policy-engine`、`zcode-usage-ledger`、`zcode-context-trend`、`secaudit-pipeline-and-eval-judging-discipline`、`fibo-ssot-merge`、`fibo-product-rollout-plan`、`fibo-official-reference-enhancement`
- 推演正本：`2026-10-05-mux-v8-fullflow-plan.md`

**运行面**（21 份，择要）：
- 团队与协作：`2026-10-05-mux-v8-fullflow-plan.md`、`2026-09-18-distributed-delivery-network-design.md`、`2026-10-18-team-registry-sync-detection.md`、`2026-10-12-win10-3node-migration-plan.md`
- 能力与供给：`2026-10-09-agent-capability-boundaries.md`、`2026-10-18-capability-directory.md`、`2026-10-18-skill-provisioning-reconciliation.md`、`2026-10-08-team-parallel-dev-capability.md`
- 编排与派发：`2026-10-09-parallel-capability-foundation-spec.md`、`2026-10-10-orchestration-capability-spec.md`、`2026-10-18-parallel-dispatch-product-landing.md`
- 安全与治理：`overlay/docs/2026-10-16-agent-security-check-report.md`、`2026-10-16-agent-security-remediation-plan.md`、`2026-10-18-harness-{p0p2,residual,reliability}-round.md`、`2026-10-19-review-governance.md`、`2026-10-21-tool-policy-engine.md`、`2026-10-21-agent-governance-toolkit-research.md`

**能力层**：
- `~/lab/Swarm-yuan/swarm-yuan/README.md`（唯一设计文档）
- `~/lab/Swarm-yuan/docs/design-evolution.md`（决策正本 1-49）
- `~/lab/Swarm-yuan/docs/{usage-manual,upstream-baseline,design-compendium}.md`
- `~/lab/Swarm-yuan/swarm-yuan/assets/facts.conf`（数字真值）
- `~/lab/Swarm-yuan/docs/research/`（98 份）、`docs/reviews/`（1 份）、`CHANGELOG.md`

## 附录 D：关键数字总账（按域）

| 域 | 项 | 数字 | 锚点 |
|---|---|---|---|
| 产品面 | 模式/阶段页签/推演入口/专题岛 | 3 / 33 / 6 / 4 | 正本 §0.1 |
| 产品面 | 路由/客户端一级目录/服务端域目录 | 89 / 19 / ~140 | 正本 §0.1 |
| 产品面 | 注入补丁（studio/zcode） | 382 / 8 | 正本 §0.1 |
| 产品面 | 用户决策/常设原则/纠正 | 140 / 30 / 27 | 正本 §8 |
| 产品面 | 测试（全量） | 5,574 通过/0 失败/8 跳过 | 用量账本轮验证 |
| 产品面 | 六闸/人工介入点/检测器/prelaunch | 6 / 14 / 31 / 30 | 正本 §5/§14.6 |
| 产品面 | 补丁净树重放 | 310/310；inject 382 applied | 0.7.38 轮 |
| 产品面 | FIBO 概念/属性/公理 | 37 / 21 / 16 | `ontology-fibo.ts` |
| 运行面 | 编制/账号/profile/看板 | 15 / 30 / 42 / 28 | mux 正本 §2.2 |
| 运行面 | profile 构成 | 14 调度 + 28 执行 | mux 正本 §2.2 |
| 运行面 | 宿主 profile/sim profile | 49 可用（50 目录）/ 45 | 安全检查报告 |
| 运行面 | 有效技能中位 | 296（8-563），orchestrator 309 | 供给对账 |
| 运行面 | 并发上限/峰值 | 30 / 13 路 | mux 正本 |
| 运行面 | 阶段扇出 | 系分 4 / 编码 6 / 测试+集成 3 | mux 正本 |
| 运行面 | 安全检查 | 4 不符合 / 15 部分 / 1 不适用 | 安全报告 |
| 运行面 | 安全阻断挂起 | 10 项，观察期≥4 周 | 整改方案 |
| 运行面 | 域决策记录 | 144 条 / 21 份 spec | 本档 §6.1 |
| 运行面 | 能力上报体积 | 单机约 340KB | 能力目录 |
| 运行面 | 上报新鲜度 | 48h | 能力目录 |
| 运行面 | fleet 验收 | 3 实例 45/45 | fleet 报告 |
| 能力层 | 版本 | v2.88.1（仓库 R130） | README/CHANGELOG |
| 能力层 | 决策文本 | 50（编号 1-49） | design-evolution |
| 能力层 | 门禁 | 56（11/18/19/6）；标准 29；全量 50 | facts.conf:25-32 |
| 能力层 | 特征卡/运行时/领域知识 | 17 / 15 / 32 | facts.conf:49-63 |
| 能力层 | references/research/reviews | 51 / 98 / 1 | facts.conf:79；实测 |
| 能力层 | 随发文件 | 92（lite 46） | facts.conf:102/159 |
| 能力层 | 宿主兼容/四层拦截 | 8 / 4 | facts.conf:127-130 |
| 能力层 | conf 变量/预算 | 197 / 200 | facts.conf:42/166 |
| 能力层 | 门禁脚本 LOC | 8,694 | facts.conf:187 |
| 文档 | specs/plans | 242 / 54（含本档） | 目录实测 10-21 |

## 附录 E：来源覆盖与维护规则

### 来源与未读声明

- 产品面：`2026-10-21-swarmstudio-complete-design.md` 全文结构（§0-§15）、10-21 专题 13 份、推演正本关键章节。
- 运行面：21 份 spec 全文精读（团队/能力/供给/编排/安全/治理），`upstream/hermes-agent` 文档树顶层，`simharness/mux/` 的 mx-lib.sh 与 run 驱动脚本。
- 能力层：`README.md`、`design-evolution.md` 全量决策、`facts.conf` 全量键、`usage-manual.md`、`CHANGELOG.md`、`docs/research` 与 `docs/reviews` 目录。
- 未读/未验证：hermes-agent 源码细部（只读文档与顶层结构）；swarm-yuan `references/` 51 份方法论正文（只按目录与引用关系登记）；产品面 §11-§15 历史卷正文（本档只摘演进节点）。
- 口径处理：历史冲突数字在 §6.4 与附录 D 并列并写明采纳。无锚点的推断不写入本档。

### 维护规则

1. 本档是**总纲与对账**。细则改动写专题正本；产品形态、跨域接口、附录 D 数字变动回写本档。
2. 新增一轮（新 spec、新版本、新决策）时，至少更新三处：§6 台账（计数与关键条目）、§7 验证账、§8 缺口（新增或关闭）。
3. 数字只改一处：附录 D 是唯一数字表；正文引用时回指附录。
4. 每季度做一次口径对账：以 `facts.conf`、`git log`、目录实测为准，修正陈旧注记。
5. 本档修订后，§6.4 与附录 D 必须同时通过机械检查（表行实数=标题计数）。

---

## 决策记录（本档自身）

| # | 决策 | 理由 | 否决的备选 | 可逆 |
|---|---|---|---|---|
| U1 | 新开一份三域合一的整体正本，不把三域硬塞进 SwarmStudio 正本 | 三域载体、节奏、正本位置都不同；塞进去会让产品正本变成杂物间 | 扩写 SwarmStudio 正本（否决：跨域内容污染产品正本） | 是 |
| U2 | 运行面首次汇编为第 3 章，并明确“无单一正本” | 21 份 spec 分散，读者无法一次读完团队模型 | 只给索引不给汇编（否决：没回答问题） | 是 |
| U3 | 本档只做摘要与对账，细则回指专题正本 | 一事实一源；避免第四份细节源 | 复制三域全文（否决：双源必漂移） | 是 |
| U4 | 数字冲突并列并写明采纳口径 | 历史口径都有出处，删除任一方都会丢失审计线索 | 只留新数（否决：审计断线） | 是 |
| U5 | 缺口按域分列、每条给下一步 | 用户需要的是可打勾清单，不是抒情总结 | 只写“另有缺口待清”（否决：不可执行） | 是 |
| U6 | 运行面安全现状写“先预警后阻断”，不写成“已完成整改” | 十项阻断确实挂起，写成已完成即失实 | 按计划文档口径写成已整改（否决：红线） | 是 |
| U7 | 工具策略引擎按 main 实锚写“已交付”，不采纳子代理“仅在分支”的判断 | `git merge-base --is-ancestor c854324b main` 返回真 | 照抄子代理结论（否决：与实物不符） | 是 |
| U8 | 能力层陈旧口径（39 条决策/97 份 research）在本档直接纠正并标注 | 汇编稿过期，继续引用会累积错误 | 沿用汇编稿（否决：错上加错） | 是 |

---

## 文档变更记录

| 日期 | 版本 | 变更 | 依据 |
|---|---|---|---|
| 2026-10-21 | 汇编 R1 | 首次三域合一：三层结构定位／产品面摘要／运行面首汇编／能力层摘要／五条接口／合并台账（决策、吸收、版本、数字）／验证账／缺口／路线／五附录 | 用户指令「再次更新，并整合 swarm studio、swarm yuan skill、hermes agent teams 等的台账、决策记录、设计文档等，形成一份整体的产品及设计文档」 |

> **维护规则**：本档是整体视图，不替代三份专题正本。新增专题 spec 时，若改变跨域接口、总量数字或产品形态，同步更新本档 §5、§6、附录 D；纯实现细节不回写。
