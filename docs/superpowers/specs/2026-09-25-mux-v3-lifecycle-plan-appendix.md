# Swarm Studio 全流程推演方案 · 工程附录（脚手架）

> 本附录承接主方案（2026-09-25-mux-v3-lifecycle-plan.md）于 2026-09-26 应「去除脚手架内容」指令移出的工程实现与实测记录：脚本执行方式、M3 事件化接线、实测记录、正文内实测注记。主方案只保留流程与机制设计本身。

## 一、推演执行（脚本）

推演脚本为单文件 `overlay/scripts/aipay/aipay-scenario.sh`（26 步与主方案"具体流程 1-26"逐步对应，头部注释有对照表）：

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
bash scripts/aipay/mux/mx-setup.sh        # 环境供给（账号/看板/团队/记忆库/中央仓，可反复跑）
bash scripts/aipay/mux/mx-up.sh           # 起单 gateway + 单 studio
RUN_ID=轮次1 bash scripts/aipay/aipay-scenario.sh    # 全流程 26 步一键推演
# 断点续跑 START_STEP=<步名>；区间上界 UNTIL_STEP=<步名>；换需求轮 RFD_ID=RFD-00X
```

脚本每一步的"把关"即硬断言（真值轮询、超时打回、凭证核验），推演报告（流程 26）自动生成于 `evidence/simulation-report.html`。当前状态（2026-09-25）：流程 1-7 与 22-23 等导演侧步骤已实测通过（含 G1 真实拦截与冻结入仓、问题单真实产生、HTML 报告真实产出）；第 8-21、24-25 条中的 AI 回合步骤待模型额度恢复后一键跑完（额度耗尽会被开局预检如实拦截，不记为产品缺陷）。

## 二、M3 事件化 wiring（2026-09-25 落地）

V3 推演与 delivery 协议（`com.swarmstudio.delivery.*` v2）打通：`MX_DELIVERY=1` 时场景在六阶段边界发协议事件（缺省关闭零行为变化）。映射表：

| V3 步骤 | delivery 事件 | 说明 |
|---|---|---|
| reqgate（G1 冻结入仓） | 开案例房（P1）+ stage P1 done + gate G1 pass（HumanGate，sender=fanfan 人类账号）+ case→P2 | 工件指针=G1 冻结文件 |
| archgate（G2 通过） | stage P2 done + gate G2 pass（decidedBy=arch）+ case→P3 | 概设评审 |
| devimpl 完成（16b 前） | stage P3 done + gate G3 pass（decidedBy=chen）+ case→P4 | 实现收口 |
| testpass（g4_pass 置位） | stage P4 done + gate G4 pass（decidedBy=qi 非实现者）+ case→P5 | 测试报告入仓 |
| ready（G5 通过） | gate G5 pass（HumanGate） | P5 done 在 UAT 收口后发 |
| uat（验收通过） | stage P5 done（工件=验收报告）+ case→P6 | |
| retro（G6 入仓） | stage P6 done + gate G6 pass | 终态 P6 |
| report 后 | dlv_scenario_assert：六 stage/六 gate/终态断言，报告落 evidence/delivery-events/ | 未全过记问题单不打断 |

接线为单行调用（aipay-scenario.sh 八处，helper 在 mx-delivery-lib.sh：dlv_scenario_open/phase/advance/assert）。断点续跑语义：事件只补未跑段（sset dlv_room 幂等开案例）；全流程事件完整性以"从头跑"为准。agent bot 入案例房留 M4（当前仅人类账号邀+join）。驱动验证：同套 helper 在真 Synapse 演练六阶段全链，断言全过（2026-09-25）。

## 三、实测记录（V3 全流程轮 2026-09-25）

| 层 | 步骤 | 方式 | 成果 |
|---|---|---|---|
| 真实 LLM 层 | 1-15（smoke→review） | DashScope qwen-plus | 144+ 回合、4 系分稿、tasklist、凭证核验通过 |
| 导演补完层 | 16-26（archgate→report） | 导演侧驱动 | 概设/排期/测试/验收/复盘入仓、26 步 state 全落 |
| 问题台账 | — | — | 18 条 ISSUE + 4 条 DISP，四问题已根治 |

暴露并修复的四个问题：①assignee 格式两套体系（normalize_assignee 归一化）②agent 集中式建卡（dispatch 强化分布式指令）③room-invite-gap 复发（前置邀人指令）④模型通道单点（MX_FALLBACK_MODELS 框架）。

## 四、正文移除的实测注记（备查）

以下注记从主方案正文移除，修复机制本身已在正文保留为规则：

1. 背景处「——V3 实测全通道断路教训」（模型备用切换机制保留）；
2. 第 8 步「（V3 实测 room-invite-gap 复发 8 次，dispatch 指令已前置邀人要求。）」（自动邀请全部关联人的要求保留）；
3. 第 10 步「V3 实测 bug 已修 normalize_assignee 归一化」与「——V3 实测 agent 集中式建卡不分发，dispatch 指令已强化」（assignee 填短名、子任务建在责任人板上、逐条发消息的规则保留）；
4. 第 20 步本地绝对路径「/Users/cuishi/.hermes/delivery/DELIVERY-STANDARD-COMPLETE.md」（改为「交付标准模版库」通用表述）；
5. 第 26 步「报告由脚本 report 步自动汇编生成（截图落 evidence/screenshots/ 自动嵌入，补图后重跑 report 步刷新）」与把关行「（实测已产出）」（报告产出要求保留）；
6. 治理总则第 6 条「存档 evidence/」改为「留档备查」；
7. AI 员工编制引言「（用户提供，2026-09-24 v2 版）」来源注记。

## 五、收尾轮实测记录（2026-09-26 全流程完成）

| 项 | 结果 |
|---|---|
| 26 步全流程 | **26✅/0⬜**，evidence/simulation-report.html（含 4 张真实界面截图：驾驶舱/群聊/看板/IDE） |
| 四硬闸 | G1 冻结入仓 · G2 arch 实评过闸 · G4 独立测试 51/51+四套件 · G5 三轮评审实测复审 PASS |
| G3 测试证据 | 四开发分支 testlog 全落档：PAYCORE 52/CHWX 25/CHALI 54 用例全绿，MP verify-logic 17+verify-skeleton 220 检查全过 |
| 问题单台账 | 34 条 ISSUE / 34 条 DISP（100% 处置：30 已修/4 观察/延后口径见复盘表） |
| MiMo 通道 | 四形态（plain/tools/stream/reasoning）curl 全 200 + 真实 profile 端到端直出；早期 format reject 判定为瞬时 4xx 放大，已自愈 |
| 状态恢复事件 | 19:1x 并行重跑致 state 丢完成键，按 run8 终态快照（真实时间戳）恢复并记账 |

截图捕获要点（复用）：studio SPA 为 hash 路由（#/app 驾驶舱 · #/hermes/kanban?board=<slug> 看板 · #/hermes/group-chat 群聊 · #/ide?task=<卡> IDE）；登录态注 localStorage `hermes_api_key`=JWT + matrix_* 四键；playwright 经 createRequire 锚定 upstream/hermes-studio/node_modules + tools/chromium 的 Chrome for Testing。
