# 2026-11-06 平台批接线整体恢复（cognition 合入回退事故根治）

## 变更

cognition P0 批（0aee3bf55）在旧检出工作区直改五脚本后经 283e3f0e1 合入，把平台重写 P1 批（262f55022→7978af7ba）落在同文件的接线整体撞回旧版——同批 seam 丢失（已由 2026-11-06-inject-seam-restore 首刀修复）的全面形态。本批恢复平台终态并回嫁 cognition 独有能力：

- **五脚本恢复平台版**（026eb817c）：`inject.mjs`（v2 会话层：planner/executor/manifest noop-增量分派＋分树 clean）、`ensure-injected.mjs`（planIncrement 差量补套）、`build.mjs`（runtime-assets 单一事实源＋ensure 前置，兼修 merge 假合并产生的 semantica 块重复）、`serve-server.mjs`（ensure 前置拒绝起服）、`build-dmg.mjs`（lib resolver）。
- **cognition 能力回嫁 inject.mjs**：resolveUpstreamRoots 兼容导出（(root, env)→{root,source,studio,agent,zcode}，与平台 lib 版双存续，契约测试与 build-dmg 消费）、checkPatchChain＋--check 干跑档＋applyPatchTextAtRoot（串联 stdin＋前缀二分）、isDirectRun 直跑守卫常量化、agent 补丁失败末端汇总＋STRICT_INJECT=1 收紧档。
- **eval-gaps 旧断言对齐**：judge.ts:681 C 批起 models 恒记（单模型换裁判可追溯，注释在案），167668fe6 的 toBeUndefined 旧断言随行为对齐为 toEqual([cfg.judgeModel])。

## 决策记录

- **事故定性**：非平台批缺陷、非 cognition 设计冲突，是「携旧基线直改＋晚合入」的合并事故——git 无法识别内容级回退。前任 27 红定谳（202d1b6cc）与本批修复互证。教训：长驻工作区直改跨大合入窗口的文件，合入前必须对该文件重放 rebase 而非整文件携带。
- **双 resolver 并存**：平台 lib 版（内部消费，返回五根）与 cognition 导出版（带 source 溯源，契约面）签名不同语义一致；强行合一属平台域重构，本批不扩面，两版本注释互指。
- **skip 守卫保留**：inject-clean-v2/executor 的 v2SessionWired 条件守卫（seam 批加）在接线恢复后恒真自动解冻——50/50 实证；保留作接线回归的自动哨兵。

## 验证

- 核心八族（worktree 无注入态环境）：inject-clean-v2/inject-executor/inject-absent-tree（v2 解冻全过）＋inject-check/upstream-root-contract（cognition 契约）＋ensure-injected-delta-guard/zcode-patches-guard 源码标记族＋verify-dist-runtime/upstream-root（平台契约）：**50/50**。
- eval-gaps 11/11；`node --check` 双脚本语法过。
- 主树全量（注入态，单线程）：合入后实测回填 RELEASE-NOTES/发版 spec（见 v1.0.13 收口）。

## 设计文档影响

DESIGN_SYNC: none——恢复平台批已登记设计（2026-11-05-platform-rewrite-design）的实现态，无新机制；eval 断言对齐随 C 批行为注释。
