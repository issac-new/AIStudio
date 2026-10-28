# npm run sync 端到端实跑证据（2026-10-28，隔离检出）

- 隔离上游：/tmp/sync-e2e-up/hermes-studio（本地 clone，origin 指向 upstream/hermes-studio，无外网）
- 运行目录：.claude/worktrees/sync-e2e（一次性 worktree）
- 环境：OVERLAY_UPSTREAM_ROOT=/tmp/sync-e2e-up、OVERLAY_ALLOW_LIVE_CLEAN=1（worktree 隔离树，非在服树）、npm_config_offline=true
- 结果：SYNC_EXIT=0；补丁 applied 339 条、FAILED 0 条

```
[sync] 1. clean(撤销 B 类 patch)
[sync] 2. fetch + 取最新 stable release tag(无 tag 则 fallback origin/main)
[sync]   checkout tag: v0.7.39 (detached HEAD + clean -fdx)
[sync] 3. re-inject(应用 patch + 建 node_modules 符号链接 + server/src/custom 链接)
[sync] 3b. install deps(git clean -fdx 清了 node_modules,需重装)
[sync] 4. 校验上游工作树状态(直接 git status,绕开 verify-clean 路径错配)
  HEAD: 8f215f59 feat: emit session task creation and completion webhooks (#3512)
  dirty files (非 inject 产物应排查): 256
[sync] 完成。若 inject 失败,按 docs/superpowers/specs 中 overlay 架构 §3.5 修复 patch。
[sync] 接下来:npm run build:full && npm run test
SYNC_EXIT=0
```
