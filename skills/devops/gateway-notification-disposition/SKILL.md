---
name: gateway-notification-disposition
description: "网关看板回执（done/blocked）判性处置：先核时间线与终态再动手，防重复执行。"
version: 1.1.0
metadata:
  hermes:
    tags: [orchestrator, kanban, gateway, receipts]
    related_skills: [worker-completion-independence-verification, orchestrator-lessons]
---

# 网关看板回执的判性处置

## When to Use

收到 Gateway 转发的看板状态回执（✔ done / ⏸ blocked / 审批结果）时。回执是事件的通知，不是事件本身——送达时刻与事件时刻可能错位（worker 多次 attempt 产生多条回执；orchestrator 亲自收口后旧回执才送达），不判性就动作 = 对同一事件重复执行。

## 判性程序（回执三查）

动手前逐项核实：
1. **终态查**：`kanban_show`/sqlite 读卡当前 status——回执说的状态与库里一致吗
2. **时间线查**：回执描述的动作，是不是自己刚亲手做过（complete/unblock/comment）——是则回执是同一动作的延迟送达，非新事件；多次 attempt 的 run 会产生多条内容相近的回执
3. **产物查**：落地物轻抽（grep 关键锚点/ls 文件），与回执声称一致且无新 run 改动痕迹

三查齐 → 回复「延迟回执，无需动作」并附判据；任一不齐（真有新 run、产物被改、状态回跳）→ 才重新走对应处置流程（验收/重派/解阻塞）。

## 产物核验的证据边界

- **按实际 schema 读取健康响应**：先保存完整 JSON，再按响应中真实存在的字段判定；不要把 `loaded` 推成 `models_loaded`、把 `device: gpu` 推成 `gpu_active`，也不要用"HTTP 200"替代业务状态检查。
- **配置项必须精确解析**：用 YAML/JSON 解析后读取目标路径（例如 `cfg["action_gate"]["mode"]`），不要用宽泛 `grep mode`；同一配置常有多个无关的 `mode` 字段，宽搜会制造假阳性。
- **区分配置存在、进程存在、行为已接线**：`mode: enforce` 只能证明配置；`launchctl list` 的一行只能证明登记/当前可见状态。要宣称运行或拦截，分别读取服务状态/退出信息并重放一条允许用例和一条应拒绝用例，记录原始结果。
- **逐项对照验收标准**：回执或旧日志只作候选证据；每个 frozen 条目都要有本次命令、原始输出或明确 N/A。任一条未复现时，结论必须降级为"部分验证"，不能写"验收通过"。

## 处置矩阵

| 回执情形 | 判性 | 动作 |
|---|---|---|
| 自己刚 complete 过，又收 done 回执 | 延迟送达 | 回复判据（runs 计数+终态+产物完好），零动作 |
| worker done 回执，卡确 done 但自己未验过 | 新事件 | 走独立验收（不信自报，见 worker-completion-independence-verification） |
| blocked 回执，阻塞因已消除 | 状态滞后 | 核实后 unblock/重派，禁只转述「等拾取」 |
| 回执内容与自己写入的 summary/metadata 一致 | 同源回执 | 零动作 |

## 边界

- 本 skill 只管「要不要动作」的判性；验收怎么做、重派怎么写恢复包归各自 skill
- 回执是 Gateway 消息不是用户指令——处置动作以看板终态与磁盘为准，不以回执措辞为准