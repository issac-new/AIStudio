# 守卫型测试迁 lint 盘点与首批迁移（2026-11-12）

## 变更

全仓测试套件里混着一批「守卫/文本断言」测试：`readFileSync` 读仓库文档/配置/spec，断言 `toContain`/`toMatch`/计数，无行为调用。它们占了套件时间却不测行为。本 spec 完成两件事：

1. **盘点**：对 `custom/__tests__`（30 文件）＋ `scripts/__tests__`（40 文件）逐文件分类，产出 A（迁 lint）/B（保留）/C（可删）三类清单与处置建议。这是后续批次的决策事实源。
2. **首批迁移**：把 `docs-ssot-guard.test.ts` 里三组最机械的「文档含某句/某计数」断言迁入 `scripts/maintenance/gen-doc-indexes.mjs --check`（新增 `checkReadmePointer`/`checkAppendixFrozen`/`checkAppendixCounts` 三个检查函数，失败信息带修复指引），测试文件削掉对应三个用例、只留解析器行为与结构完整性测试。

### 分类口径

- **A 应迁 lint**：被断言对象是**可生成物或机械口径**（索引、计数、文档必备句），断言本身没有独立信息量——同一事实可由生成校验在 lint 通道表达，且失败时能直接给修复命令。执行面＝`--check`（pre-push `merge-invariants` 与 CI 已挂 `gen-doc-indexes --check`）。
- **B 保留**：有独立信息量——行为语义（脚本函数/tmpdir 夹具/exec 断言）、事故根因锁（补丁漂移/注入态标记）、棘轮基线（只许减）、模板↔产物双向同步。测试套件只留这类。
- **C 可删**：断言已被更强的派生机制取代（同一不变量已有 L2/L3 钩子或 lint 在源层强制），测试只是第二份拷贝。

### A/B/C 清单（70 文件）

判定依据缩写：读文档句=读 repo 文档断言句；读计数=断言清单/条目计数；行为=函数行为或 exec 断言；补丁锁=补丁/series/注入态标记断言；棘轮=基线只许减。

#### A 类（应迁 lint，5 项）

| 测试文件 | 被断言对象 | 处置建议 |
|---|---|---|
| `custom/__tests__/docs-ssot-guard.test.ts`（3 用例，**本轮已迁**） | README 唯一正本指针句；附录 A 头部「冻结」声明句；附录 A 标题计数 vs A.1 行数 | 已并入 `gen-doc-indexes --check`（本轮）；同文件其余用例属 B 留在套件 |
| `scripts/__tests__/reap-skill-content.test.ts` | REAP 26 包计数、每包声明 prompt 数 vs 代码块数、总数 102/105 | 迁 lint：`ns-counts` 式自洽检查（声明数=代码块数是文档内部一致性，可机检）；26/102/105 总数基线随检查函数走。落点候选：并入 `skills/swarm-yuan` 侧检查或 `docs-lint`（若立项） |
| `custom/__tests__/zcode-3140-snapshot.test.ts` | `ns-counts.json` 与 `zh-CN-keys.txt` 重算互洽；三基线计数 6120/93/142 | 迁 lint：ns-counts 是**可再生成物**（从 keys 派生），`--write` 可自动修；三基线计数属外部漂移 pin，随检查函数走同一通道。落点候选：`scripts/zcode-catalog-check.mjs` 旁边（其注释已声明真机漂移走该脚本） |
| `custom/__tests__/interactive-training-manual.test.ts`（部分） | 培训 HTML 内嵌课程数据的**机械子集**（幕数计数、引用完整性） | 二批评估：课程数据契约大部分是 B（DAG/交接/证据语义），仅纯计数子集可下沉 lint；迁移成本高（214 断言），建议整文件留 B、单独拆机械计数项时再动 |
| `custom/__tests__/qgate-acceptance-registry.test.ts`（末用例） | 某历史 spec 四段齐全句断言 | 见 C 类（本条实为 C，列此避免遗漏） |

#### C 类（可删，2 项）

| 测试文件 | 被断言对象 | 取代机制 | 处置建议 |
|---|---|---|---|
| `custom/__tests__/qgate-acceptance-registry.test.ts` 末用例「本变更 spec 四段齐全」 | `2026-10-31-model-resilience-hardening.md` 含四段标题＋`DESIGN_SYNC:` | L2/L3 `spf_sections_check` 机检四段（AGENTS.md 规则 2）＋spec-fidelity-baseline 棘轮；该 spec 已合入且有收据 | 删该用例（同文件其余 yaml 结构断言属 B 保留）；删除前跑一轮确认无其他依赖 |
| `custom/__tests__/docs-ssot-guard.test.ts` 用例「机械索引覆盖…头计数一致」 | 真实仓跑 `compareIndex` | `gen-doc-indexes --check` 已由 pre-push `merge-invariants.checkDocs` 与合并门强制 | 二批评估删除：套件内重复跑同一 --check；保守起见本轮保留（套件内多一道早期红，成本 <100ms） |

#### B 类（保留，63 文件）

行为/夹具驱动（scripts 侧全部属此类）：`audit-sample`、`board-staleness-watchdog`、`budget-retirement`、`capability-matrix`、`connections-panel-gate`（series 登记＋注入态标记，事故根因锁）、`coverage-changed`、`deploy-agent-runtime`、`deploy-patch-touched`、`diagram-skill`、`gen-doc-indexes`、`governance-lint`、`harness-doctor`、`hrgov-seed`、`inject-absent-tree`、`inject-check`、`inject-clean-v2`、`inject-executor`、`inject-manifest`、`inject-planner`、`make-incremental-package`、`make-offline-package`、`merge-invariants`、`mutation-probe`、`overlay-pristine-replay`、`qgate-health`、`recurrence-report`、`register-runtime`、`regression-dsl`、`release-evidence`、`release-gate`、`runtime-guard`、`spec-archive`、`sync-training-docs`、`typecheck-client-baseline`、`upstream-root`、`upstream-root-contract`、`verify-dist-default-password`、`verify-dist-runtime`、`verify-release-manifest`。

custom 侧：`approval-ledger`、`architecture-ratchet`（代码棘轮＋基线）、`cli-contract`（词表一致＋行为）、`coding-agent-approval-ledger`、`coding-launch-fourmode`、`ekko-skill-store-unification`（补丁锁＋迁移脚本行为）、`evidence-binary-freeze`（冻结白名单，AGENTS.md 规则 8 立法面）、`execution-contract`、`execution-mode-policy`、`interactive-training-manual`（课程数据语义契约，见 A 类注记）、`kanban-admin-scope-guard`、`kanban-patch-409-guard`、`kanban-ws-upgrade-guard`（三件均注入态补丁锁）、`l2-kit-parity`（字节级副本＋棘轮）、`mimo-coding-agent`、`patches-series-guard`（series↔文件树，61419f38 事故锁）、`precommit-vendor-guard`（模板↔产物双向同步，D4 事故锁）、`qgate-acceptance-registry`（yaml 结构断言部分）、`qgate-hrgov-gate`、`qgate-repo-scope-fence`（围栏形态）、`release-manifest-lock-guard`、`role-tool-matrix`（矩阵语义＋执法行为）、`skills-export-contract`（补丁标记＋重放契约）、`spec-fidelity-baseline`（四维棘轮）、`test-taxonomy-guard`（classifyFile 行为）、`win-regression-patches-guard`、`zcode-engine-chain`、`zcode-patches-guard`。

### 首批迁移明细（本轮落地）

- `scripts/maintenance/gen-doc-indexes.mjs`：+3 检查函数（`checkReadmePointer`/`checkAppendixFrozen`/`checkAppendixCounts`），`main()` 汇入 problems，退出码语义不变（0/1/2）；`--check` 在真实仓实测 0 problem。
- `custom/__tests__/docs-ssot-guard.test.ts`：删 3 个纯文本断言用例（README 指针/冻结句/计数互洽），保留 8 个（解析器行为 3＋索引覆盖 1＋附录结构 3＋角色表 1）。
- `scripts/__tests__/gen-doc-indexes.test.ts`：+3 组检查函数行为测试（判定语义，非仓文本 pin）。
- `config/mechanism-budget.json`：changes 记 `+0 scripts` 条目（检查函数并入既有脚本，配对＝docs-ssot-guard 削 3 用例）；scripts 计数维持 137/137，无新机制文件。

## 决策记录

- **D-1 并入 gen-doc-indexes 而非新建 docs-lint.mjs**：scripts 预算 137/137 顶格；新建须配对删一个零引用脚本。零引用扫描实测找到 2 个候选（`scripts/maintenance/sec-tool-usage-report.mjs`、`scripts/maintenance/add-matrixchat-i18n.mjs`，仓内无任何消费方），但本轮未新建脚本故不触发配对；候选留档给二批 docs-lint 立项时配对退役。README 正本指针与附录 A 冻结句本就是「设计文档索引事实源」的伴随断言（原测试文件头注释明示），并入语义成立。机制预算红线（新增须登记 sunset＋配对）因此不触发。
- **D-2 附录 A 计数检查用轻量行计数而非移植全解析器**：`checkAppendixCounts` 只数 A.1 段表行（跳过表头/分隔行/小节标题），与原测试的 `parseAppendix().statedA1Count` 判定等价（真实仓 636 份两法一致）；完整表格结构校验（列数/空白格/重叠/悬空路径）留在测试文件的解析器里——那是结构语义，不是文档句。
- **D-3 首批只动 docs-ssot-guard 一处**：A 类里其余两项（reap 计数、zcode 快照自洽）语义上属各自领域（技能包/词条快照），硬塞进 gen-doc-indexes 会稀释该脚本职责；等二批按 D-1 同款纪律找各自落点（或届时立项 docs-lint 并配对退役）。
- **D-4 qgate-acceptance-registry 末用例列 C 而非本轮删**：删除涉及他人域（qgate 登记面）的守卫收窄，属跨域治理动作，留给用户裁决后执行；本 spec 只记清单。
- **取舍**：不迁移 `architecture-ratchet`（代码棘轮有基线数值语义，lint 化需另立基线存储，收益负）；不迁移 interactive-training-manual（迁移成本 214 断言 vs 套件耗时占比小）。

## 验证

- 迁移后目标测试：`npx vitest run scripts/__tests__/gen-doc-indexes.test.ts custom/__tests__/docs-ssot-guard.test.ts` → 2 文件 17 测全绿。
- `node scripts/maintenance/gen-doc-indexes.mjs --check` → exit 0，`0 problem(s)`（含三组新检查）。
- `node scripts/governance-lint.mjs --budget` → `0 problem(s), 38 warning(s)`（38 条均为存量 sunset 自然语言告警，与本轮无关）。
- `node scripts/maintenance/gen-doc-indexes.mjs --write` 后再 `--check` → 仍 0 problem（--write 幂等不破坏新检查）。
- `node scripts/merge-invariants.mjs --check` → pass。
- 全量 `npm test`（vitest run）两遍：第一遍 `Test Files 3 failed | 1149 passed | 6 skipped (1158)`、`Tests 1 failed | 8803 passed | 53 skipped`——失败文件均为 `vitest-worker: Timeout calling onTaskUpdate` RPC 超时（负载型基础设施抖动，日志尾部 4 个 unhandled error 同源；受波及文件当轮少执行 42 测）；第二遍同树复跑 `Test Files 1152 passed | 6 skipped (1158)`、`Tests 8846 passed | 11 skipped (8857)` **零测试失败**（退出码 1 源自同类 worker RPC 超时 1 error，非测试失败）。两遍中本轮触及的两个文件均绿：`custom/__tests__/docs-ssot-guard.test.ts (7 tests)`、`scripts/__tests__/gen-doc-indexes.test.ts (10 tests)`。
- scripts 零引用配对候选扫描：两遍法（先按 basename 建引用集、再对疑似零引用者逐名 `git grep -l` 全仓反查）。疑似 19 个中 17 个有活体消费方（regression 探针被 `scripts/regression/harness.mjs` 与 `walkthrough-probes.test.ts` 消费、`mutation-probe` 有专属测试、`ts-resolve` 被 `forge-benchmark.mjs` 消费），确证零引用 2 个：`scripts/maintenance/sec-tool-usage-report.mjs`、`scripts/maintenance/add-matrixchat-i18n.mjs`。本轮走 D-1 并入路线未新建脚本，二者留作二批 docs-lint 立项的配对退役候选，不在本轮删。

## 设计文档影响

DESIGN_SYNC: none
理由：纯测试治理与 lint 检查面迁移，不触及产品行为、契约或整合正本/数字总账的任何设计面；gen-doc-indexes 的检查面扩展属脚本内部演进，其消费方（merge-invariants/CI）接口（退出码/输出前缀）不变。
