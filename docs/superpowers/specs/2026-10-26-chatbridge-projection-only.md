# ChatBridge 入向投影化：关闭第二套 agent 编排旁路（2026-10-26，Task 3）

分支：`fix/core-coding-chain-v2`

## 变更

九段架构第 3 点要求本机 hermes gateway 是 agent 执行唯一入口。ChatBridge 的入向注入 API（补丁 509 `publishBridgeMemberMessage`）原带 `agentClients.processMentions` 编排尾段——matrix 消息可绕过 gateway 直接驱动本地群聊编排器，构成第二套编排旁路。本批：

1. **补丁 509 改纯投影**：`publishBridgeMemberMessage` 只持久化＋广播（远端消息在本地群房可见、留痕），删除 `processMentions`/`processSummaryCheck` 编排链；注释改"投影化"。出向（agent 终态→matrix）、审批远端通知（`bridgeEvents`）两通道保留。
2. **P2C task.assign 同步投影语义**：协议事件仍投影进映射房（远端在场可见），回执 `task.receipt` status 由 `created`/`injected-to-local-orchestration` 改为 **`observed`/`projected-execution-belongs-to-gateway`**——桥如实声明"已投影、执行归成员本机 gateway"，不再声称本地接单。
3. **静态守门**：`chatbridge-projection-guard.test.ts` 断言补丁 509 无 `processMentions`、投影 API 与 `bridgeEvents` 通道在位、chat-bridge 入向投影仍在。
4. 重放验证：HEAD 纯净基线上按 series 顺序应用全部 studio 路由补丁（209 个）至 509 全过，新形状落位（编排调用零残留）。

## 决策记录

| # | 决策 | 理由 | 否决的备选 | 可逆 |
|---|---|---|---|---|
| D1 | 入向纯投影，编排交回 gateway | 第 3 点"唯一入口"；桥=传输投影层，不是编排器 | 保留 processMentions（否决：旁路即架构违背） | 是（补丁可逆） |
| D2 | task.assign 回执改 observed 而非继续报 created | 桥已不接单，报 created=假回执 | 保留 created（否决：协议撒谎） | 是 |
| D3 | 直接编辑补丁 509 新增行而非追加新补丁 | 该行为就是 509 引入的，追加补丁会留"加了又删"的死链；series 序位置未变 | 新增 696 反转补丁（否决：补丁链噪音） | 是 |
| D4 | 在服 8647 不停，验证走 /tmp 基线序列重放 | 在服树属其他会话载体（仓规）；序列重放已覆盖 509 落位正确性 | OVERLAY_ALLOW_LIVE_CLEAN=1 带服手术（否决：schema 缓存污染实录） | — |
| D5 | Gateway 侧 Matrix adapter 对 com.swarmstudio.task.assign 的原生承接未在本批实现 | 桥只撤旁路不代建正身；gateway 承接需要 adapter 扩展，属独立批（正本 §3.4 已入册双通道边界） | 本批顺手改 adapter（否决：超出 Task 3 范围且无测试场） | — |

## 设计文档影响

DESIGN_SYNC: none —— 整合正本 §3.4（main R12 血统）已入册"网关是消息与派发的唯一入口；互调走 peer api_server 与 Matrix 协议事件两通道"，本批是让 ChatBridge 行为向该口径收敛，不改正本事实。

## 验证

- 序列重放：HEAD 基线 + 209 个 studio 补丁依序应用至 509 全过；`bridge processMentions` 零残留、投影注释落位（/tmp/r509 实测）。
- `npx vitest run custom/server/matrix/__tests__/chat-bridge.test.ts chatbridge-projection-guard.test.ts raci-rest-guard.test.ts` → 16/16（含 P2C observed 新断言）。
- 在服 8647 树未动（clean 被 live-server 守卫拒绝，按 D4 走 /tmp 重放）；本仓 vendor 注入态保持旧 509 形状，下次部署窗 clean+inject 后自然换装。
- 未验证项：桥在线实跑（生产 CHAT_BRIDGE_ENABLED 默认关）；gateway adapter 承接 task.assign（D5 独立批）。
