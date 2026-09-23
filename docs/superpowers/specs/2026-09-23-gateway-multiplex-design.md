# Gateway 多 profile 托管设计（port-per-profile 现行态 + multiplex 未来态）

- 日期：2026-09-23（aipaydev 推演收口轮，问题单 host-gateway-ownership 产品化）
- 状态：现行形态已实锤可用（推演 11 实例验证）；multiplex 为未来形态，上游能力
- 关联：`2026-09-23-gateway-host-ownership.md`（判读修复，patch 373）、推演报告 §五-c
- 一句话：多 profile 共存不做「一机一 gateway」的抢占游戏，而是**端口即路由**——每 profile 独立端口，前端按端口寻址，互不挤占。

## 一、问题与定位

推演中 11 个 sim profile 与宿主 orchestrator 共处一台机器。hermes gateway 有 host 级守卫：一个 gateway 实例声明占有 host，其它 profile 的 `gateway run` 被直接拒绝。由此带来两个真实事故：

- **宿主抢占**：用户真实 orchestrator gateway（`--external-supervisor`）先占 host，sim profile 全被拒，studio ensure 又把它误判为「已在跑」而跳过（patch 373 已修判读）。
- **`--force` 反噬**：推演缓解靠 `gateway run --force` 抢占，多轮推演窗口内会把宿主 orchestrator 挤下线——方向搞反了（推演环境反噬了真实环境）。

定位：这不是「guard 太严格」或「studio 太弱」，而是**寻址模型缺失**——多 profile 是常态（推演、多人共研机、CI），却没有任何机制表达「这些 profile 各自该被服务」。

## 二、现行形态：port-per-profile（已实锤）

推演环境的真实解法，比 multiplex 更简单也更稳：**每个 profile 的 gateway 独立端口**。

```
sim 布局（aipay-lib.sh 既定公式）：
  studio_port  = 8700 + user_index   (8702..8712)
  gateway_port = 8720 + user_index   (8722..8732)
  HERMES_HOME  = SIM_ROOT/users/<u>/.hermes     # 每用户独立 home
  GATEWAY_PORT = gateway_port                   # 透传 studio 进程
```

要点：

1. **端口即路由**：前端（studio）经 `GATEWAY_PORT` 直接命中本 profile 的 gateway，无需任何 mux 逻辑。寻址在编排脚本（aipay-lib）里，单一事实源。
2. **home 全隔离**：每 profile 独立 `HERMES_HOME`，runtime lock、gateway_state、kanban DB 互不可见——host 守卫的「占有」退化为「本 home 的占有」，天然不冲突。
3. **成本**：每 profile 一个 gateway 进程。11 实例实测稳定（推演全程）；N=3 共研机同样成立。成本是「一个进程 × profile 数」，不是「guard 打架」。

已被验证：推演全程 11 实例 + 宿主 orchestrator 共存，修复后（patch 373 判读 + 本端口布局）无抢占事故。

## 三、未来形态：multiplex（单 gateway 多 profile）

port-per-profile 是现行工程解，不是终态。终态是 **gateway 侧 multiplex**：单 gateway 进程托管多 profile，按 profile 路由请求。

为什么值得做（驱动点，不是为了做而做）：

- **资源**：N 个 profile 常驻 N 个 gateway 进程，长期跑的研发机上有成本上限。
- **统一管理面**：一次起停、一份日志、一个健康面——运维心智从「N 个孤儿进程」收敛到「一个托管者」。
- **与 --force 语义解耦**：multiplex 后「托管 N 个 profile」是一等公民行为，不再需要「抢占」这个危险动词。

边界（诚实声明）：multiplex 是 **hermes-agent 上游能力**（`gateway/run.py`、runtime lock、状态文件布局均在上游），overlay 只消费。立项与排期在上游侧，overlay 侧适配（前端按 multiplex 路由改写寻址）等上游落地后跟进。本设计不承诺上游排期。

## 四、现状的「落地即护栏」：harness 显式门闸

在 multiplex 到来之前，用脚本把「port-per-profile + 不抢宿主」固化成门禁（本轮已加）：

- `aipay-up.sh` 新增 `AIPAY_GATEWAY_HOST_POLICY`（默认 `isolated`）：
  - `isolated`：只信 port-per-profile 布局；发现宿主 orchestrator 正占 host 时**显式失败**（不静默 `--force`），并指引「等推演窗口错峰」或显式改 `allow-force`。
  - `allow-force`：运维者显式声明接受抢占语义，才放行 `--force` 路径。
- 目的：把「会不会反噬宿主」从「谁记得手动加不加 --force」变成「脚本层面的显式裁决」。

## 五、验收口径

- 推演复跑：`AIPAY_GATEWAY_HOST_POLICY` 缺省态下，宿主 orchestrator 在线时 aipay-up 拒绝启动 sim gateway 并给出明确指引（而非静默抢占）。
- 判读层门禁：patch 373（host-ownership）+ `host-ownership.ts` 守门 4 例常驻。
- 未来 multiplex 落地后：前端寻址改造 + 本设计 §三 验收（单进程多 profile 路由正确）另行立项评审。
