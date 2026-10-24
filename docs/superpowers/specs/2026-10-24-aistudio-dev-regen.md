# 2026-10-24 aistudio-dev 全量重生成（替代 ncwk-dev / simharness-dev）

## 变更

- 由 swarm-yuan 生成器（v20261024-src）对 AIStudio 单仓全量重生成项目开发技能 `aistudio-dev`（profile=compliance），替代整合前的 `ncwk-dev`（2026-10-16 生成，面向旧 hermes-overlay 仓）与 `simharness-dev`（面向整合前独立 simharness 仓）。
- 新技能落位 `.claude/skills/aistudio-dev/`（本地不入库；沿 2026-09-17 裁决「项目发现位=工作区根」）。旧技能归档至 `.aistudio-dev-backup-<ts>/`（本地，不入库）。
- 入库侧变更仅 `.swarm-yuan/` 台账：`notes/habits.md`（5204 commits 重挖）、`project-fingerprint`（整合后新基线）、`trace.jsonl`/`decisions.jsonl`（本轮 Step 1-13 留痕）、`project-knowledge.md`（重写）。`docs/superpowers/specs/` 新增本文。
- 不改 `custom/`、`patches/`、`vendor/`、`simharness/` 等任何源码与基线。

## 决策记录

| # | 决策 | 依据 |
|---|------|------|
| D1 | 全量重生成（非 `--upgrade` 局部刷新） | 用户裁定（2026-10-24 会话）；项目身份 ncwk→AIStudio 退役 + 目录结构巨变（指纹基线 2026-10-16 停留旧结构，`packages/`、`spec/` 已消失，新增 `vendor/`、`simharness/`、`skills/` 等 8 目录），局部刷新不敷用 |
| D2 | 单技能合一覆盖全仓（含 simharness 面），不再分 ncwk-dev/simharness-dev 两技能 | 多仓已整合为单仓（2026-10-24）；合一收敛原则；simharness-dev 的 PROJECT_DIR 指向已不存在的独立仓 |
| D3 | 生成器自检 exit=1 的两条告警（15 个 FACT_ 键零消费、make-offline-bundle.sh 注释引用已删文档）挂账生成器维护轮，不阻断本轮 | 告警在生成器侧源码域（skills/swarm-yuan），修复须另立 spec-first 流程；11 运行时全装 + 文档一致性全绿为实质通过面 |
| D4 | ACTIVE_FRAMEWORKS 按开发面证据收敛，不采信 detect-frameworks.sh 全树扫描输出 | 全树扫描命中 24 框架含 spring-boot/django/harmonyos 等误报——`vendor/` 上游树污染信号（Monorepo+钉版基线场景）；开发面=custom/、patches/、simharness/、runtime/；沿 2026-10-15 轮先例（剔除 7 个 custom/ 零引用框架，收敛 5） |
| D5 | 指纹新基线在主树采集（含本地不入库目录），非 worktree 干净态 | SessionStart hook 在主树跑 `project-fingerprint.sh --diff`，基线与运行面须同域对账，否则 upstream/archive 等本地目录永远报「新增」噪音 |
| D6 | profile=compliance | 沿 ncwk-dev 先例；本仓有 qgate L0-L5 + spec-first 四层拦截 + 审计留痕合规面 |
| D7 | 计数核验维度命令按开发面裁剪（vendor/skills/team 排除） | Monorepo+钉版基线全仓枚举必然假 FAIL（前端 585 vs 开发面 343）；vendor 组件契约由 symbol-grounding 承载 |
| D8 | COVERAGE_MIN=0 留痕 + BRANCH_REGEX 扩 docs/* + 豁免七文件回迁 | 无覆盖率报告产物不虚设阈值；文档轮分支形态 git log 实证 |
| D9 | check_deps 清单收集裁剪（排除 vendor 三树与 custom/qgate 独立子项目） | 各树自持版本基线非 overlay 版本锁对象；脚本无 conf 挂点走项目适配通道，上游改进入生成器维护轮 |
| D10 | SENSITIVE_EXCLUDE_GLOBS 逐行裁决 7→22 项 + _sec_scan 三副本单点接入豁免过滤 | 15 个新命中逐行实测全为规则名/文案/字段名类误报（grep 证据在 decisions.jsonl）；豁免单一事实源双门禁复用 |
| D11 | 测试基线 66 失败如实入册（27 个守门测试 stale upstream 路径整合债），另立修复轮 | 两树对拍实证预存失败非本轮引入；修 27 文件超生成轮边界 |
| D12 | READONLY_DIRS 留空（意图声明） | vendor 注入脏态=预期工作态，check_scope 恒假阳性；真执法=pre-commit vendor 挡护（沿 10-16 同款语义） |

## 复用约束

拼装合规声明：

- [x] 已查 reference-manual §4 组件库清单（生成轮即清单的生产者，343 组件/21 store/148 域全量在册）
- [x] 已查 §6 接口清单（528 端点机械提取入册）
- [x] 新增产物优先复用既有稳定单元（生成器链/旧裁决值/台账通道/工作规则，见下）
- [x] 无重复造轮子（未另立任何与既有机制平行的流程/配置/脚本）

明细——本任务为技能生成轮，不新增业务代码；产出物复用的既有单元：

- 生成器链：仓内源码 `skills/swarm-yuan/` → 安装态 `~/.zcode/skills/swarm-yuan/`（Step 1-13 工具链复用，零改动）
- 探查底稿：旧 `ncwk-dev` 技能的 conf 裁决值（WRITABLE_DIRS/SENSITIVE_EXCLUDE_GLOBS/SQL 白名单/框架 glob）逐项回迁，非重写
- 台账通道：`.swarm-yuan/{trace,decisions}.jsonl` 既有留痕机制直接续写
- 本仓工作规则与 worktree-flow skill（用户级）全程复用，未另立流程

## 验证

- Step 10：目标技能 `scripts/precheck.sh --all` 全绿（fail 修复重跑，不绕过）。
- Step 13：`generate-skill.sh --verify-completeness --strict` 无占位符残留；`inventory-verify.sh` 计数核验各维度 ≥0.95；`--mark-active` 路径验真后激活。
- 收口验证：worktree 合并 `--no-ff` 进 main 后 `git worktree list` 只剩 main + serve-main；主树 `.claude/skills/aistudio-dev` 就位且旧技能已归档；下一会话 SessionStart 指纹 diff 无假阳性新增目录。

### 验证结果（终值实测）

- `precheck.sh --all` 终判：branch/scope/spec-first/build/consistency/reuse/deps/security 全绿；唯一红=check_test 66 失败（D11 预存整合债：27 个守门测试 stale `../upstream/hermes-studio` 路径，两树对拍实证非本轮引入；本轮零源码改动）。
- `inventory-verify`（技能侧裁剪口径）：前端 UI 343/343、store 21/21、controller 534 清单（capped）、端点 534 清单（capped）PASS；TYPEDEF/ORM_SCHEMA（Java 生态维度，本仓无 ORM 层）FAIL 为 P1 告警不阻断（mark-active fail-open 语义）；mark-active ②③ HALLUCINATION=0（修复 1 处端点路径误判后）。
- `verify-completeness --strict`：占位符清零；`--mark-active` 三关全过，status: active。
- 独立审查：WARN（有条件通过）→ 9 项问题全部修复（修复回执见技能 references/review-record.md）→ 升 PASS。
- 指纹基线：主树域重采集（total=108205，含本地不入库目录——SessionStart 同域对账），落 `.swarm-yuan/project-fingerprint`。
