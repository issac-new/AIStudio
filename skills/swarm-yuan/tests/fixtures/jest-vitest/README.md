# jest-vitest fixture 说明

- violating 主触发 2 个 fail 意图：无覆盖率阈值 / upstream/ 直属目录新增测试文件。
- 断言登记：**2/2 主触发已断言**（`violating/expected-fail-ids`：
  `fw_jest_coverage_threshold`、`fw_jest_no_upstream_test`）。
- 2026-07-20 沉睡唤醒（含门禁脚本修复，对照证据如下）：
  `fw_jest_no_upstream_test` 的 find prune 原为 `-path "./upstream/*"`，
  upstream/ 直属文件亦被剪掉，门禁**任何 fixture 下都不可能命中**（不可实例化沉睡 bug）；
  修复为 `-path "./upstream/*/*"`，与脚本注释意图（prune upstream/<子包>/，仅检直属文件）一致，
  pass/fail 输出行未动。
  - 修复前合成样本：`find` 仅打印 `./src/normal.test.ts`（`upstream/direct.test.ts` 被误 prune）；
  - 修复后同样本：打印 `./upstream/direct.test.ts` + `./src/normal.test.ts`，`upstream/pkg/` 嵌套仍 prune。
- 双态锁定：violating 置 `upstream/direct.test.ts`（直属）→ fail；
  compliant 置 `upstream/pkg/nested.test.ts`（子包嵌套）+ 同款 conf 正则 → pass。
