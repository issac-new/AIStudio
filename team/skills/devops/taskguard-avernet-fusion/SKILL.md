---
name: taskguard-avernet-fusion
description: "Use when 部署/升级/排障 Avernet taskguard 工作流引擎或接 YAML DAG 工作流."
version: 1.0.0
platforms: [macos]
metadata:
  hermes:
    tags: [devops, workflow-engine, avernet, mcp, skill-fusion]
    related_skills: [open-source-skill-fusion-v2, native-mcp, orchestrator-cli-reference]
---

# taskguard (Avernet) 工作流引擎融合运维

> 2026-09-20 首次融合落地。taskguard = 蚂蚁 Avernet 开源的 YAML DAG 工作流引擎
> （`@avernet/taskguard`），原生多平台适配（OpenClaw/Claude Code/**Hermes**/TeClaw），
> MCP Server 形态暴露 13 个 `workflow_*` 工具。

## 本机部署事实（单一事实源）

| 项 | 值 |
|---|---|
| 正本 | `~/.hermes/services/taskguard/`（源码+dist 全量） |
| MCP 入口 | `dist/esm/platform/mcp-entry.js`（stdio；SSE 变体 hermes-entry.js 未用） |
| 持久化 | sqlite `~/.taskguard/workflow/engine.db`（config: `configs/application.yaml` → `database.mode: sqlite`，`api.enabled: false`，内网端点已清零） |
| config 双拷贝 | 改 `configs/application.yaml` 后必须 `cp` 到 `dist/esm/configs/`（运行时 walk-up 只找到 dist 份） |
| LLM env | `LLM_BASE_URL=http://127.0.0.1:15721`（cc-switch）、`LLM_API_KEY`、`LLM_MODEL=aim`；embedded-agent 亦可走 MCP sampling 借宿主模型 |
| 内置并发闸 | `llm.maxConcurrentCalls: 3` 全局 FIFO 信号量（防 429 雪崩，与统一夜间 Loop 治理同构） |
| orchestrator 接线 | profile config.yaml `mcp_servers.taskguard` 段（guard 禁 agent 直改，用户手工维护） |

## 常用命令（copy-paste 可执行）

```bash
# 升级部署（从 GitHub tarball 重建）
cd /tmp && curl -sL -o avernet.tar.gz https://codeload.github.com/inclusionAI/Avernet/tar.gz/refs/heads/dev \
  && tar xzf avernet.tar.gz Avernet-dev/src/evolverun/taskguard \
  && rsync -a --exclude node_modules /tmp/Avernet-dev/src/evolverun/taskguard/ ~/.hermes/services/taskguard/ \
  && cd ~/.hermes/services/taskguard && npm install --include=dev --no-audit --no-fund && npm run build
# 升级后三件事：核对 configs diff（勿丢 sqlite 补丁）、核对 run-log-repository.ts 的 ?? null 补丁是否被冲掉、grep 内网端点残留

cd ~/.hermes/services/taskguard
# 冒烟：13 工具可发现（脚本在 references/smoke-mcp.mjs）
node ~/.hermes/profiles/orchestrator/skills/devops/taskguard-avernet-fusion/references/smoke-mcp.mjs
# 构建产物
npm run build            # tshy + bundle + facade skills + assets
# 本机补丁重放（升级后 diff 检查）
grep -n '?? null' src/db/repositories/run-log-repository.ts
```

MCP 工具面（注册名 `mcp_taskguard_*`）：`workflow_engine_dispatch`（总入口，子命令 list/detail/runs/run/inspect/resume/validate/deploy/pull/install-pack…）、`workflow_list/inspect/state/runs/recent_events/confirm/reject/retry/validate/help/debug_segment/submit_phase_result`。

## 运行语义（源码实证，勿按 README 想当然）

- **TaskFlow 运行态是进程内 Map**（`database-taskflow.ts` in-memory mode）：MCP/stdio 形态下流程运行状态**不跨进程重启**；sqlite 只存 run_logs 归档/facade bindings/workflow specs。要跨重启断点续跑需 API 模式（clawweb 端点，本机无）。
- **节点执行双通道**：embedded-agent 优先 Claude Agent SDK（自动探测 `@anthropic-ai/claude-agent-sdk`），env 配了 `LLM_BASE_URL` 时走 OpenAI 兼容 API；MCP 宿主下 sampling 兜底。
- **outputContract**：节点间 JSON schema 强契约（`required`+`schema`），不满足节点失败可 retry——微信文章说「输出契约未落地」指的是 BCS 内置工作流，taskguard 已实现，两别混。
- **pack 结构**：`packs/<id>/workflow.pack.yaml`（manifest+facades）+ `workflows/*.yaml`（DAG：phase/dependsOn/executor/outputContract）；facade 生成 slash 命令 skill。

## 已知坑

1. **run_logs insertBatch 崩**：上游 bug——`RunLogInsert.node_id/source/seq` 可为 undefined，node:sqlite 拒绑 undefined。本机已 patch `run-log-repository.ts`（`?? null`/`?? 0`），升级会被冲掉需重放（grep 判据见上）。
2. **config 双拷贝**：只改 configs/ 不 cp 到 dist/esm/configs/ = 改了个寂寞（运行时找不到，仍用旧值）。
3. **默认 application.yaml 是 API 模式指向蚂蚁内网**：任何重装/升级后必须先验 `database.mode: sqlite` + `api.enabled: false` + 零 `inner.avernet` 残留再启动。
4. **npm install 默认不含 dev**：tshy 不在 dependencies，`npm install` 后 `npm run build` 报 `tshy: command not found`——必须 `--include=dev`。
5. **flows 按 sessionKey 隔离**：inspect 跨 session 自动 fallback，但 `runs` 只看本 session；e2e 验收时 run/inspect 用同一 sessionKey。

## 融合裁决存档（2026-09-20，防重复评估）

KEEP→部署：taskguard MCP Server/13 工具/YAML DAG/outputContract/Hermes 适配。吸收语义（不改码）：llm-semaphore 并发闸→夜间 Loop 参数互证；subagent-fallback 降级→delegation 纪律。DROP：BCS/BCN 组网（Rust 协调网络，单人集群无需求）、AgentEvolve（evals baseline 已覆盖）、BaaS/backend/frontend（重复 Hermes 基础设施）、Avernet→Hermes 服务构建适配器（反向集成不适用）。
