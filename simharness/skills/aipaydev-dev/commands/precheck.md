---
description: 运行门禁检查
argument-hint: --all | --all-full | <gate>
---

bash scripts/precheck.sh $ARGUMENTS

**常用序列（quality:full 模式——fail-fast 串行，任一步 fail 即停；按项目形态裁剪）**：
- 日常开发收口：`--all`（核心 10：branch/scope/build/test/sensitive/consistency/review/reuse/deps/security）
- 结构变更：`--all-full`（标准 28：核心 10 + 架构 18）
- 强监管交付：追加 `--compliance-suite`（合规 19）
- 单点深挖：`--test` / `--reuse` / `--deps` / `--layer` / `--shift-left` 等单跑
