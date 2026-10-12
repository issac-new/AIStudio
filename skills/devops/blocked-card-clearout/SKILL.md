---
name: blocked-card-clearout
version: 1.0.0
description: "Use when 用户令完成/清零全部 kanban 阻塞卡：两库盘全量→逐张定性三分→工具层与板库差异处置。"
metadata:
  hermes:
    tags: [kanban, orchestrator, blocked, disposition]
---

# 阻塞卡清零（orchestrator 全板处置）

> 姊妹 skill：`kanban-blocked-card-disposition`（定性三分法母本）+ `kanban-db-guarded-writes`（板库卡 sanctioned API）。本 skill 是「用户令清零」场景的执行序列 + 本机两库结构的实测差异。

## 执行序列

1. **两库盘全量**：中央根库 `sqlite3 -json ~/.hermes/kanban.db "SELECT id,title,assignee FROM tasks WHERE status='blocked'"` + 逐板 `boards/<slug>/kanban.db` 同查询（含 gave_up）。只扫一个库必然漏卡——用户面板的 blocked 数以两库合计为准。
2. **逐张定性**（按 disposition 母本三分法）：读 last_failure_error + task_runs.error 原文、列 workspace 目录内容、验收项逐项实测（脚本 selftest/干跑/cron 注册状态各自验证，不引用卡面自述）。
3. **处置落终态**：补完成（unblock→complete）/ 裁决后派工（unblock）/ 归档（archive_task，comment 留裁定+产物索引+解锁钥匙）。
4. **终验双库归零**：两库 blocked/gave_up 计数都为 0 才收工，输出处置总表。

## 本机两库工具差异（实测）

| 操作 | 中央根库卡 | 旧布局板库卡 |
|---|---|---|
| comment / complete / unblock | `kanban_*` 会话工具 | 报 "unknown task"——必须 write_file 脚本 + `connect(board="<slug>")` + kb API |
| 补完成撞活 claim | kanban_complete 会拒 | `kb.complete_task` 报 LiveClaimError 同理 |
| 归档 | — | `kb.archive_task(conn, tid)`（无 actor 参数，会终止 running worker） |

**补完成撞 LiveClaimError 的正解=交接而非 force**：unblock 后 dispatcher 一个 tick 内派出新 worker；在卡上留交接 comment（代已完成什么+worker 只需核验的命令+直接 complete+禁改禁重做），让 worker 自己收口——多一层独立核验且零重试成本。

## 归档卡留痕三要素

每张归档卡 comment 必含：①裁定依据（验收项实测结果，不引用自述）；②产物索引（workspace 路径+关键文件，供后续考古）；③解锁钥匙（用户补什么、什么形态可续跑，如授权字段清单/真机接入方式）。零产物卡写明「回滚：无」。

## 专项判定

- **staged-action proposal 等裁决**：独立复核 proposal 关键证据（数字/路径实跑验证，不沿用 proposal 自述）→ comment 落裁决+执行约束（canonical path、selftest 门槛、回滚要求）→ unblock 派工。裁决即授权，勿续挂。
- **capability-gap「路径不存在」**：先实测文件系统找正确路径（CLI 常在 scripts/ 子目录而非契约写的根目录）——路径笔误=修正后完成，非归档依据；归档要的是「真不可解」。
- **review 打回 + worker 连续熔断**：reviewer 已给精确最小修法（file:line+修法）且改动机械 → orchestrator 代修（修复+全量回归+修复复现用例+可追溯 commit+comment 留验证记录），再走交接或直接完成。
- **授权门卡**：缺书面授权就不做主动动作，归档时零动作声明+钥匙留痕；安全门不因清零压力豁免。
- **外部依赖卡（真机/账号）**：等待期是常态非失败；归档=终态而非惩罚，兄弟卡承接的部分在留痕中指路。
