# 统计口径对照表（M-F 验收门 2）

日期：2026-09-20。单一事实源：事件流（assign/receipt/agent.profile），计算式全部在 `custom/client/matrix-teams/stats.ts`（纯函数投影，不落第二份聚合状态）。统计代码与本表任何一侧变更须同步另一侧。

| # | 指标 | 定义 | 事件源 | 计算式 |
|---|---|---|---|---|
| 1 | 任务总数 | 投影内任务卡片数 | assign | taskId 去重后的 assign 计数（同 taskId 取 issuedAt 最新） |
| 2 | 状态分布 | 看板六态各计数 | assign + receipt | cardStatus(assign, 最新 receipt)：pending/assigned/running/review/done/blocked |
| 3 | 阻塞数 | blocked 态计数 | assign + receipt | 状态分布中 blocked 项 |
| 4 | 项目维度 | 每案例的总数/完成数 | assign.parentId | v1 口径：以「案例」（parentId）为项目代理，case→project 映射随 case.projectId 消费方（M-G）替换；无 parentId 归「（独立）」 |
| 5 | 阶段维度 | 每 phase 的总数/完成数 | assign.phase | phase 缺省归 '—'；done 判定同指标 2 |
| 6 | 人员维度 | 每负责人的在办/阻塞/完成 | assign.target.account | 在办 = 非 done 态计数；阻塞单列 |
| 7 | Agent 负载 | 每注册 agent 的在途数 | receipt + agent.profile | 标签聚合：capability 命中且 receipt 在途（created/running/waiting-human，口径同 agent-router LOAD_OCCUPYING）按标签计数后归并到 agent（多标签 agent 累加其标签计数） |
| 8 | 逾期催办 | 逾期未完成任务清单 | assign.dueAt + receipt | dueAt < now 且状态 ≠ done；按到期升序；负例=已 done 或未到期或无 dueAt |
| 9 | 缺陷流 | 测试失败自动建缺陷 | receipt(failed) | shouldAutoDefect：capability 含 'test' 且最新 receipt=failed → 建缺陷 assign（parentId=原任务，phase=P4，title 带失败原因） |
| 10 | 回归就绪 | 缺陷全闭合可回归 | 缺陷卡片态 | regressionReady：原任务的全部子缺陷达 done/blocked 终态 |

变更纪律：新增指标先加本表一行，再写计算式与测试；两处不一致以本表为准修代码。
