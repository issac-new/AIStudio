---
name: pm-planning
description: 项目管理与研发治理：基于定稿系分与工作量评估编排开发/测试计划，生成带时间窗口的 kanban 子任务并派发；测试工作量按 0.3 系数叠加
---

# PM Planning（排期与研发治理）

## 交付形态字段（2026-10-11 平台根治，run14 教训）
排期表与任务书必带「交付形态」列（六型：backend-service/web-frontend/mini-program/mobile-app/library-sdk/governance-doc，正本=Swarm Studio custom/server/delivery-contract）。每型任务的完成定义含对应运行证据：mini-program=真开发者工具 runtime-proof、web-frontend=浏览器走查帧、backend-service=启动冒烟+跨模块契约测试、mobile-app=模拟器启动证据。派发词随形态注入 DoD 与 RUNTIME-OK/RUNTIME-FAIL 结论行约定；QGate delivery.runtime-evidence 门在 task_close 按形态拦截缺证（单测全绿不等于可运行）。

## 触发

产品经理（本机 owner）要求基于定稿的系分结果编排开发/测试计划时执行。

## 流程（严格按序）

1. 读入：定稿需求规格 + 架构设计方案 + 各任务工作量评估
  （docs/analysis/ 与 docs/design/ 最新稿）。
2. 工作量口径：开发工作量按系分评估；**测试工作量 = 开发工作量 × 0.3**，直接
   叠加为独立测试任务。
3a. **并行分配铁律（2026-10-18 run21 提速批，用户指令沉入）**：同一域的多件
   子任务（如 pay-core 的 C/S/N）**不得捆给同一人串行**——能并行的横向摊到多工位
   （多人各一单）或同一人多会话各领一单（hermes 单档案多会话并行，配 git worktree
   隔离）；任务间真有依赖时在任务表「依赖」列显式标注并用「先行件落地后 rebase
   对接」而非「等先行件再开工」。排期表须给出每单的并行度说明（独立并行/依赖串行）。
   worktree 派发须配收尾条款：收到 PUSH-CONFIRMED 回执后 `git worktree remove`
   回收工作树（分支已推远端即弃树），派发词只建不收=残树占盘（2026-10-18 审计轮补）。
3. 排期约束：依赖关系（渠道适配依赖 pay-core 接口先行、前端依赖 BFF 契约）、
   人员当前负载（kanban 在途）、交付时间窗。每日按 6 有效工时折算。
4. 产出 `docs/plan/RFD-<id>-schedule.md`：任务表（ID/模块/责任人/类型(开发|
   测试)/工作量(人日)/开始-结束窗口/依赖），gantt 文本图，里程碑。
5. kanban 登记：每个开发/测试任务建子任务（link 到排期父任务），卡片含时间
   窗口与工作量；本机代办登记。
   **5.5 分发（V8.29 根治，run20 r3 派单断棒实录）**：每个开发子卡登记后
   **必须立即**调用 `mx_dispatch_subrev fanfan <subcard-id>`（确定性按 D-项
   分派 assignee + 复制对账卡到研发板）。禁止「建了卡就停」——未分派的
   子卡=半成品，驱动巡检官 30min 内即报 `card.unassigned-stale`。
   派单后立即推仓（commit origin/main）再终止回合。
6. 派发：逐条 matrix 消息 @主责研发-agent（或测试-agent）与 @其 lead-agent，
   附任务明细与计划文档 git 地址。

## 纪律

- 计划必须有缓冲：整体排期后加 15% 集成缓冲段。
- 结论行以 `PLAN-DONE-<RFDID>` 开头；排期冲突无法解时以
  `PLAN-BLOCKED-<RFDID>` 开头并说明冲突点。
- **子卡禁飞（V8.29）**：登记子卡后必须调用 `mx_dispatch_subrev`
  分派+分发（不派发即不算完成）；子卡 assignee 为空
  即视为断派单，巡检官 30min 告警。
