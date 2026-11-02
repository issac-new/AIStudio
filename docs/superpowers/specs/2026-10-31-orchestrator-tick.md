# 编排定时轮与多板接入（2026-10-31）

日期：2026-10-31
状态：实现中
来源：用户指示「1、都接吧；2、加吧；3、使用 swarm 账号验证」；前序 `2026-10-31-orchestrator-delivery.md`（投递）与 `2026-10-31-superagent-router.md`（评估/汇总）。
关联：`2026-10-31-superagent-domain-auth.md`（Trigger/Thread/准入）。

## 1. 背景与目标

### 1.1 现状

投递批上线后，链路仍缺两处：

1. **没有自动轮次**：桥接只能手动 `POST /kanban-bridge/tick`，评估只能手动 `POST /evaluate`，只有投递有定时器。事件不会自己流起来。
2. **只接默认板**：`kanbanDbPaths()` 默认只扫 `$HERMES_HOME/kanban.db`；命名板 `aiteam`（4017 条事件）与 `data`（2242 条）完全没接入。

### 1.2 目标

1. **价值声明**：让「事件进来 → 判断 → 汇总 → 投递」按固定节奏自动走完，人不用手动触发每一步。
2. **SMART 目标**：
   - 新增 `orchestrator/tick.ts`：一轮串起桥接、评估、汇总、投递四步。
   - 定时器由 `ORCHESTRATOR_TICK_INTERVAL_MS` 控制（默认 0=关），取代原单独的投递定时器。
   - 接入 `aiteam` 与 `data` 两个命名板，`ORCHESTRATOR_KANBAN_DBS` 支持 `~/` 展开。
   - 首次接入前把各板游标设到当前 `task_events` 最大 id，避免回填 6259 条历史。
3. **非目标**：
   - 不改 kanban notifier（vendor 侧）。
   - 不改变准入模式（保持 `observe`）。
   - 不做跨板事件去重（各板 `task_events.id` 独立，按 `sourceId + externalId` 天然隔离）。

## 2. 决策记录

| # | 决策 | 理由 | 否决的备选 | 类型 | 用户裁定 | 可逆 |
|---|---|---|---|---|---|---|
| D1 | 用统一 tick 取代单独的投递定时器 | 四步共享同一节奏，分开定时会互相错位（投递时汇总还没生成） | 保留两个定时器（否决：时序不可控） | Mechanical | approved | 是 |
| D2 | 评估默认开，每轮上限 2 条 | 用户要求「加定时轮」；每次评估一次模型调用，不限量会烧钱 | 默认关（否决：功能不自动跑） | UserChallenge | approved（用户「加吧」） | 是 |
| D3 | 汇总只为有订阅的线程生成，生成后推进订阅游标 | 无订阅等于没人要看，生成是浪费；推进游标避免同一批事件反复汇总 | 每轮为所有线程生成（否决：噪音） | Mechanical | approved | 是 |
| D4 | 命名板接入用 `ORCHESTRATOR_KANBAN_DBS` + `~/` 展开 | 配置文件不能写死用户名；换机器不用改 | 写绝对路径（否决：不可移植） | Mechanical | approved | 是 |
| D5 | 首次接入设游标到各板 max id，不回填历史 | aiteam/data 共 6259 条历史，回填会产生大量无关 Trigger 与 Decision | 全量回填（否决：噪音与成本） | UserChallenge | approved（用户「都接吧」） | 是 |

## 3. 变更范围与侵入点

| 文件 | 改动 |
|---|---|
| `custom/server/orchestrator/tick.ts`（新增） | 编排轮四步、汇总生成与游标推进、间隔/开关/上限解析 |
| `custom/server/orchestrator/kanban-bridge.ts` | `bridgeAll` 接受 `dbPaths`；`kanbanDbPaths` 支持 `~/` 展开 |
| `custom/server/orchestrator/controller.ts` | `POST /tick`；定时器由投递改为 tick |
| `custom/server/orchestrator/__tests__/tick.test.ts`（新增） | 7 例 |
| `config/orchestrator.env` | 加三块板、tick 间隔 60s、评估开关与上限；删 `ORCHESTRATOR_DELIVER_INTERVAL_MS` |
| `package.json` | `typecheck:harness` 加 `tick.ts` |

## 4. 详细设计

```
每 60 秒（ORCHESTRATOR_TICK_INTERVAL_MS）：
  1. bridgeAll({ limit: 100, dbPaths })           // 默认板 + aiteam + data
  2. evaluatePending({ limit: ORCHESTRATOR_EVAL_LIMIT })   // 默认 2 条
  3. generateDigests()                            // 只为有订阅的线程；生成后推进游标
  4. deliverPendingDigests({ limit: 20 })         // 已投递的置 delivered
```

- 任一步失败记入 `errors`，其余步骤继续（fail-soft，不静默）。
- 汇总静默（纯列变更）时**仍然推进游标**，避免下一轮重复扫描。
- 评估在 `observe` 下只记 Decision，不推进 Trigger（沿用 A+B 规则）。

## 5. 验证（实测结果）

- `npx vitest run custom/server/orchestrator` = **63/63 通过**（8 文件；tick 7、evaluator 13、pass 6、delivery 7、其余既有）。
- `npm run typecheck:harness` = **0 错**。
- 合并前 `npm test` 全量。
- **活体端到端（2026-11-02，8652 临时实例）**：写入一条演示 Trigger（`blocked`）→ 一轮 tick 后
  - Trigger 状态 `ignored`（评估完成，不再重评）
  - Decision `ignore` + `inferred` + `semantic:no_reason`
  - digest 生成「t-demo 阻塞」，`delivered=0`
  - 三块板游标生效：aiteam(4017)/data(2242)/default(7027) 均未回填
- **未做**：真实 Matrix 投递未验证（演示线程无 `kanban_notify_subs` 订阅，走 skipped 分支）。

### 5.1 活体暴露并已修的三个真缺陷

1. **`author` 字段类型错**：`POST /p/<profile>/api/sessions/<id>/chat` 的 `author` 必须是对象，
   传字符串返回 400 `invalid_author`。已删该字段（evaluator 不需要署名）。
2. **模型输出词表不匹配**：模型返回 `{"verdict":"no_action"}`，原实现只认
   `accept|ignore|unavailable`，直接丢弃 → 白花一次调用。已加 `normalizeVerdict` 同义词表
   （no_action/skip/approve 等）。
3. **评估失败无限重试 + observe 下重复评估**：原实现 `unavailable` 与 `observe` 都保持 `pending`，
   每轮 tick 对同一批事件重复调模型。已修：`trigger.eval_attempts` 累计，达 2 次置 `ignored`；
   `Trigger.status` 改为表达「评估是否完成」（accept→routed / ignore→ignored），实际派发仍由
   `mode` 决定（`promoted` 字段单独表达）。

## 6. 风险与回滚

| 风险 | 缓解 |
|---|---|
| 评估每轮调模型产生成本 | 每轮上限 2 条；可 `ORCHESTRATOR_EVAL_ON_TICK=0` 一键关 |
| 命名板事件量大导致单轮超时 | `bridgeLimit` 默认 100，超出下一轮继续 |
| 游标未设导致回填 | 上线步骤显式设游标到各板 max id |
| 多板事件混入同一线程键 | `sourceId` 带板名（`kanban:<board>`），`threadKey` 也带板名，天然隔离 |

回滚：设 `ORCHESTRATOR_TICK_INTERVAL_MS=0` 即停定时轮；删 `tick.ts` 回退到手动端点。

## 7. 设计文档影响

DESIGN_SYNC: touched

- `docs/superpowers/specs/2026-10-23-swarmstudio-integrated-design.md`：§4.7 补「编排轮四步与多板接入」。
- `docs/superpowers/specs/2026-10-21-swarmstudio-appendix-a-spec-index.md`：本 spec 登记（计数 +1）。
