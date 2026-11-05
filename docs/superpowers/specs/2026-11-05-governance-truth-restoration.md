# 治理可信度修复：判定四态化、复发账本与机制减法

> 日期: 2026-11-05
> 状态: 实施中
> 关联: 批判性复盘（cognition-lattice，2026-11-05）；前置证据=`.qgate/state.json`（最近推送 5 个 L0 门 4 个 error→CONDITIONAL）、`.qgate/scope.yaml` 267 条 > executor 硬上限 200、`.qgate/junit-report.xml` 停留 2026-10-02、`.swarm-yuan/spec-receipts.jsonl` 192 条覆盖 122/555 份 spec、近 90 天 586 次「根治/根因」提交

## 任务卡审查七项

### 业务完成条件

四组能力各自可判定：①qgate 能把 `executor 报错`、`证据不足`、`失败被 warn 容忍` 从 `CONDITIONAL` 中区分出来，`qgate health` 对最近一次推送给出 `DEGRADED/SKIP/STALE/OK` 判定；②`scope.yaml` 超过 200 条不再静默失效，空声明是 FAIL 不是 error；③发布前置强制全量测试新鲜度，旧 junit 不能过；④复发账本、治理 lint、测试分类、机制预算、合并不变量各自有可执行入口与退出码。全部完成判据=验证段命令逐条通过，未通过项如实标注。

### 输入与来源

输入=本仓 git 事实（origin/main 430054e88 快照）＋2026-11-05 批判性复盘报告（本轮会话）＋qgate 源码与运行态（`.qgate/runs/*.json` 1273 份、`.qgate/state.json`、`.qgate/junit-report.xml`）。无外部数据源，不依赖运行态服务，不调用模型。

### 工作流边界

P0（批次 A）先恢复「通过」的可信度，不新增门；P1（批次 B）让修复可证伪，新增脚本但不新增 conf 变量；P2（批次 C）做减法与结构，新增机制必须配对 sunset。P2-2 单文件拆分只做 `custom/server/eval/controller.ts` 首批，其余 9 个进台账，不在本轮强行完成。所有代码改动在 worktree `feat/governance-truth` 内，不合入 main。

### 工具与副作用

只读探查 + 代码/文档写入 + qgate 运行态写入（`.qgate/runs`、`.qgate/evidence`、`.qgate/state.json`）。新增 `.swarm-yuan/recurrence.jsonl`、`.swarm-yuan/spec-coverage.json`、`.swarm-yuan/merge-invariants.jsonl`、`.swarm-yuan/audit-samples.jsonl` 均为 append-only 或生成物。无网络写、无外部系统写、不改 vendor、不改上游补丁编号。

### 结果与证据

证据=各命令输出（vitest 通过数、qgate health JSON、governance-lint 退出码、typecheck 零错）＋文件锚点（见「变更」段）。故障注入证据：把 `scope.yaml` 改到 268 条或注入 `paths: []`，`qgate health --scope pre-push` 必须显示 `DEGRADED/FAIL`；恢复后显示 `ok`。全量 `npm test` 若出现红项，如实写入交付说明，不隐瞒、不修改阈值制造假绿。

### 异常与恢复

`executor error` 不得再被降级为「证据不足」：`executionStatus=error` 在 health 中显示 `DEGRADED`，pre-push 默认拦截（`QGATE_PREPUSH_ENFORCE=0` 可降级为告警）。`scope.yaml` 非数组仍是 `error`（输入不可解析），空数组是 `FAIL`（配置错误），缺失文件仍是 `error`（未声明 ≠ 通过）。旧 run 无 `executionStatus` 时按 `CONDITIONAL` 兼容，不因新字段丢失历史。回滚=按批次 `git revert`，无 schema 迁移、无破坏性 DDL。

### 验收反例

必须被拦住：①`scope.yaml` 267 条仍被判 `paths empty` 并 CONDITIONAL 放行；②`paths: []` 被当作「证据不足」而非配置错误；③最近一次推送 4/5 个 L0 门 error 仍被读成「全绿」；④旧 junit（2026-10-02）通过 `release:preflight`；⑤同一 `category` 在 90 天内第 4 次复发仍以普通 fix 提交；⑥新增机制未登记 sunset 仍通过 `governance-lint --budget`；⑦合并后关键文件静默回退仍能推送。

## 变更

### 批次 A（P0，恢复「通过」的可信度）

1. **判定四态化（兼容式，不改 `GateVerdict` 枚举）**：`custom/qgate/src/core/types.ts` 的 `GateRun` 增可选 `executionStatus: 'executed'|'degraded'|'skipped'|'error'` 与 `degradedReason`；`decision.ts` 按证据覆盖派生 `failure-tolerated`/`insufficient-evidence`/`executor-error`/`evidence-conditional`；`run.ts` 落盘；`parse.ts` 白名单透传；`store.ts` 的 `StateEntry` 扩展并新增 `listRuns(paths)`；新增 `custom/qgate/src/core/health.ts` 纯函数；`cli.ts` 新增 `health [--json] [--scope] [--max-age-hours] [--consecutive]`，`status` 在 `executionStatus=error` 时显示 `DEGRADED`、`skipped` 显示 `SKIP`。同批修复 `parseRun` 对 201 键快照（200 文件＋截断标记）的误拒——`engineering.basic-check` 的 PASS 曾因快照截断读不回来，health 显示 NEVER。
2. **scope 上限与空声明**：`custom/qgate/src/executors/scope.ts` 的 `strList` 上限 200→2000；`paths: []` 改 `finish('fail', ...)`；`.qgate/scope.yaml` 只做精确重复去重并记录前后条数。
3. **全量测试新鲜度**：新增 `scripts/qgate-health.mjs`；`.qgate/gates/engineering.basic-check.yaml` 在全量测试绿后 `failure: block`、`minTotal: 7600`；新增 `config/test-baseline.json`；`package.json` 新增 `release:preflight` 并前置到 `release:packages`/`release:incremental`/`offline:package`；`.swarm-yuan/hooks/pre-push` 在 L0 循环后调用 `qgate health --scope pre-push`，只对 `degraded/error/stale` 失败。健康体检按年龄判定（严格快照新鲜度仍由 `status --fresh` 负责，避免大 glob 快照截断导致刚跑完也 stale）；`L0.registers`/`requirement-trace`/`convention-alignment` 的已知欠债进 `config/qgate-health-baseline.json`（reviewBy 2026-12-05，到期自动 strict，表外新退化仍拦）。
4. **附录 A 与 AGENTS.md 一致性**：补 `2026-11-05-review-anchor-pin` 行并同步计数；`AGENTS.md:11` 改为「默认强制拦截，`QGATE_PREPUSH_ENFORCE=0` 降级为告警，`QGATE_PREPUSH_SKIP=1` 关闭」。

### 批次 B（P1，让修复可证伪）

5. **复发账本**：新增 `scripts/recurrence-report.mjs`，读 `.swarm-yuan/error-history.jsonl`/`gate-deny.jsonl`/`decisions.jsonl` 与近 90 天 `git log`，按既有 `category` 聚类；≥3 次标 `needs-design-review`；快照写 `.swarm-yuan/recurrence.jsonl`。
6. **治理 lint 与决策 schema**：新增 `config/governance-schema.json` 与 `scripts/governance-lint.mjs`，校验 decisions/receipts/gate-deny/recurrence；`--commits` 检查推送范围内提交标题不得单独用「根治/根因」；不原地重写 75 条历史台账，只生成 `decisions.normalized.jsonl` 供复核。
7. **spec 覆盖与 DESIGN_SYNC**：`skills/swarm-yuan/assets/spec-first-lib.sh` 修 `touched` 空列通过、`###` 截断两个漏洞；同步 `.swarm-yuan/hooks/spec-first-lib.sh` 并跑 `l2-kit-parity`；`governance-lint --spec-coverage` 输出 `.swarm-yuan/spec-coverage.json`；修复 run26 台账双源（specs 正本 N01-N13、simharness 副本改名 `run26-collection-backfill.md`、清偿 spec 引用改指正本）。
8. **测试分类与覆盖率**：新增 `config/test-classes.json`、`custom/__tests__/test-taxonomy-guard.test.ts`、`scripts/coverage-changed.mjs`；`vitest.config.ts` 增 coverage v8；清理本批触及文件的 silent-return 与 2 处 `expect(true).toBe(true)`，其余进 `.qgate/silent-return-baseline.json` 只许减。
9. **变异探针**：新增 `scripts/mutation-probe.mjs`，在临时 worktree 注入已知缺陷，跑 scope/acceptance/registers/requirements/docs-ssot 五类门，期望非 PASS；结果写 `.qgate/mutation-probes.jsonl`。

### 批次 C（P2，减法与结构）

10. **机制预算**：新增 `config/mechanism-budget.json` 与 `governance-lint --budget`；`AGENTS.md` 增「新增机制必须配对退役条件」；机制地图加 sunset 列。
11. **合并后不变量**：新增 `scripts/merge-invariants.mjs`；`.swarm-yuan/hooks/post-merge` 留证；`scripts/maintenance/merge-to-main.mjs` merge 后 `--require-pass` 阻断；pre-push 复查最后一条记录。
12. **发布批次化与证据**：`RELEASE-MANIFEST.json` 增 `releaseBatches: []`；`verify-release-manifest.mjs` 校验 tag/commit/treeHash；`make-release-packages.mjs` 写 `dist/release/RELEASE-EVIDENCE.json`；`RELEASE-NOTES.md` 增 `## 发布批次` 段（不插入 `## 版本` 首行之前）。
13. **独立审计抽检**：新增 `scripts/audit-sample.mjs`，`--seed` 抽 5 个 PASS 门 + 5 份 spec，写 `.swarm-yuan/audit-samples.jsonl`，只读不改证据。
14. **单文件拆分首批**：`custom/server/eval/controller.ts`（1494 行、54 路由）拆为 3 个 handler 模块 `custom/server/eval/routes/{sets,runs,analysis}.ts`＋共享助手 `routes/shared.ts`，`controller.ts` 保留 99 行路由表与 `evalRoutes` 聚合导出；eval 全域 41 文件/397 用例与 4 个 HTTP 测试同批回归；新增 `docs/superpowers/specs/2026-11-05-file-size-refactor-ledger.md` 登记 top 10 与后续批次。
15. **索引自动检查**：新增 `scripts/maintenance/gen-doc-indexes.mjs --check`，复用 `custom/server/specs/specs-index.ts` 的 `listSpecDocs()`；本批修复 554/101/96 vs 555/102 差异与 3 个重复链接；`--write` 留下一批。

16. **合入后收口（2026-11-05）**：主树全量 8030 用例暴露 `custom/client/kanban/__tests__/raci-visibility.test.ts` 卡片渲染用例 15s 超时（单跑 8.6s 通过、全量并发下超），两处提至 30s；断言语义不变。

## 决策记录

| 决策 | 选择 | 备选 | 理由 | 类型 | 用户裁定 |
|------|------|------|------|------|---------|
| 判定四态化的实现 | 保留 `GateVerdict` 枚举，追加 `executionStatus/degradedReason`，在 health/CLI 层派生 `DEGRADED/SKIP` | 新增 `SKIP/DEGRADED` 枚举值 | 枚举被 13 个消费者读取（parseRun/CLI/治理统计/客户端），直接加值会让旧 run 回读失败；先恢复语义，再评估是否升级枚举 | Mechanical | approved（D 档） |
| `CONDITIONAL` 的处置 | 保留为兼容值，停止把它当「通过」；health 把 `executionStatus=error` 判 `DEGRADED` | 删除 `CONDITIONAL` | 旧 run 与外部消费者需要回读；删除是破坏性变更，收益不抵风险 | Mechanical | approved（D 档） |
| scope 上限 | `strList` 200→2000；空数组 FAIL；非数组仍 error | 删除上限 / 继续 200 | 267 条是真实规模，200 是隐式硬编码；空声明是配置错误，不是证据不足 | Mechanical | approved（D 档） |
| 全量测试门 | 先跑全量确认绿，再升 `block`；`minTotal 7600` + `config/test-baseline.json` 棘轮 | 直接升 block | 未确认绿就升 block 会制造推送瘫痪；先用基线棘轮防缩水 | Mechanical | approved（D 档） |
| 故障类命名 | 复用既有 `category`，不新增 `failure_class` | 新增 `failure_class` | 单一事实源：`failure-detector.sh` 已有 `category`，第二名字会制造映射债 | Mechanical | approved（D 档） |
| 测试三分类 | 清单 + 元测试，不批量改名 | 重命名 1044 个测试文件 | 改名会打断引用与历史；清单可逆、可增量 | Mechanical | approved（D 档） |
| 机制新增纪律 | 每条新机制登记 sunset，预算超限即失败 | 只加不减 | 复盘的 D3 就是治理通胀；加法必须有配对减法 | Mechanical | approved（D 档） |
| 单文件拆分范围 | 本批只拆 `eval/controller.ts`，其余进台账 | 全拆 10 个 | 10 个大文件涉及 21 处生产引用与大量整组件 mock，单批风险过高；先拆测试覆盖最好的一个 | Mechanical | approved（D 档） |

## 验证

- `npx vitest run custom/qgate/__tests__`（含 `qgate-verdict-health.test.ts`）
- `npx vitest run scripts/__tests__`
- `npx vitest run custom/__tests__/docs-ssot-guard.test.ts`
- `npx vitest run custom/__tests__/l2-kit-parity.test.ts`
- `npx vitest run custom/__tests__/test-taxonomy-guard.test.ts`
- `npm run typecheck:harness`
- 故障注入：`scope.yaml` 268 条 / `paths: []` → `qgate health --scope pre-push` 必须 `DEGRADED/FAIL`
- `node scripts/qgate-health.mjs --scope release --require-fresh`：旧 junit 应失败，跑 `qgate run engineering.basic-check --trigger release` 后应通过
- `node scripts/governance-lint.mjs --strict --budget --spec-coverage`
- `node scripts/merge-invariants.mjs --check`
- `npm test`（全量；红项如实记录）
- 拆分后：`npx vitest run custom/server/eval/__tests__`（41 文件/397 用例）

## 设计文档影响

- DESIGN_SYNC: none
  - 理由：本批只改工程治理机制（qgate 内核/脚本/钩子/账本）与 `AGENTS.md` 工作规则，不触及四份设计正本（整合正本、数字总账、harness2 工作台、RRSI 工作台）的能力边界与数字口径；机制地图的 sunset 列属于规则文档，随 `AGENTS.md` 同批更新。
