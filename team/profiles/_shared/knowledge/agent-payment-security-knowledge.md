# Agent 支付安全知识（三层防护框架）

> 来源：`research/aipay-04-academic-opensource.md`（aipay 学术/开源调研 04 号报告，§五 结论 4 条 + §二 防护设计模式，2026-08-25 沉淀）。
> 用途：pay 域（pay-fintech / pay-infra / pay-clearing / pay-orchestrator）共享的 agent 支付安全设计速查。
> 时效：截至 2026-08（学术侧 arXiv 2604/2602/2511 系列）；引用具体协议/论文编号时以原报告 URL 为准。

## 〇、核心威胁共识（为什么要有三层）

prompt injection 攻击的是**推理层**，而现有协议（AP2/x402/MPP 等）保护的是**执行层**——
「密码学合法的恶意图」是当前所有 mandate 类协议的盲区：注入操纵推理层即可产出
「签名合法、意图虚假」的交易（间接注入操纵排序 100% 成功）。
因此防护必须**三层叠加**，缺一不可：

## 一、意图层（Intent Layer）

- **mandate 三段式签名授权**：Intent / Cart / Payment Mandate（open/closed 两阶段），
  授权范围与金额上限在签名层固化。
- **可信面确认（Trusted Surface）**：人类在场确认走独立可信 UI 面，**不走 agent 推理链**——
  防止确认环节本身被注入污染。
- **mandate 只证明授权，不证明推理正确**（arXiv:2511.03434 批评）：上游 agent 的推理幻觉
  必须由独立约束层兜底，不能指望 mandate 自证。

## 二、运行时层（Runtime Layer）

- **逐调用 PDP/PEP**（而非能力门）：scope + authorization + **money ceiling** + idempotency + default deny。
  能力门 ≠ 授权——LangChain/Stripe Agent Toolkit 默认不对带参 tool call 做逐次再授权是已知缺口。
- **consume-once**（防重放）+ **上下文绑定**（防挪用）：原子 nonce registry + 商户/收款方/参数/身份绑定，
  两者互补缺一不可（ZTRV，arXiv:2602.06345）。即使授权合法，重放/并发/跨上下文重定向可致
  mandate 被重复消费——「misuse under valid authorization」。
- **金额上限 + 幂等**：money ceiling 进入逐调用 PEP，idempotency-key 防重复扣款。

## 三、身份层（Identity Layer）

- **DID + VC**：agent 身份与 agent↔客户关系可验证声明。
- **TEE attestation**：agent 推理与执行完整性证明（arXiv:2511.15712 链上 intent proof + TEE）。
- **信任模型**：Proof+Stake 门控高影响动作，Reputation 仅作柔性叠加不作依据（arXiv:2511.03434）。

## 四、agent 钱包资金隔离原则（最后防线）

- **低余额 + 日上限 + JIT 充值**：agent 专用钱包保持低余额，设日累计上限，按需即时充值（just-in-time）。
- 资金隔离是最后防线：即使前三层全被突破，低余额+日上限确保损失可控。
- 参考：京东专用账户、微信 AI 专属卡、OmniClaw 预算引擎。

## 五、给自建 agent 支付的直接启示（三角验证 ≥2 来源）

1. agent 钱包必须**低余额 + 日上限 + JIT 充值**。
2. **逐调用 PDP**，而非能力门（capability gate）。
3. mandate 消费必须 **consume-once + 绑定收款方上下文**。
4. 人类在场确认走**可信 UI 面（Trusted Surface）**，不走 agent 推理链。

## 参考（URL 见原报告）

- AP2 规范：https://ap2-protocol.org/ap2/specification/
- SoK Agentic Commerce 安全（arXiv:2604.15367）
- ZTRV 零信任运行时验证（arXiv:2602.06345）
- ScopeGate 能力门≠授权（arXiv:2606.28679）
- DID/VC/TEE 身份（arXiv:2511.15712）
- 信任模型比较（arXiv:2511.03434）
