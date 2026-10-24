---
name: source-tree-write-conflicts
version: "1.0.0"
description: "hermes-agent 主树被 agent 会话管线批量回写时的处置手册。"
---

# 源码树批量回写冲突：处置手册

> 适用：kanban worker 集体秒崩于 `cannot import name`，且源码树在崩溃窗内
> 被成批改写。与单文件 patch 冲突（见 `hermes-source-patch-persistence`）的区别：
> 本手册处理的是**多文件同秒回写成旧基线**的整树级冲突。

## 波次指纹（满足两条即可定性为本类）

- 主树多文件 **同秒 mtime** 成批刷新，留 `<file>.py.bak.<millis_epoch>` 孪生；
  `.bak` 存的是写入前好版本（写手先快照后覆写），当前文件是旧基线。
- 错误指纹 `cannot import name '<fn>'`：`git show HEAD:<file>` 有该符号、当前文件 grep
  无——**git 干净 ≠ 树健康**，HEAD 正确而工作区被回退才是真相。
- 崩溃窗内 spawn 的 worker 全崩，窗前窗后 spawn 的 worker 正常；恢复后解阻的卡
  **若再次回阻，先查是否又一波写入，勿沿用上一次结论**。

## 恢复序列

1. **定性**：`stat -f '%Sm' <file>` 比对崩溃窗；`git diff HEAD -- <file>` 量漂移；
   `grep -c 'def <fn>' <file>` 定符号在不在；找孪生 `ls -la <file>.bak.*`。
2. **验孪生方向**：对比 `.bak` 内容与当前文件——`.bak` 有符号、当前无 = 孪生是好版本，
   `cp` 恢复；反之则另有写入者，勿用孪生。
3. **恢复**：逐文件 `cp <file>.bak.<ts> <file>`，py_compile + 全链 import 冒烟
   （`venv/bin/python3 -c 'from tools.X import Y'` 全过）。
4. **查写手**：`grep 'tool (patch|write_file|execute_code)' <profile>/logs/agent.log`
   找恢复时刻附近活跃的 agent 会话；`index.lock` 反复重建 = 写手活着的直接证据。
   确认写手已终态（会话日志停止）后再进下一步。
5. **稳定窗**：`find <tree> -newermt <恢复时刻>` 持续为空，且近 10 分钟 agent.log
   无对主树的写动作——两条件同时满足才解阻。
6. **批量解阻 + 抽样拾取**：整波一次解阻，90s 后回读 status→running + 新 pid。
   解阻≠恢复，拾取才是。

## 根改卡（同型第二次波次必须开）

纯恢复是临时止血。开一张 platform 板卡，body 必含：

- **管线定位**：执行 `.bak.<millis>` 快照+覆写的脚本/代码 file:line（从 orchestrator
  workspace 的 research/ 目录、会话 transcript、`grep -rn "time.time() \* 1000"` + `.bak` 组合找）。
- **版本门**：覆写前 `git diff --stat HEAD -- <file>` 非空即拒绝（fail-closed），冲突报告转人工。
- **互斥**：管线覆写期间对主树 flock；dispatcher spawn 前查锁，锁空闲才 spawn。
- **验收 fixture**：构造旧基线文件跑管线 → 断言拒绝 + 留报告；持锁期模拟 spawn → 断言延迟。

上线后生产验证（门已实战生效的可观测判据）：① watchdog 日志出现 `baseline gate refused
overwrite (fail-closed)` 拒绝记录而非静默覆写；② 波次 blast radius 骤降（整树 14 文件级
→ 个位数）。**门是第二道不是替代**：先于/绕过门的写手仍会污染少量文件并留孪生——每波
仍需按恢复序列做写手定位与孪生恢复；同一时刻既见「gate refused」又见新一波 `.bak` 孪生
= 存在绕过门的写手，按被污染文件集合反查其归属。

## 复发时的复检序

写手会话可叠加（不同会话、同型管线），每波复发只需复检三件：
① 当前内容仍对（grep 关键符号）；② 无新写入（稳定窗重测）；③ 写手已终态。
三件都过 → 直接走恢复序列 6 的批量解阻，不必重跑定性。
