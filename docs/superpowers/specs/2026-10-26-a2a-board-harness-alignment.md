# A2A 入口、看板归属与 harness 单仓化校正批（2026-10-26）

分支：`fix/core-coding-chain`（与核心编码链批同枝两批）

## 变更

对应用户系统逻辑第 3、4 段与「文档真相」欠账：

1. **A2A 跨用户 agent 互调接线**：orchestrator `platforms.a2a.enabled=true`（端口 9900）。
   安全语义沿用上游适配器：无 token 只绑 127.0.0.1；跨机须在 profile `.env` 配
   `A2A_PEER_TOKENS`（或 `A2A_BEARER_TOKEN`）＋`A2A_HOST=0.0.0.0`＋`A2A_TRUSTED_PEERS`，
   否则远端 dispatch fail-closed（403）。仓内不落 token 原值。
2. **看板→团队/员工归属**：
   - `runtime/hermes_cli/board_team_keys.py`（新）：板级团队键选择单一源——
     `profiles`（围栏契约键）优先、`profile_scope`（板生命周期实际写入键，live 板实测）
     回落；present-but-empty 原样返回（围栏 fail-closed）。
   - `kanban_db_dispatch._board_team_allowlist` 改用该单一源；修复「board.json 写的是
     profile_scope、围栏只认 profiles、配置形同虚设」的键错配。
   - `team/shared/domain-registry.yaml` 每域补 `owner_label`＋`owner_account_env`
     （人类负责人岗位标签＋本机账号环境变量名；账号原值不入仓）。
3. **Harness 单仓化与判据**：
   - 路径：`mx-lib.sh` 根探测新增单仓签名（custom+patches+vendor 同根），
     `OVERLAY_ROOT` 缺省=仓根；`mx-prelaunch-check/mx-sim-gateway-service/
     mx-night-watchdog/deploy-window-runbook` 与 `mx-report-gen/mx-report-audit/
     final-report-merge` 的 `/Users/cuishi/lab/ncwk{,/overlay,/simharness}` 硬编码
     全部改仓内相对/env 解析；`chain-watch.sh` 模板改 `MX_HARNESS_ROOT` 可覆盖。
   - 守门测试解卡：`graph-spec-smoke/task-boundaries` 改相对 import、
     `v846-governance-closure` OVERLAY 缺省改仓根、`report-truth-anchor` 走
     `HARNESS_MUX` env、`jargon-source-gate` 走仓根派生——单仓下全部恢复可跑。
   - `sim-launch.ts` 默认脚本目录改「仓内 simharness 优先、旧仓外回落」。
   - 判据对齐方案 §5.3：G1 `reqgate_judge` 要求 AC≥3；`mx-report-audit`/`demo-kit-gen`
     G3 键改 `g3_code_pass`、G4 键改 `g4_pass`；`unified-report-layer` 读
     `g5_ready`/`retro_done`（原读不存在的 `g5_ready_pass`/`g6_report_pass`）。
   - `steps_entry.py` 步 16-18 错位修复（16=系分收尾、17=排期、18=编码+g3_code_pass）。
   - 推演方案升 V8.53：全流程推演页签口径统一「四签兄弟路由＋左侧栏运行编排/推演
     设置」（代码 2026-10-21 双入口收敛后的产品事实）；顺带清偿方案正本 4 处 HARD 黑话。
4. **文档真相批**：CLAUDE.md 重写为单仓 AIStudio 布局；整合正本 §3.1/§6.1 旧路径与
   §0.1/§8.2 测试数；README/总账数字刷新（测试文件 883、Vue 344、series 活跃 400、
   服务端域 151、specs 340、plans 62、上游 0.7.39/0.22.5）；附录 A 补 2026-10-22 起
   增量索引；`config/features.ts` 过时注释（登录落点/cockpit 共存）纠正；simharness
   README 预检计数纠正；Matrix 客户端口径写实（自研 matrix-js-sdk 面板，element-web
   仅参考实现）。

## 决策记录

| # | 决策 | 理由 | 否决的备选 | 可逆 |
|---|---|---|---|---|
| D1 | A2A 用 env 注入安全参数，默认仅本机监听 | 网络面必须 fail-closed；仓内落 token 违反脱敏纪律 | 配置里写 token（否决：泄密面）；默认 0.0.0.0（否决：无 token 即裸奔） | 是 |
| D2 | 板级团队键抽 `board_team_keys.py` 单一源 | 双键历史并存（fence 契约 vs 生命周期写入）；单源可被无 agent 依赖地测试 | 在 dispatch 内 if-else（否决：runtime 镜像不可独立测试，本次实锤） | 是 |
| D3 | 人类负责人以 `owner_account_env` 表达 | 仓为脱敏正本，账号原值不入仓；部署时 env 注入真实 Matrix/studio 账号 | 写真实账号（否决：脱敏纪律）；不加 owner（否决：归属断链） | 是 |
| D4 | G3/G4 闸键取 `g3_code_pass`/`g4_pass` | 方案 §5.3 判据冻结面；run22 state.env 实证两键与步骤键并存，闸键须取关卡标志而非步骤完成键 | 沿用 `devimpl_done`/`testpass_done`（否决：步骤键冒充关卡，报告审计漂移根源） | 是 |
| D5 | 推演 IA 写实为四签＋左侧栏两项 | 代码 2026-10-21 已做双入口收敛（组件头注明），文档滞后 | 恢复六签（否决：推翻已收敛的产品裁决且无必要） | 是 |
| D6 | harness 旧路径改仓内解析而非批量文本替换 env | 各脚本上下文不同；仓根派生（dirname 上溯/env 覆盖）对 worktree/主树一致成立 | 保留硬编码＋文档要求设 env（否决：单仓下开箱即红） | 是 |

## 验证

- 看板/入口守门（Python）：`python3 -m pytest team/tests runtime/tests/hermes_cli/test_board_team_keys.py -q`
  → 13/13（九域板全有 profiles+owner、orchestrator A2A 启用且无 token 落值、
  profile_scope 双键选择/空值 fail-closed/优先级）。
- 板围栏单测：`runtime/tests/hermes_cli/test_board_team_fence.py` 新增 profile_scope
  三用例；该文件依赖合并部署树（runtime 镜像非整包），单仓直跑需
  `PYTHONPATH=runtime:vendor/hermes-agent` 且 hermes_cli 以完整包形态存在——本轮以
  `board_team_keys` 纯函数测试+team 源守门覆盖，合并树实测列为未验证项。
- Harness 守门：`npx vitest run --root simharness tests/graph-spec-smoke.test.ts
  tests/task-boundaries.test.ts tests/v846-governance-closure.test.ts` → 21/21（单仓
  路径修复后由不可跑转绿）；`bash simharness/tests/report-truth-anchor.test.sh` 全绿；
  `bash simharness/mux/tests/reqgate-ac3.test.sh`（新增）全绿；
  `bash simharness/mux/tests/repo-root.test.sh`（新增）全绿。
- jargon 源层：`python3 scripts/plan-html/jargon-check.py <方案正本>` 工作副本 HARD=0；
  `jargon-source-gate.test.sh` 按「提交态 main」取本，须待本批合入 main 后方绿（语义
  即「HARD=0 才提交」，属预期）。
- sim-launch：`npx vitest run custom/server/harness/__tests__/sim-launch.test.ts` → 5/5
  （含新增「未设 SIM_HARNESS_DIR 时默认解析到仓内 simharness」）。
- 语法面：改动过的 .sh 全量 `bash -n` 通过；改动过的 .py 全量 `py_compile` 通过。
- 未验证项：A2A 真实跨机调用（需两机 token/网络）；board 围栏在合并部署树的行为
  （见上）；simharness 全量套件与 custom 全量套件（本轮只跑定向面）。

## 挂账（本轮不做）

- 看板归属的产品面读模型端点（板→团队→负责人展示）未接线，属产品面增量。
- `~/.hermes` 侧生效需部署步：同步 team 配置、`generate-configs.py`、
  `runtime:deploy`+`runtime:register`、重启 gateway。

## 设计文档影响

- DESIGN_SYNC: touched
  - docs/superpowers/specs/2026-10-05-mux-v8-fullflow-plan.md —— 统一推演入口和关卡键口径，修正步骤映射。
  - docs/superpowers/specs/2026-10-23-swarmstudio-integrated-design.md —— 修正单仓路径、测试数字与文档真相。
