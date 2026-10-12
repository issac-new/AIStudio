# 阿里云《AgenticOps 全栈能力》融合报告

> 执行：orchestrator（article-methodology-fusion 6 步流程）
> 日期：2026-09-24
> 存档：`original-full.txt`（sha256 19301dc4b81c8e44，5966 字符，fetch via curl+regex，已截除微信页脚 HTML，结语完整）

## 一、来源

| 项 | 值 |
|---|---|
| 标题 | 阿里云发布 AgenticOps 全栈能力，让 Agent 成为运维与研发的第一用户 |
| 公众号 | 阿里云云原生 |
| 发布 | 2026-09-24 16:00 |
| URL | https://mp.weixin.qq.com/s/rPoeHJTBXbSeIrOam2GQlw |

文章结构：三道墙（数据采不到/上下文读不懂/能力验不准）→ 五块能力：云监控 2.0（全域可观测）、AgentLoop（Agent 自身观测评估）、STAROps（智能运维闭环）、云效研发智能体（研发数字分身）、开源底座（OTel+UModel+BRiSE）。

## 二、机制清单（编号）

| # | 机制 | 解决什么 | 依附语境 |
|---|---|---|---|
| M1 | 三道墙框架（采不到/读不懂/验不准） | 生产化 Agent 的失败分类学 | 通用 |
| M2 | 可观测双向扩张（向下供事实/向上观测 Agent 自身） | Agent 行为黑箱 | 有 Agent 运行时遥测基建 |
| M3 | 智能接入五步闭环（意图→发现→方案→Preview→验证） | 配置接入不可信 | 500+ 云服务接入场景 |
| M4 | 安全契约：只读默认/写操作独立授权/执行后回读复验/权限不高于发起用户/全程留痕 | Agent 写操作失控 | 通用（Agent 执行动作） |
| M5 | UModel 语义地图+RunbookSet | Agent 读不懂数据语义 | 大规模多源观测 |
| M6 | Agent-as-a-Judge：理由+可回溯 Trace+人类复核，宣称正确率 90%+ | 自动评估可信度 | 评估基建 |
| M7 | 失败归因七维：Prompt/Tool/Knowledge/Planning/Memory/Model/Policy | 评分→改进动作 | 评估基建 |
| M8 | 实验回测五步：锁基线/离线回归/小流量 A/B/变更门禁/灰度 | 变更非正向 | 有线上流量 |
| M9 | 分层执行：低风险自动/关键变更人工确认/禁止规则拦截+双重校验 | 自动化与风险匹配 | 通用 |
| M10 | 定时巡检+事件驱动（事找人） | 被动响应 | 有调度基建 |
| M11 | 团队知识自沉淀（交互→入库→召回复用） | 经验不复制 | 有知识库 |
| M12 | RCA 闭环：假设展开与反证/证据化评测/Bad Case 回流回归 | 根因结论不可信 | 故障诊断 |
| M13 | BRiSE 分层评测集（1360 题/418 任务/764 案例） | 能力验不准 | 评测基建 |
| M14 | 接入终点=真实数据可用而非配置成功 | 假接入 | 云服务接入 |

## 三、现状扫描（防重复融合）

grep 横扫 `_shared/`+evals：M4/M10/M11/M14 关键词零命中；M6-M9/M12/M13 部分命中（evals/baseline.md、action-risk.md、review-gates.md、four-lenses-charter.md），逐一读上下文后定性见裁决矩阵。

## 四、裁决矩阵

| # | 判定 | 理由 |
|---|---|---|
| M1 | 等效印证 | 三道墙=集群四论四问的「系统问/信息问/方法问」同构表述；不新增框架 |
| M2 | 语境 DROP | 集群 Agent 遥测=task_events+action_gate_shadow.jsonl+cc-switch 日志，已有等效；eBPF 全栈观测不适 batch=1 单机语境 |
| M3 | 语境 DROP | 无 500+ 云服务接入问题；集群「接入」=skill/工具挂载，已有 skills_list 实测口径 |
| M4 | **收缩吸收** | 落 action-risk.md §1.4。吸收子集：执行后回读复验+权限天花板+全程留痕成文化。收缩：不引入「Preview 变化范围」独立 UI 环节——staged 双重复验（§1.2）已覆盖其精神，集群无该 UI 面。依据：只读默认/执行前复验已有，缺「执行后回读」这最后一环 |
| M5 | 等效印证 | RunbookSet≈runbook 类 skill（nightly-radar-runbook 等）；语义地图≈owner-registry/capability-graph |
| M6 | **收缩吸收** | 落 evals/baseline.md X4。吸收：judge verdict 必附理由与证据锚（可回溯性的最小子集——集群无 Trace 基建，理由内嵌 verdict 文本替代）。收缩依据：judge 体系（G2 三值/rubric 指纹/judge 故障分离）已完整，只缺「必附理由」机械要求；「正确率 90%」厂商口径无独立验证，不吸收 |
| M7 | **吸收** | 并入 X4：失败归因七维，与 G5（归因评测体系本身）互补不重叠——G5 归因判分环节，本条归因被测 agent 失败 |
| M8 | 等效印证（部分 DROP） | 小流量 A/B/灰度=线上流量机制，语境不适 DROP（与 G 节已判 DROP 同类）；锁基线/离线回归/变更门禁=evals 回归卡+模型回归总闸已有；four-lenses 控制问「无回滚不发布」已成语义 |
| M9 | 等效印证 | action-risk 三级分级+双维权限门+staged 复验完全覆盖（含 RAM 双重校验≈AuthorityLevel×Scope 叉乘） |
| M10 | 等效印证 | 定时=nightly loop v3.3；事件驱动=watchdog/看门狗。已有机制，零增量 |
| M11 | 等效印证 | 知识自沉淀=skill_manage+hindsight+`_shared/failures/` 案例库+evals 题库追加铁律，全链已在 |
| M12 | **收缩吸收** | 假设-反证手法→failure-mode-playbook 〇-2 第 3 步增补；Bad Case 回流=evals 铁律已有（等效印证）。收缩依据：集群复盘五步已有骨架，只补根因手法缺口 |
| M13 | 等效印证 | 分层评测=evals T1-T17+G1-G5 分层门禁；「固定环境/案例/评分口径」=rubric 指纹已判。开源规模不可比，不吸收 |
| M14 | 语境 DROP | 云服务接入语境；精神上有弱对应（capability-ladder「以验收命令重跑退出码为准」），已有成文，不加机制 |

## 五、显式不吸收清单

| 机制 | 理由 |
|---|---|
| eBPF/LoongSuite 四语言探针（M2 观测采集） | 单机集群无多语言 Agent 生产环境；观测已有 jsonl/task_events |
| UModel 3200 模型/SPL 查询语言（M5） | 无多源观测规模；引入即维护负担 |
| 小流量 A/B+灰度发布五步（M8） | batch=1 无线上流量（与图灵吸收同判例） |
| 「评估正确率 90%」（M6 附属宣称） | 厂商口径，无独立复现通道 |
| BRiSE 开源基准共建（M13） | 产学研共建不适集群；分层评测已有等效 |
| 智能接入五步（M3/M14） | 无云服务接入面 |

## 六、边界声明

- 融合仅覆盖文章**产品能力描述层**；代码不可得（无开源仓库链接于文中——OTel/UModel/BRiSE 开源可后续按 repo 源融合走 harness-fusion-patterns，本次不做）。
- 文章为厂商发布稿，数字（90% 正确率/40 倍增长/432 条贡献）均为其自述口径，本报告仅引用不背书。
- 语境差：文章=多云大规模生产；集群=batch=1 单人多域。凡依附大规模语境的机制整类 DROP。

## 七、落点

| 落点 | 内容 | 成色 |
|---|---|---|
| `_shared/03-evolution-memory/action-risk.md` §1.4 | 执行后回读复验+权限天花板+留痕成文化 | 语义+机制落地（本文件即 action gate 规则依据）；效力待下次真实高危动作 |
| `_shared/evals/baseline.md` X4 | judge 必附理由+失败归因七维 | 语义落地；效力待下次模型回归报告 |
| `skills/devops/failure-mode-playbook` 〇-2 第 3 步 | 假设-反证根因手法 | 语义落地；效力待下次 P2+ 复盘 |
| 本报告 | 全量裁决存档 | — |
