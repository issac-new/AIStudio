# UI 与功能重构·一一对账总表（唯一正本）

> **文档定位**：三份设计档（IA 重构/全量盘点/角色镜头）的**对账唯一正本**——冲突处以本表为准（取代声明）。对账方法＝先新鲜全量扫描（2026-10-15 文件系统实测，非记忆），再函数级登记，**前向**（每功能→唯一新家）与**反向**（每设计元素→盘点依据）双向核对，零孤儿、零双家。
> **扫描完备性证明**：路由 21 条（ia2/routes.ts 全量 grep）＋页签 13（i18n-tasks-tabs.ts 全键）＋客户端 18 域 300+ 文件（逐域 find 计数：ia2/views 18·kanban 组件 17·ide 27·matrix-chat 68·matrix-teams 27·chat 3·loop 32·cockpit 52·eval 7·bpa 11·ontology 5·skillgov 4·zcode 2·settings-layers 1·branding 1·governance 28）＋服务端 129 能力域。未单列的文件由所属域的聚合行覆盖（域整体迁移，无遗漏通道）。

## 一、功能登记表（前向对账：功能 → 唯一新家）

### A. 路由级（21 条逐一）

| # | 路由/功能 | 实存锚 | 唯一新家 | 形态 |
|---|---|---|---|---|
| A1 | /app 三栏工作台 | WorkbenchView 33K | 工作台·壳 | 保留骨架+顶栏三中心 |
| A2 | /app/settings·/hermes/settings | IaLegacyShell | 工作台·设置 | 不变 |
| A3 | accounts 账户管理 | AccountAdminView 6.5K | **治理中心·组织与权限** | 迁移 |
| A4 | agent 全局智能体 | routes | 工作台·沟通 | 不变 |
| A5 | board | TasksView 13K+组件群 | 工作台·board（3 签） | 收敛 |
| A6 | cases 交付案例 | routes | **推演中心·证据库** | 迁移 |
| A7 | dash 仪表 | routes | 工作台·岛屿入口 | 保留入口 |
| A8 | eng 编排 | OrchestrateView 14.3K+EngScene | **推演中心·场景编排**（治理中心·关卡与流程=其定义态） | 迁移 |
| A9 | gov | governance 域 28 文件 | **治理中心·壳** | 升格 |
| A10 | history 会话历史 | routes | 工作台·沟通 | 不变+证据互链 |
| A11 | inbox | InboxView 1.9K | 工作台·把关（审批+清偿门） | 扩展 |
| A12 | l/:loopId 循环 | loop 域 32 文件 | 工作台·岛屿入口 | 保留 |
| A13 | runs(/:id) | governance/runcenter | **推演中心·壳** | 升格 |
| A14-17 | s/chat·s/chat/:id·s/group·s/room | matrix-chat 68+matrix-teams 27+chat 3 | 工作台·沟通（域整体迁移） | 不变+消息存证 |
| A18 | ide（岛屿路由） | ide 域 27 文件 | 工作台·生产位（岛屿） | 不变+新鲜度标记 |

### B. board 13 页签逐一对账

| # | 页签 | 实存锚 | 唯一新家 | 形态 |
|---|---|---|---|---|
| B1 | 看板 | KanbanBoard/Column/TaskCard/Toolbar/BulkBar/InlineCreate/Attachments/Markdown/saved-views（17 组件中 9） | 工作台·board·看板 | 我的卡默认 |
| B2 | 任务协同 | KanbanOrchestrationPanel 12.9K | 工作台·board·任务协同 | 不变 |
| B3 | 协作与知识 | GovOrgKnowledgeView 1.7K＋handoff.ts+HandoffSection | 工作台·board·协作与知识（交接并入） | 合并 |
| B4 | 需求追溯 | tabTrace | **推演中心·需求追溯** | 迁移+provenance |
| B5 | 交付健康 | tabAccounts+i18n-accounts | **推演中心·交付健康** | 迁移+宽限窗语义 |
| B6 | 运行观测 | tabObservatory | **推演中心·运行观测** | 迁移+两健康卡 |
| B7 | 能力与规则 | GovRegistryRulesView 2.0K | **治理中心·资产与能力** | 迁移（治理六域裁定） |
| B8 | 审计与变更 | GovAuditChangeView 1.9K | **治理中心·审计与变更** | 迁移 |
| B9 | 文档评审 | GovDocsReviewView 16.3K | **治理中心·文档评审** | 迁移 |
| B10 | 工程效能 | GovHarnessView 2.7K | **治理中心·度量体检·卡1** | 合并 |
| B11 | 集群健康 | GovClusterSection 8.9K | **治理中心·度量体检·卡2** | 合并 |
| B12 | 语义体检 | GovOntologySection 8.7K | **治理中心·度量体检·卡3** | 合并 |
| B13 | 会话健康 | GovSessionHealthSection 8.2K | **治理中心·度量体检·卡4** | 合并 |

### C. 组件级补充行（board 17 组件中未入上表者+gov 域）

| # | 功能 | 实存锚 | 唯一新家 | 形态 |
|---|---|---|---|---|
| C1 | 任务抽屉/表单 | KanbanTaskDrawer 64.5K/TaskForm 10.3K | 工作台·共享组件（四页含证据页） | 增强 |
| C2 | 注意力条 | KanbanAttentionStrip 5.2K | 工作台·顶（+清偿门红灯） | 增强 |
| C3 | 容量分析 | CapacitySection 8.2K | **治理中心·度量体检·成本卡（卡5）**；推演中心·轮次总览仅引用摘要行 | 迁移（裁决：唯一家在治理，摘要引用非双家） |
| C4 | 诊断规则 | KanbanDiagnosticsSection 9.0K | **治理中心·问题单对账** | 迁移 |
| C5 | 六域体检+六闸总览 | GovHealthSection 16.5K | 拆分：六闸卡→治理中心·关卡与流程；六域→度量体检卡6 | 拆分 |
| C6 | cockpit 驾驶舱组件群 | cockpit 域 52 文件 | 三中心壳与仪表盘的组件基座（域整体沿用） | 沿用 |
| C7 | governance 域其余 | governance 28 文件中未点名者 | 治理中心对应签（域整体归位） | 聚合行 |

### D. 新增能力登记（本轮设计引入，反向对账的「依据」侧）

| # | 新增元素 | 来源依据（实存锚） | 落点 |
|---|---|---|---|
| D1 | 姿态横幅/净额双行卡 | 代偿台账+posture 键（simharness 已落） | 推演中心·轮次总览 |
| D2 | 监督面板（观察窗流/研判/判词） | workflow-journal.ndjson+shadow-observer（已运行） | 推演中心·监督面板 |
| D3 | 证据库（帧/台账/事件/journal 检索） | evidence/ 体系+humansim 审计流（631） | 推演中心·证据库 |
| D4 | 派发器健康卡/休眠工作者卡 | 634/635 补丁端点（已部署） | 推演中心·运行观测 |
| D5 | 清偿门审批流 | mx-compensation-ledger CLI（已落） | 治理中心·清偿门+inbox |
| D6 | 闸修复状态机/受控合并 | orgloop 控制器（636 已部署） | 治理中心·关卡与流程 |
| D7 | 旅程条/四维摘要带/镜头切换器 | roster 编制数据源（既有） | 角色镜头层 |
| D8 | 人工介入待办卡（14 介入点） | approved.events+闸状态+清偿门（全既有） | 各镜头待办队列 |
| D9 | 排期产品源 | autosched/schedule-generator（636） | 推演中心·场景编排 |

### E. 设置页功能逐一盘点（28 个 hermes.* 设置族路由＋2 设置路由＋1 基建，2026-10-15 补扫）

**设计原则**：设置不散入各签——按三件产品分三个设置页（沿用 IaSettingsSidebar 侧栏壳）：**工作台·设置**（个人偏好，跟我走）／**治理中心·系统设置**（组织与系统配置——治理六域的配置面）／**推演中心·推演设置**（引擎参数）。

| # | 设置页 | 归属设置页 | 依据 |
|---|---|---|---|
| E0 | /app/settings（收编壳+IaSettingsSidebar） | 三设置页共用壳 | A2 细化 |
| E1 | hermes.theme 主题 | 工作台·设置 | 个人偏好 |
| E2 | hermes.chat 聊天偏好 | 工作台·设置 | 个人偏好 |
| E3 | hermes.session 会话偏好 | 工作台·设置 | 个人偏好 |
| E4 | hermes.files 文件偏好 | 工作台·设置 | 个人偏好 |
| E5 | hermes.terminal 终端偏好 | 工作台·设置 | 个人偏好 |
| E6 | hermes.browser 浏览器桥 | 工作台·设置 | 个人工具 |
| E7 | hermes.journey 旅程视图 | 工作台·设置 | 个人偏好 |
| E8 | hermes.global 全局配置 | 治理·系统设置·总 | 系统配置 |
| E9 | hermes.config + /hermes/config/settings 配置编辑 | 治理·系统设置·总 | 系统配置 |
| E10 | hermes.version 版本 | 治理·系统设置·总 | 系统信息 |
| E11 | hermes.profiles 档案管理 | 治理·系统设置·人员 | 治理域「人员」 |
| E12 | hermes.group 群组配置 | 治理·系统设置·人员 | 治理域「人员」 |
| E13 | hermes.kanban 看板配置 | 治理·系统设置·流程 | 治理域「流程」 |
| E14 | hermes.workflow 工作流配置 | 治理·系统设置·流程 | 治理域「流程」 |
| E15 | hermes.jobs 定时任务 | 治理·系统设置·流程 | 治理域「流程」 |
| E16 | hermes.agent agent 配置 | 治理·系统设置·功能 | 治理域「功能」 |
| E17 | hermes.plugins 插件（功能开关） | 治理·系统设置·功能 | 治理域「功能」 |
| E18 | hermes.skills 技能装载 | 治理·系统设置·功能 | 治理域「功能」（与 skillgov 岛屿联动） |
| E19 | hermes.mcp 工具接入 | 治理·系统设置·资产 | 治理域「资产」 |
| E20 | hermes.channels 渠道接入 | 治理·系统设置·资产 | 治理域「资产」 |
| E21 | hermes.connections 连接管理 | 治理·系统设置·资产 | 治理域「资产」 |
| E22 | hermes.memory 记忆库配置 | 治理·系统设置·资产 | 治理域「资产」（知识） |
| E23 | hermes.models 模型配置 | 治理·系统设置·成本 | 治理域「成本」 |
| E24 | hermes.usage 用量 | 治理·系统设置·成本 | 治理域「成本」 |
| E25 | hermes.performance 性能 | 治理·系统设置·成本 | 成本/性能同域 |
| E26 | hermes.logs 日志 | 治理·系统设置·审计 | 治理问责面 |
| E27 | hermes.petdex 宠物图鉴 | 治理·系统设置·功能 | 功能开关类 |
| E28 | 推演引擎参数（姿态缺省/观察窗节奏/清偿门策略/审批 TTL escalate） | **推演中心·推演设置**（新增） | 依据=本轮已落地参数面（posture/MX_PROXY_POLICY/escalate config） |
| E29 | settings-layers 四层基建（default<user<workspace<session） | 三设置页共用存储基座 | 既有基建沿用；组织级键落 workspace 层、个人键落 user 层 |

**裁决**：A2 行「设置族不变」细化为 E0-E29——设置收编壳保留，28 项按三设置页重组（治理 18 项/工作台 7 项/推演 3 项+基建 1）。features.ts 构建期开关与运行期偏好的分界维持（settings-layers 注释既定）。

## 二、反向对账（设计元素 → 登记行）

三中心壳（A1/A9/A13）｜工作台 3 签（B1/B2/B3）｜inbox 扩展（A11+D5）｜推演中心 6 签（D1/D2/A6/D3/C3 摘要/B4/B5/B6+D4）｜治理中心 7 签（C5 拆分+C6/D6·C4·D5·B8·B9·B10-13+C3·A3+B7）｜四角色镜头（D7/D8，四首页=C1/B1/B4-C4 重组）｜IDE 增强（A18+新鲜度=branch_fresh 语义）｜消息存证（A14-17+D3）｜三设置页（E0-E29，治理·系统设置按六域分组=治理域裁定的设置面落点）。**每个设计元素均有登记行依据；D 组九件为唯一合法新增（全部锚定本轮已落地的产品能力，无凭空设计）。**

## 三、冲突裁决记录

1. 容量分析旧记「推演中心·轮次总览」与「治理中心」并存=双家违例——裁决：唯一家=治理中心·度量体检成本卡，轮次总览仅引用摘要行（C3）。
2. board 签数 4→3（治理六域裁定后，B7/A3 迁出）。
3. 旧盘点档中「能力与规则+组织资产并入 board」一行废止，以 B7/A3 为准。
4. 本表取代三档各自映射行；后续任何归属变更只改本表（单一事实源），三档引用本表。

## 四、守卫

- 实现按本表逐行验收（每行=一个迁移/合并/增强工单；行号即对账号）；完成一行勾一行，双家/孤儿即时红。
- 帧拍摄位（capture-plan.env）随 A/B 组迁移同步；测试随迁（ia-views/governance-view）；studio 在跑轮次期间禁 inject。
