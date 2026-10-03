# 全流程推演方案问题分析（依据 run7 最终报告）

依据：RUN=20261002-v5-run7 最终报告（reports/run7/final-report.html，26 步/六闸/42 图/问题单 31 行 15 键全处置）。
对照正本：docs/superpowers/specs/2026-10-02-mux-v6-fullflow-plan.md（562 行，总则 15 条）。
方法：run7 报告全部问题单/打回环/逆境实录逐条归因——执行层已修项剔除，只留**方案层缺口**（条文矛盾、盲区、不可执行设计）。每条带 run7 实锤锚点。

## 结论一句话

run7 六闸全过、UAT 7/7，但全程 13 小时中约 4 小时消耗在**方案未定义的行为面**上：并发容量、环境残留、会话断裂、驱动子命令韧性、回合尾部动作——这五类占 run7 全部治理逆境的六成。V6 的闸门/凭证/判词体系已被 run6/run7 双轮验证可靠；下一版的主要增量在**运行韧性与容量规划**章节。

## 一、方案层缺口（八项，按影响排序）

### P1 并发预算章节缺失（影响最大：anexec/devimpl 两步必撞）
- **实锤**：anexec 18:06 hu/lin 派发撞 max_concurrent_sessions=4 拒收（dispatch-capacity-rejected 单，三发 nudge 才救回）；devimpl 20:43-20:5x lin/xiao 十一次 Rejecting；容量排队补丁 533 三次被 hermes 自更新擦除（run6/run7 各实录）。
- **缺口**：§四架构链路无并发预算条文——编制 15 人×30 账号与网关闸值 4 的矛盾从未被方案正视；错峰派发（驱动 sleep 5）形同虚设；"容量拒绝必须排队不得丢弃"无条文依据。
- **建议**：新增"并发预算与容量守卫"小节：闸值×编制×峰值矩阵（26 步各步并发峰值表）；容量拒绝一律入排队泵（533 语义）；错峰派发改为按闸值分批；网关重启前并发归零检查。

### P2 环境重置口径不完整（run6 遗留三度污染 run7 判定面）
- **实锤**：hu 工作区 run6 旧提交（534202f@11:38）被误读为 run7 进度（director-nudge-mislead 单）；origin 旧 feat/DEV-* 四条依赖 branch_fresh 时间甄别兜底；mx-clean 不清 workspaces 与远端分支。
- **缺口**：§十一 mx-clean 合格线只写"runs 无旧目录/房间无同名房"——工作区、远端分支、集成分支三面不在合格线内。
- **建议**：合格线补三条：agent 工作区按轮重建（或基线重置+RUN 标记核验）；远端旧轮分支删除或条文写明"由 branch_fresh 守卫甄别"；integration 分支重置（旧轮测试报告存在性不应让 repo_has 直接判真——推广 artifact_fresh：工件核验须带 RUN 标记或晚于 run_started_at）。

### P3 驱动子命令失败隔离缺失（死循环三连）
- **实锤**：gate_review 的 jq payload 键名语法错在 set -e 下击杀主进程→relay 无限换代（00:53-00:57 三连，gate-review-jq-crash 单，热修 c24a9d60）。
- **缺口**：§十二运行手册有 relay 接力但无"子命令失败不得击杀主循环"条文；best-effort 面（gate_review 等）的容错边界未定义。
- **建议**：总则补第 16 条"驱动韧性"：核验/沉淀类子命令（jq 解析、mx_send、kanban 读）一律错误隔离（|| true + 记单续跑）；仅硬闸语义失败允许 fail；上线前 bash -n + jq 表达式静态自检入守门。

### P4 会话断裂恢复模式未定义（三次踩坑才总结出）
- **实锤**：21:04 网关重启腰斩 chen/hu/lin 会话；"续跑提示"类短消息触发的新 turn 只回"No pending command to approve."即停；唯一有效模式=重发完整任务书（chen/hu/lin 三人验证一致）。
- **缺口**：§十二无任何"会话断裂"条文——重启/崩溃后的恢复路径完全靠现场摸索。
- **建议**：补"会话断裂恢复"小节：断裂判据（agent 日志静默+无 turn）；恢复=重发**完整任务书**（附断点引导：检查 git status/log 续作，已完成勿重做）；明示"提示类短消息无效"。

### P5 回合尾部动作与完成凭证解绑（agent 执行率系统性缺口）
- **实锤**：四类尾部动作在重活完成后被丢——完成回执 3 条未见（receipt-missing×3）、RACI 双 @ 群通知四组未见、评审卡未自登（review-card-missing，导演补登 t_0369aec7）、主卡 raci 未填（raci-not-structured）。
- **缺口**：总则 4"打回不静默"覆盖核验侧回灌，但派发词的"完成"定义未绑定尾部动作——agent 报 DONE 与回执/通知/登记是分离动作，重活完成即 turn 结束是必然。
- **建议**：总则补"完成凭证一体化"：结论行格式扩展（如 AN-DONE-X commit=Y card=Z notified=双@已发 receipt=已发）——核验一把抓，缺任一要素=未完成打回；跑八轮已落地回灌机制（704c1099）上升为条文。

### P6 观测面语义未定义（误杀在途会话）
- **实锤**：gateway_state.json 的 active_agents 是 turn 边界快照——turn 进行中显示陈旧 0，idle-restart 守护误判空闲重启网关腰斩双会话（gw-idle-restart-false-positive 单）。
- **缺口**：§十二无观测面语义条文；"判活"与"会话计数"混用。
- **建议**：补"观测面语义"：active_agents 仅趋势参考；判活唯一口径=责任 agent 日志活性（wait_alive_truth 语义）；任何自动重启/清理动作前置条件=无 in-flight turn 二次确认。

### P7 运行时补丁收编纪律缺失（迟到两轮）
- **实锤**：533/534 工作区态补丁三次被 hermes 自更新擦除；收编 runtime manifest 迟至 run7 收官后才做（704c1099，manifest 21 条收敛）。
- **建议**：§十五维护规范补：凡涉 gateway/runtime 行为的上游补丁，必须收编 runtime-manifest（正本入 overlay/runtime+登记+deploy --apply 验证三步齐）——工作区态补丁视为未部署；每次 mx-up 后跑 deploy dry-run 对账。

### P8 判据窗口与消息洪的矛盾未上升为条文
- **实锤**：步 10 四组 RACI 双 @ 派发核验 60s 全超时（消息洪窗口失效的权衡注释写在驱动代码里，run4 实锤）；run8 已落回灌补发。
- **建议**：§五步 10 把关行改写："消息洪环境以 state 事件锚（dispatch_marker 可反查）为主判据，文本复查窗降级观察+回灌补发闭环"。

## 二、已修项对照（方案无需再动）

| run7 实锤 | 修复 | 状态 |
|---|---|---|
| UAT 核验位矛盾（main vs integration 九连死循环） | 3bb5b88a+V6 步 21 细则勘误 | 已入 V6 |
| 判词器括号注误判 | uat_verdict.py python 后端 | 已守门固化 |
| 回执/raci/评审卡/双 @ 四类回灌 | 704c1099 | 已落地（本文 P5 建议其上升为总则条文） |
| gate_review jq 击杀 | c24a9d60 热修 | 已修（P3 建议其类推为总则） |
| 533/534 manifest 收编 | 704c1099 | 已落地（P7 建议写入维护规范） |

## 三、对 run8 的优先级建议

P1（并发预算）与 P2（环境重置+artifact_fresh）直接影响下一轮能否少遇逆境；P3/P4 是 run7 夜间 4 小时逆境的主根因；P5-P8 可随 P1 修订顺带入文。预计全部并入 V7 修订工作量约一个会话。
