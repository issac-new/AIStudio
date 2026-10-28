# 预检④单仓形态适配（run23 前置批）

日期：2026-10-28 ｜ 分支：fix/sim-prelaunch-check4-single-repo ｜ 关联：simharness/docs/2026-10-22-run23-prelude.md §二

## 变更

- `simharness/mux/mx-prelaunch-check.sh` 检查④：判据从「双仓（simharness+overlay）git status 全净」改为「AIStudio 单仓 status 排除 `vendor/**` 后全净」。pathspec 用 `:(top,exclude)vendor` 锚仓库根，避免 `$HERE`（simharness 子目录）下相对解析失位；删除已死的 `$HERE/../overlay` 后半判据（overlay 已并入单仓，路径不存在恒空真）。
- `simharness/tests/harness-gate-integrity.test.ts`：新增守门断言（④ 须含 exclude pathspec 与单仓判据名），防回退到误红形态。
- `simharness/docs/2026-10-22-run23-prelude.md` §二表补一行注记。

## 决策记录

| # | 决策 | 理由 |
|---|---|---|
| D1 | 排除 `vendor/**` 而非要求主树注入态清场 | AGENTS.md/VENDOR.md 立法：vendor 注入脏态=预期工作态、不入提交（pre-commit 自动撤出）；且 8647 服务以 vendor/hermes-studio 为运行树，带服 clean 被 inject.mjs 活体守卫拒绝，物理上不可清。 |
| D2 | 分支基底取本地 main（6e9d71af5）而非 origin/main（e3a058a14） | 并行会话已提交未推送、本地领先 10 笔且为 origin 严格超集；从旧基底开分支会丢补丁 028 去重与上游根解析改动。 |
| D3 | 保留「其余已跟踪面零未提交改动」强度不降 | 豁免仅限 vendor/**；simharness/custom/patches/runtime/docs 等真实漂移仍一票红。 |

## 验证

- `bash -n mux/mx-prelaunch-check.sh` 语法过。
- 实测判据：主树当前 313 文件 vendor 注入脏态下，`git -C simharness status --porcelain --untracked-files=no -- ':(top,exclude)vendor'` 输出为空 → ④ 绿；人为留 1 个非 vendor 脏文件 → 输出非空 → ④ 红（两态都验）。
- `npx vitest run tests/harness-gate-integrity.test.ts` 目标套件绿（含新断言）。

## 设计文档影响

DESIGN_SYNC: none —— 预检脚本内部判据适配，不触及整合正本/数字总账；前置正本（run23-prelude）已随批加注记行。
