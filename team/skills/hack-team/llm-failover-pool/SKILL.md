---
name: llm-failover-pool
description: "Use when building or reviewing runtime LLM provider failover for harnesses — reference implementation of homogeneous priority-chain + equal-rank rotation + 4xx/5xx circuit breaker, ARTEX llmpool style. Reference implementation: runs against user-supplied stub endpoints in tests, never against real providers."
version: "1.0.0"
author: "platform-skill-miner (R2 staged proposal)"
license: "internal"
metadata:
  hermes:
    tags: [auditor, failover, circuit-breaker, llmpool, reference-impl, artex]
    source: "ARTEX llmpool/pool.go:82-208 (T1§7); T4 合并报告矩阵#4; 对照夜间 ZCode 单通道定时切换"
    target_profile: hack-auditor
    staged: true
    staged_note: "已由 orchestrator 人审批准 mark-active，1.0.0 激活生效（2026-10-13，裁决：全部激活）"
---

# LLM Failover Pool — 运行时故障转移/熔断参考实现

> 对照 ARTEX llmpool（`llmpool/pool.go:82-208`）：同构故障转移 + 等优先级轮转 + 402/401/429/5xx 熔断切换。本集群现状 = cc-switch 静态路由 + zcode/claude 定时单通道切换（无运行时 failover）。本技能交付**纯标准库参考实现 + 测试 harness**：验收测试只打本地 stub HTTP server，不接任何真实 provider。

## 何时用（触发条件）

- 审计/评审某个 harness 的 LLM 路由层是否具备运行时 failover（而非定时单通道切换）
- 给 cc-switch 或新 harness 设计 failover 层时需要一个可裁剪的语义基准
- 编写 failover 单元测试时需要 stub provider 的行为模拟

## 语义规格（与 ARTEX llmpool 对齐）

| 语义 | 规则 |
|---|---|
| 同构优先级链 | provider 列表按优先级排序；同优先级构成一个 rank |
| 选择策略 | rank 内等秩轮转（round-robin）；首选失败才下沉到下一 rank |
| 熔断切换 | 遇 402/401/429/5xx（可配置集合）→ 当前 provider 熔断 `cooldown_s` 秒，期间切同 rank 下一 provider |
| 半开试探 | cooldown 到期后放行一次试探请求；成功则关闭熔断，失败重新计时 |
| 全池熔断 | 全部 provider 熔断中 → `PoolExhausted`（fail-closed，不静默降级到无凭据通道） |

## 标准步骤

1. 读参考实现 `scripts/llmpool_ref.py`（~150 行，stdlib only：urllib + threading + time）
2. 按你的 harness 裁剪：保留 `Pool.next_provider()` / `Pool.report_result()` 接口契约
3. 跑测试 harness：`python3 scripts/accept_llm_failover_pool.py`（mktemp 起 2 个本地 stub，验证熔断/轮转/半开/全池耗尽四个场景）
4. 评审 checklist：
   - [ ] 失败状态码集合可配置（不硬编码 429）
   - [ ] cooldown 半开后成功会关闭熔断（不会永久粘滞）
   - [ ] 全池熔断抛异常而非返回 None（fail-closed）
   - [ ] 无全局可变状态（线程安全：熔断表按 provider 实例隔离）

## 陷阱

- 把 429 当重试信号原地 backoff → 单 provider 粘死。本实现 429 触发**切换**而非等待
- cooldown 用全局时钟 → 测试不可控。`Pool(clock=...)` 注入时钟
- 半开试探风暴 → 半开期只允许单并发试探，其余请求仍切其他 provider
- 参考实现是语义基准不是生产组件：接入真实 harness 前需补鉴权头管理/流式响应处理

## 验收命令（copy-paste，实跑 exit=0）

```bash
python3 ~/.hermes/skills/hack-team/llm-failover-pool/scripts/accept_llm_failover_pool.py
# 预期输出末行：ALL GREEN llm-failover-pool acceptance exit=0
# 4 个场景验证（全部本地 stub HTTP server，零外网）：
#   T1 首选 429 → 熔断并切下一 provider（轮转）
#   T2 cooldown 到期半开试探成功 → 熔断关闭
#   T3 全池熔断 → PoolExhausted 异常（fail-closed）
#   T4 同 rank 等秩轮转（无失败时按 round-robin 分配）
```

## Exercised 记录

- 2026-10-13 本卡实跑 `accept_llm_failover_pool.py`（mktemp + 本地 stub server）：ALL GREEN exit=0。
- 真实拦截 1（T1）：首选 stub 持续 429 → 熔断触发，请求切到次选 stub。
- 真实拦截 2（T3）：双 stub 均熔断 → `PoolExhausted` 异常（fail-closed，未静默放行）。
- 真实命中 3（T2/T4）：半开试探成功恢复 + 等秩 round-robin 分配与预期序列一致。

## 与既有机制关系

- 上游对照 `provider-fallback-chain-management`（静态路由视角）；本技能补运行时动态 failover 语义
- 评审对象：cc-switch 定时切换 / acp-provider-free-window-routing（夜间免费窗）——本技能解释两者为何都是「调度层切换」而非「运行时 failover」

## staged 状态

⚠️ **staged 提案态，未激活**：待晨报呈现 + mark-active 三关人审。请勿在未获批前作为既定流程引用。
