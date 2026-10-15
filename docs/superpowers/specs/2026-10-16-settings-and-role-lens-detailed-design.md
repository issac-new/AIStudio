# 三设置页与角色镜头层·实施级详细设计（Phase D 首件＋设置基座）

> **文档定位**：定稿（2026-10-16-swarmstudio-final-design）§五 三设置页与 §六 角色镜头层的实施级设计。行号引自对账总表（E/F/G 三组为设置，D7/D8 为镜头层）。实现者照此编码，不再自行决策展示内容。
> **合并原则（对账总表 E/F/G 组裁决）**：设置不散入各签——三层合账（studio 原生 F 组 20 行＋旧 hermes-* 族 E 组 30 行＋侧边栏 G 组 22 入口）按三设置页收纳；**同域同区合并呈现，来源只作标注不作分隔**（小字徽「原生/旧族」），零双家。

# 第一部 三设置页

## 页 0 共用基座（E0/E29/F17/F18/F19/F20/G26）

- 壳：`/app/settings` 并入壳（IaLegacyShell 5.6K）＋`ia2/components/IaSettingsSidebar.vue` 侧栏——侧栏三域即三设置页入口；门控语义=权限闸随行（G26：superAdmin/features.pet/features.agentManager/features.ekko/versionPreview 四类门控不丢，条目级沿用）。
- 行组件：SettingRow（F17）统一行形态；视图壳（F18：SettingsView/HermesSettingsView 分壳，ekko 视图随其域）。
- 存储基座：settings-layers 客户端四层（E29：default<user<workspace<session，键 `sl:<layer>:<key>`，custom/client/settings-layers/index.ts）＋config-layers 服务端配对（F20，custom/server/configlayers/）。归属规则：个人偏好键落 user 层；组织级键落 workspace 层；设置 store（F19，stores/hermes/settings.ts）沿用。
- 来源标注：每个设置区右上角小字徽标「原生」（F 组）或「旧族」（E 组）——标注不分隔，同域项同区混排。

## 页 1 工作台·设置（个人偏好，F1-F8＋E1-E7 合账为 12 区）

| 区 | 内容（来源标注） | 层 |
|---|---|---|
| 显示与主题 | F1 DisplaySettings＋E1 hermes.theme | user |
| 聊天 | E2 hermes.chat | user |
| 会话 | F3 SessionSettings＋E3 hermes.session | user |
| 压缩 | F4 CompressionSettings | user |
| 文件 | E4 hermes.files（G4 入口） | user |
| 终端 | E5 hermes.terminal（G23） | user |
| 浏览器与预览 | E6 hermes.browser（G24）＋F5 GithubPreviewSettings | user |
| 旅程 | E7 hermes.journey（G13） | user |
| 语音 | F2 VoiceSettings 全族（STT/TTS 三件套整族） | user |
| 代理 | F6 ProxySettings | user |
| 隐私 | F7 PrivacySettings | user |
| 我的账号 | F8 AccountSettings（行政操作唯一家在治理中心·组织与资产签，此处仅个人面） | user |

实存锚：`upstream/hermes-studio/packages/client/src/components/hermes/settings/`（17 组件＋voice/ 子目录）；旧族 hermes.* 路由按 E 组行并入。

## 页 2 治理·系统设置（六域分组——「这是治理域 X 的配置」说明常驻每区首行）

| 域 | 内容（E/F/G 合账，来源标注） |
|---|---|
| 总 | E8 hermes.global＋E9 hermes.config（G15）＋E10 hermes.version＋F15 GatewayAutoStart＋G14 ekko 运维区（四页入口）＋G25 versionPreview 版本面 |
| 人员 | E11 profiles（G16）＋E12 group＋F9 UserManagement＋G5 agentManager（agent 编制） |
| 流程 | E13 kanban（G12）＋E14 workflow（G2）＋E15 jobs（G11）＋F14 Webhook |
| 功能 | E16 agent＋E17 plugins（G7）＋E18 skills（G6，与 skillgov 岛屿联动）＋E27 petdex（G18）＋F11 AgentSettings＋F16 DshPluginSettingsPanel＋graph 图引擎策略只读卡（G 组裁决补记） |
| 资产 | E19 mcp（G8）＋E20 channels（G10）＋E21 connections（G3）＋E22 memory（G9）＋F12 MemorySettings＋F13 PlatformSettings/PlatformCard |
| 成本 | E23 models（G1）＋E24 usage（G21）＋E25 performance（G22）＋F10 ModelSettings＋G19 skillsUsage 用量面 |
| 审计 | E26 logs（G20） |

层规则：以上全部落 workspace 层（组织级键）；门控随行——superAdmin 条目对非管理员不可见（G26 语义）。

## 页 3 推演设置（E28 新增，引擎参数页——挂推演中心，设置壳统一承载）

| 区 | 内容 | 条款锚 |
|---|---|---|
| 姿态缺省 | strict/standard/demo 三档选择＋每档政策语义原文引用（strict=全约束从严/standard=现状动作保留每笔代偿记账/demo=演示宽限） | §1.5 双态 |
| 观察窗节奏 | 观察窗间隔与触发面（影子观察层参数） | §2.6.5 监督面 |
| 清偿门策略 | check-clearance 门槛（open=0 方可开轮的开关与例外说明） | §2.6.5 |
| 审批 TTL 升级 | 审批超时 escalate 阈值（633 补丁参数面的产品化） | §2.9 人把关列 |

层规则：全部落 workspace 层（引擎参数=组织级，不随个人偏好走）。守卫：姿态缺省改动不改变在跑轮次——在跑轮姿态以 run-state 为准，设置仅影响下一轮开轮。

# 第二部 角色镜头层（Phase D，盖在三中心上）

## 件 1 角色×站点配置表（D7 单一事实源，新文件 `client/ia2/role-lens.ts`）

前端常量，上游依据=方案正本 §2.4 步操作者列＋§2.9 人把关列。结构：四角色（产品/研发/测试/治理）×各自旅程站点（26 步子集，站点=步号＋全名＋目标路由）＋四维摘要数据源键＋14 介入点登记（见件 3）。旅程条、镜头切换器、四维摘要带三件同读此表——改表即改三件，无第二处配置。

## 件 2 旅程条＋镜头切换器＋四维摘要带（D7）

- 旅程条：工作台顶部常驻横条——只显示当前镜头角色的站点，横向排布；站点三态色（past 淡/focus 亮/future 灰，代偿相关标紫）；站点徽标=该站待办数；当前站高亮。点击站点=直达链接到该步功能面（功能仍住三中心，旅程条只是路径）。
- 镜头切换器：顶栏右侧四镜头（产品·研发·测试·治理）；登录账号的编制角色默认高亮；未授权镜头可看（透明原则），操作按权限闸（非 lead 不见合并钮、HumanGate 只管治理镜头）。
- 四维摘要带：任一镜头可展开——四行各一维：产品维=AC 进度环值；研发维=我的卡在制数；测试维=缺陷四列计数；治理维=六闸进度＋净额。维度=关注面非权限，四维全员可见。

## 件 3 人工介入待办卡（D8，14 介入点全量登记）

数据源三合一：`approved.events`＋闸状态（run-state gates）＋清偿门 open 项（orgloop check-clearance）→ 聚合端点 `GET /api/hermes/interventions/pending`（新增，orgloop 族；输出=待决介入点列表：介入点号/维度/标题/证据锚/待决时长）。

14 点登记（角色镜头稿 §五，一处不漏）：产品维 4——G1 需求冻结判读、系分汇总复核定稿、G5 发布准出、UAT 逐条判词；研发维 3——域 lead 评审合并、自测门禁申诉、缺陷修复验证确认；测试维 3——缺陷「验」人验、残留可接受理由人工签署、G4 新鲜度基线确认；治理维 4——开轮姿态声明、闸 FAIL 缺项清单处置、清偿门 resolve/waive、复盘行动项采纳。

卡形态：人形图标＋批准/打回双钮＋全留痕（谁·何时·依据什么证据）；未处理点在四维摘要带红点计数——「等人决定的事」一眼可数，本身是治理指标。消费位：工作台首页「待我出手」块与 inbox 同源复用本端点（一处实现，处处消费）。

## 件 4 四张角色首页（纯重组，零新数据面）

| 首页 | 组成（全部为既有件重组） | 关键装置 |
|---|---|---|
| 产品「我的需求」 | RFD 卡＋AC 判据进度环（每条 AC 的实现/用例/判词三态）＋待我复核/待我验收两队列 | 冻结边界提示条（G1 冻结后改动走重锁流程）；派发令编辑器（standard 模板/strict 自产拆分）；UAT 判词工作台（左证据右三态判词，判完一键生成验收书） |
| 研发「我的卡」 | 在制 ≤2 卡列表＋每卡下一步动作钮（继续开发/推分支/看评审意见/修缺陷——下一步永远可点）＋任务抽屉四页（工作台 C1 共享件） | lead 评审合并面（merge-run 调 orgloop）；IDE 直达（?task= 协议）＋分支新鲜度徽 |
| 测试「测试台」 | 待跑套件（QUALITY/INT 案例矩阵）＋缺陷泳道四列（在途/已修待验/已验/回归）＋准出检查单（出口准则逐项灯） | 「测试者≠写码者」账号级独立性自动标注；诚实报告强制字段（未跑用例不许静默）；G4 新鲜度双查呈现 |
| 治理「驾驶位」 | 姿态横幅＋开轮/续跑钮（prelaunch 十六项灯）＋六闸进度＋净额对账双行卡＋观察窗最新研判 | =推演中心轮次总览变体（同数据面重组）；清偿门红灯位；治理报告位（预览/多格式导出/审计四查状态） |

连贯性约定：产品维每步产出挂同一张 RFD 卡，冻结单/任务清单/概设/排期/测试报告/验收书=卡的证据时间线。研发维卡的全状态变化回抽屉：会话提醒/评审意见/合并结果/缺陷单。测试维缺陷报-修-验-回归全环在一条泳道。

## 数据契约汇总（Phase D 消费面）

| 端点/数据源 | 消费件 | 正身 | 合并铁律 |
|---|---|---|---|
| GET /api/hermes/interventions/pending（新增） | 件 3＋首页待办＋inbox | orgloop 族 | 介入点唯一聚合 |
| observability/run-state（631） | 四维带/驾驶位 | 631 | 透传 |
| simcenter 族九端点（Phase B） | 驾驶位/四维带 | simcenter | 一处实现 |
| orgloop 清偿门契约（Phase C） | 件 3/驾驶位 | orgloop 族 | 原样消费 |
| 看板 API＋profiles | 研发/产品首页 | 既有 | 过滤在参数 |
| role-lens.ts 配置表 | 件 1/2/4 | 本档件 1 | 单一事实源 |

## 实施序与守卫

序：件 1 配置表（先行，无 UI 依赖）→ 件 3 介入点端点与卡（治理价值最高）→ 件 2 旅程条三件套 → 件 4 四首页（逐张，研发先行——卡抽屉四页已熟）。依赖=A/B/C 全落（镜头对准的目标已存在）。守卫：角色镜头不做角色专属路由（URL 稳定，视角随镜头变）；四维内容全员可见（透明是治理前提）；代偿紫标不对任何角色隐藏；E 收尾件（帧拍摄位同步＋测试随迁＋ekko 域归位检查）在本层落地后统一执行。
