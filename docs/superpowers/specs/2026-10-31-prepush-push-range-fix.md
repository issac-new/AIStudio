# pre-push 判定面修正：从工作树改为本次推送的提交范围

日期：2026-10-31
状态：implemented
触发：模型波动加固 B 层落地后实测——main 工作树的 `vendor/` 是 inject 注入态（预期脏、永不入提交），pre-push 按工作树变更判定会把正常推送与分支删除误拦（远端分支删除实测被拒）。

## 变更

- `.swarm-yuan/hooks/pre-push`：
  - 先把 pre-push stdin（待推引用清单）落到临时文件，qgate 据此计算 `local_sha..remote_sha`/`merge-base(origin/main)` 的文件变更集；
  - `qgate plan/run` 传入 `--changed "$_changed"`，只判本次推送的提交内容，不读工作树；
  - 仅删除引用（local sha 全零）或推送无文件变更时跳过 qgate 并明示；
  - stdin 临时文件在末尾回放给 `git lfs pre-push`，避免 LFS 失去输入；EXIT/INT/TERM trap 清理。
- `custom/__tests__/qgate-acceptance-registry.test.ts`：新增推送范围判定与 LFS stdin 回放的守门断言。

## 决策记录

| # | 决策 | 理由 | 否决的备选 | 可逆 |
|---|---|---|---|---|
| D1 | 判推送范围而非工作树 | 工作树含 inject 预期脏态；门禁应判“要合入的内容” | 把 `vendor/**` 加进 scope（否决：掩盖真实越界，且 scope 是任务级不是工作树卫生级） | 是 |
| D2 | 删除引用时跳过 qgate | 没有提交内容可判；删除分支不应被内容门禁拦 | 仍跑门（否决：必然误拦，且与内容无关） | 是 |
| D3 | stdin 落临时文件后回放给 LFS | qgate 需要读引用清单，LFS 也需要同一份 | 直接消费 stdin（否决：LFS 拿到空输入） | 是 |

## 验证

- `sh -n .swarm-yuan/hooks/pre-push` → 语法通过。
- `npx vitest run custom/__tests__/qgate-acceptance-registry.test.ts` → **5 passed**。
- 推送本分支时 pre-push 以提交范围运行 L0：scope/acceptance PASS，registers/requirement-trace CONDITIONAL，intent-drift 无登记跳过。
- 诚实边界：shell 逻辑未做全组合仿真；range 计算依赖本地存在 remote sha，缺席时回落 `merge-base origin/main`。

## 设计文档影响

DESIGN_SYNC: none

本修正只改 pre-push 的执行面（判定输入从工作树变为推送范围），不改四层架构、阈值或数字总账；B 层设计仍以 `2026-10-31-model-resilience-hardening.md` 为准。
