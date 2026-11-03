# 四性四格能力：姿态准入、AC 追溯、阶段交接键、审阅独立性

> 来源：2026-11-03 路演备战材料中识别的四个最弱格。四格共同点不是"AI 不够强"，而是**已有观测/约束停在"看得见"层，没有走到"拦得住"层**。本批把四格各补一层执法。

## 变更

四件能力，均为扩展既有模块，不新建平行体系：

| 编号 | 能力 | 新模块/改动点 | 补的格 |
|---|---|---|---|
| C2 | 治理姿态准入 | 新增 `custom/server/governance/posture-admission.ts`；`governance-controller` 增 GET `/api/governance/posture-admission` | 安全默认态：姿态从只读对账升级为可拦 |
| C1 | AC 追溯链 | 新增 `custom/server/governance/lifecycle/ac-trace.ts`；`lifecycle/controller` 增 POST `/lifecycle/ac-trace` | 需求准确性：AC 到用例到运行结果可核验 |
| C4 | 阶段交接键 | 新增 `custom/server/handoff/stage-keys.ts`；`lifecycle/controller` 增 POST `/lifecycle/stage-keys/verify` | 阶段交接：交接从事后审计变入口校验 |
| C3 | 审阅者独立性 | 新增 `custom/server/trust/independence.ts`；`trust/types.ts` 增可选字段；`trust/service.ts` 审计面接入 | 测试独立性：共模从不可见变可见且可策略降级 |

### C2 治理姿态准入

- 策略三档（env `HERMES_POSTURE_POLICY`）：`report`（默认，零行为变化）/ `require-for-gate`（姿态为 bare 时拒）/ `strict`（另要求执法总闸与 strict 姿态开启）。
- 输出 `{admits, mode, blockers[], warnings[], digest}`；blockers 逐项点名 profile 与偏差，不笼统说"姿态不合格"。
- 只读：不修改任何进程环境，不代开开关；解除路径写进 blocker 文本。

### C1 AC 追溯链

- `parseAcceptanceCriteria(doc)`：解析 `- **AC-N` 条目，识别可验证方式（auto/manual/evidence/unspecified）。
- `parseCaseBindings(source)`：从 `@ac AC-1, AC-2` 注释或测试名 `[AC-1]` tag 提取归属。
- `buildAcTrace` + `judgeAcTrace`：每条 AC 至少一个绑定用例且有运行结果才判过；未绑定判 `ac-unbound`、有绑定无结果判 `ac-no-result`、不属于任何 AC 的用例单独计入 `orphanCases`（提示不阻断）。
- 门禁语义：G3 判据可调用本模块；本批不替换既有 simharness 门禁，只提供可被调用的判据。

### C4 阶段交接键

- 四把键：`req-frozen` / `design-approved` / `dev-done` / `verify-done`。
- 键结构沿用 `handoff-script` 六段语义，`notDone` 空必须显式写"无"。
- 校验四件：结构完整、产物路径存在、sha256 一致、提交锚点可解析（依赖可注入，路由侧用真实文件系统）。
- 缺键或校验失败逐项点名，拒入。

### C3 审阅者独立性

- `modelFingerprint({provider, model, version})`：归一化后 sha1，不落完整标识。
- `assessIndependence`：三态 `independent` / `same-model` / `unknown`。
- `trust` 域接入：主张增可选 `claimedByModel`，审计增可选 `auditorModel`；每个审计记录写入 independence 评估。
- 策略 `HERMES_TRUST_INDEPENDENCE`：`report`（默认，只记录）/ `require-for-verified`（共模时 `verified` 裁决直接拒，给解除路径）。

## 决策记录

- **D1（默认零行为变化）**：三档策略默认都是 `report`。理由：仓内先例（`enforce-gate.ts` 总闸默认 0，2026-10-16 裁定"零阻断先预警"）一致；直接默认拦截会打断既有推演链，且四件能力本身尚未在真环境验证。
- **D2（不消除共模，只让共模可见）**：C3 不做强制换模型——成本不可控且运行时不保证能取到指纹。策略降级只作用于 `verified` 裁决的必要条件，`unverified`/`refuted` 不受影响。
- **D3（AC 追溯不替换现有 G1 判据）**：`judgeRequirementFreeze` 判形式完备，C1 判追溯完整，两者并列而非替代。避免同一判据两处定义（单一事实源）。
- **D4（交接键复用六段语义）**：不新造交接格式，`notDone` 显式"无"的纪律沿用 `handoff-script`，降低两套格式漂移风险。
- **D5（姿态 digest 固定算法）**：对 `{summary, global 四开关, ledger.problems 计数}` 做稳定序列化后 sha1，供报告与证据引用；字段顺序写死在实现里，改序即视为契约变更。

## 验证

- 每个新模块配行为测试（`__tests__/`），覆盖：正常路径、边界、**变异探针**（故意破坏关键判据后测试必须变红）。
- 目标测试：`npx vitest run custom/server/governance/__tests__/posture-admission.test.ts custom/server/governance/lifecycle/__tests__/ac-trace.test.ts custom/server/handoff/__tests__/stage-keys.test.ts custom/server/trust/__tests__/independence.test.ts`。
- 服务端类型：`npm run typecheck:harness`。
- 回归：既有 `posture.test.ts`、`handoff-script.test.ts`、`trust` 相关测试必须保持全绿（新字段均为可选）。
- 本批不宣称"四性已达标"：四项默认 report 档，只提供可开启的拦截与可引用的读数。

## 设计文档影响

DESIGN_SYNC: none——四个模块属运行面新增模块，按整合正本 §8.4 末行条款（"运行面新增模块：未逐项纳入本文，避免把未验证实现写成稳定契约；以代码、测试和专题文档为准"）不写入正本；本批未改动任何既有契约字段语义（`TrustClaim`/`ClaimAudit` 只增可选字段），既有正本描述仍成立。
