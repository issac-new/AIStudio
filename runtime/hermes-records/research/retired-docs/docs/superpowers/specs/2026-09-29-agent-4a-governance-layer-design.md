# 智能体协作 4A 治理层设计（能力台账 / 语义指标层 / 保鲜与准入门禁）

日期：2026-09-29
状态：五期已落地（一期 0a038f66/二期 93464d1b/三期 4ac3c6ad+清理 ac979ac0/四期=第三期遗留登记/五期 feat/agent-4a-ontology-full，实录见 §9-§11；六件套对账终态见 §11 末）
受众：overlay 实施者与评审者、后续维护会话；阅读前建议先读姊妹篇《三系统能力边界设计》（`2026-09-25-capability-boundaries-design.md`，下称"边界 spec"）
方法论来源：傅一平《4A 架构系列》六图（业务/数据/应用/技术架构总图、可信数据空间五问、4A 一图讲清）+《从 4A 架构到本体驱动的数据治理》（数据搬砖日记，2026-08-15）

## 0. 三句话主旨

本机三套智能体系统（hermes agent teams 运行时、SwarmStudio、swarm-yuan 技能）的"数据写者边界"已由边界 spec 立住，但"能力、语义、生命周期"三个治理面仍是缺口：三套团队模型互不认账、判定词与指标口径多源、agent 无退役与复核机制，已在真实推演中造成审计误判（V4.1 轮 G5"实质 FAIL 词面误配"）与接线妥协（mention 总线拿团队名当 agent 名册）。本设计按 4A 架构方法论补建一层"治理注册表"：git 内四份制品（能力台账/语义指标层/动作契约/准入清单）作单一事实源，vitest 守门族断言跨制品一致性，七条 REST 只读投影，治理中心三个视图区，外加 SLO 预算派发闸与派发结果台账两个运行时执行件，把"哪项能力谁主责、哪个词什么意思、哪个 agent 该退役、派发花了多少钱"变成机器可对账的事实。三期已全部落地（§8-§10 实录；第三期一项内核重写经裁决不做、理由存档）。

## 1. 为什么是现在：方法论与现状的五个对不上的地方

4A 方法论对智能体系统的要求，与本机现状之间有五个根缺口。每个缺口都有一次真实事故或妥协佐证，不是纸面推演。

| # | 缺口 | 方法论要求（出处） | 现状佐证（锚点） |
|---|---|---|---|
| G-A | 能力台账缺失 | 一项能力一个主责；台账记负责人/承载/上下游/生命周期（应用架构总图·分域站） | 三套团队模型并行：TeamRecord（`teams-store.ts:31-41`）、Matrix AgentTeam（`matrix-teams/protocol.ts:52-57`）、squads/roster YAML；能力声明另散五处（404 patch 角色目录、lane-specialists 11 件、agent.profile capabilities、profile toolsets、squads）。症状：mention 总线以 TeamRecord 团队名充当 agent 名册（patch 355），两个命名空间混用 |
| G-B | 语义指标层缺失 | 指标一次定义=口径·维度·权限，绕过不认（数据架构总图·服务站） | "done/通过/打回"无归口定义。V4.1 轮统一报告实录：G5 门禁实质 FAIL 因词面匹配误配被判过；判定词散在 kanban_gates.py、qgate、报告生成器各自实现 |
| G-C | 生命周期与保鲜缺失 | 引入是承诺，退役是纪律；90 天没人用就要评估；保鲜靠系统记不靠人填（技术架构总图·演进站+落地机制） | 团队删除即硬删无退役态（`teams-store.ts:163-169`）；agent"下线"靠停止写事件间接表达；名册 YAML 无版本无复核日期 |
| G-D | SLO 与成本归集缺失 | 分级×目标值（核心/重要/一般）；成本账按维度归集（技术架构总图·立标站+贯穿成本账） | 只有零散超时（审批 72h、派单槽 30min、per-task max_runtime）；token-meter 是纯计算 REST 不落库（`token-meter-controller.ts`），无按能力/团队归集视图 |
| G-E | 可信五问准入缺失 | 跨边界协作五问一票否决：真实场景/口径一致/用途边界/越界可证/责任落地（可信数据空间五问） | 跨机准入只查技术可达（边界 spec §6.2：入网 runbook+Synapse 可达）；新 agent 入注册房无语义、用途、责任审查 |

文章《从 4A 到本体驱动的数据治理》给了解法定位：本体语义层不是第五个 A，而是跨 4A 的可计算连接层，把对象、状态、事件、规则、证据、权限、动作八要素显式关联给机器消费。本设计即本机语境下的语义连接层——不新建第五套系统，把散落制品收编成注册表并上门禁。

## 2. 总体设计：一份注册表，三种消费，四级保鲜

治理层 = 四份注册表制品 + 守门族 + 七条投影 + 三视图区 + 两个运行时执行件（预算闸/派发台账）。数据流向单向：git 内制品是唯一写面，派发台账是唯一运行时写面（单点 append，边界 spec §2 已登记），其余全是只读投影。

```
runtime/governance/capability-ledger.yaml    能力台账（谁-能做什么-主责-生命周期-SLO 档）
runtime/governance/metrics.yaml              语义指标层（判定词六态+指标+sloTargets 分级目标值）
runtime/governance/action-contracts.yaml     动作契约注册表（八关键动作·接口契约六件事）
runtime/governance/admission-checklist.md    可信五问准入清单（跨边界协作签约模板）
        │
        ├─ vitest 守门族（custom/server/governance/__tests__/ 四文件）
        │    台账/指标/契约三注册表 schema 与跨制品一致（roster/columns/squads/
        │    协议词法/qgate 六态/upstream 验证器锚点/主承载唯一/判定词表归口）
        ├─ REST 只读投影 ×7（governance-controller.ts，patch 490 前缀，无新挂载点）
        │    ledger / metrics-defs / contracts / usage / slo / cost-summary / audit-log
        ├─ 运行态实取链（只读，诚实降级）
        │    governance-analytics（kanban+squad+派发台账+qgate runs+usage-store 聚合）
        │    governance-budget（SLO 预算派发闸：enforce 时 core 档耗尽拒派→409）
        │    dispatch-ledger（引擎派发 append-only 留痕：mention/column 双路落账）
        └─ 治理中心三视图区（/app/gov，GovernanceView）
             能力台账区（能力树+生命周期徽标+保鲜告警+指标定义表）
             运行态区（消费关系/零调用/SLO 分档/派发统计/门禁通过率/成本三维度）
             统一审计区（四源归一：源 chips+检索+时间倒序）
```

三个定位裁决：

1. **单一事实源在 git，不进 DB**。与治理工件"git 真仓锚点"先例一致（`governance-controller.ts` GOVERNANCE_DOCS）；DB 只会再造一个需要边界 spec 裁决的写面。
2. **台账是编制态，不替代运行态**。agent.profile 心跳、fleet 网格是运行态投影，各自有事实源；台账回答"应然"，运行态回答"实然"。编制态内部一致由守门断言；运行态对账经三信号源（kanban assignee/squad 评估/派发台账）在 /usage 落地（§3.9）。
3. **写面只有人手改 YAML + 评审，不做 UI 编辑器**。第一期的治理目标是"可对账"，不是"可在线编辑"；UI 编辑器会引入写路径鉴权、冲突、审计一连串新问题，超出本期主旨。

## 3. 详细设计

### 3.1 能力台账 capability-ledger.yaml

分层对齐业务架构总图能力地图（L1 领域 / L2 能力项 / L3 能力单元），命名规则沿用"业务对象+动作"。

```yaml
version: 1
reviewedAt: "2026-09-29"        # 台账整体复核日，保鲜门依据
domains:                         # L1 能力域
  - id: engineering
    name: 开发实现
    owner: YOURNAME
capabilities:                    # L2 能力项（能力=对象+动作）
  - id: eng.implement
    domain: engineering
    name: 卡片实现
    object: 任务卡
    action: 实现
    importance: core             # core|support|base（投什么四象限）
    maturity: high               # high|medium|low
units:                           # L3 能力单元（主承载认定落点）
  - id: kanban-dev-executor
    capability: eng.implement
    primary: true                # 每个 L2 恰好一个 primary（守门断言）
    kind: lane-specialist        # lane-specialist|squad|coding-agent|service|team
    owner: YOURNAME                # 认账人（服务三问之"只有一个认账人"）
    lifecycle: active            # introduced|active|sustaining|retire-candidate|retired
    sloTier: important           # core|important|general（分级×目标值）
    skills: [kanban, git]        # 能力标签，词法对齐协议 ^[a-z0-9][a-z0-9:-]*$ ≤64
    refs:                        # 实物锚点：条目指向真实制品，守门验存在
      file: runtime/roster/lane-specialists/dev-executor.yaml
    introducedAt: "2026-09-26"
    reviewedAt: "2026-09-29"
```

覆盖范围（第一期全量入账）：lane-specialists 11 件、squads.yaml 2 组、agent-roster 9 角色、TeamRecord 编制概念、coding-agents 4 件（zcode/codex/mimo/claude-code）、列编排 columns.yaml 引用的全部 specialist。每类在台账中以 kind 区分，refs 指向各自实物文件——台账不复制各制品内容，只登记治理维度（主责/生命周期/SLO/复核日），治"互不认账"而非"再抄一遍"。

### 3.2 语义指标层 metrics.yaml

对齐数据架构总图"指标一次定义=口径·维度·权限；绕过这一层的口径不认"。

```yaml
version: 1
reviewedAt: "2026-09-29"
verdicts:                        # 判定词表（单源；与 qgate 六态对齐，守门断言）
  - id: pass
    label: 通过
    semantics: 全部验收条件成立且证据齐
  - id: fail
    label: 不通过
    semantics: 任一验收条件不成立；词面相似（如报告含 fail 字样）不构成判定依据
  # conditional / inconclusive / waived 同式
metrics:
  - id: task.done
    name: 任务完成
    formula: kanban 列=done 且 completion_contract 四件套过闸（kanban_gates.py）
    dimensions: [board, assignee, capability]
    permission: 全员可读
    authority: kanban.db（经 hermes CLI 单写者）
  - id: gate.passRate
    name: 门禁通过率
    formula: pass 数 / 判定总数（conditional 计分母不计分子；not_applicable 双侧剔除）
    dimensions: [gate, capability, period]
    permission: 全员可读
    authority: qgate runs 台账（.qgate/runs 扫描）
    status: live                  # live=实况已接线；defined=口径已定待接线（如实分列）

# sloTargets：SLO 分级目标值（技术架构总图"分级×目标值"承载）
sloTargets:
  core:      { successRate: 0.95, windowDays: 30, minSamples: 10, budgetAction: freeze }
  important: { successRate: 0.90, windowDays: 30, minSamples: 10, budgetAction: warn }
  general:   { successRate: 0.80, windowDays: 30, minSamples: 10, budgetAction: warn }
```

`verdicts` 节是 G-B 缺口的直接根治：fail 的 semantics 显式写"词面相似不构成判定依据"，这条定义就是 V4.1 轮 G5 误判的复盘产物。报告生成器、qgate、治理中心视图判定词一律引本表。`sloTargets` 三档目标值（freeze 仅 core 档可配，校验器强制）驱动预算派发闸（§3.10）；`status` 字段区分 live/defined，防止把已定义冒充已接线。

### 3.3 一致性守门（vitest）

守门由单文件扩为四文件族（ledger 基础 + analytics 运行态 + contracts 契约 + dispatch-qgate 派发/门禁；另有 matrix-teams 准入 10 例在 admission-gate.test.ts、前端三区在 ia2/governance-view.test.ts），断言分 strict 与 warn 两级（沿用 swarm-yuan enforce 三级先例的裁减版）。ledger 基础十条：

strict（红即不过）：
1. 两份 YAML 可解析、schema 必填齐全（每 L3 有 capability/kind/owner/lifecycle/sloTier/reviewedAt）。
2. 主承载唯一：每个 L2 capability 恰好一个 `primary: true` 的 L3。
3. columns.yaml 每个 `step.specialist` 在台账有 L3 条目（refs.file 验存在）。
4. squads.yaml 每个 leader 与 member 在台账有 L3 条目。
5. agent-roster 9 角色每个在台账有对应 L2 或显式豁免登记。
6. skills 标签词法对齐 `matrix-teams/protocol.ts` 的 capability 词法（`^[a-z0-9][a-z0-9:-]*$`，≤64 字符）。
7. metrics.yaml 每个指标有 formula/dimensions/permission/authority；verdicts 六态与 qgate 判定词表逐字对齐（PASS/FAIL/CONDITIONAL/INCONCLUSIVE/WAIVED/NOT_APPLICABLE，反向漂移同守）。
8. lifecycle 与 sloTier 取值在冻结词表内；refs.file 指向的实物必须存在（全条目 strict，实现强于设计下限）。

warn（黄名单提醒，不挡构建）：
9. reviewedAt 距今超 90 天的条目（保鲜信号，输出清单）。
10. lifecycle=active 但无任何 refs 锚点（file 与 note 俱无）的条目。

后续各期并入的 strict 断言：契约注册表六件事齐全+错误 id 词法+语义归一（凡 verdictCarrier 必归口 metrics.yaml）+refs.file/refs.upstream 实物存在+upstream 验证器锚点实证（validate_contract/output_schema+schema_valid/门禁四件套）；sloTargets tier/successRate/windowDays/minSamples/budgetAction 词表与区间+freeze 仅 core；派发统计去重口径（同 commandId column 优先）与送达判定；门禁 passRate 的 NA 剔除口径；准入五问答卷完整性（admissionComplete）与写入闸。全部带变异验证（删 primary/删引用/错配词表必红）。

### 3.4 REST 投影

扩展 `custom/server/governance/governance-controller.ts`（patch 490 已挂载 `/api/governance` 前缀，无新挂载点、无 upstream 改动）：

- `GET /api/governance/ledger`：解析台账，返回 L1/L2/L3 树 + 派生统计（按域/生命周期/SLO 档计数、保鲜告警清单、主承载覆盖矩阵）。YAML 路径经既有 `resolveRosterFile('governance/<名>.yaml')` 解析（GOVERNANCE_DIR 覆盖优先，向上寻 `runtime/`）；文件缺失如实返回 `exists:false`，不编造。
- `GET /api/governance/metrics-defs`：词表+指标定义+sloTargets。
- `GET /api/governance/contracts`：动作契约注册表（§3.8）。
- `GET /api/governance/usage`：消费关系报告（三信号源映射、零调用候选、名册外活跃）+ dispatchStats（引擎派发统计）+ gateStats（门禁通过率）。
- `GET /api/governance/slo`：SLO 分档实况（budgetMode 随报）。
- `GET /api/governance/cost-summary?days=`：成本三维度归集（provider/profile/capability，idle~peak 区间，未计价如实标注）。
- `GET /api/governance/audit-log?sources=&q=&limit=`：统一审计四源归一（§3.11）。

读多写少，进程内 mtime 缓存（文件不变不重复解析，沿用 roster 缓存先例 patch 458 的语义）；运行态数据只读实取，库/台账缺席如实降级不编造。

### 3.5 治理中心「能力台账」视图

`GovernanceView.vue` 挂三个区块（组件落 `custom/client/governance/components/`：LedgerSection / RuntimeSection / AuditSection，i18n 键进 `custom/client/governance/i18n.ts` 的 governance.* 命名空间——该文件是为绕开 patch 473 单一事实源而设的增量注入面，不动上游 locale）：

- 能力树：L1 域 → L2 能力项 → L3 单元，单元行显示 owner、lifecycle 徽标（五色对齐词表）、sloTier、reviewedAt。
- 保鲜条：reviewedAt 超 90 天条目计数 + 清单；主承载缺口（无 primary 的 L2）红色显式列出。
- 指标定义表：verdicts 词表 + metrics 清单（口径/维度/权威源/状态四列），即语义层的 human-readable 投影。

运行态区（RuntimeSection，§3.9-3.10 数据的消费面）：零调用候选与名册外活跃 chips、SLO 分档表（成功率/目标/P95/预算态+名册外桶）、引擎派发行（送达率/分单元）、门禁通过率行、成本三维度表（provider/profile/capability）。统一审计区（AuditSection，§3.11）：四源 chips 过滤+文本检索+时间倒序表，源缺席如实 n/a。

验收按 UI 完成标准三层验法：构建产物 grep + `GET /api/governance/*` HTTP 200 + dev 服务器（:8649，或隔离端口+shim 后端）真浏览器走查截图入档。

### 3.6 可信五问准入清单 admission-checklist.md

模板制品，五问各带"过关条件/危险答案/谁来答"三栏（照五问图原结构），适用场景：新 agent 接入注册房、新跨机协作、新外部数据源接入。

第二期起自动化（登记于 §9-5）：`team.account` 协议事件增 admission 五问答卷（增量可选、老事件容错解析），写入闸在 `writeSelfAccount`——首宣或答卷缺失须随写提交五答（缺一问拒写），已有完整答卷改 teams 自动沿用；Teams 面板"已过/未过"徽标+自声明区五问表单+派发列表目标未过告警。词条走模块级 i18n-admission（不动 patch 473）。

### 3.7 swarm-yuan skill 接线

swarm-yuan 是方法论立法平面（边界 spec §1），本设计在其 references 增收一档《agent-collab-4a-governance.md》：把任务契约五字段、55 门禁、四权分离映射到 4A 概念（任务契约=接口契约六件事的智能体形态；四权分离=拍板矩阵；门禁=卡点），并登记本机治理层注册表族的位置与消费方式（随发档 2593B，字节预算逐例登记），使生成的项目技能在多 agent 项目里指向台账而非自建第二份名册。按 skill 自身纪律入账（capability-map.md 登记 + facts.conf 计数联动；R73 吸收轮已落）。

### 3.8 动作契约注册表 action-contracts.yaml（第二期①）

八个关键动作（kanban create/assign/transition、delegate_task、mention/column dispatch、task.assign/receipt）各登记接口契约六件事：用途/输入/输出/错误词表/责任人与版本/变更通知。**语义归一红线**：凡产出判定的契约 `verdictVocabulary` 必归口 metrics.yaml——completion_contract 与 output_schema 两套历史契约在治理平面统一词表，守门机检+变异验证。refs.file（仓内相对路径）与 refs.upstream（相对 upstream 根，findUpstreamRoot 向上寻 ≤6 层三形态兼容）由守门验存在；upstream 验证器锚点（validate_contract、output_schema+schema_valid、门禁四件套）实证在守——上游结构变更即红。hermes 内核验证器语义重写的裁决与理由见 §10-6。

### 3.9 运行态分析 governance-analytics.ts（第二期②③④+第三期）

只读实取五源：kanban.db（HERMES_HOME 根解析，root+boards 聚合）、squad 评估台账（mtime 为最近活动时间，at 字段是单调计数器非墙钟）、派发结果台账（§3.12）、qgate runs（.qgate/runs 扫描，GOVERNANCE_QGATE_RUNS 覆盖，__dirname+cwd 双起点）、usage-store（session_usage）。产出：消费关系（unit→usage 三信号源映射，优先级 kanban > squad > dispatch；90 天零调用候选；名册外活跃 assignee 如实入 unmappedAssignees 不编造归属）、SLO 分档报告（done/(done+archived) 成功率、P95、minSamples 挂起）、成本三维度归集（provider/profile/capability，价目 idle~peak 区间、未收录 unpriced 不计金额）。

### 3.10 SLO 预算派发闸 governance-budget.ts（第二期③）

列编排派发前按 step.specialist → 台账单元 → sloTier → sloTargets 判定预算。GOVERNANCE_SLO_BUDGET 三模式：off 不查；warn（默认）日志告警放行并记档；enforce 时 budgetAction=freeze 的档耗尽抛 BudgetExhaustedError，REST 侧 409 slo_budget_exhausted。硬冻结仅 core 档可配（校验器强制，防一般档误配拦死全链路）。SLO 计算 60s TTL 缓存（一分钟内重复派发不重复扫库）。

### 3.11 统一审计查看器 governance-audit.ts（第二期⑥）

四源归一为 NormalizedEvent（ts/source/actor/action/target/result/ref）：approvals（复用 queryApprovalLog 单一读取面）、domain（GOVERNANCE_REPO/docs/governance/domain-audit.jsonl）、provider（hermes-web-ui.db provider_audit_events）、kanban（task_events，root+boards）。任一源缺席如实 available:false，不编造事件；支持源过滤+文本检索+limit。

### 3.12 派发结果台账与派发负载契约化（第三期）

`dispatch-ledger.ts`：`~/.hermes-web-ui/overlay/dispatch-ledger.jsonl`（GOVERNANCE_DISPATCH_LEDGER 覆盖），append-only、CAP 2000 截尾原子写、fail-soft（台账故障绝不影响派发主链路）。双路落账：引擎单例 onOutcome（mention 条目，单点覆盖 REST/列编排全部引擎派发）+ 列编排执行半环（column 条目带 specialist/role/列名）；统计去重同 commandId、column 条目优先。派发负载契约化：列派单文本尾部嵌交付契约块——action-contracts:column.dispatch 的判定词表（六态+"词面相似不构成判定依据"）与冻结错误词表随负载下发，注册表缺席回落内置短句；本机引擎派发自此不再是裸文本任务传递。

## 4. 红线与落地机制

红线（沿用各图"一站一红线"句式，守门可机检的前四条）：

1. 一项能力只认一个主责（L2 恰好一个 primary，守门 2）。
2. 判定词与指标口径以 metrics.yaml 为唯一准，绕过的口径不认；凡产出判定的契约 verdictVocabulary 必归口本表（守门机检）。
3. 台账条目必须有认账人与复核日，无名条目不入账。
4. 准入五问缺一问不签（写入闸：首宣或答卷缺失须随写五答，不全拒写）。
5. 台账不复制实物内容，只登记治理维度（防第二事实源）。
6. SLO 硬冻结仅 core 档可配；预算耗尽在 enforce 模式拒派（409），warn 只告警记档。
7. 派发负载必带契约块；派发台账 fail-soft，台账故障不阻派发主链路。

落地机制四件套在本层的对应：卡点=vitest 守门族进 overlay 全量测试序列 + SLO 预算闸/准入写入闸两道运行时卡点；仲裁=台账主责争议按边界 spec §7 流程裁决入 §6 编号；保鲜=reviewedAt 超期 warn 清单 + 每轮治理批复核；存量=retire-candidate 条目经一轮复核无异议转 retired，实物制品另行归档；审计=派发台账与统一审计查看器（四源归一）留痕可查。

## 5. 与既有设计的关系

- 边界 spec（2026-09-25）裁"数据写者唯一"，是本设计的下游约束：注册表族四份制品的写者只有 overlay 仓库评审流；运行态唯一新增写面是派发结果台账（单一写者=dispatch-ledger.ts 的 appendDispatchOutcome，两处调用点：引擎单例 onOutcome+列编排执行半环），已登记入边界 spec §2。kanban/state/usage-store 全部只读。
- mux-v5 全流程方案（2026-09-29）的 26 步主链与六道硬闸是本层的消费方：步骤 1（编制）应读台账、步骤报告判定词应引 metrics.yaml；接线随下一推演轮执行。
- swarm-yuan（v2.38.0）是方法论上游：本层的守门分级、证据落盘、预算纪律沿用其范式，并在其 references 回登记（§3.7，R73 已落）。

## 6. 风险与对策

1. 台账与实物漂移：守门 3/4/5 已把主要实物（specialists/squads/roles）纳入 strict 断言；新增实物不过守门即红，漂移止步于提交前。
2. 并行会话撞车：本期全部改动收敛在 `runtime/governance/`（新目录）+ governance-controller 尾部追加 + 视图增区，不触碰 patch 系列与 473 locale；worktree 隔离开发，收口前 rebase origin/main。
3. 覆盖不全成摆设：第一期强制全量入账（§3.1 覆盖范围清单），守门 5 防"名册外角色"重现 mention 总线式混用。
4. reviewedAt 沦为填表：保鲜信号只做 warn 不做 strict（防为了过门而刷日期），由治理批轮次复核承担真实保鲜（§4 落地机制）。

## 7. 第一期验收清单

1. `runtime/governance/` 三件制品落盘，schema 如 §3.1/§3.2。
2. vitest 守门十条全绿（strict 8 + warn 2 输出清单为空或可解释）。
3. `GET /api/governance/ledger` 与 `/api/governance/metrics-defs` HTTP 200，内容=YAML 实解。
4. 治理中心「能力台账」区浏览器可感知（走查截图入档）。
5. swarm-yuan references 新增档 + 入账完成。
6. overlay 全量 vitest + tsc 绿，无新增失败。

## 8. 第二期 backlog（六项已于 2026-09-29 同日全部落地，实录见 §9）

1. 契约对称化：本机 CLI spawn 派发补输入输出契约（动 hermes 派发内核，回归面大）；completion_contract 与 output_schema 统一语义。
2. 消费关系登记：agent 对看板/事件/指标的消费登记，支撑"算得清影响面"与零调用统计自动化。
3. SLO 实况：台账 sloTier 接运行数据（成功率/门禁通过率/p95 时延），错误预算耗尽冻结派发。
4. 成本归集：token-meter 落库 + 按能力/团队维度的成本视图（usage-store 已有 model_call|run 粒度，缺归集层）。
5. 五问自动化：准入清单从人工填写升级为注册房写入拦截。
6. 统一审计查看器：审批 JSON/域审计 JSONL/provider 审计 SQLite/kanban events 单页查询（独立需求，本层只提供词条归口）。

## 9. 第二期落地实录（2026-09-29，分支 feat/agent-4a-governance-p2，两提交 3c08bf35/f3b7231e）

§8 六项全部落地。逐项收口口径与边界（超出/不足设计处如实标注）：

1. **契约对称化（①）**：落地形态=`runtime/governance/action-contracts.yaml` 注册表（八个关键动作，接口契约六件事）+ 语义归一红线机检（凡产出判定的契约 verdictVocabulary 必归 metrics.yaml）+ upstream 验证器存在性实证守门（validate_contract/output_schema+schema_valid/门禁四件套锚点，upstream 结构变更即红）。**未做部分如实登记**：本机 CLI spawn 派发负载格式未改（动 hermes 派发内核回归面大），completion_contract 与 output_schema 的统一是"治理平面词表归一"而非"验证器语义重写"——验证器语义重写仍属后续上游工作。
2. **消费关系登记（②）**：`governance-analytics.ts` 实耗聚合（kanban root+boards 只读、squad 评估台账）+ `GET /api/governance/usage`（unit→usage 映射、90 天零调用候选、名册外活跃 assignee 如实入 unmappedAssignees）。lane-specialist/roster-role 等 kind 暂无实耗信号面，如实标 untracked——消费登记声明面已立，运行侧信号接线属增量空间。
3. **SLO 实况（③）**：metrics.yaml `sloTargets` 三档目标值（core 0.95/important 0.90/general 0.80；freeze 仅 core 可配，校验器强制）+ `GET /api/governance/slo`（分档成功率/p95/minSamples 挂起）+ 派发预算闸 `governance-budget.ts` 接列编排链（off/warn/enforce 三模式，enforce 抛 BudgetExhaustedError→409；默认 warn 只告警——机制完整、策略分级是上线纪律不是缺欠）。
4. **成本归集（④）**：`GET /api/governance/cost-summary?days=`：session_usage 按 provider/profile 分桶 + 价目表 idle/peak 区间折算；未收录模型如实 unpriced 标注不计金额。token-meter 仍为定价口径单源，本层只做归集投影。
5. **五问自动化（⑤）**：`team.account` 事件增 admission 五问答卷（增量可选、老事件兼容），`writeSelfAccount` 首宣/答卷缺失须随写五答（缺一问不签），已有完整答卷改 teams 自动沿用；Teams 面板"过/未过"徽标 + 自声明区五问表单 + DispatchList 目标未过告警。词条走模块级 i18n-admission（对齐 governance 增量先例，不动 patch 473）。
6. **统一审计查看器（⑥）**：`GET /api/governance/audit-log`：approvals（复用 queryApprovalLog 单一读取面）/domain/provider（hermes-web-ui.db）/kanban（task_events）四源归一 NormalizedEvent，源缺席 available:false 不编造；治理中心 AuditSection（源 chips+检索+时间倒序）。

**验证**：新增守门 19 例（analytics 9 + contracts 8 + 准入 10 例中含协议/投影/写闸）全绿；治理域+看板域 41/41、matrix-teams 202/202；overlay 全量 vitest 3129+/3131+（2 例 qgate 既有失败与改动零交集）；真浏览器走查（vite dev+shim 后端）运行态区/审计区/准入口径截图入档。

**第三期登记**：①中验证器语义重写（hermes 内核）、lane-specialist 实耗信号接线、lane-specialist 级消费声明自动化、SLO 门禁通过率（gate.passRate）实况、dispatch.successRate 实况（task.receipt 聚合）、成本按能力维度归集（run→capability 映射）。

## 10. 第三期落地实录（2026-09-29 同日，分支 feat/agent-4a-governance-p3，两提交 4eb0e112/1f2c57ff）

第三期登记的六项中五项全落地、一项按边界裁决收窄，逐条对账：

1. **lane-specialist 实耗信号接线 + 消费声明自动化（两项合一）**：`dispatch-ledger.ts` 派发结果台账（`~/.hermes-web-ui/overlay/dispatch-ledger.jsonl`，append-only、CAP 2000 截尾原子写、fail-soft 不影响派发主链路）。双路落账：引擎单例 `onOutcome`（mention 条目，覆盖 REST/列编排全部引擎派发）+ 列编排执行半环（column 条目带 specialist/role/列名，归因更细）；统计去重同 commandId 优先 column。deriveUsage 增第三信号源 dispatch-ledger（优先级 kanban > squad > dispatch），lane-specialist/coding-agent 从 untracked 转 mapped——消费"声明"由真实派发行为自动生成，无需人工登记。
2. **gate.passRate 实况**：`collectQgateRuns` 扫描 `.qgate/runs`（GOVERNANCE_QGATE_RUNS 覆盖；默认 cwd/仓根双起点上寻+示例仓，兼容注入树/打包 shim/开发树），六态归一小写、not_applicable 双侧剔除。走查实证：9 根 9 运行，passRate 66.7%（示例仓真实历史 run）。
3. **dispatch.successRate 实况**：本地引擎派发面转 live（queued/coalesced=送达，deferred 计分母不计分子，分单元 rate）；走查实证 0/4 送达（测试期引擎不可达记录如实呈现）。跨机 Matrix task.receipt 聚合如实分列"待接线"，不冒领。
4. **成本按能力维度归集**：costSummary 增 byCapability（profile→台账单元→capability 映射；未映射入 (未映射) 桶如实），UI 成本卡增能力维度表。
5. **派发负载契约化（①的 overlay 收窄面）**：列派单文本尾部嵌交付契约块——action-contracts:column.dispatch 的判定词表（六态+"词面相似不构成判定依据"）与冻结错误词表随负载下发；注册表缺席回落内置短句。本机引擎派发自此不再是裸文本任务传递。
6. **①中 hermes 内核验证器语义重写——裁决不做，理由存档**：upstream `validate_contract`/`output_schema` 验证器语义与 V4/V5 推演 harness 的冻结预期深度耦合，强行统一词表的回归面远超本期收益；第二期已交付治理平面语义归一（verdictVocabulary 归口+双向漂移守卫），第三期补齐负载契约下发后，内核重写的边际价值进一步降低。若未来实施，须先过边界 spec §7 裁决流程。

**验证**：新增守门 11 例（台账 2+统计 2+消费 3+门禁 2+成本 1+契约块/落账 2，去重后计入 governance-dispatch-qgate 9 例与列测试 2 例）+列测试台账重定向 tmp 防污染主机；治理+看板域 60/60；全量 vitest 3258/3260（2 例 qgate 既有失败零交集）；tsc 定向零错；真浏览器走查截图（引擎派发行 0/4、门禁 66.7% 9 次、零调用 squad-review）。

**遗留（第四期登记，均属增量非缺口）**：跨机 dispatch.successRate 的 Matrix receipt 聚合接线、qgate runs 按能力维度拆分（gateId→capability 映射表）、派发台账按 runId 关联 session_usage 实现真 per-run 成本。

## 11. 第五期落地实录（2026-09-29 同日，分支 feat/agent-4a-ontology-full）——本体驱动 100% 对账缺口的五项补齐

第五期针对"本体驱动 100% 落地对账"（§0 评估轮）点名的缺口逐项补齐：

1. **① agent 消费本体（派单语义上下文）**：`buildDispatchSemanticContext(specialistId)`——列派单负载在契约块之外新增语义上下文块（单元/主承载/能力=对象·动作/SLO 档与目标值/判定词表+"词面相似不构成判定依据"），数据全部来自受守门的注册表，fail-soft（无册单元不占行）。agent 收到的派单自此携带自己的本体位置——文章"Agent 消费本体"主张的最小通道。
2. **② 状态-事件本体**：`runtime/governance/state-model.yaml`（注册表族之五）——task 对象九态语义、run 终态映射、五条有治理挂接的转移（run 终态×3+列编排×2，各挂触发/规则/动作/证据）、四事件源、freeMoveStates 如实声明无门禁态。**词表不写死**：守门直接从 upstream kanban_db.py 提取 VALID_STATUSES（:103）与 _RUN_OUTCOME_TERMINAL_STATUS（:2377）逐字比对（变异：少一态必红）；无合法转移矩阵是 upstream 事实，transitions 只声明有挂接者不虚构全量；changes_requested 出现在终态映射但不在词表（upstream 既有怪味）如实登记。API `/api/governance/state-model`。
3. **③ 反向影响查询**：`governance-impact.ts`——两层事实源：注册表内交叉引用（实析）+运行时消费面锚点清单（RUNTIME_CONSUMERS：文件+符号，守门 grep 断言锚点有效，清单腐烂即红——首跑即逮住一处写错清单项）。API `/api/governance/impact?target=unit.<id>|contract.<id>|metric.<id>|verdicts|sloTargets|state-model`（前缀式解析，契约 id 含点不拆坏）。
4. **④ 高质量数据集**：`scripts/governance/build-dataset.mjs` 单一生成器——四份注册表蒸馏为 `runtime/governance/dataset/agent-handbook.jsonl`（七类条目：unit×27/verdict×6/metric×7/contract×8/state×9/transition×5/admission×1，共 62 条），产物入 git，守门 `--check` 断言重新生成零 diff（变异：篡改产物必 exit 1）——与源注册表零漂移由生成器保证，无第二份人工维护。
5. **⑤ 执行端五问强制（跨域收窄）**：doReceiveAssign 增闸——**跨域派发**（target.account 与本机不同 homeserver 域）且本机已宣但未过五问 → 拒收建卡并回执 failed(admission-incomplete)。语义修正实录：首版对全部派发拒收，11 个既有用例连带红暴露"同域存量被打断"——按文章本义收窄为跨边界（可信数据空间场景）才强制，本域治理归边界 spec 写者边界与审批面。写端闸（首宣必答）+执行端闸（跨域拒收）双层闭环：即使绕开 studio 直接发协议事件，跨域落地仍被拒。行为测试双断言（同域放行建卡/跨域拒收回执）。

**验证**：ontology 守门 14 例（词表提取/逐字对齐/变异/语义上下文四行/锚点清单/影响查询六型/HTTP 200/数据集零漂移+篡改有牙/源码序断言）+准入行为用例（203/203 含新双断言）；治理+看板域 74/74；全量失败面与基线完全一致（2 既有 qgate+1 注入态环境，零新增回归）；tsc 定向零错（task-dispatch 三条 @/ 别名噪声在未触碰行）。

**六件套终态对账**（对 §0 评估轮缺口表）：语义模型与资产目录 ✅；跨 4A 映射 ✅；证据链与语义质量规则 ✅；影响分析 ✅（③）；高质量数据集 ✅（④）；动作契约+版本/变更 ✅。三方消费：治理系统 ✅、AI/Agent ✅（①语义上下文+契约块随负载）、业务系统=派发/预算/列编排执行面 ✅（hermes 内核直读仍按 §10-6 裁决不做）。剩余登记：跨机 receipt 聚合（同第四期）、state-model 视图区（API 已就绪，展示面增量）、dataset 的 RAG 检索消费（当前为文件态，接入检索引擎属增量）。
