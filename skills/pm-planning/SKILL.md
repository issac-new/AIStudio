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
3. 排期约束：依赖关系（渠道适配依赖 pay-core 接口先行、前端依赖 BFF 契约）、
   人员当前负载（kanban 在途）、交付时间窗。每日按 6 有效工时折算。
4. 产出 `docs/plan/RFD-<id>-schedule.md`：任务表（ID/模块/责任人/类型(开发|
   测试)/工作量(人日)/开始-结束窗口/依赖），gantt 文本图，里程碑。
5. kanban 登记：每个开发/测试任务建子任务（link 到排期父任务），卡片含时间
   窗口与工作量；本机代办登记。
6. 派发：逐条 matrix 消息 @主责研发-agent（或测试-agent）与 @其 lead-agent，
   附任务明细与计划文档 git 地址。

## 纪律

- 计划必须有缓冲：整体排期后加 15% 集成缓冲段。
- 结论行以 `PLAN-DONE-<RFDID>` 开头；排期冲突无法解时以
  `PLAN-BLOCKED-<RFDID>` 开头并说明冲突点。
