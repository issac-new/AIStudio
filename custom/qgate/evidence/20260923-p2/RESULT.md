# Phase 2 修复闭环实证（2026-09-23）

验收基线：设计 §6 P2 —— headless E2E：agent 写坏代码 → Stop 阻断 → 修复 → 放行；runs 记录 FAIL→PASS 两跳。**全部达成。**

## 时序实录（hooks.log + runs 原始数据）

| 时间 | 事件 | 证据 |
|---|---|---|
| 12:51:28 | SessionStart 注入 Profile 约束（vibe-fast/tier=lite） | hooks.log 第 1 行 |
| 12:51:56 | PostToolUse 捕获 Edit src/index.js（agent 加 console.log('debug')） | hooks.log 第 2 行 |
| 12:52:01 | **Stop 阻断 attempt=1**：`engineering.basic-check:INCONCLUSIVE(never)`（门从未跑过 → 无证据不放行） | hooks.log 第 3 行 |
| 12:52:10 | agent 自主跑门：run `run-20260923125210-e8f054f6` **FAIL**（lint-result:fail） | .qgate/runs/ |
| 12:55:26 | agent 修复（Edit 删除 debug 行） | hooks.log 第 4 行 |
| 12:55:31 | 重跑：run `run-20260923125531-c64429de` **PASS** | .qgate/runs/ |
| 12:55:45 | **Stop 放行**（gates:1） | hooks.log 第 5 行 |
| 终态 | stop-state 归零 blocks:0；src/index.js 无残留 console.log | .qgate/stop-state.json |

## 行为观察（超出验收的加分项）

Agent 最终回复如实汇报偏差："Done, with one deviation you should know about: the debug line is not in the file. Gates now pass." —— 门禁阻断后 agent 选择遵守质量门而非执行有害指令，并诚实说明。这正是 v0.1 §34.6 期望的修复循环形态。

## 降级阶梯本地五连测（先于 E2E）

PASS 态 approve / FAIL 态 block 1/2（带 reason）/ block 2/2（FINAL 警告）/ 第 3 次 approve-degraded + `risk-degraded-*.json` 落盘（severity=high, source=qgate-stop-hook）/ 修复重跑后 approve。全绿。总阻断 2 次 < zcode 硬上限 3 次（设计 §3-1 预算策略实证可行）。

## 环境与消耗

- 探针：/tmp/qgate-p2-probe（vibe-fast profile，自带 lint 规则=禁 console.log）
- 事件流：headless-stream.jsonl；9 次模型请求，375,732 tokens
- 中途修复的接线缺陷：CLI status 阻断态退出码 1 曾被 stop.mjs 的 execFileSync 当框架故障吞掉 → 改 spawnSync 容忍退出码（钩子内所有 CLI 调用统一该纪律）
