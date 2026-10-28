---
name: orchestrator-dag-supervision-forensics
description: "Use when 监督在跑 kanban DAG：板库定位/update窗口取证/停机续接/dispatch输出解析"
version: 1.0.0
platforms: [macos]
metadata:
  hermes:
    tags: [orchestrator, kanban, supervision, forensics, update-window]
    related_skills: [orchestrator-proxy-closeout-orch, kanban-orchestrator, orchestrator-lessons, operational-status-reporting]
---

# 在跑 DAG 的监督取证（orchestrator profile 增量）

> 权威源声明：代收判定线与顺序门在 `orchestrator-proxy-closeout`(-orch)；
> 派工图纪律与 GE 系列在 default 的 `kanban-orchestrator`；进度汇报与 ETA 三档在
> `operational-status-reporting`。本件只存四条上述件没有的监督侧规则；冲突以原件为准。
> 本件存在的理由：本 profile 技能目录是共享池符号链接，存量技能对本会话只读。

## 适用判据

orchestrator 监督在跑的多卡 DAG 时发生下列任一情况：裸 sqlite 查卡无行、worker
死于工具层 import 类故障、用户中途要求停机保留现场、dispatch 输出解析失败。

## 1. 裸 sqlite 读卡：先解析 current 指向的板库

`cat ~/.hermes/kanban/current` 得板 slug，板库在
`~/.hermes/kanban/boards/<slug>/kanban.db`。查根库 `~/.hermes/kanban.db` 对板内卡
返回**空行不报错**——读起来像「从未被拾取」，实际 dispatcher 正常在跑。
卡 id 在板库查无行才查根库；两库都空才谈丢卡。写侧对偶纪律（kanban_* 调用
显式传 board=）归 default 的 kanban-orchestrator，此处不重复。

## 2. worker 死于 `No module named 'hermes_cli.<模块>'`：四步取证定瞬态/持久

模块是本地未跟踪 patch 文件时，hermes 更新流程重放 patch 期间存在缺失窗口，
worker 的 complete 落进窗口即整轮退出——活干完了，只差完成接口。四步只读
取证，判据是「窗口是否已闭合」：

1. `stat` 模块 mtime 对比故障报文时刻——**恢复时间晚于故障时刻 = 窗口已闭合**，
   该次不会重现；
2. `pgrep -f 'hermes.*update'` 看 update/恢复进程是否仍在跑；在跑先等它退出
   再动卡；
3. `git -C ~/.hermes/hermes-agent status -s -- <file>` 确认未跟踪——下次更新
   还会重放它，窗口可再现，代收不必等「永久修复」；
4. 用网关同一 python 实测 import——import 成功才可断言工具层已恢复。

四步全过 = 瞬态窗口已闭合：核验盘上产物齐全后代收（判定线照
proxy-closeout），metadata 写明「complete 撞更新重放窗口，四步取证复验恢复」。
任一步不过 = 持久故障：先修工具层让卡重试 complete，**不代收**——代收会把
「卡为什么死」从证据链里抹掉，下次撞同一窗口时无从比对。

## 3. `dispatch --json` 前导非 JSON 行：既绕也读

中断过的 update 之后，CLI 在 JSON 前打印网关重启/告警行，`json.load` 整流即炸
（Expecting value）。两点：
- **绕**：从首个 `{` 起截流解析（`sed -n '/^{/,$p'`）；前导行非瞬态（持续到
  下条 hermes 命令重启网关），同参重试不过；
- **读**：前导行本身是诊断信号——「checkout 有半写文件 / 网关被暂停」类告警
  能解释同期 worker 侧工具故障（如第 2 节的 import 窗口），读它不丢它。

## 4. 用户中途「停一下，保留现场」：冻结编排侧，不冻结在跑 worker

① 被点名卡的 worker block+留现场（备份、残稿、精确到节的进度自述）是正确
行为，收 block 通知不当故障处置；② orchestrator 同步冻结自己——不派新卡、
不解锁、不做下游规划，其余在跑卡按用户裁决自然跑完，勿顺手连带处置；
③ 汇报前只读核实现场（残稿行数 / 备份在位 / 写到哪一节截断），区分盘上
实测与 worker 自述；④ 给「续写完成 / 废弃重写 / 调整方向」三类选项等裁决；
⑤ 裁决=续写时 **comment 必须写死精确接续点**——从哪节哪个截断处接、参数
口径、剩余步骤顺序——然后再 unblock。只评论「继续」不给接续点，重派
worker 会从头重写而非续写，等于废弃已保留的现场。

## Pitfalls

- 心跳新鲜 + 产物零增量 ≠ 停滞：读必读 context 阶段本就无写动作，判据与
  ETA 口径归 operational-status-reporting，勿据低 CPU 催办。
- 停机指令只对点名卡生效：未点名卡照跑，勿连带 block 整个 DAG。
