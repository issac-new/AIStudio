# 2026-11-02 hermes-agent「80 补丁存量债」复核批：证伪＋7 件 gitignore 误伤补录

## 变更

- **证伪昨日「存量债」结论**（v1.0.9 升级批 spec/VENDOR.md 所记「hermes-agent 80 补丁对 v0.22.5 pristine 重放必败」为测量伪象）：双 pristine 实验证明 **80 agent 补丁在 v0.22.5 pristine（bf0203a794 archive）与 git 基线树上均 80/80 全绿**。
- **补录 7 件上游自带文件**：`vendor/hermes-agent/.gitignore`（上游文件，随基线入库）的 `export*`（:32）与 `apps/desktop/electron/**/*.d.ts`（:105）规则误伤 7 件上游文件未入库，`git add -f` 补录 pristine 态。
- VENDOR.md 台账修正：删「存量债挂账」段，改记真相与 gitignore 误伤配方。

## 决策记录

1. 昨日误判根因：v109 worktree 的 final inject 跑在「run3 已应用 117/118/178/179 的 agent 树」上（收口还原只 `git checkout -- vendor/hermes-studio` 未动 agent），git apply 无幂等 → 已应用补丁连锁报 WARN，「80 全败」是重跑伪象。实验方法：真 pristine 起点、按 series 序、逐补丁 `git apply` 统计（v0.22.1 树 71/9、v0.22.5 树 80/0、git 基线树 80/0）。
2. 主检出 M 态验算：主检出 vendor/hermes-agent 与「git 基线+80 补丁」重建树 diff，实质差异仅 2 个 untracked 本地构建产物目录（web/public/fonts、website/src/data）＋缓存——**M 态完全可由 clean+inject 再生**，此前「不可再生的历史快照」判断错误。
3. 7 件误伤不删上游 .gitignore（基线必须 pristine）：以 `git add -f` 入库；后续 vendor-sync 重建 agent 基线时同规则补录（VENDOR.md 记配方）。7 件不在任何补丁 touch 面（80/0 实验即证），缺录不影响注入，只损基线快照完整性。
4. v0.22.1 树 71/9 的 9 件失败属补丁族已被 v0.22.5 时代适配所致（先例 215eed9e0 trial 轮），与 v0.22.5 重放无关，不动。

## 验证

- 双树实验：`/tmp/agent-0225-clean`（bf0203a794 archive）与 `/tmp/agent-gitb-test`（git 基线提取）各 80/80 全绿（逐补丁 git apply，脚本 /tmp/agent-apply-all.sh）。
- 主检出再生验证：`git checkout HEAD -- vendor/hermes-agent && git clean -qfd vendor/hermes-agent` → `npm run inject` 全量 → studio 351 + agent 80 = 431 全绿（回填）。
- 7 件补录后 `git ls-files` 计数从 0 → 1/件（回填）。

## 设计文档影响

- DESIGN_SYNC: touched——vendor/VENDOR.md 台账「存量债挂账」段改写为复核结论＋误伤配方；昨日 spec 2026-11-02-vendor-upgrade-studio-v109.md 的「存量债」表述随批修正（SPEC_REBIND）。
