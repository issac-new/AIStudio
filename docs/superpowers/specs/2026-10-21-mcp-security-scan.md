# MCP 注册面安全扫描（高危命令形态 / env 内嵌密钥 / 远程外联面 / 仿名）（2026-10-21）

> 来源：微软 AGT 的 MCP Security Gateway 四件套（工具投毒/配置漂移/typosquatting/
> 隐藏指令）。并行会话（AGT 吸收轮 D）已落「配置漂移」（名单级 added/removed/
> changed），并明示语义档不做。本件补**注册面风险形态扫描**——对真实数据面
> `~/.hermes/profiles/*/config.yaml` 的 `mcp_servers`（command/args/env/url，
> 50 profile 实测在案）做确定性检查，仍不做语义判读。

## 检查项（全部形态级，可解释）

| 严重级 | kind | 判定 | 说明 |
|---|---|---|---|
| high | dangerous-command | `curl/wget … \| sh`、`rm -rf /`、`base64 -d … \| sh`、`nc -e`、`python -c import socket` | 下载即执行/远控形态 |
| high | embedded-secret | env **值**形似 sk-/ghp_/github_pat_/AKIA/xox?-/私钥头/JWT 头 | 只报键名+类别，不回显值（AGT「密钥只存 env 名」纪律的审计面） |
| medium | remote-url | url 为 http(s) 且 host 非 loopback/*.local | 数据外联面清单 |
| medium | typosquat | 与高频连接器名（≥3 profile 在用）或内置名单编辑距离=1 | 仿名供给面 |
| low | suspicious-path | command 相对路径 / /tmp / Downloads | 来源不明的执行体 |

聚合：同 (kind, server, detail) 跨 profile 合并，profiles 列表最多展示 5 个。

## 决策记录

| # | 决策 | 理由 |
|---|---|---|
| D1 | 只读扫描，不阻断、不自动处置 | 巡检纪律（对齐 clusterinspector/mcp-drift）；执法阻断属策略引擎职权 |
| D2 | 敏感值零回显：embedded-secret 只落键名与形态类别 | 审计不落敏感原值纪律 |
| D3 | typosquat 基线=频次自举（≥3 profile 在用的名字）∪ 内置常见名 | optional-mcps/manifest.yaml 是注入路由目录非本地目录；频次自举无外部依赖且贴合「这台机器的真实常态」 |
| D4 | 挂治理姿态页（GovPostureView，与并行会话 PostureSection/EmergencyStopSection 同页） | 安全扫描与姿态对账同域；不新开页面 |
| D5 | REST 走 governance-controller 既有挂载（GET /api/governance/mcp-security-scan） | 零新 patch |
| D6 | 采集层 YAML 解析 fail-soft 逐 profile 计入 problems | 坏一个 profile 不拖垮整面 |

## 变更清单

- 新增 `custom/server/mcpcatalog/mcp-security-scan.ts`（采集 + 纯扫描）。
- 新增 `custom/server/governance/__tests__/mcp-security-scan.test.ts`（纯函数 + REST）。
- 改 `custom/server/governance/governance-controller.ts`：扫描端点。
- 新增 `custom/client/governance/api` 复用 governance.ts？不——新增 `mcpSecurity.ts` + `components/McpSecuritySection.vue`；`i18n.ts` 增 `mcpSecurity` 词条（中英成对）。
- 改 `custom/client/ia2/views/gov/GovPostureView.vue`：挂载扫描面板。
- 改 `package.json`：typecheck:harness 纳入新模块。
- 新增组件测试 `custom/client/governance/__tests__/mcp-security-section.test.ts`。

## 边界（本轮不做）

- 工具描述/隐藏指令的语义扫描（需 MCP 工具级元数据通道，另立轮）。
- 拦截/自动卸载（只报不处置）。
- 与 mcp-drift 基线联动（两件互补：漂移管「变了」，本件管「本身危险」）。

## 验证

- `npx vitest run custom/server/governance/__tests__/mcp-security-scan.test.ts custom/client/governance/__tests__/mcp-security-section.test.ts`：10/10
  （纯扫描 6 例 + REST 真 fixture 1 例 + 组件 3 例）。
- 受影响套件（mcpcatalog / tool-policy-routes / governance 客户端 / governance-view）：52/52。
- `npm run typecheck:harness`：零错误（mcp-security-scan.ts 已入清单）。
- `npm test` 全量：5682 通过 / 1 失败——唯一失败为 `unified-nav-guard.test.ts`
  v12.4 窗控守门（54691bea 的源/测漂移，sequence-guard 轮已 stash 证伪与本线无关）；
  上轮同时失败的 zcode 真库探针本轮通过（活体数据面波动）。
