# run23 前置正本起跑命令路径更新

日期：2026-10-28 ｜ 分支：docs/run23-prelude-paths ｜ 关联：2026-10-28-sim-prelaunch-check4-single-repo.md（§二 路径已随该批更新）

## 变更

- `simharness/docs/2026-10-22-run23-prelude.md` §三/§四：起跑顺序与审批随行器命令中残留的旧仓绝对路径 `/Users/cuishi/lab/ncwk/simharness`（两处）更新为单仓新址 `/Users/cuishi/lab/AIStudio/simharness`。SIM_ROOT 侧路径（ncwk-sim-mux）未动——该路径是现行运行态真值，非旧仓残留。

## 决策记录

| # | 决策 | 理由 |
|---|---|---|
| D1 | 只清旧仓路径，不动 SIM_ROOT 路径 | ncwk-sim-mux 是当前生效 SIM_ROOT（10-27 swarm-eval 三跑实证）；仓整合只迁移了源码树，未迁移运行态。 |
| D2 | docs 批随 spec 提交（不 --no-verify） | L2 spec-first 对 simharness/ 全域生效（V8.47 轮立法先例）；路径错误属操作面风险，值得决策留痕。 |

## 验证

- `grep -n 'lab/ncwk/simharness'` 复扫：仅剩 §二 注释行内的说明性引用（标注旧址已归档），可执行命令零残留。
- 起跑序列逐行走查：cd 新址 → mux-clean/mx-setup/mx-up/prelaunch-check 相对路径解析与主树实测路径一致。

## 设计文档影响

DESIGN_SYNC: none —— 前置正本路径勘误，不触及整合正本/数字总账。
