# 模型能力波动下的交付确定性加固（A→D 四层）

日期：2026-10-31
状态：implemented（待合并；验证见下）
触发：用户指示「担心各 agent 使用的模型能力波动，导致执行出现偏差遗漏，按建议顺序全部落地」。诊断结论：运行期容错层已完整（错误分类/重试回退/看门狗/熔断），真正的穿透点在完成边界只认模型自述——`_gate_empty_completion` 只判非空、`gates.json` 是文本包含匹配、六态 verdict 无落库字段、qgate 判定框架因断言登记缺失而空转。

## 变更

### A. 完成门可判化

- 新增运行时模块 `runtime/completion_contract.py`：从任务 body 派生 DoD 契约（`AC-n` 行或 ```dod JSON 块）、计算契约源哈希、校验结构化回执、重算 TAP/JUnit 计数与失败数、校验产物存在性与 sha256、拒绝越界路径。
- `runtime/hermes_cli/kanban_db_dispatch.py`：派发时向 worker 注入 `HERMES_KANBAN_DOD_CONTRACT` 与 `HERMES_KANBAN_DOD_SOURCE_SHA256`，worker 无法通过改卡面削弱契约。
- `runtime/tools/kanban_tools.py`：`kanban_complete` 读取契约并强制 `receipt`；违规返回结构化 tool_error（任务保持 in-flight）并落 `completion_blocked_contract` 事件；通过时把规范化回执写入 `metadata.completion_receipt`（含实际 sha256/字节数/解析计数）。
- `runtime/tools/kanban_tools_schemas.py`：完成工具新增 `receipt` 参数与 schema 描述。
- `runtime-manifest.json`：登记新模块，随部署到达运行时安装树。
- 兼容：body 无 `AC-n` 且无 `dod` 块的卡契约 `mode=off`，行为与现状完全一致。

### B. 判定网通电

- `custom/qgate/src/core/parse.ts`：executor 枚举补 `runtime-proof`（此前 `types.ts`/`run.ts` 均支持，但解析层丢弃，声明不可达）。
- `custom/qgate/src/cli.ts`：`plan`/`run` 新增 `--include-disabled`，按全量门清单工作，不受当前 profile 禁用面限制。
- `.swarm-yuan/hooks/pre-push`：改跑 L0 硬件集（`--include-disabled`），默认从告警改为拦截；`QGATE_PREPUSH_ENFORCE=0` 显式降级，`QGATE_PREPUSH_SKIP=1` 关闭。
- 本变更登记 `.qgate/acceptance.yaml`、`.qgate/scope.yaml`、`.qgate/registers/requirements.json`；新增守门测试防止登记再次空转。
- 现有 L0 策略为 `failure: block` / `inconclusive: warn`：缺登记只会 CONDITIONAL，不阻断；登记齐备后才形成真拦截。

### C. 能力路由

- 新增 `custom/server/modelcap/`：
  - `types.ts`：能力观测、矩阵条目、风险档、路由请求/决定。
  - `matrix.ts`：从评测观测聚合模型×任务类别×难度矩阵，带样本数、pass@1、评测集指纹、时效。
  - `route.ts`：按风险档路由。高风险无足量证据返回 `unknown`/`requiresHuman`，不静默降级；低风险 fail-soft 回落默认模型并标注理由。
  - `store.ts`：矩阵文件读写（`MODELCAP_MATRIX_PATH` 覆盖，缺省 `<HERMES_HOME>/modelcap/matrix.json`），损坏/缺席返回 `available:false` 不猜数。
  - `controller.ts`：只读端点 `GET /api/hermes/modelcap/matrix`、`POST /api/hermes/modelcap/route`。
- 新增服务端挂载补丁；新模块并入 `typecheck:harness` 点名清单。

### D. 补偿止损

- `custom/server/clusterinspector/inspector.ts`：自动处置默认开启，`CLUSTER_INSPECTOR_SAFE_ACT=off` 才关闭（原有进程内幂等集与收敛熔断保留）。
- `team/config.yaml`：开启 `session_rotation.mode=auto`，长会话质量衰减从“只提示”改为“自动换会话”，配合既有机械检查点。
- 建卡幂等：`runtime/hermes_cli/kanban_db_connect.py` 增加 `(idempotency_key) WHERE status != 'archived'` 唯一部分索引；`runtime/hermes_cli/kanban_db.py` 创建冲突时返回既有卡而非报错，跨进程生效。
- `custom/server/faileroute/failure-routes.ts`：路由规则增加 `modelTier`（same/upgrade/human），`hintLine` 透出模型档位处置建议，供派单/人工改派消费。

## 决策记录

| # | 决策 | 理由 | 否决的备选 | 可逆 |
|---|---|---|---|---|
| D1 | 契约放 task body + 派发环境变量，不新增 DB 列 | 避免迁移与 vendor/runtime 双树补丁；派发时锁定契约源哈希，worker 改卡面无法削弱 | 新增 dod_contract 列（否决：迁移面大、CLI/工具/看板三处都要改） | 是 |
| D2 | 回执只做证据重算，不复跑验证命令 | 完成门产生副作用会引入新的不确定性；复跑属独立验证层 | 完成时执行验证命令（否决：可执行任意命令、超时/副作用不可控） | 是 |
| D3 | 无 AC 的卡不启用契约 | 先管住已声明验收标准的卡，避免存量卡迁移导致停摆 | 全量卡强制 receipt（否决：存量卡无人补契约，直接堵死交付） | 是 |
| D4 | qgate 增加 `--include-disabled` 而非切 feature-close | pre-push 只需 L0；切档会把 engineering 全量测试门拉进推送路径 | 切换项目 profile（否决：推送耗时分钟级，开发者会直接 `--no-verify`） | 是 |
| D5 | pre-push 默认拦截 | 现有 L0 缺登记只 CONDITIONAL 不阻断；先通电，登记补齐后自然形成硬拦 | 维持默认告警（否决：审计实证“有框架、无强制”是空转根因） | 是（env 可降级） |
| D6 | 能力路由高风险 fail-closed、低风险 fail-soft | 高风险错配的代价大于等待；低风险无证据时回落到保守默认 | 全档 fail-closed（否决：矩阵冷启动期所有任务都堵） | 是 |
| D7 | 巡检自动处置默认开启 | 动作已有进程内幂等集与收敛熔断，默认关闭等于检测只报不动 | 维持默认关闭（否决：假完成/零交付检测失去处置面） | 是（env 可关闭） |
| D8 | 幂等唯一索引用 partial（status != 'archived'） | 归档后允许重建同键卡，符合重派语义 | 全量唯一（否决：归档卡挡住重建） | 是 |
| D9 | pre-push 对 `L0.intent-drift` 在无 task-intent 登记时跳过并明示 | 该门是「按任务登记」语义；vibe-fast 不要求逐任务意图，强行纳入会让所有推送被历史登记挡住。有登记时照常强制执行 | 为分支写一份会立即过期的全局 intent（否决：合入后污染后续任务） | 是（登记即恢复强制） |

## 验证

- `PYTHONPATH=<拼合树> python3.14 -m pytest runtime/tests -q` → **94 passed**（含 completion contract 21 例、幂等 4 例）。
- `npx vitest run custom/server/modelcap/__tests__ custom/server/faileroute/__tests__ custom/server/clusterinspector/__tests__ custom/__tests__/qgate-acceptance-registry.test.ts` → **62 passed**。
- `cd custom/qgate && npx vitest run __tests__` → **206 passed**（含 runtime-proof 解析可达性）。
- `npx vitest run custom/__tests__/docs-ssot-guard.test.ts` → **6 passed**（附录 A 计数 441 与行数一致）。
- `npm run typecheck:harness` → 0 错误（modelcap 五文件已并入点名清单）。
- `HOME=/tmp/inject-home node scripts/inject.mjs` → 720/721 applied；vendor 树 `grep modelcapRoutes`/`grep idx_tasks_idempotency_unique` 均命中 1+。
- pre-push L0 模拟（hook 同款循环）→ `TOTAL_RC=0`；scope/acceptance PASS，registers/requirement-trace CONDITIONAL（warn 不阻断），intent-drift 无登记跳过。
- 全量 `npx vitest run` → **986 passed | 6 skipped（7175 passed | 11 skipped，0 失败，EXIT 0）**。
- 诚实边界：回执不证明命令真实执行（只证明报告可重算、产物存在）；语义正确性仍依赖独立验证层与人闸。

## 设计文档影响

DESIGN_SYNC: touched

- `docs/superpowers/specs/2026-10-23-swarmstudio-design-ledger.md`：新增“模型波动下的交付确定性四层”机制行（完成契约/判定网/能力路由/补偿止损）及锚点。
- `docs/superpowers/specs/2026-10-21-swarmstudio-appendix-a-spec-index.md`：登记本 spec。
