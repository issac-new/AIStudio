# swarm-yuan R142 运行时基线聚焦刷新（vendor 升级轮联动）

- 日期：2026-10-25
- 分支：feat/skill-r142-runtime-refresh（worktree：.claude/worktrees/skill-r142-refresh）
- 触发：用户指令——vendor 升级轮（studio v0.7.39 + agent v0.22.5）须联动技能侧上游组件基线与 research 记档（「skill 的 research 和上游组件也要更新」）。
- 详细轮档：`skills/swarm-yuan/docs/research/R142-runtime-refresh.md`（本 spec 只记决策与验证口径）。

## 变更

| 文件 | 变更 |
|---|---|
| skills/swarm-yuan/assets/registry/runtimes.tsv | 2 行基线更新：ruflo v3.61.1→v3.62.0；gstack「v1.87.5.0 tip 6f7488a70」→「v1.91.188 tip 1e3ee83c4」 |
| skills/swarm-yuan/scripts/src-pins.conf | gstack SHA 6f7488a70→1e3ee83c4（对齐基线 tip） |
| skills/swarm-yuan/docs/upstream-baseline.md | 头部核验行 R140→R142；状态表块重渲（ruflo/gstack 两行） |
| skills/swarm-yuan/docs/research/upstream-changelog.md | 追加 R142 节（2 移动/20 零移动 + 宿主克隆面记档 + zcode 新口径裁定记录） |
| skills/swarm-yuan/docs/research/R142-runtime-refresh.md | 新增轮档（移动面/最小吸收/宿主克隆面/异常记档/验证） |
| skills/swarm-yuan/references/subagent-orchestration.md | 新增「合成结果披露与取消终态（ruflo v3.62.0）」节（最小增量吸收） |
| skills/swarm-yuan/references/review-methodology.md | 新增「v1.91.186-188 增量」节（最小增量吸收） |
| skills/swarm-yuan/scripts/registry-render.sh | 整合债修复：3 处 `$ROOT/docs/` stale 路径改 `$BASE/docs/`（upstream_baseline_write/check + cmd_dead_facts） |
| skills/swarm-yuan/assets/registry/dist.tsv | 字节锚同步（subagent-orchestration 66572 / review-methodology 60429） |

## 决策记录

1. **22 行全量核验、只升 2 行**：多通道查新（npm/pypi/git tag/tip）实测 ruflo 与 gstack 移动、其余 20 行零移动；R141 至今仅一天，零移动为主属预期，如实记档不凑数。
2. **gstack 版本前缀修正**：R141 时 tip 已 v1.91.x 而基线列仍 v1.87.5.0（版本前缀滞后），本轮随 tip 更新一并对齐为 v1.91.188；gstack 仓 git tag 通道为空，版本号以仓内 package.json 为准。
3. **dsh 基线不随缓存动**：宿主克隆（upstream/ 缓存）已到 master tip 22ddee3792，但注册表 tag 口径下最新 tag 仍 dsh-v0.2.1-rc.3——基线仍钉 tag，克隆面 tip 前进走 changelog 记档（与 kimi-code/minimax「未发版不升基线」同口径）。
4. **最小吸收不扩面**：仅 2 个移动项落 references 增量节（延续 R141 版本节格式）；R141 型实栈回归/物化/发版不在本轮范围。
5. **渲染器 stale 路径当场根治**：registry-render.sh 三处 `$ROOT/docs/` 在树内指向不存在的路径（入树后从未跑通）——修为 `$BASE/docs/` 技能子树定位；build-compendium.sh 同款问题挂账下轮。
6. **zcode 同步口径变更入册**（用户裁定）：zcode 依上游 main 变更判移动、不看版本 tag；已实测 main=3c5b2276 持平零移动，口径记入 changelog。
7. **异常不盲动**：routa 本地分叉（领先 4083 提交）与 codex 缓存本地提交（1 个来路不明 Cargo.toml 版本改动）只记档待用户裁决，不自动升级。

## 验证

| 门 | 结果 |
|---|---|
| registry-render --check | ✓ 注册表一致性通过（状态表↔tsv 逐行一致/面积 5555B/无历史头注/dist 字节锚一致） |
| self-check --check-only | 无 ✗、无 drift warn；2 条 ⚠ 为存量 advisory（对照主检出确认非本轮引入） |
| 重放验证 | --write-upstream-baseline 树内首次跑通（stale 路径修复后）；--facts 重生成字节一致 |
| git 面 | worktree 改动 8 文件 +新增 2（R142 轮档+本 spec）；脚本碎屑 skills/.swarm-yuan/ 已清不入库 |

## 未做/未验证项

- routa 分叉与 codex 本地提交两件异常待用户裁决（见 R142 轮档 §四）。
- build-compendium.sh 同款 stale 路径未修（挂账）。
- R141 型吸收物化（references 之外的 gates/facts 面）与技能发版（v2.95.1）不在本轮；如需我可另开轮。
