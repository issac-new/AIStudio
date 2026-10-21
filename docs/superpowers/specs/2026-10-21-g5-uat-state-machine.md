# G5 发布门与 UAT 判定最小状态机（接管补正本）

日期：2026-10-21　分支：`feat/backlog-closure`（战线 C）　接管：2026-10-22 本会话收口（原会话已写实现，spec 未落盘——本文件由实现反推补写，是实现的正本描述）

## 1. G5 发布门状态机（release-state.ts）

纯函数派生，不造通用工作流引擎。状态图：

```
draft --submit--> pending --approve--> approved --release--> released
  |                  |
  +------reject------+--> rejected（终态；重新提交需新 run，不做回流）
  +------approve-----+（兼容旧台账：无 submit 直接批准）
```

- 存储：沿用 `evidence/release-gate.jsonl` append-only。新记录写 `action`（submit/approve/reject/release），approve/reject 附 `decision` 保持旧读面兼容；旧记录只有 `decision`。
- 读模型：事件顺序派生 state/latest/latestDecision/history；旧台账 approve↔reject 改判按旧语义覆盖（不把历史读成 draft）；新台账非法序列（只可能来自手工改账）忽略该事件并标记 `ignored`。
- 写入校验：action 合法集；reject 必填 note；approve 必填证据锚（UAT 台账/门记录/commit）。非法迁移 409；幂等同态动作（重复提交/批准/驳回/发布）返回 `idempotent:true` 200。
- 权限：未启用鉴权的单用户部署放行；启用后 approve/reject/release 仅 `super_admin` 或 `role=release`（显式发布审批角色），submit 所有登录用户。

## 2. UAT 逐 AC 判定（uat-state.ts）

```
pending --pass--> pass
pending --conditional（note + acknowledged:true 双必填）--> conditional
pending --reject（note 必填）--> reject（阻断该 AC）
```

- 允许改判：append-only，最新记录胜出，历史全量可查；无 409 迁移限制。
- AC 归一：`3`/`AC-3`/`ac 3` → `AC-N`（编号 ≤3 位）。
- 聚合：按 AC 分组（latest=最大 ts，同 ts 取后出现者），summary=pass/conditional/reject/blocked；blocked=最新判定为 reject。

## 3. REST 面（simcenter-controller 挂载）

- `GET /api/hermes/simcenter/uat-verdicts?run=` —— 按 AC 聚合读模型。
- `GET /api/hermes/simcenter/release-gate?run=` 与 `/release-gate/state` —— 状态机读模型（state/history/allowedActions/can）。
- `POST /api/hermes/simcenter/release-gate` —— 状态迁移（409 非法迁移；幂等 200）。

## 4. 决策记录

| # | 决策 | 理由 | 否决的备选 |
|---|---|---|---|
| 1 | 纯函数派生 + append-only 台账 | 状态可重放、历史可审计 | 引擎化工作流（否决：超需） |
| 2 | rejected/released 为终态，重提交需新 run | 防回流改写历史 | 回流 reopen（否决：审计语义受损） |
| 3 | 旧台账 decision 直接映射动作（draft 可直接 approve） | 历史读面不因新矩阵漂移 | 强制重放 submit（否决：旧账读坏） |
| 4 | approve 必填证据锚、reject 必填理由 | 「批准无证据=嘴上通过」红线 | 允许空锚（否决：与 FAIL 唯一出口=修复单纪律冲突） |
| 5 | conditional 需 acknowledged:true | 「有条件通过」必须显式认可事件 | 静默 conditional（否决：责任不可追溯） |
| 6 | 权限：单用户未鉴权放行 | 与 approval/governance 同先例 | 强制三权（否决：单机部署不可用） |
| 7 | 类型/标签/纯函数正身在新文件，controller 保留旧导出面 | 消费者（TracePanel 等）不迁移 | 全量改消费者（否决：爆炸半径大） |

## 5. 验证

- 本文件为接管补写：`__tests__/release-uat-state.test.ts` 守状态机矩阵（合法/非法 409/幂等/旧账兼容/权限/锚与理由必填）、UAT（归一/conditional 双必填/聚合最新胜出/blocked）与 REST 面。
- `npx vitest run custom/server/simcenter` 全量保持通过；typecheck:harness 纳入两个新文件。
