# 工作区目录整理轮：根层全目录定性 + 垃圾清理 + 导航补全

日期：2026-10-24 ｜ 分支：docs/workspace-dirs-map ｜ 任务：用户指示「整理本项目下所有文件夹（包含隐藏文件夹）」。

## 变更

| 类 | 项 | 处置 |
|---|---|---|
| 本地垃圾 | 根 `.pytest_cache/`（pytest 自建缓存，内嵌自忽略 .gitignore） | 删除 |
| 本地垃圾 | 根 `packages/`（4 个 test-runtime SQLite 残留 db/wal/shm，测试运行产物可再生成） | 删除 |
| 本地垃圾 | 根 `tests/`（0 文件纯空目录树，运行残留） | 删除 |
| 本地垃圾 | `.DS_Store` ×2（根 + docs/superpowers/） | 删除 |
| 文档 | AGENTS.md 目录导航缺 5 处入库目录（config/ 与隐藏 4 项）+ 本地基建族无成文说明 | 补「隐藏目录」与「本地基建」两节 |

## 决策记录

- **D1 自忽略目录定性**：`.gstack/`、`.superpowers/sdd/`、`.pytest_cache/` 目录内自带 `.gitignore`（内容 `*`），故 git status 干净而 check-ignore 对目录本身报未忽略——属合法自忽略形态，不加根级规则；`.pytest_cache` 为缓存垃圾径直删除。
- **D2 `.swarm-yuan/` 有意入库**：其 12 个跟踪文件含 `hooks/pre-commit`（`core.hooksPath` 指向处，fresh clone 必须可得）与 decisions/trace 台账（留痕立法），与技能模板对目标项目的「.swarm-yuan 忽略」约定不同——本仓作为技能自用项目属刻意例外，导航表明示。
- **D3 根 packages/tests 删除依据**：两者被根锚定规则 `/packages/`、`/tests/` 忽略（防误伤 vendor 同名目录，见 .gitignore 注释）；内容为测试运行残留（test-runtime db / 空树），可再生成，删目录不动忽略规则。
- **D4 本地基建不入库清单成文**：upstream/archive/sim-mux/governance 与隐藏运行态的忽略兜底来源三轨（.gitignore、info/exclude、自忽略）在 AGENTS.md 立法「新本地目录必须同步加忽略规则」。

## 验证

- 清理后 `git status --porcelain` 非 vendor 行 = 0（vendor 注入态为预期工作态）。
- 导航表与实况逐项核对：根层全部 34 目录（含 15 隐藏项）每一项要么入导航表、要么入本地基建清单、要么属 .git（不列）。
- 提交前 worktree 内 diff 仅 AGENTS.md + 本 spec 两文件。
