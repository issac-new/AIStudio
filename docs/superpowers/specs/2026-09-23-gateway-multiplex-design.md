# Gateway 多 profile 共存——overlay 侧终态（host-gateway-ownership 收口）

- 日期：2026-09-23（aipaydev 推演收口轮）
- 范围：**overlay 自家域**。multiplex（单 gateway 托管多 profile）是 hermes-agent 上游能力，本文不做也不排期——overlay 侧以 port-per-profile + 门闸收口，推演场景已够用。
- 关联：`2026-09-23-gateway-host-ownership.md`（判读修复，patch 373）、推演报告 §五-c

## 一、overlay 侧的终态（三件套，已全部落地）

| 件 | 位置 | 作用 |
|---|---|---|
| 判读修复 | patch 373（`isGatewayRunningForProfile`） | 「他 profile 占 host」判 NOT-running，ensure 不再静默跳过启动 |
| 端口布局 | `scripts/aipay/aipay-lib.sh` | studio 8702-8712 / gateway 8722-8732 按 user_index 编址，端口即路由 |
| harness 门闸 | `scripts/aipay/aipay-up.sh` `AIPAY_GATEWAY_HOST_POLICY` | 宿主 gateway 在线即 fail-fast，不静默抢占 |

## 二、布局（既定公式，不再展开）

```
sim 布局（aipay-lib.sh）：
  studio_port  = 8700 + user_index   (8702..8712)
  gateway_port = 8720 + user_index   (8722..8732)
  HERMES_HOME  = SIM_ROOT/users/<u>/.hermes   # 每用户独立 home
  GATEWAY_PORT = gateway_port                 # 透传 studio 进程
```

要点：端口即路由（studio 经 GATEWAY_PORT 直命中本 profile gateway，无 mux）；home 全隔离（runtime lock / gateway_state / kanban DB 互不可见，host 守卫的「占有」退化为「本 home 的占有」，天然不冲突）。推演全程 11 实例 + 宿主共存验证。

## 三、门闸语义（AIPAY_GATEWAY_HOST_POLICY）

- `isolated`（缺省）：宿主 orchestrator gateway(:8650) 在线即拒绝启动 sim 实例，给错峰/降档指引——推演宁可不开局，也不挤掉真实环境。
- `allow-force`：运维者显式接受抢占语义才放行。
- `skip`：跳过检查（调试用，不推荐）。

实测（09-23）：宿主 :8650 在线时 `isolated` 正确 fail-fast；`allow-force` 放行。

## 四、不做的事（边界声明）

- 不做 gateway multiplex（单进程多 profile 路由）——上游 hermes-agent 能力，超出 overlay 修改域。若日后上游原生支持，再评估 overlay 侧寻址适配。
- 不在 overlay 模拟/代理上游行为。overlay 只消费 hermes CLI/gateway 的现状语义。

## 五、验收口径

- 门闸：宿主在线/离线两态下 aipay-up 行为符合 §三（本轮已实测在线拦截）。
- 判读：patch 373 + host-ownership 守门 4 例常驻 overlay vitest。
- 推演复跑：宿主在线时推演无法静默开局（门闸拦截即证）。
