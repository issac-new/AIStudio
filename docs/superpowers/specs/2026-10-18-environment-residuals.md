# 环境遗留清理：台账自动发现、journal 回落、测试默认超时（spec）

日期：2026-10-18
分支：`fix/env-residuals`
来源：V8.41 验收记录列出的环境遗留——`ORGLOOP_LEDGER_TSV` 未配置导致台账 503、run21 无每轮 journal 副本导致 `/journal` 404、默认 5s 测试超时在高负载下出现无关挂载超时。

## 变更

1. **台账路径自动发现**（`custom/server/orgloop/orgloop-controller.ts`）：
   - 显式 `ORGLOOP_LEDGER_TSV` 存在 → 用它；显式配置但文件不存在 → 仍返回 null（失败关闭，配置错误不被静默忽略）。
   - 未配置 → 在 `OBS_SIM_ROOT/runs/<run>/evidence/compensation-ledger.tsv` 中选 mtime 最新的一份；无任何台账仍 null（失败关闭）。
   - 新增 `resolveLedgerPath(explicit, simRoot)` 纯函数与 4 例单测（显式优先、显式缺失失败、未配置选最新、无台账 null）。
2. **journal 回落**（`custom/server/simcenter/simcenter-controller.ts`）：
   - 先读 `runs/<run>/workflow-journal.ndjson`；不存在且 run 目录存在时，回落到 `OBS_SIM_ROOT/logs/workflow-journal.ndjson`（网关 journal 是全局流）。
   - run 目录不存在仍 404；路径穿越仍由 `safeRunDir` 返回 400；响应 `source` 如实给出实际读取路径。
   - `simcenter.test.ts` 增加 run2（无每轮副本）→ 200 + source=全局日志；run1 优先每轮副本；run=nope 仍 404。
3. **测试默认超时**（`vitest.config.ts`）：`testTimeout: 20000`，覆盖重型 UI 挂载在并发负载下的 5s 抖动；断言不变，真实挂起仍失败。

## 决策记录

1. **只在“有真实数据”时自动发现**：显式 env 缺失/错误仍失败关闭；未配置且 SIM 根存在台账时才默认读取。这解决环境可用性，不放弃 N5 的失败关闭原则。
2. **journal 回落只对已存在的 run 生效**：不存在的 run 仍 404，避免把所有查询都指向全局日志、掩盖 run 名错误；`source` 字段保留真实路径，界面可辨认。
3. **测试超时全局 20s 而非逐用例补丁**：重型 UI 挂载在并发负载下是系统性风险；统一阈值比逐个加超时更可维护，且不改变断言强度。
4. **不改 Matrix 默认角色与 WCAG 1.4.11**：前者是产品策略，后者是另一类对比度测量，均不在本批擅自扩大范围。

## 验证

- `npx vitest run custom/server/orgloop/__tests__/ledger-path.test.ts custom/server/simcenter/__tests__/simcenter.test.ts`：32/32 通过。
- 合并后重启 8647：`/api/hermes/orgloop/ledger` 由 503 转 200（读取 run21 台账）；`/api/hermes/sim/journal?run=20261017-v8-run21` 由 404 转 200（source=全局 logs）；`run=nope` 仍 404。
- 全量 vitest 与构建复跑。
