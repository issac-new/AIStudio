# DeepSeek Harness rc.8 可移植模式知识库（2026-08-20 调研提炼）

> 来源：`deepseek-ai/deepseek-harness` v0.1.0-rc.8（commit `141eb6f`，Stars 169,923）。
> 完整证据：`~/hermes-docker-sandbox/workspace/research/dsh-rc8-*.md`（4 份子报告，file:line 经独立抽查验证）+ `hermes-baseline.md` + `dsh-rc8-optimization-mapping.md`（落地状态）。
> 本地 clone：`~/hermes-docker-sandbox/workspace/research/deepseek-harness`（depth 1，master）。

## 四条可移植机制（file:line 已验证）

### 1. Profile Bundle 子代理 + 权限分级（rc.8）
- Bundle = npm 包 + `dsh.bundle.patch` 字段 + `cordis.patch.yml`；子代理是 dormant provider，模型调用工具时才 spawn 真实 CLI。
- **「安装 ≠ 授权」**：Bundle 管 provider 是否存在，Agent Preset（每会话组合）管模型能否看到工具——两层分离。
- 权限 5 级：`dontAsk/acceptEdits/auto/plan/bypassPermissions`，默认 `dontAsk`（`packages/subagent/subagent-claude-code/src/run.ts:43-55`）。
- 迁移：ACP provider 的「可用」与「对某 worker 可见」可按角色分级配置，非二选一硬编码。

### 2. reportDelivery 唤醒父任务（rc.8，最高价值）
- `reportDelivery = 'quiet'|'next-step'` 是 report 工具的部署配置，非事件名（`packages/subagent/subagent/src/continuation.ts:101`）。
- **report 与 turn 结束解耦**：子代理在「部分发现会改变父下一步」时就 report，不等任务结束。
- 唤醒 = 消息投递 + 驱动器唤醒：`steer() = send(msg,'next-step',wakeup=true)`（`packages/core/agent-loop/src/agent.ts:113-132`）；父运行中多个子代理报告在 step 边界批量领取，只花父一个 step。
- **dsh 依赖同进程 inbox；Hermes ACP 子代理是外部进程（claude/codex CLI）跨进程**——落地需跨进程上报协议（已立项 t_d7a01b96 派 worker-coder）。

### 3. web_search 单工具内并发（rc.8）
- 模型一次 tool call 传 `queries: string[]`（`packages/web/tool-web/src/search.ts:26-28`）；Consumer 层 `Promise.allSettled` + `AbortSignal.any` 失败即取消兄弟 + maxQueries 封顶 + round-robin 去重聚合（`search.ts:232-294`）；provider 无感知。
- 迁移：Hermes 零代码等价——`delegate_task` 并行子代理（已落地 worker-researcher SOUL「并发调研」节）；不改 `web_search_tool` 签名（防 tool schema/prompt caching 破坏）。

### 4. 推理强度三层级联 + 目的驱动降级（rc.7）
- 层级：适配器默认（per-plugin config）→ 模型能力广告（`efforts[]`/`defaultEffort`）→ 请求级覆盖；优先级 请求级 > 适配器默认 > 硬编码 high。
- **目的驱动降级**：`purpose === 'session-title'` 时强制 `thinking: disabled`（`packages/llm/llm-deepseek/src/serialize.ts:57`）——非核心任务自动降级。
- 防成本漂移：会话级强度是记录在 session log 的 per-conversation 状态，非可悄悄改的 per-call knob。
- 迁移：Hermes 等价物 = `auxiliary.<task>.reasoning_effort`（`agent/auxiliary_client.py:8257`，折叠进 `extra_body.reasoning`）——按任务类型分级，非静态降 profile 主对话强度。

## 落地状态（2026-08-20）
- 机制 4 ✅ 已落地（orchestrator + [已移除]-orchestrator 两 profile；title=low、4×medium、vision=high；主对话 ultra 保留）。
- 机制 3 ✅ 已落地（零代码，worker-researcher SOUL）。
- 机制 2 🔄 派单 worker-coder（t_d7a01b96，跨进程上报协议设计+实现）。
- 机制 1 暂缓（需配置结构设计）。
- Cordis 核心理论 rc.8 无大改，演进全在应用层——已吸收部分（swarm-yuan cordis-composability-methodology.md）无需重做。

## 关键教训
- **静态降档 ≠ dsh 精髓**：dsh 是 per-request 按目的动态降级；图爸否决了静态降 profile 强度（GLM 走代理无硬配额，ultra 换质量值得）。
- **零代码等价优先**：能复用现有能力（delegate_task 并行、auxiliary 分级）就不改工具签名/协议。
