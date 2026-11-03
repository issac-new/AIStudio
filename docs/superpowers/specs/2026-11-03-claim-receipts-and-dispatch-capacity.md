# 挂账清偿：主张-回执核验（L1）与派单准入（capacity）

日期：2026-11-03
状态：implemented
触发：调研差距清单剩余两条（报告 §7.5 第 2、3 条）。查重后确认：仓内 `evidence-store` 已提供稳定 evidenceId + 任务级台账 + 前向 hash 链（可直接当回执），缺的是「主张 → 回执」判定；`planDispatch` 已有单槽/TTL 语义，缺**进程级并发上限**（DeerFlow `capacity.py` 的 reject/timeout）。

## 变更

- 新增 `custom/server/handoff/claims.ts`：`verifyClaims(taskId, claims, facts)` 纯判定——无引用 `no_receipt`、引用解析不到 `unresolvable_receipt`、引用其他任务证据 `cross_task_receipt`；混合引用里一条坏即整条未验证；空列表 `allVerified=false`（空不等于通过）。
- `custom/server/handoff/handoff-controller.ts`：`POST /api/harness/handoff/claims/verify`（`{taskId, claims[]}`，回执从 evidence 台账读取；缺参 400）。
- 新增 `custom/server/zcode/dispatch-capacity.ts`：`admitDispatch` 纯判定（未配置放行 → 有余量放行 → 饱和按 reject/queue → 排队超时 `capacity_timeout`）＋ `capacityFromEnv` 装配。
- `custom/server/zcode/dispatch-reasons.ts`：**追加** `capacity_exhausted`、`capacity_timeout`（冻结纪律：只追加不改名）。
- `custom/server/zcode/mention-dispatch.ts`：`PlanFacts.capacity?` 可选事实；`planDispatch` 判定序末位（引擎可达之后）接容量闸；`planFacts()` 从 env + 活跃 pending 槽数装配（缺省 `maxRunning=0`＝不拦）。
- 设计同步：正本 §5.8 增「主张要回执」「并发上限」两句；总账增两行；附录 A.1 登记。

## 决策记录

| # | 决策 | 理由 | 否决的备选 | 可逆 |
|---|---|---|---|---|
| D1 | 回执复用 evidence-store 的 evidenceId，不新造回执表 | 已有稳定 id + 任务级台账 + hash 链；再造一套就是第二事实源 | 新建 receipts 表（否决：与 evidence 双写、易失配） | 是 |
| D2 | 跨任务引用判未验证 | 别任务的证据不能证明本任务的主张；且能防「借证据」蒙混 | 只看 id 存在性（否决：跨任务引用会通过） | 是 |
| D3 | 容量闸缺省 `maxRunning=0`（不拦） | 存量部署行为必须不变；上限是运维显式开启的旋钮 | 给个默认上限（否决：存量 agent 数量差异大，默认值必误伤） | 是 |
| D4 | queue 策略落到既有 `deferred` 码，不新增 `capacity_queued` | `deferred` 语义就是「有意暂缓，条件窗口未到」，UI chip 已认；少一个码少一处漂移 | 新增专用码（否决：与 deferred 语义重叠） | 是 |
| D5 | runningTotal 由调用方注入（当前取活跃 pending 槽数） | pending 槽是进程内已知下界；不在这里数全系统 run，避免与 loop 运行态双事实源 | 本模块自己扫 run 目录（否决：跨进程不一致） | 是 |

## 验证

- `custom/server/handoff/__tests__/claims.test.ts`：全通过/无引用/不可解析/跨任务/混合引用/空列表/重复引用（6 例）。
- `custom/server/handoff/__tests__/handoff-controller.test.ts`：无台账→不可解析、追加证据后→通过、缺参 400（2 例）。
- `custom/server/zcode/__tests__/dispatch-capacity.test.ts`：未配置放行/有余量/饱和拒绝/排队超时/脏事实；`planDispatch` 三态（无事实不变/饱和拒绝/队列暂缓）；码表只追加（9 例）。
- 全量 `npm test` 与 `npm run typecheck:harness`。

## 设计文档影响

DESIGN_SYNC: touched

- `docs/superpowers/specs/2026-10-23-swarmstudio-integrated-design.md`：§5.8 增主张回执与并发上限两句。
- `docs/superpowers/specs/2026-10-23-swarmstudio-design-ledger.md`：§A 增回执判定与并发准入两行。
- `docs/superpowers/specs/2026-10-21-swarmstudio-appendix-a-spec-index.md`：登记本 spec。
