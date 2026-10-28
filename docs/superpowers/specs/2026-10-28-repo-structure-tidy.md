# 仓库目录结构整理轮：scripts/docs 分层、死件退役、单仓路径对齐

日期：2026-10-28 ｜ 分支：refactor/repo-structure-tidy ｜ 触发：用户指示「整理下本项目的目录结构，符合工程规范」。

## 变更

范围只取职责不清的四个面；`vendor/`、`custom/`、`patches/`、`zcode-patches/`、`runtime/`、`team/`、`skills/swarm-yuan/`、`simharness/`、`registries/`、`config/`、`.swarm-yuan/`、`.qgate/`、`.github/` 一律不动（见 D1）。

| 组 | 项 | 处置 |
|---|---|---|
| G1 | `docs/` 根 30 个日期前缀文件（28 md + 1 docx + 1 pdf） | 迁入新建 `docs/reports/`，三格式同批迁移 |
| G1 | `docs/README.md` | 新建文档索引：现行入口、子目录职责、命名规则、历史档案位 |
| G1 | `docs/absorption-domain-README.md:15,19` | 相对链接改指 `./reports/` |
| G1 | `docs/2026-10-21-wx-3accounts-research.md:5` | 语料目录相对链接改 `../wx-research-20261021-digests/` |
| G1 | `custom/` 8 处代码注释中的设计文档路径 | 改指 `docs/reports/2026-09-29-change-gov-three-accounts-research.md` |
| G2 | `scripts/` 根 16 个 `*-walkthrough.mjs` + 6 个 `obs-*`/`observatory-*` | 迁入既有 `scripts/regression/`（该目录本就是走查/探针/冒烟归属地） |
| G2 | 12 个迁移/重生成/对账/一次性脚本 | 迁入新建 `scripts/maintenance/` |
| G2 | `scripts/diagram-skill.test.ts` | 迁入 `scripts/__tests__/`，`__dirname` 回根层级由 `..` 改 `../..` |
| G2 | `scripts/` 根文件数 | 60 → 25（余项为 package.json/CI/qgate/代码/测试显式调用的入口与共享库） |
| G3 | 根 `vite.config.iso.ts` | 删除；同批从 `RELEASE-MANIFEST.json` cockpit `packageIncludes` 移除 |
| G3 | 根 `docker-compose.yml` | **保留**：`docs/windows-x64-setup.md:110-113` 已把它作为「已知边界」如实披露（YAML 合法，但引用的 Dockerfile 不存在、任何平台都起不来），删除会同时抹掉这段披露；改列挂账 4 |
| G3 | `patches/028-client-kanbanview-enh.patch` | 删除（与 `.archived-patches/028-*` 字节相同，series 未登记，inject 不消费） |
| G4 | `scripts/sync-upstream.sh`、`serve-server.sh`、`check-bundle-budget.mjs`、`verify-dist.mjs` | 上游根解析统一为 env → `vendor/hermes-studio` → 旧 `../upstream` |
| G4 | `scripts/plan-html/render.sh:11` | 硬编码 `/Users/cuishi/lab/ncwk/...` 改 `$ROOT` 变量 |
| G4 | `custom/__tests__/zcode-patches-guard.test.ts:11` | 同上游根解析序 |
| G4 | `scripts/maintenance/add-i18n-keys.mjs`、`add-matrixchat-i18n.mjs` | 目标树 `../../upstream/...` 改 `../../vendor/hermes-studio/...`（随迁入 maintenance 后层级同步） |
| G5 | 根 `AGENTS.md` 目录导航 | 补 `docs/reports/`、`docs/README.md` 与 `scripts` 子目录约定 |
| G5 | 本地根 `.pytest_cache/`、`skills/swarm-yuan/${PROJECT_DIR...}` 怪名目录 | 删除（本地垃圾，不入提交） |

## 决策记录

- **D1 只动四处，不动硬绑定目录**：`vendor/`（整树基线 + pre-commit 挡护）、`patches/`（series 顺序契约）、`custom/`（alias + vitest include + inject 挂接）、`runtime/`（`runtime-manifest.json:3` 写死）、`team/`、`skills/swarm-yuan/`、`simharness/`、`registries/`、`config/`、`.swarm-yuan/`、`.qgate/`、`.github/` 都有硬编码路径或发布清单绑定，移动等于改写工具链契约；本轮收益不足以承担该回归面。根层真正的问题不是「目录太多」而是平铺堆放，故按职责收容而非重排架构。
- **D2 docs 判据取日期前缀，判定不了的不搬**：`docs/` 根 28 个 md 全部以 `2026-` 开头，是历史复盘/审计/调研的稳定命名；非日期文件（`USAGE.md`、`windows-x64-setup.md`、`intro.html`、`absorption-domain-README.md`、`comm-collab-v13/v14`）留在原处，`comm-collab-*` 两篇是否属现行入口无法机械判定，按「判定不了留原处」处理并在索引标注，不做猜谜式搬迁。
- **D3 scripts 判据取引用方扫描，不按文件名猜**：对 `scripts/` 根每个文件做全仓引用扫描（排除 `vendor/`），被 package.json、CI、qgate、源码、测试、其他脚本引用的留在根；零引用且属走查/探针的进 `regression/`，属迁移/重生成/对账的进 `maintenance/`。该判据可复算，后续新增脚本照此归位。
- **D4 历史档案内的旧路径不改写**：已迁入 `docs/reports/` 的文档正文里出现的 `docs/2026-*` 或 `scripts/xxx` 字样是当时事实的记录，按「历史归 git」不改写；只更新活体入口（`docs/absorption-domain-README.md`、根 `README.md`、`AGENTS.md`）与被移动文件内会立即失效的相对链接。同理，历史 spec（`docs/superpowers/specs/`）中对旧路径的引用保持原样，代码注释属活体说明故同批更新。
- **D5 根级死件按「是否仍有活体引用」逐个判定**：`vite.config.iso.ts` 13 处路径全部指向 `/Volumes/nvme2230`，无任何脚本引用，仅被发布清单列为包内文件，故删除并同步清单，恢复命令记于本文末节（满足「先存档再删、可回滚优先」）。`docker-compose.yml` 初判同类，执行时发现 `docs/windows-x64-setup.md:110-113` 正以「已知边界」条目如实披露它不可 up——删文件会让该披露指向空气，属删掉证据而非清理杂物，故保留原状并转为挂账 4。
- **D6 怪名目录只清产物，根因另行挂账**：`skills/swarm-yuan/${PROJECT_DIR...}` 的成因是 `skills/swarm-yuan/assets/precheck.conf:11` 占位符行尾带 `# MEASURE:` 行内注释，生成器按整行取值后当作 `PROJECT_DIR` 建目录。`skills/` 不在 spec-first 可写区（`WRITABLE_DIRS` 八面不含 skills），且技能本体是发布模块（`RELEASE-MANIFEST.json` yuan-skill），修解析器需配 1589 个技能测试与版本记录——独立一轮处理，本轮只删本地产物并落挂账。
- **D7 不合并证据与档案多轨**：`evidence/`（37 跟踪文件，34 个二进制）、`custom/qgate/evidence/`、`archive/`、`.archived-patches/`、`patches/_skip-*`、`runtime/hermes-records/research/retired-docs/` 分属不同契约（交付证据、qgate 独立子项目、退役补丁、脱敏记录镜像），合并会打断可追溯性与打包边界，本轮明确不做。
- **D8 上游根解析统一为单仓序**：以 `env → vendor/hermes-studio → 旧 ../upstream` 为准（`scripts/build.mjs:14-18`、`scripts/serve-server.mjs:50-54` 已有先例）。旧多仓布局的兄弟 `upstream/` 只在本地存在，纯本仓检出下 `npm run sync`、`postbuild`、`check:bundle` 必坏，属单仓整合遗留债，与本轮目录整理同族故同批修。

## 验证

提交前逐组执行：

- `npx vitest run custom/__tests__/docs-ssot-guard.test.ts custom/__tests__/patches-series-guard.test.ts custom/__tests__/zcode-patches-guard.test.ts scripts/__tests__/verify-release-manifest.test.ts scripts/__tests__/inject-absent-tree.test.ts custom/__tests__/zcode-3140-snapshot.test.ts`
- `npm run release:check`
- `bash -n` 覆盖本批改动的全部 shell 脚本
- `git grep` 旧路径残留核对（排除 vendor）：`docs/2026-`（活体入口应为零）、`scripts/<已迁文件>`（活体入口应为零）
- 结构核对：`ls docs/*.md` 只剩 6 个非日期文件 + 索引；`ls scripts/` 根只剩入口与库
- 判据复算：对本批留在 `scripts/` 根的文件重新跑引用扫描，确认每个都有引用方

合并前：`npm test` 全量。

构建面：`npm run build:full`（内含 `postbuild` → `verify-dist.mjs`）后跑 `node scripts/check-bundle-budget.mjs`，用于证明 D8 的产物路径解析真的生效。

**本批未验证项如实登记**：`npm run sync` 的端到端执行未跑（需外部 upstream 远端、clean 后重装依赖，破坏当前注入态），只做 `bash -n` 与路径解析静态核对；`docs/reports/` 内的历史文档不做链接存活审计（其正文引用的上游源码路径本就指向当时的树）。

## 设计文档影响

DESIGN_SYNC: none

理由：整合正本 §4.5「单仓与代码归属」的路径表（`docs/superpowers/specs/2026-10-23-swarmstudio-integrated-design.md:539-549`）所列路径无一变更——`custom/`、`patches/`、`zcode-patches/`、`vendor/`、`runtime/`、`team/`、`simharness/`、`skills/swarm-yuan/`、`registries/`、`config/`、`docs/superpowers/specs/` 全部原地不动。本批只新增 `docs/reports/` 归档位与 `scripts/` 子目录，并退役两个未被引用的根级死件，不改变架构契约、接口、数据流。数字总账 §D（`2026-10-23-swarmstudio-design-ledger.md:70-80`）明确补丁、路由、测试与文档数量随代码变化、不手工维护，故文件数变动不入账。

## 挂账

1. **swarm-yuan 生成器把带行内注释的占位符当目录名**（D6）：修 `skills/swarm-yuan/assets/precheck.conf:11` 与解析器（`skills/swarm-yuan/scripts/generator/subcommands.sh`、`skills/swarm-yuan/assets/precheck.sh`），补「带注释占位符不产生目录」守门测试，另起一轮。
2. **孤儿目录 `.claude/worktrees/upstream`**：无 git worktree 注册，按仓规不自行 `rm -rf`，待用户裁决移入隔离区或删除。
3. **`custom/server/governance/repo-root.ts:10` 的 `/Volumes/nvme2230` 兜底**：属同族旧机路径，但位于治理仓解析链尾，改它需先确认生产部署面，留下轮。
4. **`docker-compose.yml` 与它的三个 Dockerfile**：compose 在根、`Dockerfile.server`/`.ide`/`.leader` 全缺，`docs/windows-x64-setup.md:110-113` 已如实记为「任何平台都 up 不起来」。补齐或下线是路线决策，不是整理动作，需产品裁决后另起一轮；本轮保留原状。

## 死件恢复命令

```bash
# e3a058a14 = 本分支基点（origin/main），两个文件在该提交完整存在
git checkout e3a058a14 -- vite.config.iso.ts
git checkout e3a058a14 -- patches/028-client-kanbanview-enh.patch
```

（`.archived-patches/028-client-kanbanview-enh.patch` 始终在库，无需恢复。）
