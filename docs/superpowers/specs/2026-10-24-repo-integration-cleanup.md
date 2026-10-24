# 2026-10-24 仓库终态整合清理轮（repo-integration-cleanup）

## 背景

单仓整合（ncwk 多仓并入，2026-10-24）后的收口轮：全面走查全仓，把散落的未跟踪正身内容入库、清除多版本并存的文档变体族、修正过期 git 元数据，使仓库达到终态干净：文档只留终态全量正本，第三方引用关系准确，目录导航完整。

## 变更

### A. 整合入库

1. **skills/swarm-yuan/**：v2.95.0 迁移（793d81686）时漏 git-add 的全部内容补齐——`CHANGELOG.md`、`docs/` 16 份（design-evolution 决策正本、design-compendium 双卷、usage-manual、upstream-baseline、waivers 三份、带日期轮稿四份）、`docs/research/`、`docs/reviews/`、`tests/`（bats + 跨栈 fixtures）、`runtime/mattpocock-skills/engineering/research/`。技能树按发布态原样入库：内部文档族由技能自身的 compendium/waivers 体系治理（`build-compendium --check` 逐字节门禁），不适用仓级版本收敛。
2. **runtime/tests/hermes_cli/**：`test_board_team_fence.py` 入库；`test_kanban_decompose_estimate.py` 入库，其中 `TestPersistEstimates` 两个用例标 `xfail(strict=False)`——`set_estimate` / `Task.estimate_days` / `estimate_set` 事件全域未实现（vendor、runtime、部署树 grep 实证），半成品特性挂账，实现落地后自动转 XPASS 提示摘牌。
3. **runtime/hermes_cli/kanban_workflow.py + runtime-manifest.json 登记**：runtime 树缺该模块致 `kanban_db.py` import 断链、`tests/hermes_cli` 三测全数不可收集；vendor 与 `~/.hermes` 部署树副本逐字节一致，补齐根治 manifest 清单漂移。

### B. 版本变体族删除（18 文件）

- `release-notes-1.1`~`2.2` 增量 ×12：`RELEASE-NOTES.md` 已逐版全量覆盖（历史版本节在案），增量文件属并存历史版本。
- `docs-cockpit-*.md` ×4 + `docs-plans-cockpit-notify-panel.md`：旧 overlay 根目录设计草稿，已被 specs 体系取代。
- `spec/design.md`（aipaydev 旧设计）：被全流程方案 V8.x 与 specs 体系取代，`spec/` 目录随之清空。
- `RELEASE-NOTES.md:288` 活引用同步改写为终态表述。

### C. 元数据与导航

- `.gitignore` 增补 `/.zcode/`、`/.zcodeignore`（ZCode 宿主会话产物，本机生成）。
- `AGENTS.md` 目录导航补 `team/`、`zcode-patches/`、`evidence/`、`assets/` 四行。

## 决策记录

1. **过程台账保留（用户裁定）**：`docs/superpowers/specs/` 327 份、`plans/` 62 份、`notes/` 7 份全数保留——台账是仓库宪法立法的决策事实源，不属「同一文档多版本并存」；本轮只删版本变体族。
2. **技能内部轮稿保留（取证改判）**：四份带日期设计稿初判零脚本引用拟删，复核发现 `design-compendium.md` 源映射表索引全部四份（受 `build-compendium --check` 逐字节契约约束），属生成语料而非孤本变体，随技能树原样保留。
3. **decompose 估算持久化挂账不补实现**：`set_estimate` 属未开工特性，本轮为清理整合轮，越权改动 198K 金身模块风险大于收益；测试 xfail 挂账。
4. **既有 `test_estimate_workload.py` 红测披露不动**：该测试（已在 main）引用未实现的 `_reorder_ready_by_workload`，import 即断——非本轮引入，与决策 3 同源同挂账，保持原样披露。
5. **git 层清理（随收口执行，不入本提交）**：删 4 个已并入 feat 分支（`git merge-base --is-ancestor` 实证全部含于 main）；移除 3 个过期 remote——`simharness`（指向已消失的 `~/lab/ncwk/simharness`）、`swarmteam`（指向已消失的 `/tmp/swarmteam-clone`）、`swarmstudio`（旧仓，AIStudio 已为正身仓且脚本无引用）。
6. **本地工作区垃圾清理**：`skills/.swarm-yuan/.gate-fail-flag`（门禁运行旗标）与 `skills/swarm-yuan/<项目根绝对路径>…`（引号事故产生的怪名目录，内含仅运行态 jsonl）删除，均未跟踪、无入库价值。

## 验证

- 测试（拼合树 = vendor v0.22.4 基线 + runtime 覆盖层，`/opt/homebrew/bin/python3.14 -m pytest`，2026-10-24 实测）：
  - `test_board_team_fence.py` + `test_kanban_decompose_estimate.py`：**12 passed, 2 xfailed**（xfail 标注前为 12 passed + 2 failed）。
  - `test_estimate_workload.py`：collection error（挂账披露，非本轮引入，见决策 4）。
  - 环境注记：`python3` 符号链接当前指向 3.15（无 pytest），须用 3.14。
- 残留引用核查：`git grep` 实证删除族无活引用（仅历史台账与有意保留的终态表述行）。
- `vendor/**` 未动：注入态照旧，pre-commit 自动撤出通道不变。
- **未跑 vitest 全量**：本轮零 JS/TS 代码改动（仅 .gitignore、md、python、json、manifest），`npm test` 留给下轮代码改动时执行。
