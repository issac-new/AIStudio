---
name: weixin-complaint-triage
description: "WeChat 'reply failed' complaint: triage by errors.log first."
tags: [weixin, wechat, gateway, triage, errors-log, reply-generation]
---

# Weixin 投诉分诊：先分层，再动手

> 边界声明：send 侧机制（iLink errcode 判定、session timeout、home channel）与
> gateway 重启全流程以 default profile 的 `weixin-send-troubleshooting` 和
> `hermes-gateway-operations` 为权威源；本件只补 orchestrator 域高频的
> 「用户报错 → 分层归因 → 修复后验证」分诊机制，与原件互补不复制。

## When to Use

- 微信用户报告 `Something went wrong and I couldn't finish this reply`
- 用户侧报错但不确定是通道坏了还是回复生成失败
- gateway 重启后要判断「真的好了吗」

## 规则 1：统一报错话术不标识层，先查 errors.log 签名

「Something went wrong…」是 Hermes 对**任何失败回合**的统一包装，不代表微信通道问题。
动手前先按 `logs/errors.log` 签名分层：

| errors.log 签名 | 层 | 修复路径 |
|----------|-------|-----|
| 每条入站消息同一个 ImportError，且全指向同一 import 点 | 网关进程陈旧（主仓代码更新后未重启；磁盘代码是好的） | `hermes-gateway-operations` 惰性导入节：worker 空窗 kickstart 重启 |
| `HTTP 429` / `RateLimitError` 成簇 | 上游 LLM 供应商（cc-switch 级） | `cc-switch-failover-ops`；偶发重试即过，不是通道问题 |
| traceback 落在 `gateway/platforms/weixin.py` 内 | 才是真的通道层 | `weixin-send-troubleshooting` §1–§3 |

## 规则 2：三个分诊判据

- **先证明通道无辜再动通道**：新解释器 `python3 -c "import <出错模块>"` 干净通过、
  而网关仍每消息报错 → 磁盘自洽、进程陈旧 → 重启，禁改文件。
- **下「代码 bug」结论前先比进程年龄**：`ps -p $(lsof -tiTCP:8650 -sTCP:LISTEN) -o lstart`——
  进程启动时间早于相关文件 mtime = 跑的是旧代码，磁盘说什么不算数（惰性导入撞上
  sys.modules 里的旧模块缓存）。
- **同窗多症状分开归因**：上游 429 噪声与真实的每消息崩溃常同现。按投诉时间窗分别
  计数各签名、按「与入站消息的相关性」排主因，否则会修了更吵的那层、投诉照旧。

## 规则 3：重启后健康判据只认两条

- 8650 恢复 LISTEN（`lsof -iTCP:8650 -sTCP:LISTEN`）
- gateway.log 出现 `✓ weixin connected (profile: …)`

**勿把 multiplex 凭据告警墙当启动失败**：multiplex 网关启动日志会刷几十条
「Profile 'X' and 'Y' both configure weixin with the same credential — refusing to start
the duplicate」ERROR——每个共享凭据的停靠 profile 一条，属既有配置告警，与本次故障无关。
有墙 ≠ 失败；没墙也不证明连接成功。errors.log 重启后无新增目标签名才是最终验收。

## Related Skills

- `weixin-send-troubleshooting`（default）— send 侧 errcode 判定权威源
- `hermes-gateway-operations`（default）— 重启时序门控、惰性导入陷阱、launchd 操作
- `cc-switch-failover-ops` — 上游 429/503 分流
- `orchestrator-profile-skill-writeback` — 本件存在的原因与回写边界
