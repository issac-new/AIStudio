# 四性四格补齐批：制品落盘、矩阵界面、报告节、指纹采集

> 上一批（`2026-11-03-four-gap-capabilities`，main bddb8b71e）交付了四个判据与校验入口，但留了四项尾巴：判据产物没有落盘、界面没建、报告没引用、模型指纹靠调用方手填。本批把四件补齐，使四性读数从「能算」变成「能看、能留、能自动取」。

## 变更

| 编号 | 事项 | 落点 |
|---|---|---|
| F1 | 判据制品落盘：AC 追溯与阶段交接键可写入 run 目录并可回读 | 新增 `custom/server/governance/lifecycle/run-artifacts.ts`；`ac-trace` 与 `stage-keys` 路由支持 `run` 入参 |
| F2 | AC × 用例矩阵界面 | 新增 `custom/client/governance/components/AcTraceSection.vue`，挂载到需求阶段总览 |
| F3 | 报告「四性自评」节 | 新增 `simharness/mux/four_properties.py`（纯函数）＋ `mx-report-gen.py` 插入调用（fail-soft） |
| F4 | 模型指纹采集 | 新增 `custom/server/trust/model-fingerprint-source.ts`；`GET /api/harness/trust/model-fingerprint` |

### F1 制品落盘

- AC 追溯：`POST /api/governance/lifecycle/ac-trace` 增可选 `run`；给出时把 `{at, acTotal, rows, judgement}` 原子写入 `<SIM_ROOT>/runs/<run>/evidence/ac-trace.json`。
- 新增 `GET /api/governance/lifecycle/ac-trace?run=` 回读；文件缺席返回 `available:false`（不编造空矩阵）。
- 阶段交接键：新增 `POST /lifecycle/stage-keys`（结构校验通过才写 `governance/stage-keys/<stage>.json`）与 `GET /lifecycle/stage-keys?run=`（列出已落键）。
- 安全：run 名走既有 `isValidRun`＋`safeRunDir`，禁止路径穿越；写入用 `atomicWriteJson`。

### F2 矩阵界面

- 组件只读：按 `run` 拉取 `ac-trace`，渲染 AC 行 × 用例状态矩阵；未绑定/无结果/失败分别标红黄，孤儿用例单列提示。
- 无 run 时显示空态并说明「先跑一次带 run 的追溯」；接口 `available:false` 时如实显示「未采集」。
- 挂载点：`StageRequirementsOverview.vue` 底部（需求阶段），不新建路由。

### F3 报告节

- `four_properties.py` 提供纯函数 `build_section(run_dir)`，读四个可选制品：`ac-trace.json`、`posture-admission.json`、`stage-keys/*.json`、`independence-summary.json`。
- 每行给「读数 + 采集状态」；任一缺席写「未采集」而非 0。
- `mx-report-gen.py` 通过 try/except 调用并插入 HTML；模块或制品异常不得影响报告主体（fail-soft）。

### F4 指纹采集

- `resolveModelRef({ profile, hermesHome, env })`：优先读 profile `config.yaml` 的 `model`/`provider`，回落 env `HERMES_MODEL_PROVIDER`/`HERMES_MODEL`/`HERMES_MODEL_VERSION`，都没有返回 `null`。
- 端点返回 `{available, fingerprint, source}`；只出摘要与来源，不回显原值。
- trust 审计仍不自动猜：调用方取到指纹后显式传入 `claimedByModel`/`auditorModel`；取不到保持 `unknown`。

## 决策记录

- **D1（制品落 run 目录而非数据库）**：与 `breaker.json`、`release-gate.jsonl` 同构，便于随 run 归档与回放；不新增存储依赖。
- **D2（界面只读制品，不做输入表单）**：界面职责是让缺口可见，编辑仍在 spec 与测试代码里；避免在 UI 里造第二套输入事实源。
- **D3（报告 fail-soft）**：四性节属增量信息，生成异常不得阻断既有报告链；异常以「本节生成失败：<原因>」呈现，不静默吞掉。
- **D4（指纹不自动回填）**：服务端无法可靠知道某个回合跑在哪个 profile/模型，自动回填会把 `unknown` 假装成 `independent`。只提供解析能力与端点，判定权留给调用方并留痕。

## 验证

- 目标测试：`npx vitest run custom/server/governance/lifecycle/__tests__/ac-trace.test.ts custom/server/handoff/__tests__/stage-keys.test.ts custom/server/trust/__tests__/independence.test.ts simharness/tests/four-properties-report.test.ts custom/client/governance/__tests__/ac-trace-section.test.ts`。
- `npm run typecheck:harness`（新模块纳入清单）。
- 全量 `npm test` 零红；合并前复跑。
- 现场口径：本批仍属「已实现未验证」——未在真实 run 上启用强制档。

## 设计文档影响

DESIGN_SYNC: none——延续上一批的「运行面新增模块」条款（整合正本 §8.4 末行），本批未改变任何既有契约语义；`ac-trace`/`stage-keys` 新增可选入参与只读端点，旧调用方行为不变。
