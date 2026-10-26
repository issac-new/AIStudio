# 2026-10-26 swarm-yuan 单源与迁移补位重构

## 变更

对 `skills/swarm-yuan` 做设计层与源码层盘点后，本轮只实施与并行分支 `refactor/swarm-yuan-core` 零重叠的 P1 项。并行分支已承担路径契约、`verifier/` 恢复、CI、测试路径改写；本轮不修改其已改文件。

1. **facts 双段对账**：`assets/facts.conf` 手写段服务安装态，`assets/facts.generated.conf` 服务仓库态并在文件末尾 source 覆盖。保留双段（安装态没有 generated 文件），新增重叠键等值断言；修正 `FACT_UNIVERSAL_FILES_CORE` 手写值 46→47（生成段与实测均为 47）。
2. **vendor 校验**：先核对 4 个 SHA256 失配文件的差异来源，再重签 `vendor-knowledge/SHA256SUMS`。银联两份规范的 `EDA` 标识已脱敏为 `[已移除]`；`_shared` 两份与当前裁剪正本一致。
3. **活文档死链**：`references/bugfix-runbook.md`、`references/remote-debug-jvm.md` 的 `mcp-tools.md` 链接由 `../scripts/` 改为实际位置 `../assets/`。
4. **安装排除**：`install.sh` 的两处分发排除表补 `verifier`、`CLAUDE.md`、`CONTRIBUTING.md`、`.gitattributes`，避免恢复后的生成器侧资产装入目标技能。
5. **两处旧根路径**：`scripts/registry-render.sh` 的 `--dead-facts` 扫描改为技能根下 `verifier/v1`；`scripts/profile-threshold-survey.sh` 输出改到技能根 `docs/`。
6. **黑话清零**：`references/subagent-orchestration.md` 的“三件套”改为“三项要求”，恢复 `test-r68-jargon-free` 全绿。
7. **测试行为域分类**：新增 `tests/domains.tsv`（120 个测试 → generation/gates/frameworks/distribution/knowledge/runtime/verification/regression 八域）；`tests/run.sh` 新增 `--domain NAME[,NAME]` 与 `--list-domains`；runner 契约测试增加域登记闭环、孤儿/重复检查、域筛选与未知域 fail-closed。
8. **设计源合并**：README 增补文档角色与附录 F（治理原则、九条不变量），M0–M4 证据分级定义迁入 `assets/registry/README.md`，`docs/design-terminal.md` 归档；`build-compendium.sh` 路径修正并 `--regen` 通过。

## 决策记录

- **与并行分支的边界**：`refactor/swarm-yuan-core` 正在活动（最近编辑 `make-offline-bundle.sh` 与 `r134` 测试），本轮在独立 worktree `refactor/swarm-yuan-single-source` 上做非重叠补位，避免同文件并发写。
- **facts 不删重复键**：`facts.generated.conf` 不在分发清单，安装态只能读手写段。删除手写键会让安装态缺值；正确做法是保留双段并机器断言等值。
- **vendor 重签前先验差异**：4 个失配文件中，2 个银联规范的差异是 `EDA`→`[已移除]` 脱敏，2 个 `_shared` 文件与现行正本逐字节一致；不存在未解释的内容漂移，才重签。
- **设计文档合并为一份**：README 增补“文档角色”段与附录 F（治理原则、九条不变量），M0–M4 证据分级定义迁入 `assets/registry/README.md`，`docs/design-terminal.md` 归档为 `docs/reviews/design-terminal-2026-10-26-archived.md`（顶部标注规范源为 README）。`build-compendium.sh` 的正本路径同步修正并执行 `--regen`，`--check` 通过。合并并行分支时若 `design-compendium-full.md` 冲突，以本分支 README 为准重跑 `--regen`。
- **CI 触发过滤**：技能级 CI 工作流由并行分支新增，本轮不触碰；待其合入后补 `paths:` 与 `concurrency`，避免 AIStudio 无关改动触发 30 分钟全量 sweep。

## 验证

```bash
cd skills/swarm-yuan
bash scripts/registry-render.sh --check          # 含新增 facts 双段等值断言
bash scripts/sync-vendor-knowledge.sh --check    # SHA256SUMS 全量通过
bash tests/test-r68-jargon-free.sh               # 黑话清零
bash tests/test-r102-legacy-items.sh             # 分发排除边界
bash -n install.sh
bash -n scripts/registry-render.sh
bash -n scripts/profile-threshold-survey.sh
```

全量 `tests/run.sh` 与 `build-compendium --check` 需在并行分支合入后复跑：当前主树的失败项主要来自迁移路径与缺件，不属于本轮改动面。

## 复核并行分支（refactor/swarm-yuan-core）

- 已覆盖：路径解析（`SWARM_YUAN_HOME` / `SWARM_YUAN_SOURCE_ROOT`）、self-check 豁免与版本锚、build-compendium、make-offline-bundle、runner、14 个测试路径、CI 工作流、`.claude/commands/`、`.gitattributes`、`CLAUDE.md`/`CONTRIBUTING.md`、`verifier/v1`。
- 实测：该分支 `self-check` 通过、`test-source-layout` 34/34 通过、汇编校验通过、多数目标测试转绿；最近一次观察 `test-r133-offline-complete` 与 `test-r134-everything-bundle` 仍红，分支仍在改 `make-offline-bundle.sh`，未定论。
- **缺口 1（高）**：`verifier/` 只恢复了 `v1`（9 文件），缺 `verifier/README.md`、`verifier/v2/external-validity.md`、`verifier/v2/run-v2.sh`、`verifier/capture-baseline.sh`。README 的“外部效度阈值”与使用手册的验证器入口仍悬空，不能据此宣称司法层已完整。
- **缺口 2（中）**：新增的 `.github/workflows/swarm-yuan.yml` 没有 `paths:` 过滤与 `concurrency`，AIStudio 任意 push/PR 都会触发 30 分钟全量 sweep。
- **缺口 3（已在本文档分支补位）**：facts 双段等值、vendor 校验、活文档死链、install 对生成器侧资产的排除、两处旧根路径、黑话、测试行为域分类。
- **缺口 4（待合并后修）**：`make-offline-bundle.sh` 直接用 `git describe` 的 tag 名；AIStudio 的 tag 是 `swarm-yuan-v2.95.0`，导致离线包`.bundle-version` 与 `install.sh --version` 输出 `installer swarm-yuan-v...`，不满足 `installer v...` 口径（`test-r133-offline-complete` 态4 红）。修法：写版本与打印版本时统一剥掉 `swarm-yuan-` 前缀。

## 验证记录

```text
bash scripts/registry-render.sh --check        # exit 0；新增 "facts 双段重叠键等值（20 键）"
bash scripts/sync-vendor-knowledge.sh --check  # exit 0；304 项校验通过
bash tests/test-r68-jargon-free.sh             # exit 0；17 ok / 0 fail
bash tests/test-r102-legacy-items.sh           # exit 0；安装排除边界通过
bash tests/test-registry.sh                    # exit 0；13 ok / 0 fail
bash tests/test-vendor-checksums.sh            # exit 0；3 ok / 0 fail
bash tests/test-r125-distill-references.sh     # exit 0
bash scripts/build-compendium.sh --check       # exit 0；六卷逐字节一致
bash tests/test-runner-contract.sh             # 13 ok / 1 fail（仅 TAP 项依赖 test-doc-numbers 的并行分支路径修复）
bash tests/run.sh --list-domains               # 8 域，合计 120 测试
bash -n install.sh scripts/registry-render.sh scripts/profile-threshold-survey.sh tests/run.sh  # 全部通过
```

变异验证：把 `facts.conf` 的 `FACT_GATES_TOTAL` 临时改为 55，`registry-render.sh --check` 报 `facts 双段重叠键失配: FACT_GATES_TOTAL(手写=55 生成=56)`；恢复后重新通过，证明新断言不是装饰。

## 未做 / 未验证

- CI `paths` / `concurrency` 过滤：工作流文件归并行分支。
- 函数尺寸锁扩展到 `self-check.sh` / `precheck.sh` / `state-machine.sh`：需先拆分超限函数，单独立项。
- 测试按行为域重命名：保留 `test-rNNN-*` 历史别名，单独立项。
- 并行分支的 `verifier/v2` 等缺件、`r133`/`r134` 两项红测：归该分支继续收口。
- 全量 `tests/run.sh`：当前主树基线 102/120，失败集中在迁移路径与缺件；本分支只验证了改动面，待并行分支合入后复跑全量。

## 集成收口（2026-10-26）

- **合并方式**：`refactor/swarm-yuan-core` 与 `refactor/swarm-yuan-single-source` 均与当前 main 无共同祖先（历史被重写/快照导入）。整支合并会回退 AIStudio 应用面，故只摘取 `8c9f13466` 的 `skills/swarm-yuan` 与 `.github/workflows/swarm-yuan.yml` 补丁，再以 patch 方式叠加本分支提交。
- **隐藏测试资产**：`test-source-layout` 依赖的 `.claude/commands/swarm-yuan.md` 与 gate-fixture 隐藏目录文件（`.swarm-yuan/notes`、`.claude/skills/demo`）在 core 分支存在但未随补丁进入新树；已从 core 分支恢复并 `git add -f` 入库，避免 fresh checkout 假绿/假红。
- **LFS 决策**：vendor-knowledge 在 AIStudio 是普通 blob 且无 LFS 对象库；`filter=lfs` 会在下次 `git add` 把普通文件静默转成指针（数据雷）。`.gitattributes` 改为 `vendor-knowledge/** -text`，`sync-vendor-knowledge.sh` 移除 `git lfs track` 并加防回归断言，`test-r118-install-hardening` 1d 同步改为“-text 在位 + filter=lfs 禁入”。
- **版本兜底**：无 tag 历史（浅克隆/重写主线）时 `git describe` 只返回短 SHA；离线包与 `install.sh --version` 回退到技能 `CHANGELOG.md` 首个版本号，并统一剥 `swarm-yuan-` 命名空间前缀。r133 的包目录解析改为按实际 zip 名，避免测试与构建器各算一遍版本。
- **行尾**：按 `.gitattributes` 把 11 份 `.bat` 工作树文件重写为 CRLF（`test-bat-parity` 5 通过）。
- **函数尺寸锁**：锁面从 `generate-skill.sh` 扩展到 `assets/precheck.sh`、`scripts/self-check.sh`、`assets/state-machine.sh`，共 235 函数 ≤150（`_fg_emit_workflow=209` 豁免）；同轮拆分 `check_doc_consistency` 239→98、`_default_conf` 161→112、`guard_phase` 166→131。
- **版本锚适配**：AIStudio 根 README 是应用面、无技能 badge；版本锚改为“技能 CHANGELOG 首行 = 技能 README badge”两面一致，根 README 若含技能 badge 再升三面。此前因根目录无 CHANGELOG 而静默跳过。
- **CI**：工作流仅随 `skills/swarm-yuan/**` 或自身变更触发，并加 concurrency 取消旧运行。

### 集成验证

```text
bash scripts/self-check.sh --check-only            # ✓ 自检通过（版本两面锚生效）
bash scripts/registry-render.sh --check            # ✓ 六表 + facts 双段
bash scripts/build-compendium.sh --check           # ✓ 六卷逐字节
bash tests/test-doc-numbers.sh                     # 214 项 0 失败
bash tests/test-source-layout.sh                   # PASS 42
bash tests/test-runner-contract.sh                 # PASS 14
bash tests/test-r128-function-size.sh              # PASS（235 函数）
bash tests/test-r133-offline-complete.sh           # 全部通过
bash tests/test-r134-everything-bundle.sh          # 全部通过
bash tests/test-bat-parity.sh                      # PASS
```

### 集成补记（最终收口）

- `set -e/pipefail` 陷阱：无 CHANGELOG 时 `sed | head` 会使版本回退语句整段退出（R126 G5 同族）；四处 CHANGELOG 读取全部加 `|| true`，假源安装 5b 复绿。
- `.gitattributes` 守门断言用 `grep -F`，避免 `**` 被当作重复运算符（1d 假红）。
- `FACT_SCRIPT_LOC` 随拆分实测同步为 9331；`build-compendium --regen` 后 r141 复绿。
- 最终全量：121 项（见下）。

### 最终回归（2026-10-26）

`bash tests/run.sh --level all --jobs 6` → **121 通过 / 0 失败（共 121，独占串行 17）**，EXIT=0。

## 设计文档影响

DESIGN_SYNC: touched

- `skills/swarm-yuan/README.md`：新增“文档角色”段与附录 F（治理原则/九条不变量），明确唯一规范源。
- `skills/swarm-yuan/assets/registry/README.md`：新增 M0–M4 证据分级定义。
- `skills/swarm-yuan/docs/reviews/design-terminal-2026-10-26-archived.md`：由 `docs/design-terminal.md` 归档，顶部标注合并去向。
- `skills/swarm-yuan/docs/design-compendium.md`、`docs/design-compendium-full.md`：同步归档路径与汇编重生成。
- `skills/swarm-yuan/docs/design-refactor-2026-10-24.md`：终态机制指向 README。

## 并入最新 main（2eeedcd3d，2026-10-26）

- 最新 main 为无共同祖先的新快照（JoyAI/design-sync 轮）。整支 merge 会拒绝/回退应用面，故以 `git diff d48a79300..integration` 净 patch 三方应用到最新 main；冲突仅 `facts.conf` 的 `FACT_SCRIPT_LOC`，取实测 9362。
- design-sync 轮新增 `FACT_CONF_VARS=199`、`FACT_ENGINE_CODE_LOC_MAX=7800`、`test-design-sync.sh`；`test-doc-numbers` 的引擎 LOC 断言同步 7800，行为域登记补 `test-design-sync.sh=verification`。
- `install.sh --version` 恢复“源树 git 真值”（无 tag 时为短 SHA），与 r118 断言一致；语义版本回退（CHANGELOG）只保留在离线包写入侧，`.bundle-version` 仍为 `v2.95.0`。
- 合并后 `registry-render --facts` 重生成、`build-compendium --regen` 重灌；self-check / registry / 汇编全绿。

### 并入最新 main 后补记

- design-sync 轮使 `_fg_emit_workflow` heredoc 由 209→212 行；尺寸锁豁免同步 212，并保留注释说明。
- 合并树 `.bat` 按 `.gitattributes` 重写 CRLF；`test-bat-parity` 复绿。
- 最终全量 122 项（121 + design-sync）待本轮干净回归确认。

### 最终回归（并入最新 main 后）

`bash tests/run.sh --level all --jobs 6` → **122 通过 / 0 失败（共 122，独占串行 17）**，EXIT=0。

## 终审修复补位（2026-10-26）

摘取并行核心会话 `fbcc731f4` 中与当前 main 兼容的四个修复（不并入其独立可信性重构的 8 个新测试与 secure-fs/conf 内核）：

- `assets/precheck.conf`：尾链补 `precheck.industry.conf`，并注明变量定义区必须在尾链 source 之前。
- `assets/precheck.sh`：`--dump-conf` / `--gate-stats` 改为只 source `precheck.conf`（由其级联加载 arch/compliance/industry/patch），消除重复 source；`--gate-stats` 由此尊重 conf 中的 `GATE_RUNS_DIR`。
- `install.sh`：外部符号链接目标改为 `return 3`，批量汇总单列“未变更外部链接”，不再计入成功。
- `scripts/ops-readonly-guard.sh`：输出重定向改为两步白名单（先剥 `2>&1` / `/dev/null` 等无害丢弃，再匹配 `>`/`>>`/`curl -o`/`wget -O`）。
- 预算：上述改动净增 3 行，通过压缩既有空行抵消，`FACT_SCRIPT_LOC` 9362 与引擎上限 7800 维持不变；self-check 全绿。
