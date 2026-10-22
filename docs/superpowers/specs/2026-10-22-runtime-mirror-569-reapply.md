# 运行时镜像 0.22.4 刷新回套补丁 569（2026-10-22）

## 背景

harness-gate-integrity 守门⑬（部署通道不得静默回退已打补丁）在 V8.47 文档批全量
回归中捕获：0.22.4 升级轮（21cd5d3a）刷新运行时镜像 40→44 文件时，
`runtime/gateway/kanban_watchers_common.py` 按新上游源重写——补丁 569 的
`_kanban_gate_guard_allowed` 函数被冲掉（sim-run gate-guard：spawn 前置闸键拦截，
run9 P9 抢跑防线）。镜像契约=「新上游源＋全部 agent 补丁在位」，漏套即部署回退面。

## 改动

将 569 补丁 hunks 逐行回套镜像副本（`_kanban_dispatch_allowed` 尾部改道＋新增
`_kanban_gate_guard_allowed` 全函数——与 patches/569-agent-kanban-gate-guard.patch
逐字节同源）。守门⑬ 复跑 128/128 绿。

## 决策记录

| # | 决策 | 理由 |
|---|---|---|
| D1 | 手工回套而非重放升级脚本 | 升级轮是并行会话的在途工作面；最小修复只动一个镜像文件，避免与其冲突。 |
| D2 | 逐字节同源补丁文本 | 守门强锚=文件 hunk 首个新增 def 名，逐字节保证锚命中且未来 diff 可对账。 |
