# Detection 手册：CSRF（跨站请求伪造 × LLM 应用特化）

> 模式参照 GCP reference-harness（github.com/GoogleCloudPlatform/reference-harness，repo 创建 2026-08-05，Apache-2.0，仅 3 commits——**借「一漏洞类一 md + 按需装载」模式，不依赖其代码**）。
> RoE：本手册全部测试仅在 `scope-gate` 授权门内执行；破坏性状态变更只在 staging。

## 适用目标

- 会话凭证走 Cookie（而非 Authorization header）的 LLM Web 应用 / agentic 控制台
- 计费型端点：充值、订阅变更、token 包购买、批量推理任务提交
- SSE/streaming 补全端点（`/v1/chat/completions` 的 GET 变体或 `text/event-stream`）
- agentic 平台的「批准/驳回」审批端点（CSRF 伪造审批 = LLM06 审批关卡绕过的传送门）

## LLM 应用的 CSRF 特殊形态

1. **烧额度即伤害**：一次 CSRF 触发批量付费推理调用，不需要泄露任何数据——直接命中 LLM10 Unbounded Consumption。判定「影响」时按实际计费金额计。
2. **审批劫持**：agentic 平台的人工审批（approve/deny）若为简单 POST 且无 CSRF 防护，攻击页面可在管理员浏览恶意页期间自动「批准」待审高危动作。
3. **模型/工具配置变更**：改默认模型、挂载 MCP server、改 system prompt 的端点若可被跨站触发，等于远程改写目标行为。

## 测试矩阵

| # | 测试项 | 请求特征 | 预期防控行为 |
|---|--------|----------|--------------|
| C1 | 无 Origin/Referer 的状态变更 POST | 剥掉两个头 | 拒绝或降级 |
| C2 | 伪造 Origin（攻击者域） | `Origin: https://evil.example` | 拒绝 |
| C3 | 跨域 JSON POST + `Content-Type: text/plain`（no-cors 表单可发） | 绕 preflight 的形式 | 服务端不得按 JSON 解析执行 |
| C4 | GET 触发状态变更 | 把状态变更端点改 GET | 方法不允许 |
| C5 | Cookie SameSite 属性 | 检查 Set-Cookie | `Lax`/`Strict`；`None` 必须配 Secure |
| C6 | CSRF token 绑定 | 跨会话重放 token / 换用户 token | 拒绝（token 须绑定会话） |
| C7 | SSE 端点跨域读 | `EventSource` 跨域拉流 | CORS 显式白名单，不是 `*` + credentials |

## 命令示例

```bash
# C2：伪造 Origin 的审批端点探测（金丝雀目标，授权范围内）
curl -ksS -X POST 'https://target.example/api/agent/approve' \
  -H 'Origin: https://evil.example' \
  -H 'Content-Type: application/json' \
  -b 'session=TESTUSER' \
  -d '{"request_id":"canary-req-001","decision":"approve"}' -o resp.json -w '%{http_code}\n'

# C6：token 跨会话重放——A 会话的 token 配 B 会话的 cookie
curl -ksS -X POST 'https://target.example/api/billing/purchase' \
  -H "X-CSRF-Token: $TOKEN_FROM_SESSION_A" -b 'session=SESSION_B' \
  -H 'Content-Type: application/json' -d '{"plan":"enterprise"}' -w '%{http_code}\n'
```

## 判定标准（对齐 Detection_Mode 三分法）

- **Confirmed（Reflective/OOB）**：C2-C6 任一在无同站上下文的情况下完成状态变更（响应或后台记录可证：余额变化、审批记录、配置 diff）。
- **Probable（Blind）**：仅时延/行为差异推断；审批与计费类必须升级到 Reflective/OOB 才可定级。
- 烧额度型 CSRF 的严重度按「单次请求可触发的最大计费额 × 可重复性」计，不按数据敏感度计。

## 证据要求

- 完整请求/响应对（含全部头）+ 金丝雀账号计费前后快照或审批流水截图名；
- C5 记录原始 `Set-Cookie` 串原文；
- 报告 `attack_chain.final_state_change` 必须写实际状态变更（如 `billing_balance -=$X`）。

## 常见误报（fp-check 对接）

- **CORS 宽松 ≠ CSRF 可利用**：`Access-Control-Allow-Origin: *` 且不带 credentials 时，浏览器跨站请求不带 Cookie——需确认凭证实际随行才成立。
- preflight 拦截了 `fetch` 不等于拦截表单：`text/plain`/`application/x-www-form-urlencoded` 不触发 preflight（C3 正是为此保留）。
- 同站子域发起 ≠ 跨站：先确认站点注册表（eTLD+1）再定性。

## 框架映射

OWASP LLM05（输出处理不当→请求伪造链）/ LLM06（审批关卡绕过）/ LLM10（额度消耗）；通用侧 OWASP Top 10 A01:2021 Broken Access Control 家族；agentic 清单 Framework_Mapping 按 `AI-xxx` 切片（v1.5 节口径，LLM 前缀锚 2025 版，报告期引用 2026 版名称）。
