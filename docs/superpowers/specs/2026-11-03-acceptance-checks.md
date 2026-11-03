# 确定性验收断言：把「交付了」判成可核验的逐条结论

日期：2026-11-03
状态：implemented
触发：MASS/DeerFlow 两篇调研的落地差距清单第一条（报告 §7.5）——仓内 `delivery-contract` 只做「证据形态是否在档」的粗判，缺 DeerFlow L2 的逐条判定（`subagents/acceptance_checks.py`：`file_*` 家族 + `tests_passed` 对账，不可判定落 `unchecked` 且 `all_hold=false`）。

## 变更

- 新增 `custom/server/handoff/acceptance.ts`：
  - 六种可判定家族 `file_exists / file_readable / file_min_bytes / file_contains / command_ok / test_passed`，语法 `family: 参数`；解析不了即不可判定。
  - `checkAcceptance(criteria, evidence)` 纯判定：缺观测 → `checked:false`；`test_passed` 除退出码 0 还要求测试摘要（`N passed / PASS / ok / SUCCESS`）；`allHold` 只有全部 `checked && holds` 才为真；空断言 `applicable:false`。
  - `probeArtifacts(root, paths, {allowedRoots})` 探针：允许根校验、拒绝绝对路径与 `..`、realpath 复核防符号链接逃逸、尾部读取上限 64KB。
- `custom/server/handoff/handoff-controller.ts`：`POST /api/harness/handoff/acceptance/check`——给 `root` 时服务端实测（允许根取 `ACCEPTANCE_ALLOWED_ROOTS` 或 cwd），否则用调用方观测的 artifacts/commands；无断言 400。
- 设计同步：正本 §5.8 增「验收断言」句；总账增「验收断言家族」一行；附录 A.1 登记本 spec。

## 决策记录

| # | 决策 | 理由 | 否决的备选 | 可逆 |
|---|---|---|---|---|
| D1 | 判定与探针分层（纯函数 + IO 适配器） | kanban 列契约、qgate、harness 三处都要用，各自证据来源不同；纯函数可被任意消费者复用 | 只做 IO 端点（否决：其他模块无法复用判定） | 是 |
| D2 | 不可判定条目一律 `unchecked` 且整体不放行 | DeerFlow 同款纪律：不可判定 ≠ 通过；宁可判「没验成」 | 忽略不可判定项（否决：等于给未验项盖章） | 是 |
| D3 | `test_passed` 额外要求测试摘要 | 只看退出码会被「跑了条啥也没输出的命令」冒充过测 | 只看 exit=0（否决：假阳性） | 是 |
| D4 | 探针必须给允许根，并做 realpath 复核 | 服务端读盘不能变成任意文件读取；符号链接是最常见的绕过 | 只做字符串前缀检查（否决：软链可逃逸） | 是 |
| D5 | 本批不自动接管看板完成判定 | 接管完成门=改派发/完成链，影响面大；先把判定能力备好，接入单独评估 | 直接拦 `complete_task`（否决：未评估存量任务会大面积误伤） | 是 |

## 验证

- `custom/server/handoff/__tests__/acceptance.test.ts`：语法六家族（含非法参数）、摘要识别四正两负、文件/命令判定、不可判定与空断言、探针实测、`..`/绝对路径/符号链接三重守卫、探针→判定串联（10 例）。
- `custom/server/handoff/__tests__/handoff-controller.test.ts`：端点全成立/缺证据不放行/无断言 400/root 不在允许根回传问题（2 例）。
- 全量 `npm test` 与 `npm run typecheck:harness`。

## 设计文档影响

DESIGN_SYNC: touched

- `docs/superpowers/specs/2026-10-23-swarmstudio-integrated-design.md`：§5.8 增验收断言一句。
- `docs/superpowers/specs/2026-10-23-swarmstudio-design-ledger.md`：§A 增验收断言家族一行。
- `docs/superpowers/specs/2026-10-21-swarmstudio-appendix-a-spec-index.md`：登记本 spec。
