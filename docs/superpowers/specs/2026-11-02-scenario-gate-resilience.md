# 2026-11-02 场景脚本闸门韧性两件（挂账清偿：RACI 免等窗＋G2 超时回灌再判）

## 变更

`simharness/aipay-scenario.sh` 两处：

1. **RACI 双 @ 派发复查免等窗（提速④）**：`for pair` 循环内 `wait_truth … 60 raci_dispatch_seen`（四组串行最多 240s）改为谓词即时单查——见到记 ✓，未见记 MISS 走既有末尾统一回灌。与同函数内 raci-not-structured 的提速③（2026-10-09 决议：回灌保留补填信号但不 sleep 等待）同语义同款。
2. **G2 超时分支二轮复审等待（C 层）**：外层 `wait_truth` 超时的缺失分支（hoist 段）派复审后新增 `wait_truth … 600 mx_gate_combined_pass` 一轮——PASS 即置 `security_review_done`，仍无结论才放行到 G2 总闸 fail。fail 语义与熔断阈值（2 轮）不变。

## 决策记录

- 两项均源自 run25 G2 熔断事故复盘（spec 2026-11-02-chat-recovery-kwarg-fix 的 C 层挂账＋run25 首轮值守的 RACI 挂账）。
- RACI 取免等窗（方案 B）而非单拉合并判四组（方案 A）：源码注释自认 60s 窗在消息洪下「注定超时」（500 条仅回溯 5 分钟），run25 四组全超时实锤烧 4 分钟——A 省下的是注定白等的 75%，剩 25% 仍白等，且需新写消息合并逻辑回归面更大；B 有同文件同语义先例（提速③），语义等价（副作用证据，真值=主卡 raci 列）零等待。
- G2 超时分支原设计「supervisor 续跑驱动重入等待」在 run25 实证失效：派单后 2 秒即总闸 FAIL 退出，复审没有执行窗，两轮即熔断（19:40/20:12 实锤）。二轮等待把「重启循环碰运气」改为「原地等一轮」：run25 场景重放（provider 恢复后派单唤醒 secops→20:24 结论落群）在二轮内即过闸。仍超时才 fail——熔断计数语义不变，闸不放行语义不变（用户 2026-10-14 21:02 裁定：只有末判词翻 PASS 才放行）。
- 部署时序：改动合并即更新主仓工作区脚本；在跑驱动经同目录 `cp+mv` inode 隔离后持旧脚本跑完本轮，新内容自下次驱动重启（断点续跑/下一轮）生效。

## 验证

- `bash -n simharness/aipay-scenario.sh`（语法门）。
- `npx vitest run tests/harness-gate-integrity.test.ts`（含本批新增两断言：免等窗标记＋二轮等待标记，见提交实测）。

## 设计文档影响

DESIGN_SYNC: none——场景脚本执行层韧性，判据语义（闸门判词/熔断阈值/放行条件）零变化；提速④属提速③同族既有决议延伸。
