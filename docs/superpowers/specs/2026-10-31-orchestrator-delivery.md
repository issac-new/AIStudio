# 编排域汇总投递（2026-10-31）

日期：2026-10-31
状态：实现中
来源：用户指示「接下投递吧」；前序 `2026-10-31-superagent-router.md` 的 §5 明确「digest 落库但投递未接」。
关联：`2026-10-31-superagent-domain-auth.md`（Trigger/Thread/准入）、`2026-10-31-superagent-router.md`（汇总与评估）。

## 1. 背景与目标

### 1.1 现状

汇总器的产物写在 `digest` 表（`thread_id/subscriber/body/delivered`），但没有任何投递实现：消息生成后没有人发出。`subscriber` 只是标签，全仓无解析方。

### 1.2 目标

1. **价值声明**：让「多条进展合成一条」真正抵达人，而不是停在数据库里。
2. **SMART 目标**：
   - 新增 `orchestrator/delivery.ts`：digest → thread → kanban 通知订阅表反查原信道 → Matrix 发送。
   - `digest` 表增 `attempts`/`last_error`，老库自动补列。
   - 暴露 `POST /api/orchestrator/deliver` 手动触发；定时器由 `ORCHESTRATOR_DELIVER_INTERVAL_MS` 控制，默认关。
3. **非目标**：
   - 不改造 kanban notifier（vendor 侧），不改供应商订阅表。
   - 不支持 telegram/tui/api_server 订阅的投递（需要 `hermes send`）。
   - 不做 E2EE 加密发送（明文事件在加密房会显示不可解密，属已知限制）。
   - 不改变准入模式（保持 `observe`）。

## 2. 决策记录

| # | 决策 | 理由 | 否决的备选 | 类型 | 用户裁定 | 可逆 |
|---|---|---|---|---|---|---|
| D1 | 用 `matrixSend`（chat-bridge）而非 `matrixSendMessage`（raci-matrix） | 后者在 REST 白名单守门 `raci-rest-guard.test.ts:52-60` 内，新增调用点会红；前者不在名单 | 用 matrixSendMessage（否决：需先过设计裁决改白名单） | Mechanical | approved | 是 |
| D2 | 只投 `platform='matrix'` 的订阅 | Studio 有 Matrix 直发能力；其它平台需 `hermes send` 子进程，本批不做 | 全平台（否决：范围外） | Mechanical | approved | 是 |
| D3 | 订阅为空记 skipped 并累加 attempts，不判失败 | CLI/cron 建的任务本就不自动订阅（`kanban_tools.py:1201-1203`），不是投递错误 | 记失败重试（否决：会让 attempts 无意义膨胀） | Mechanical | approved | 是 |
| D4 | 定时器默认关，靠 env 显式开启 | 默认开会在未验证的频道上刷屏 | 默认开（否决：先造成噪音） | UserChallenge | approved（用户要求接投递） | 是 |
| D5 | 发送失败不删 digest，靠下一轮重试 | 与上游 notifier 的失败计数语义一致；digest 是待办不是日志 | 失败即丢弃（否决：丢消息） | Mechanical | approved | 是 |

## 3. 变更范围与侵入点

| 文件 | 改动 |
|---|---|
| `custom/server/orchestrator/delivery.ts`（新增） | 线程解析、订阅反查、Matrix 发送、结果归集 |
| `custom/server/orchestrator/store.ts` | `digest` 增 `attempts`/`last_error`；老库 `ALTER TABLE` 补列；新增 `recordDigestAttempt` |
| `custom/server/orchestrator/controller.ts` | `POST /deliver`；定时器按 env 启动（`unref`） |
| `custom/server/orchestrator/__tests__/delivery.test.ts`（新增） | 7 例 |
| `package.json` | `typecheck:harness` 点名清单加 `delivery.ts` |
| `config/orchestrator.env`（新增） | 评估 profile / gateway 地址 / 超时 / 投递间隔（非敏感项） |
| `scripts/serve-server.mjs` | 启动时注入 `config/orchestrator.env`；`API_SERVER_KEY` 缺省从 `$HERMES_HOME/.env` 取同名行（密钥不入库） |

## 4. 详细设计

```
digest(delivered=0)
  → thread.threadKey（`task:<board>:<taskId>`）
  → kanban_notify_subs WHERE task_id=?（只读板库）
  → filter(platform === 'matrix')
  → matrixSend(env, chat_id, 'm.room.message', {msgtype:'m.text', body, m.relates_to?})
  → 全部成功：markDigestDelivered(id)；任一失败：recordDigestAttempt(id, error)
```

- 板库路径复用 `kanbanDbPaths()`（默认 `<HERMES_HOME>/kanban.db`，可用 `ORCHESTRATOR_KANBAN_DBS` 扩展）。
- Matrix 凭据复用 `resolveMatrixDispatchEnv()`；读不到即整批 skipped（`matrix_not_configured`）。
- 线程关系：`thread_id` 非空时挂 `m.relates_to{rel_type:'m.thread', event_id, is_falling_back:true}`。

## 5. 验证（实测结果）

- `npx vitest run custom/server/orchestrator/__tests__/delivery.test.ts` = **7/7 通过**（线程解析、消息体、订阅反查去重、三态投递）。
- `npm run typecheck:harness` = **0 错**。
- 合并前 `npm test` 全量。
- **未做**：真实 Matrix 房间投递未验证（需要订阅表非空 + 机器人已在房）；本批只验证到 HTTP 调用形状与失败分支。
- **未做**：E2EE 房行为未验证（明文事件预期不可解密）。

## 6. 风险与回滚

| 风险 | 缓解 |
|---|---|
| 机器人不在房 → 403 | 记 attempts/last_error，不标记已投递；人工可查 |
| 订阅表为空 → 消息发不出 | 记 skipped；需要时用 `hermes kanban notify-subscribe` 补订阅 |
| 定时器重复投递 | `markDigestDelivered` 只 0→1，天然幂等 |
| 加密房不可读 | 已知限制，文档写明；需要时改走 `hermes send` |

回滚：删 `delivery.ts` 与 `/deliver` 端点即可；`digest` 新列只增不减，不影响读取。

## 7. 设计文档影响

DESIGN_SYNC: touched

- `docs/superpowers/specs/2026-10-23-swarmstudio-integrated-design.md`：§4.7 补「汇总投递走 kanban 通知订阅 + Matrix 直发，默认只投 matrix、定时器默认关」。
- `docs/superpowers/specs/2026-10-21-swarmstudio-appendix-a-spec-index.md`：本 spec 登记（计数 +1）。
