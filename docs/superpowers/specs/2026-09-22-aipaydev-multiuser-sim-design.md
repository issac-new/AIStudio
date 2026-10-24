# aipaydev 多用户产品研发团队 Matrix 全流程推演设计

日期：2026-09-22
状态：拓扑口径已被取代——§4（实例与端口）与 §7 步骤 1-5 的实例拓扑以
`2026-09-24-multiplex-multiuser-feasibility-and-plan-v2.md`（单 gateway 多路复用 + 每账号多 kanban）为准；
20 步业务流本身仍以本文 §7 为准。
前置设计：2026-09-17-multiuser-matrix-collab-sim-design.md（3 用户 stringops 轮）、matrix-fleet v2、M-A 协议 v2

## 1. 目标

基于真实需求（依据财付通/支付宝公开技术手册，为收单商户开发兼容多端的小程序支付收银台），在本机模拟完整多人的产品研发测试团队及真实工作流程，对 SwarmStudio 的「驾驶舱」「协作沟通」「IDE 工作台」做全流程推演；暴露的问题在 overlay 修复并全量回归，直至彻底完成。

推演产出的代码仓库统一使用 GitHub `issac-new/aipaydev`（私有）。

## 2. 与 09-17 轮的差异

| 维度 | 09-17 stringops 轮 | 本轮 aipaydev |
|---|---|---|
| 团队规模 | 3 用户 | 12 账号（11 实例，admin 仅 matrix 操作） |
| 组织模型 | 扁平三工程师 | BA/PM/双团队 lead/4 研发/2 测试/架构治理 |
| 流程深度 | RFD→分解→实现→集成→发布 | 20 步：系分/RACI 派发/双兜底/排期/缺陷闭环/发布登记 |
| 应用模块 | 单包 stringops | 4 个 csw-* 应用（收银台小程序/支付核心/财付通渠道/支付宝渠道） |
| 考察面 | gateway+kanban 链路 | 驾驶舱 + 协作沟通 + IDE 工作台三面 |
| 中央仓库 | 本地 bare 仓 | GitHub issac-new/aipaydev |

## 3. 团队编制（Matrix 账号，server_name=matrix.test）

| 序号 | 账号 | 角色 | 团队 | 职责 |
|---|---|---|---|---|
| 1 | admin | 管理员 | — | 账号分配、房间治理（不起实例） |
| 2 | bella | BA | 业务分析 | 输出客户需求文档 RFD-001 |
| 3 | fanfan | 产品经理 A | 产品团队 | 需求分析主持、评审组织、排期、发布登记 |
| 4 | wei | 后端团队负责人 | 支付后端 | csw-pay-core + 两个渠道应用的 lead |
| 5 | mei | 前端团队负责人 | 小程序前端 | csw-cashier-mp 的 lead |
| 6 | chen | 研发 | 支付后端 | csw-pay-core 主责 |
| 7 | hu | 研发 | 支付后端 | csw-channel-wechat（财付通）主责 |
| 8 | lin | 研发 | 支付后端 | csw-channel-alipay（支付宝）主责 |
| 9 | xiao | 研发 | 小程序前端 | csw-cashier-mp 主责 |
| 10 | qi | 测试 | 支付后端 | 后端三应用固定测试 |
| 11 | fei | 测试 | 小程序前端 | csw-cashier-mp 固定测试 |
| 12 | arch | 架构治理 | 虚拟架构小组 | 评审（本轮线下人工结论，账号在册收通知） |

每人配 `-agent` 机器人账号（显示名「<账号> 的 AI 助理」），共 24 个 matrix 账号。
密码统一 `Aipay_<账号>_2026`，token 由 setup 脚本登录后落 `SIM_ROOT/creds/`。

## 4. 实例与端口

SIM_ROOT 独立为 `/Volumes/nvme2230/lab/ncwk-sim-aipay`（与旧轮 `ncwk-sim` 隔离，避免串库）。

- studio：8701+i（i=序号-1，admin 不起实例）→ fanfan=8703 … arch=8712
- gateway：8721+i → fanfan=8723 … arch=8732
- 每实例独立 HERMES_HOME：`$SIM_ROOT/users/<u>/.hermes`，profile 名同账号
- gateway 复用真机 model/fallback/custom_providers 配置（cc-switch 代理）；并发派发错峰（cc-switch 限速前科）
- studio 用生产构建 `upstream/hermes-studio/dist/server/index.js`（若落后于 overlay main 则先 build:full）

## 5. 技能安装（hermes profiles/<u>/skills/）

| 技能 | 装机范围 | 作用 |
|---|---|---|
| capability-report | 全员 | 收到能力查询指令时读本机 machine-manifest.json 并上报 kanban/teams/agent 能力清单 |
| requirements-analyst | fanfan | 金融支付（银行卡及网络支付、转接清算）背景 + 需求切分/提取/评估 + 架构统筹 + SMART 拆分 + RACI 派发 |
| pm-planning | fanfan | 排期、工作量系数（测试 0.3）、kanban 子任务登记 |
| aipaydev-dev | chen/hu/lin/xiao/qi/fei | xxx-dev 研发技能：仓库资产地图、开发流程、worktree 纪律、接口/数据模型设计、白盒扫描/单测/回归 |
| inbox-dedup | 全员 | 重复派单自动合并去重、完成后双兜底通知（发起人+团队负责人） |
| defect-loop | qi/fei/chen/hu/lin/xiao | 缺陷复现确认→修复→自测→提测流程 |

swarm-yuan 正式生成 xxx-dev 技能成本过高（每仓全量普查），本轮按其输出规范手工编制 `aipaydev-dev` 技能正文并在报告中如实标注此替代。

## 6. 应用模块清单（csw-* 即应用模块）

| 应用 | 名称 | 主责 | 测试 | 团队 lead |
|---|---|---|---|---|
| csw-cashier-mp | 多端小程序收银台前端（微信/支付宝双端） | xiao | fei | mei |
| csw-pay-core | 支付核心（收单、路由、对账接口） | chen | qi | wei |
| csw-channel-wechat | 财付通（微信支付）渠道适配 | hu | qi | wei |
| csw-channel-alipay | 支付宝渠道适配 | lin | qi | wei |

公开手册锚点（写进需求文档）：
- 微信支付 V3 小程序下单 `POST /v3/pay/transactions/jsapi`（pay.weixin.qq.com 文档中心）
- 微信小程序调起支付 `wx.requestPayment`（timeStamp/nonceStr/package=prepay_id/signType=RSA/paySign）
- 支付宝小程序 `my.tradePay`（tradeNO）+ 服务端 `alipay.trade.create`（opendocs.alipay.com）

## 7. 20 步 → 导演机制映射

导演脚本只做三件事：扮演人类打字/点击、安装材料、核验地面真值。所有 agent 动作均为真实 gateway + LLM 回合。

| 步骤 | 机制 |
|---|---|
| 1 账号分配 | setup 注册 24 账号；roster（去 token）入 aipaydev `docs/admin/roster.md`；含 token 的 credentials.md 仅落各用户 SIM_ROOT 目录 |
| 2 gateway 配置 | setup 写每用户 profile config.yaml/.env（matrix channel 五件套），等价真机 8650 配置动作 |
| 3 登录 | 每实例验证两种登录：matrix 账号密码登录页登录；已配 gateway channel 的自动登录（若无此能力记为问题单） |
| 4 功能就绪 | 冒烟：每实例 /health/ready + kanban API + cockpit 聚合端点 |
| 5 profiles | 各实例 hermes 首启 bootstrap 默认智能体，核对清单 |
| 6 BA 分发 | bella 提交 RFD-001 至 aipaydev `docs/requirements/`，matrix 私信 fanfan（email 通道本轮禁用，以 matrix 替代并在报告标注） |
| 7 建群 | fanfan 建「支付收银台需求分析讨论群」，邀 fanfan-agent |
| 8 发需求 | fanfan @agent 发 RFD 摘要 + 仓库地址 |
| 9 登记+分解 | fanfan-agent 登记协作 kanban，加载 requirements-analyst 技能 |
| 10 系分 | 技能执行：文档提取评估→读三清单（roster/machine-manifest 上报/架构文档）→SMART 拆分→kanban 登记→邀请关联人进群→按 RACI 逐条 @责任人+lead 派发→建跟踪子任务（kanban link 父子） |
| 11 分诊 | 各接收方 orchestrator 登记分诊台；lead 确认/调整；dev 领用；完成双兜底；重复派单去重 |
| 12 系分执行 | dev 侧 worktree 建任务 workspace，aipaydev-dev 技能驱动分析/概设/工作量评估，matrix 回执 lead+发起方 |
| 13 复核评审 | fanfan 汇总→requirements-analyst 复核→评审任务（线下人工结论，fanfan 手工更新）→定稿 |
| 14 归档关闭 | 主任务登记全部子任务与档案链接，标记 done（测试工作量 ×0.3 叠加） |
| 15 排期 | fanfan 用 pm-planning 生成带时间窗口的开发/测试计划，kanban 子任务 + matrix 派发 |
| 16 开发测试闭环 | 分诊→worktree→真实编码（小程序骨架+pay-core+双渠道适配，渠道端点 mock）→白盒/单测/接口/回归→缺陷 matrix 回流→修复→提测 |
| 17 测试通过 | 测试 agent 登记 commitid 到关联任务，出测试报告（入 aipaydev `docs/test/`） |
| 18 发布登记 | 变更发版/交付任务登记（线下执行，任务追踪在册） |
| 19 模板完备性 | 套用 DELIVERY-STANDARD-COMPLETE.md 模板；缺口即改；任务分类/优先级/依赖完备性检查脚本 |
| 20 IDE 工作台 | 验证任务→IDE 跳转（ide?task=）+ 任务简报自动生成；缺口记问题单 |

## 8. 观察面与取证

- 驾驶舱：每关键节点抓 fanfan/chen/qi 三实例 `/app` 驾驶舱（聚合端点、看板、等我这儿、在线状态）
- 协作沟通：房间消息流全量留证（evidence/room-*.json），群邀请/线程/mention 计数
- IDE 工作台：任务跳转链路、简报生成、会话三段视图
- 取证：`sim-evidence.sh` 同类脚本输出 evidence/（房间消息、kanban 快照、git 真值、UI 截图）
- 问题单：发现即录 `docs/issues/ISSUE-NN.md`（aipaydev 仓），修复走 overlay fix 分支

## 9. 修复与回归门禁

- 所有产品修复在 overlay 建 `fix/<slug>` 分支，过守门测试后合 main（workspace 分支纪律）
- 收口门禁：`npm run inject` 注入完整 + tsc 0 错 + vitest 全绿 + i18n 守门 + hermes agent pytest + build:full
- 推演报告：结论先行，每论断带锚点（event_id / commit / file:line / 实测输出）

## 10. 已知替代与偏差（诚实清单）

1. email 通道（步骤 6）禁用，以 matrix 私信替代。
2. swarm-yuan 全量生成 xxx-dev 技能以手工编制替代（按其输出规范）。
3. 架构评审（步骤 13）线下人工结论，由 fanfan 手工更新。
4. 变更发版（步骤 18）线下执行，仅登记追踪任务。
5. 人员清单来源：matrix 无公开全量用户目录 API，采用 admin roster 文档下发（步骤 1 产物），与真实企业目录服务下发等价。
