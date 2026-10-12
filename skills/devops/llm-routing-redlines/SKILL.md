---
name: llm-routing-redlines
description: 写任何调 LLM 的脚本/管道前必查：统一走 cc-switch，通道捆绑优惠走通道协议，排活先分清三个时间钟。
version: 1.0.0
metadata:
  hermes:
    tags: [llm-routing, cc-switch, redline, orchestrator]
---

# LLM 调用路由红线（orchestrator 侧执行面）

> 用户红线级纪律（非建议）。机制全景与审计方法权威源在 default 侧：`llm-usage-cost-audit`（审计顺序/计费口径/浪费判定）、`acp-provider-free-window-routing`（免费窗验证协议）——本 skill 只存 orchestrator 写脚本/排活时直接要用的红线，不复制其内容。

## When to Use

- 写/改任何会调 LLM 的脚本（标注、批量回溯、cron 管道、子代理任务书）
- 给「免费/优惠通道」排活或写等待重试逻辑
- 验收他人交付的含 LLM 调用的脚本

## 红线（违反即返工，无豁免）

1. **统一出口**：脚本内 LLM 调用一律走 cc-switch（`http://127.0.0.1:15721`，OpenAI/Anthropic 兼容端点），不得读供应商 key（`~/.zcode`、`~/.bigmodel` 等）直连 vendor API。机制：直连绕过计量/熔断/审计三层，且在免费通道存在时仍烧计费配额——脚本里出现「读 key 文件 + vendor 域名 base_url」即判路由缺陷，修复而非沿用。
2. **通道捆绑优惠走通道协议**：zcode 官方免费窗（夜间活动窗）的优惠只在 `acp_send(provider="zcode")` 通道生效；拿同一 vendor 的 API key 直调**不继承优惠**（照常烧计费配额）。要享通道优惠必须换调用面（ACP 协议），不是换 key。
3. **三个时间钟分开对表**：供应商配额重置时刻（报错里的「限额 HH:MM 重置」）/ 供应商促销免费窗（活动日历）/ 本地授权作业窗（用户裁决的夜间窗口）是三个独立时钟。排任何「等窗口」的活先声明对的是哪个钟——把配额重置时刻当免费窗边界，会白烧掉免费窗本已覆盖的一晚。

## 验收脚本时的检查点

- grep 脚本 `base_url|api_key|openai|anthropic`：命中 vendor 域名或 key 文件路径 → 打回改 cc-switch
- 免费窗作业：确认调用面是通道协议（acp_send）而非 key 直调
- 重试/等待逻辑：确认等待条件绑定的是正确的钟
