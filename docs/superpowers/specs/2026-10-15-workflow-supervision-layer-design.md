# 监督编排层设计（zcode dynamic-workflow 接管统筹/裁判层）

> **文档定位**：三会话（sess_658b9c3e/sess_287485ef/sess_94f4f65d）收敛方案的落成正本+2026-10-15 治理轮（V8.29）姿态化修订。回答：workflow 层管什么、怎么管、与推演程序和产品体系怎么衔接。
> **一句话定位**：bash 监督器保推演「不死」，workflow 子智能体保「走对」，人只在升级点出现；执行层一行不动，单一事实源仍是闸键+state.env。

## 一、三层架构与边界

- **L2 决策层**：人+主会话，只接升级（question/hole）。launchd 30 分钟机械看守人**永不撤**——workflow 活性依赖 ZCode 宿主进程，合盖/退出即中断；保不死归机器，保走对归 workflow。
- **L1 统筹层（本设计）**：zcode dynamic-workflow，TypeScript 控制流+短命子智能体。**只读纪律（V8.29 收紧后）**：对运行中的体系零写动作——不派修、不代发提醒、不动闸键、不写 kanban、不发 Matrix；唯一产出=evidence/ 与 workflow-journal.ndjson。审批类动作不进 workflow（那是推演程序审批模拟面的职责，走 humansim 通道，见 PR-0）。
- **L0 执行层**：simharness 全栈（驱动/supervisor/sentinel/launchd/cluster-inspector）+SwarmStudio/matrix/hermes agent teams（推演对象）。不动。

## 二、四子智能体角色（观察员军团）

| 角色 | 触发 | 动作面 | 红线 |
|---|---|---|---|
| 闸口裁判 | 闸键变化/FAIL 信号 | 读判据+evidence/ 出判词，判词强制带 state.env 键/日志行锚；核查组织侧闸过程是否合规（监考的监考） | 只读；闸 FAIL 唯一出口=缺项清单升级给人（[[gate-fail-upstream-return-principle]]），禁拆闸式解锁 |
| 停滞诊断员 | 驱动日志 N 分钟无新行/哨兵报警 | 先查 Turn ended 再查内核负载（run14 第七形态教训），区分真停滞/正常等待/降级运行 | 只读；诊断结论落 journal |
| 缺陷工单员（原修复协调员降格） | 确判 FAIL/代偿台账新增 | 生成产品缺陷工单（对照 PR-1~7 编号），轮内零写动作；修复在轮间工程通道 | 不代偿、不派修入运行体系 |
| 报告审读群 | report 段 | 按受众视角 fan-out 独立审读 mx-report-gen 产物（含新姿态/净额对账节的口径核对） | 只读；意见升级给人 |

## 三、衔接铁律与实现要点

1. **磁盘是唯一记忆介质**：子智能体间只传指针（路径+键名），不传上下文；每个 workflow run 只覆盖一个观察窗（一幕或一个异常事件），跑完落 journal 即退出，不挂 20 小时。
2. **数据面=mx-state-query.sh 单一入口**（已落地，simharness mux/）：summary/gates/steps/state/posture/ledger 六命令；远期切换到 PR-0 observability 端点（HTTP 同源语义）。
3. **轮询=脚本侧确定性轮询**：`world.run("sleep",["60"])`+轮次上限（防死循环）；事件驱动子智能体平时零 token。
4. **代偿台账是一等公民**：每窗读 `ledger summary`，open 笔映射 PR 编号进观察报告；清偿门状态（prelaunch ⑯）纳入每轮开跑裁判。
5. **tunable 不进 ask 文本**：阈值/超时留脚本控制流——AmendWorkflow 调参会冲缓存重付全部 token。
6. **姿态感知**：workflow 读 posture 键；strict 姿态下停滞诊断员的结论权重上升（停滞=有效发现，报告口径见 V8.29 §5.9）。

## 四、迁移路线（避让在跑轮次）

- 阶段 0（已完成基建）：mx-state-query.sh+代偿台账+姿态旋钮已入 simharness main 候选。
- 阶段 0.5（已完成）：方案 V8.29 条款+报告净额对账面。
- 阶段 1：影子统筹——run21 起挂只读影子模式，与现有监督器对账判词一致率（出口≥90%）。
- 阶段 2：接管监测与裁判（哨兵监测半退役备用）；缺陷工单员常驻。
- 阶段 3：严格姿态全量轮（full×strict）由 workflow 全程观察——跑死即产出=新缺陷 N+代偿点 M+死点 K 清单。
- 退出条件：任一阶段两轮不达出口即停在上一阶段（影子模式零沉没成本）。

## 五、风险与未验证项（诚实声明）

- workflow 20h+ 长跑可靠性未实测（宿主睡眠/重启行为）——阶段 1 影子对账就是回答它的；回答不了停在影子模式。
- 裁判误判四层压：只读先行+判词带锚+工单白名单+升级兜底。
- 会话只能绑一个自动化（run20 教训）：workflow 与其他自动化互斥使用。
