---
name: fusion-delivery-pipeline
description: "Heavy methodology fusion via kanban vertical slices."
version: 1.0.0
metadata:
  hermes:
    tags: [fusion, orchestration, kanban, estimation, calibration]
    related_skills: [article-methodology-fusion, kanban-orchestrator, worker-completion-independence-verification]
---

# Methodology 融合的交付管线编排

触发词：外部方法论（培训课件/文章/标准）「融合进集群」且体量超出单卡；估算/度量/预算类机制的落地派工。
文章源融合的单会话流程见 article-methodology-fusion（default 侧，本侧只读）；本 skill 管它的**重型分卡编排与落地形态**。

## 垂直切片：研究 → 实现 → 接线，三张卡

1. **研究卡**（只裁决不写码）：全文通读存档 → 机制清单 → 裁决矩阵 + 校准数据盘点（对本机历史实测候选代理变量的相关性）。
2. **实现卡**：落机制本体（形态见下节）；orchestrator 独立复验通过才放行下游。
3. **接线卡**（parents=[研究,实现]）：单一事实源文件 + 既有资产只加引用行，grep 计数验收。

**研究前置退化形态**：研究已在前置会话完成（报告+源码快照落盘）时不建研究卡——把报告与源码快照的绝对路径注入每张实现卡 body 顶替研究卡输入，切片退化为「N 并行实现 + 1 审查门」；派工前 grep skill 库与 `_shared/` 确认目标机制未被融合过（重复融合预检，详见 open-source-skill-fusion-v2）。

**运维型 lane 边界收窄**：安装/实装类卡只做「安装 + 只读命令验证 + 简报」；init/写配置/注入 hook 类动作一律转为待决清单交用户裁决，不进卡；降级路径（如 npx 直跑）预先写入 body；验收项不含「环境就绪」类不可控前提。

**决策内嵌是唯一传递通道**：worker 看不到兄弟卡上下文。字段面/公式/落点/红线等冻结决策必须完整复制进每张子卡 body，或给研究产物的绝对路径让 worker 直读。禁写「参见父卡讨论」——父卡常是壳卡，决策悬空 = 两棵子树各自发明口径。

## 估算/度量类机制的落地形态：门在工具，不在自觉

- 落点不是文档新节，是**可执行 CLI + 正反 fixtures + 单一事实源文件 + 引用行**。估算器做成文件不是 skill：worker 经 terminal `python3 <path>` 调用，技能面零扩大。
- **拒绝门写进工具**：缺边界、缺验收项、非法枚举、外部基准当运行时参数 → 非零退出。散文规则只能请求合规，机械门才保证合规。验收口径随之：CLI 交付独立复跑 rc 契约 + 反例 fixture 实测被拒 + 数值手算对账。
- **校准纪律**：换算率/生产率必须本机实测校准，且先验代理变量与目标量的相关性再采纳（实测教训：tool_calls×tokens 与规模相关 0.405，任务历时仅 0.113——直觉代理可能实测最差）。外部行业基准一律标 `external_example` 仅作对照，禁入运行时默认。

## 子卡验收对齐：按各卡自身 frozen 验收项打分

- 垂直切片中 Wired/Exercised 证据归**接线卡**。实现卡自报 `evidence_strength: unobserved`（机制未接 fleet）是诚实标注不是缺陷，因缺接线证据打回实现卡 = 验收口径错位。
- 反向同样成立：实现卡 done ≠ 接线完成。接线验收项（grep 计数/指针可执行）显式落在接线卡，不默认上游卡「顺带」做。
- orchestrator 对实现卡的独立复验清单：pytest 独立复跑（不沿用 worker 的 venv 结论）、CLI rc=0/2 契约实测、输出数值手算对账、拒绝 fixture 实测非零退出。

## 手动 dispatch 与等待纪律

- **dispatch 返回 `spawned: []` 有两义，先查卡再动**：`running`+有效 worker_pid = 已被上一轮 dispatch 或 60s tick 拾取，对 running 卡再 dispatch 永远返回空，误读成「零拾取」而反复重派 = 自己制造重复卡；只有 `ready` 且无 pid 才是真零拾取（查 board.json profile_scope）。一条只读 SQL 分歧：`sqlite3 ~/.hermes/kanban/boards/<board>/kanban.db "SELECT status, worker_pid FROM tasks WHERE id='<id>'"`。
- **等 running 卡 = 后台轮询 + 并行干活**：terminal 前台超 600s 会被强制转后台（notify_on_complete），轮询循环（每分钟查 status，done/blocked 即停）主动 `background=true` 挂起等通知。等待窗口做不依赖该卡的工作（独立复验已交付产物、备下游卡 body）。禁空转、禁反复手动 dispatch。

## 归属说明（curator 整理时收编）

本文各节的 canonical 家在 default 侧只读 skill：落地形态→article-methodology-fusion；dispatch/等待→kanban-orchestrator Pitfalls；验收对齐→worker-completion-independence-verification / orchestrator-lessons。若 curator adopt 后已收编，删除对应节防双事实源。
