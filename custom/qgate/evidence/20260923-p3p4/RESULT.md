# Phase 3 + Phase 4 实证（2026-09-23）

## P3：Profile + Impact 四项验收（CLI 输出原文见下）

| # | 项 | 结果 |
|---|---|---|
| 1 | 改 README 不触发任何门 | PASS：`plan --changed README.md` → `(no applicable gates)` |
| 2 | 改 src 触发 L1 门 | PASS：`plan --changed src/index.js` → `engineering.basic-check [L1]` |
| 3 | feature-close（tier=standard）下本地 L2 门启用 | PASS：2 gates enabled, `local.l2-guard [L2]` 入 plan |
| 4 | vibe-fast（tier=lite）下 L2 门被禁 | PASS（修复 Profile 域匹配缺陷后）：`L2.*` 按 `spec.domain` 匹配而非 id 前缀；回归测试已入库（qgate-core.test.ts「质量域模式 L2/L2.* 匹配 domain 而非 id」） |

P3 过程中修复的缺陷：Profile enable/disable 模式曾按门 id 前缀匹配，`L2.*` 匹配不到 domain=L2 但 id 无 L2 前缀的门 → 改为域模式（`L2`/`L2.*`/`L2.**` → domain 等值）+ id 模式并存。

monorepo 路径归一化：git status 给出仓库根相对路径，appliesWhen 按项目根（.qgate 所在）相对匹配——gitContext 现剥离项目在仓库内的前缀，仓库内其他项目的变更不计入本项目变更集。

## P4：Persistence Gate + Payment Demo

验收标准（设计 §6）：**unit test 可 PASS + persistence Gate FAIL**；证据六件套（request/response/before/after/field-diff/invariant）落盘。全部达成。

### 演示时序（examples/payment-demo，植入缺陷 = db.mjs 把 amount 元换算成分落库）

1. `npm test` → **unit tests: 5/5 pass**（响应构造纯函数契约正确，不触库）
2. `qgate run data.persistence-integrity` → **FAIL**，双证据：
   - field-diff.json：`payment.amount expected 100 / actual 10000 / match:false`（currency、status match=true——逐字段精确指出错在哪）
   - invariant-result.json：`amount-consistency pass:false, payment_amount:10000 vs ledger_amount:100`（跨表金额不变量）
   - response.json：HTTP 201 + 完美响应体 `{"amount":100,...}` —— **传统集成测试到这就判通过了**，这正是本门的价值主张
3. `sed 's/amount * 100/amount/'` 修复 → 重跑 → **PASS**；`status --fresh` 双门 fresh

### 过程中修复的缺陷（3 个，均有回归测试或已入证据）

- 场景文件 YAML 曾带 `scenario:` 外层包裹（照抄 v0.1 文档格式）→ 执行器按文件本体消费，格式已修正并在场景文件头注释言明
- demo db.mjs 误用 better-sqlite3 的 `db.transaction()` API（node:sqlite 无此方法）→ 改显式 BEGIN/COMMIT
- setup SQL 删序违 FK（先删父表 payment）→ 改先删子表 ledger
- 执行器 db 存在性检查原在服务启动前，而 db 由服务启动时创建 → 重排为"先起服务再开库"

### 回归测试

`__tests__/qgate-persistence.test.ts` 2 例（真夹具：cp demo 到 tmp、起服务、真 SQLite）：植入缺陷 → 门 FAIL 双证据 + 五类证据齐且全 exercised + 制品落盘；修复 → PASS。与 qgate-core 22 例合计 **24/24 绿**。
