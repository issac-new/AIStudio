# 2026-11-06 O7 派发权移交总监角色（PR-7，run27 设计优化第七项）

> 来源：run27 复盘四类结构缺陷 A 判据 fail-open 的代偿结构治理——「dispatch-preset 77 笔=15 人组织的派发面主要靠脚本代演，净额口径下组织能力长期为 0」（spec `2026-11-06-run27-design-gap-rootfix.md` O7）；用户裁决七项全做、本项因产品面大改造挂下轮（`2026-11-06-run27-design-optimizations.md`）。本批=机制批（通道＋降级保底＋净额台账），活体验证=run28 首跑。

## 变更

1. **`simharness/mux/mx-scenario-lib.sh` `dispatch_in_room()` 增 director 姿态**（`MX_DISPATCH_MODE=director` 显式开关，缺省零行为不变）：
   - **需求移交**：脚本只发「需求草稿＋总监框架指令」到分析房——from=人类需求方（$1），mention **只 @wei-agent**（团队负责人A，displayname 职能表 386 行既有语义），正文=调用方 $2 原文标注为草稿（总监可改派/改分工）＋一句框架指令（「由团队负责人牵头拆分、指派与派发」）。不带既有任务书模板（派发标识/RACI 解析段是执行任务书形态，总监自己写）。
   - **wait 总监产出**：`mx_wait_sender` 等 wei-agent 在移交消息之后发出含 `@[a-z-]+-agent` 的消息（=总监自主产出任务书并 @ 执行者）；超时 `MX_DIRECTOR_TIMEOUT`（缺省 480s）。
   - **成功**：`self-dispatch.jsonl` 落 director 行（`from=wei-agent`＋additive `mode:"director"`，净额达标同族——B 批台账语义：自派发进独立 jsonl 不进代偿账）；返回移交消息 event_id。
   - **降级**：超时/移交 SEND-FAILED → `compensate director-dispatch-timeout` ＋落**strict 分支**（自主组织消息，不降 preset——preset 是 O7 要退役的旧行为）＋issue 记录。run28 主链不被卡死（fail-soft）。
2. **净额口径修复路径**：director 姿态轮的 dispatch-preset 趋零（脚本不再预写任务书）、self-dispatch.jsonl 的 director 行=真实组织派发——报告净额行实算消费既有逻辑零改动。
3. **不动的面**：posture 机制（strict/preset 二态保留为既有行为）；15 人编制零变更（总监=既有 wei 兼任，无 roster/org/matrix 对账面扰动）；wei-agent 的 profile/提示词面**本批不动**（群消息上下文驱动 LLM 理解负责人职能；若 run28 首跑总监哑火率高，P1 给 profile 加职能词——挂账）。

## 决策记录

| # | 决策 | 依据 |
|---|---|---|
| D1 | 总监=wei 兼任而非新增编制 | displayname 职能表 wei=团队负责人A（组织 leader 语义既有）；新增 16 人=roster/org/matrix 三方对账面全动（R28 断言），改造面倍增且破坏「15 人组织」复盘口径 |
| D2 | 显式 env 开关（MX_DISPATCH_MODE）而非改 posture 语义 | posture 是全局二态被多处消费；新通道独立开关=run28 可单轮启用对照（director 轮 vs strict 轮净额对比正是 O7 的验证设计）；缺省零行为=存量轮零风险 |
| D3 | $2 原文作为「需求草稿」移交而非重写原始需求 | 调用点（1425/1504/1512/1520 等+subrev）零改动；草稿标注后脚本预写内容降为参考输入，派发决策权（谁做什么）归总监——净额语义成立的充分条件是决策权移交，不是文案从零写 |
| D4 | 降级目标=strict 不回 preset | preset 是 O7 退役面；降级链 director→strict→（无第三级），strict 自主组织消息已是 B 批净额达标行为 |
| D5 | 提示词面 P0 不动 | agent 侧职能由群上下文（displayname 团队负责人AI＋框架指令）驱动；先跑真数据再定 profile 改造（YAGNI——run28 首跑数据决定 P1 是否需要） |
| D6 | wait 谓词=含 @agent 消息而非语义判定 | 机械可测（mx_wait_sender pattern 复用）；「任务书质量」不属门槛属 G2/G3 既有闸——不在此处重复执法 |

## 验证

- [x] 守门 **7/7**：源码级三分支结构（开关/wei mention/wait/降级链两置位点/缺省零行为短路序）＋行为级四路径（成功落 director 行无 compensate／超时降级 strict 且 preset 姿态下不回 preset／SEND-FAILED 降级不卡死／缺省零新行为走 dispatch-preset）。行为级测法=**提取函数体**（`sed -n '/^dispatch_in_room()/,/^}/p'`）＋stub 全外部依赖——整库 source 依赖链（mx-lib/ledger/hb）不进测试。
- [x] `bash -n` 过；存量回归 decision-receipts＋run27-design-gap **25/25**＋contract-gate shell 门 ✓。
- [x] 全量 `npm test`：**8534 passed / 0 failed / 11 skipped**（1110 文件）＋1 vitest-worker 负载型 error；链尾 release:check 红=worktree 伪象族（docs:check 路由计数/引擎解析，前两批定谳 main 绿）。N-4 坑在本 worktree 复发一次（未建链直接跑全量），配方建链（git 重置三树＋清 .overlay-injected.json＋inject 469/complete）后过——**配方已入记忆，worktree 建链应成为全量门前置标准步**。
- 活体验证：**留 run28 首跑**（`MX_DISPATCH_MODE=director` 启用轮）——本批如实记「机制在位未经活体」；P1 挂账=总监 profile 职能词（首跑总监哑火率高才做）。

## 设计文档影响

DESIGN_SYNC: none —— 推演 harness 派发通道增强（新姿态开关＋台账 additive 字段），六闸判据/纪律条款/净额报告实算逻辑均未改；无整合正本/数字总账触及。
