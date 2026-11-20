# Judge 真实调用启用：Anthropic 协议与宿主 env 加载

> 日期：2026-11-20
> 状态：实施中（用户指令「完成剩余残留事项」）
> 来源：上一轮残留项「judge 无 OpenAI-compatible 端点未启」
> 关联：`2026-11-19-scheduling-intelligence-wiring.md`（judge 接线）、`2026-11-19-mechanism-budget-closeout.md`
> 读者：需要让 loop 验证真正走独立 judge 的开发与运维

## 变更

### 问题

judge 客户端只支持 OpenAI `/chat/completions`；本机唯一可用模型通道是 cc-switch 的 Anthropic 兼容代理（`ANTHROPIC_BASE_URL=http://127.0.0.1:15721`），其 `/v1/models` 为空、OpenAI `/chat/completions` 上游 404。因此真实 judge 无法启用，`verifier-bridge` 日志恒为 `judge disabled`。

### 范围

**新增**

- `docs/superpowers/specs/2026-11-20-judge-anthropic-live-enable.md`（本文件）。

**修改**

- `custom/server/loop/graph/judge-client.ts`：`protocol: 'openai' | 'anthropic'`；Anthropic 走 `/v1/messages` + `x-api-key` + `anthropic-version`，解析 `content[].type=text`（忽略 thinking）；缺 key 直接 pending；`maxTokens` 可配（anthropic 缺省 1024）。
- `custom/server/loop/graph/verifier-bridge.ts`：`GRAPH_JUDGE_PROTOCOL`；anthropic 下 API key 解析序 `GRAPH_JUDGE_API_KEY > ANTHROPIC_AUTH_TOKEN > ANTHROPIC_API_KEY`；缺 key 时保持 disabled。
- `scripts/serve-server.mjs`：启动时从 `$HERMES_HOME/.env` 加载白名单键（`API_SERVER_KEY` 与 `GRAPH_JUDGE_*`），已存在的 process.env 优先；密钥不进版本库。
- 测试：`judge-client.test.ts` 新增 3 例 anthropic；`verifier-bridge.test.ts` 新增 2 例协议/回退。

**宿主启用（不入库）**

- `~/.hermes/.env`（600）新增 `GRAPH_JUDGE_PROTOCOL=anthropic`、`GRAPH_JUDGE_BASE_URL=http://127.0.0.1:15721`、`GRAPH_JUDGE_MODEL=glm-5.3`、`GRAPH_JUDGE_API_KEY=<token>`、`GRAPH_JUDGE_ENFORCE=1`、`GRAPH_JUDGE_MIN_SCORE=0.7`、`GRAPH_JUDGE_TIMEOUT_MS=60000`。
- 8647 服务重启后日志：`judge enabled (protocol=anthropic, model=glm-5.3, defaultIntent=true)`。

### 验收判据

1. Anthropic 请求打到 `/v1/messages`，不双 `/v1`，头带 `x-api-key`。
2. 只解析 text 块，忽略 thinking；坏 JSON/HTTP 错/缺 key 均 pending。
3. `GRAPH_JUDGE_PROTOCOL=anthropic` + `ANTHROPIC_AUTH_TOKEN` 回退可启用；无任何 key 保持 disabled。
4. 真实调用返回 `{score, reasoning}`（实测 glm-5.3 score=1）。
5. 服务启动日志出现 `judge enabled (protocol=anthropic, ...)`。

## 任务卡

### 完成条件

judge 能经本机 Anthropic 兼容代理真实调用；失败仍 pending；服务启动自动加载 judge 配置。

### 输入与来源

`GRAPH_JUDGE_*`（`$HERMES_HOME/.env`）；cc-switch Anthropic 代理；loop 合同 diff+rubric。

### 工作流边界

只改 judge 客户端协议与 env 加载；不改 verifier 的 pending/repair 语义，不改 OpenAI 路径行为。

### 工具与副作用

judge 只发 HTTP POST；默认 judge 意图由 `GRAPH_JUDGE_ENFORCE=1` 开启，每个合同一次调用；超时 60s、diff 截断 20k。

### 结果与证据

`VerificationRecord.results.judge` 记录 model/status/score/reason；服务日志 `judge enabled`；真实探针输出 score/reasoning。

### 异常与恢复

端点不可达/超时/坏 JSON/缺 key → pending，不阻断 overall；关闭 judge 只需删/改 `GRAPH_JUDGE_ENFORCE=0` 或移除 env 后重启服务。

### 验收反例

OpenAI 协议不应被 anthropic 配置误用；缺 key 不应发请求；thinking 块不应被当 JSON 解析；`/v1` 结尾不应拼成 `/v1/v1/messages`。

## 决策记录

### D1 双协议而非替换

保留 OpenAI 路径（其他部署可用），新增 Anthropic 路径；由 `GRAPH_JUDGE_PROTOCOL` 显式选择，不做自动探测。理由：协议差异明确，自动探测会引入不确定性。

### D2 Anthropic key 回退序

`GRAPH_JUDGE_API_KEY > ANTHROPIC_AUTH_TOKEN > ANTHROPIC_API_KEY`。理由：judge 专用 key 优先；复用宿主已有 Anthropic 凭据时不必复制密钥。

### D3 服务启动只加载 `GRAPH_JUDGE_*` 白名单

`serve-server.mjs` 从 `$HERMES_HOME/.env` 只读 `API_SERVER_KEY` 与 `GRAPH_JUDGE_*`，不把整份 env 注入进程。理由：避免无关密钥进入服务进程；已存在的 shell env 优先。

### D4 本机 `GRAPH_JUDGE_ENFORCE=1`

本机已配置可用代理，默认给无 judge 意图的合同注入 defaultJudge；其他部署不设该 env 则保持关闭。理由：不把本机 localhost 配置写进版本库。

## 验证

```sh
npx vitest run custom/server/loop/graph/__tests__/judge-client.test.ts \
  custom/server/loop/graph/__tests__/verifier-bridge.test.ts
npm run typecheck:harness
# 真实探针（token 来自宿主 profile .env，不落库）
JUDGE_TOKEN=<token> npx tsx /tmp/judge-probe.ts
```

结果：17 passed；typecheck 通过；真实探针 `{"score":1,"reasoning":"..."}`；服务日志 `judge enabled (protocol=anthropic, model=glm-5.3, defaultIntent=true)`。

未覆盖：真实 loop 合同端到端（需起一轮 loop 并产生 validation 节点）；judge 误判率/成本评估。

## 设计文档影响

DESIGN_SYNC: none

理由：新增 judge 协议分支与 env 加载白名单，不触及整合正本、数字总账或架构图；配置口径以本 spec 与 `judge-client.ts` 头注释为单一事实源。
