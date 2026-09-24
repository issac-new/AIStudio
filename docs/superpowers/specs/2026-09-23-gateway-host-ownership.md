# Gateway host 守卫与多 profile 共存（host-gateway-ownership）产品定性

- 日期：2026-09-23（aipaydev 推演收口轮）
- 状态：判读根因已修（overlay patch 373）；迁移通道为另行立项的产品化项
- 关联：`2026-09-22-aipaydev-fullchain-sim-report.md` §四/§五-c、ISSUES-LOG host-gateway-ownership

## 一、问题是什么

推演环境（SIM_ROOT 多 profile）暴露：宿主 orchestrator 的 gateway 先占住 host 后，
sim profile 的 gateway 起不来。链路是：

1. Studio autostart 的 `ensureProfileGatewaysRunning` 对每个 profile 先问
   `isGatewayRunningForProfile`，回答「已在跑」就跳过启动。
2. 该函数跑 `hermes gateway status`，CLI 在「**另一个 profile** 的 gateway 拥有本
   host、不服务本 profile」时以非零退出，输出带 lock 字样。
3. 旧判读把它当「本 profile 幂等在跑」→ ensure 永远跳过 → sim profile gateway
   永远起不来，且**无任何告警**（静默失败，最难排查的一类）。

## 二、两类锁语义（勿混淆，本设计的核心）

| 语义 | CLI 输出特征 | 正确判读 |
|---|---|---|
| 本 profile runtime lock（同 profile 重复启动） | `runtime lock is already held` | 幂等，视作在跑（跳过启动合法） |
| host 守卫拒绝（他 profile 占有 host） | `already owns this host` + `will not serve` | **本 profile 未被服务**，不是在跑 |

纯函数单一事实源：`overlay/custom/server/loop/gateway/host-ownership.ts`
（`gatewayStatusLooksHostOwned`，守门测试 4 例）；patch 373 把它接进
`isGatewayRunningForProfile` 的成功路径与 catch 路径双守卫。

## 三、产品边界（裁决记录）

修复后的行为边界，按「诚实优先、不擅动别人的 gateway」裁定：

1. **Studio ensure 只查不抢**：判读到 host 被他 profile 占有时，如实判
   NOT-running 并 warn 日志，随后照常尝试 start——start 若被 host 守卫拒绝，
   失败**可见**（不再静默跳过）。这是本修复的全部范围。
2. **不自动 --force**：`hermes gateway run --force` 会把别人的 gateway 挤下线，
   多 profile 共存时可能反噬宿主 orchestrator。谁占有 host、谁让位，是部署者
   的决策，不是 studio 单方面的决策。--force 保留为人工通道。
3. **长期形态是 multiplex 迁移**：单 host 多 profile 由 gateway 侧 multiplex
   （按 profile 路由）解决，属 hermes-agent 上游能力，另行立项跟踪。
   【2026-09-24 立项落地】见 `docs/superpowers/specs/2026-09-24-multiplex-multiuser-feasibility-and-plan-v2.md`：
   上游 multiplex 为原生能力（host_rendezvous.py 每主机一 gateway 多路复用全部 profile），
   推演拓扑改为单 gateway + profiles/<u>；本节第 2 条"--force 仅人工通道"在新拓扑下自然收敛
   （单 gateway 无同机再起场景）。

## 四、验收口径

- 判读层：host-ownership 纯函数单测（4 例）在 overlay vitest 常驻。
- 接线层：patch 373 重放于 series（373-server-gateway-host-ownership.patch），
  `npm run clean && npm run inject` 全量重放零失败为门禁。
- 行为层：推演复跑时，宿主占 host 场景下 studio 日志应出现
  `host owned by another profile; treating as NOT running`，而非静默跳过。
