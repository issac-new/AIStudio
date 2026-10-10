# 路演素材大纲（roadshow-outline）

> 生成：2026-10-10 07:51:29；数据源：/Users/cuishi/lab/ncwk/simharness/tests/fixtures/unified-mini/runs/fixture-run（实算，无编造）

## 开场
headline: 全流程推演：让 AI 团队把需求跑到发布
points:
- 一轮 2 个呈现步、1 次审批的真实协作
- 六闸落键 3 道
- 每一步都有可反查的对话/帧/台账证据
anchor: state.env+r18-steps.json 实算

## 需求线
headline: 需求提出、冻结与凭证收口——回执与登记类缺口 1 条（入库真值在案、过程凭证缺失）。
points:
- 回执与登记类缺口 1 条（入库真值在案、过程凭证缺失）。
- G1 需求冻结已落键。
anchor: audience-cards：requirement

## 设计线
headline: 系分、概设与架构治理闸——G2 架构评审通过并落键。
points:
- G2 架构评审通过并落键。
- 概设/评审记录无缺口记录。
anchor: audience-cards：architecture

## 开发线
headline: 六路开发与本地门禁证据——开发证据缺件 1 条（分支或 testlog 缺失）。
points:
- 开发证据缺件 1 条（分支或 testlog 缺失）。
- G3 已落键。
anchor: audience-cards：coding

## 测试线
headline: 独立测试与缺陷闭环——测试报告/交付证据无缺失记录。
points:
- 测试报告/交付证据无缺失记录。
- scenario.log 记录缺陷信号 1 处（以【缺陷】行计）。
anchor: audience-cards：testing

## 治理线
headline: 门禁、审计与治理度量——门禁零打回零熔断记录。
points:
- 门禁零打回零熔断记录。
- 审批 1 次、派发 1 次、呈现步 2 个（实算）。
anchor: audience-cards：dev-mgmt

## 平台线
headline: 承载面：采集、稳定性与产能——运行面事故 1 条（采集失败/重启/驱动异常）。
points:
- 运行面事故 1 条（采集失败/重启/驱动异常）。
- 呈现步 2 个、对话件 1 组、帧 2 张（r18 实算）。
anchor: audience-cards：platform

## 六闸
headline: 六闸逐闸结果（真值锚=state.env 落键）
points:
- g1_frozen：在位
- g2_arch_pass：在位
- g3_code_pass：在位
- g5_ready_pass：未见
- g6_report_pass：未见
anchor: state.env

## 数据亮点
headline: 问题与改进的双向账
points:
- receipt-missing×1
- g3-local-gate-missing×1
- frame-capture-failed×1
anchor: issues.log 分类计数

## 结尾
headline: 能力主张：全流程可审计的 AI 团队协作
points:
- 从需求到发布的 26 步全链路有据可查
- 六闸治理：不过闸不放行，打回有留痕
- 下一轮：图引擎自驱动+二合一报告持续演进
anchor: 本报告全文
