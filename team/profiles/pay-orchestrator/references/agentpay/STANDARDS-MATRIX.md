# Agentic 支付标准跟踪矩阵（条款级 + 双周更新）

> 目的：对 x402 / FIDO / AP2（身份委托）/ 相关协议标准做**版本与条款级**持续跟踪，双周更新，并把每条标准条款映射到本集群系统约束（三层防护/合规引擎），标注对系统接口的影响。
> 建线：2026-10-09（gap-20260927-013，kanban t_113b7ff5）｜上游：`TRACKER.md` 事件线（48h SLA）——本矩阵是版本/条款维度，事件线是发布事件维度，互不重复
> 口径纪律：标准版本号与条款以**官方仓库/官方规范页**为第一锚点，媒体转述仅作旁证；与 `known-conflicts.md` 裁决冲突时以裁决为准
> markings: TLP:GREEN/CLEAR
> owner：pay-fintech（矩阵维护+条款评估）／pay-orchestrator（双周检查排程路由）

---

## 一、标准总览矩阵（9 条）

| # | 标准 | 治理方 | 当前版本/状态 | 版本节奏（观察） | 官方一手锚点 | 纳入理由 |
|---|------|--------|--------------|----------------|-------------|---------|
| S1 | x402 协议规范 | x402 Foundation（LF Projects, LLC Series） | **v2.0**（spec Version History 落款 2025-12-09）；v2 发布文更新至 2026-06-24 | 大版本约半年级（v0.1 2025-08 → v0.2 2025-10 → v2.0 2025-12），扩展经 extensions 免改 spec | spec：https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md ；发布文：https://x402.org/x402-v2-launch/ | HTTP 402 互联网原生支付事实标准，agent 结算层主候选 |
| S2 | x402 Foundation 治理 | Linux Foundation | 运营启动 2026-07-14；40 组织（17 Premier/18 General/5 Associate）；TSC 3 人（Coinbase Reppel/Cloudflare Lohe/Stripe Kaliski） | TSC 多数表决扩员；核心原则变更需 ≥75% | https://linuxfoundation.org/press/linux-foundation-announces-operational-launch-of-x402-foundation-to-standardize-internet-native-payments-for-ai-agents-and-applications | 治理归属决定规范中立性，卡组织已入桌（Visa/MC/Amex/Stripe/AWS/Google） |
| S3 | AP2（Agent Payments Protocol） | FIDO Alliance Payments TWG（Google 捐赠，2026-04-28） | **v0.2**（2026-04-28 同日发布）：新增 Human-Not-Present 流；mandate 模型从 Intent/Cart 演进为 Checkout/Payment Mandate 各含 open/closed 变体（`mandate.checkout.1`/`mandate.checkout.open.1`/`mandate.payment.1`/`mandate.payment.open.1`） | 0.x 快迭代（v0.1 2025-09-16 → v0.2 2026-04-28）；进入 FIDO 后走 TWG 标准流程 | repo：https://github.com/google-agentic-commerce/AP2 （Apache 2.0，spec 在 docs/，SDK schemas 在 code/sdk/python/ap2/schemas/）；捐赠公告：https://fidoalliance.org/fido-alliance-to-develop-standards-for-trusted-ai-agent-interactions/ | 身份委托/授权链标准主轴；v0.2 open/closed mandate 直接对应本集群意图层设计 |
| S4 | FIDO Agentic Authentication TWG | FIDO Alliance | 2026-04-28 成立，spec 开发期（无正式 spec）；三大范围：Verifiable User Instructions / Agent Authentication / Trusted Delegation for Commerce | TWG 主席 CVS Health/Google/OpenAI，副主席 Amazon/Google/Okta；预期 H2 2026–2027 出初版 | https://fidoalliance.org/fido-alliance-to-develop-standards-for-trusted-ai-agent-interactions/ ；专题页 https://fidoalliance.org/fido-alliance-agentic-ai/ | agent 认证与可验证委托的标准化主航道（WebAuthn/passkey 延伸） |
| S5 | Mastercard Verifiable Intent | Mastercard（2026-04-28 捐 FIDO Payments TWG） | 2026-03-05 发布（与 Google 联合，IBM/Worldpay/Fiserv/Adyen 参与）；tamper-proof 用户意图记录，选择性披露密码学；跨 FIDO/EMVCo/IETF/W3C 四标准体 | 与 AP2 兼容设计，随 FIDO TWG 演进 | 捐赠确认（一手）：https://fidoalliance.org/fido-alliance-to-develop-standards-for-trusted-ai-agent-interactions/ ；发布文（次级）：https://ppc.land/mastercard-and-googles-new-trust-layer-could-reshape-how-ai-buys-for-you/ ；规范 https://verifiableintent.dev | AP2 之上的意图证明层，与意图层 mandate 记录互补 |
| S6 | Visa Trusted Agent Protocol（TAP） | Visa | 2025-10 发布（已 Stable）；信任模型三签名（agent 强身份/防篡改请求/消费者识别）；签名基座 **RFC 9421** HTTP Message Signatures，Ed25519 + RSA-PSS-SHA256 双算法 | spec 页滚动更新（页脚 last updated 2026-09-07）；样例仓库跟进 | spec：http://developer.visa.com/capabilities/trusted-agent-protocol/trusted-agent-protocol-specifications ；样例：https://github.com/visa/trusted-agent-protocol | 网络方 agent 身份证书路线（非 FIDO 系），商户侧验签接口事实标准 |
| S7 | Visa Core Rules Agentic 条款 | Visa | **2026-04-18 生效版**：§4.1.24 Agentic Platform Requirements（p.254）+ Global Agentic Payment Requirements for Digital Wallets（钱包/传递钱包可用于 Agentic Transactions）；预告 2026-07-25 起 ecosystem fraud 专用授权响应码 | 规则册季度级更新（4-18 版 + 7-25 增补），PDF 公开可引节号 | https://corporate.visa.com/content/dam/VCOM/download/about-visa/visa-rules-public.pdf （18 April 2026 版） | 唯一已生效的网络方**规则级**（非协议级）agentic 条款——合规义务直接落在收单/钱包侧 |
| S8 | ACP（OpenAI+Stripe）/ 其他结账协议 | OpenAI、Stripe | Shared Payment Token 模式 spec live；ChatGPT Instant Checkout 2026-03 退役（次级源，待官方复核） | watch 级 | https://agentspay.ai/vs/ap2 （对比表，次级）；官方锚点待补 OpenAI/Stripe 文档页 | 曾与 AP2 竞争的结账层路线，退役信号使其降为观察项 |
| S9 | IETF HTTP 402 语义归属（趋势） | IETF httpbis（争议中） | RFC 9110 中 402 仍 "reserved"；个人草案：draft-hawkins-x402-dns-discovery-03（2026-08-22 active）/ draft-vauban-x402-consolidated-00（2026-09-03）；**竞争提案** draft-nottingham-httpbis-402（M. Thomson 建议 402 语义归 IETF 管，2026-08-30 http-wg 列表讨论） | 不定（个人 I-D 6 个月有效期，可能过期或立 WG） | https://datatracker.ietf.org/doc/draft-hawkins-x402-dns-discovery/ ；https://lists.w3.org/Archives/Public/ietf-http-wg/2026JulSep/0232.html | x402 的 402 语义**尚非 IETF 标准**；若 httpbis 立项将改变 S1 的合规地位——双周必盯 |

### 补充观察项（不入矩阵主线，季度复核）

| # | 标准 | 状态 | 锚点 |
|---|------|------|------|
| W1 | OpenID Connect Agent Identity Claims（draft-sharif-openid-agent-identity-01，2026-08-26） | 个人 I-D，OIDF AI Identity CG 背景；定义 `agent_trust_level`(L1-L4)/`agent_sanctions_status`/`agent_spend_limit`/`agent_attestation_method` 等 claim——**与限额维度直接对口**，若立 WG 升入主线 | https://datatracker.ietf.org/doc/html/draft-sharif-openid-agent-identity-01 |
| W2 | NIST NCCoE AI Agent Identity Concept Paper（2026） | 概念文件，无规范约束 | W1 草案 Informative References 引用 |
| W3 | AAIF（Agentic AI Foundation，2025-12）与 UCP Tech Council | 治理联盟，无支付条款级产出 | agenticcommerce.report 2026-w18 存档 |

---

## 二、条款级跟踪明细（含系统约束映射）

> 映射目标 = 本集群系统接口：①意图层 mandate 三段式 ②运行时层逐调用授权+consume-once+金额上限 ③身份层 DID/VC/TEE + agent 钱包低余额+日上限+JIT 充值（四者载体：`~/.hermes/profiles/_shared/knowledge/agent-payment-security-knowledge.md`，下称 aipay-sec）④AI支付三要素 v4（授权确认/可信识别/安全调用，`workspace/research/AI支付三要素完整设计方案-v4.md`）⑤多法域合规引擎（`workspace/research/compliance-engine/` 规则包）
> 判级：一致=标准条款与本集群机制同构｜缺口=本集群无对应机制需补｜观察=标准未定不影响当下

| 标准条款（锚点） | 条款要点 | 映射到本集群 | 判级 | 系统接口影响标注 |
|----------------|---------|-------------|------|----------------|
| S1 x402 §6.1 Payment Flow Models（spec v2） | 结算时点三模式：`authorization`（verify→resource→settle，默认）/`upfront`（settle→resource，预扣）/`escrow`（先押后结） | authorization = 运行时层逐调用授权+consume-once 同构；upfront/escrow = 预付/押金模式，对应 agent 钱包 JIT 充值边界外场景 | 一致（authorization）/缺口（预扣流无专门约束条目） | aipay-sec §四 agent 钱包原则需补一行：接入 x402 upfront/escrow 资源时，预扣额计入当日上限口径（设计约束，暂无实现） |
| S1 x402 §5.1 PaymentRequired + §12.1 AI Agent Integration | accepts[] 支付要求结构化下发；agent 侧预算管理/budget 属 implementation-specific（**协议不管预算**） | 预算留在本集群侧（低余额+日上限+JIT），协议不接管——与"agent 钱包资金隔离是最后防线"定位一致 | 一致 | 合规引擎规则包可加 x402 通道标记字段（fiat rails 走 ACH/SEPA facilitator 时通道规则仍适用）——扩展点，暂不动 |
| S1 x402 v2 extensions + CAIP-2 网络/资产标识 | 扩展免改 spec；网络用 CAIP-2 标识，兼容 legacy rails | 引用矩阵条款时必须带版本号（v2 才有 extensions）；引用旧文注意 v1 头部（X-PAYMENT-*）已废 | 一致 | 知识库引用纪律：任何 x402 引用标注 spec 版本+日期（本表即锚点） |
| S3 AP2 v0.2 open/closed mandate | open mandate=用户在场时签的边界约束；closed mandate=agent 在边界内代签的实例；选择性披露哈希绑定 closed↔open，closed 不得超出 open | 与意图层 mandate 三段式同构（意图→购物车→支付凭证的链条收窄语义）；HNP 场景的 open/closed 两段式是本集群 mandate 模板**尚未显式建模**的形态 | 缺口（HNP open/closed 建模） | aipay-sec §一意图层应增补：HNP 场景 mandate 拆 open（边界，用户签）+closed（实例，agent 签）两层，绑定哈希防越界——spec 开发期，登记不落地 |
| S3 AP2 v0.2 HNP + mandate credential type 命名 | `mandate.checkout.1` 等四类 credential type claim | 命名可作为本集群 mandate 类型标识参考，避免另造口径 | 观察 | 引用 aipay v4 三要素文档时增补 AP2 v0.2 类型名对照 |
| S4 FIDO Agent Authentication（spec 开发期） | 目标=服务方可验证"agent 是否代表已认证用户、是否在授权参数内" | 与身份层 DID/VC/TEE 同向；FIDO 路线是 WebAuthn/passkey 延伸，本集群 DID/VC 路线与其互补而非替代 | 观察 | 双周盯 TWG 初版 spec；若 passkey 延伸成为事实标准，评估本集群身份层加 passkey 绑定通道 |
| S5 Verifiable Intent | 防篡改意图记录+选择性披露 | 与意图层 mandate 的不可抵赖审计要求同构；选择性披露=支付网络只看最小字段（对应 AP2 Payment Mandate 不暴露 PII 设计） | 一致 | 无需改动；作为意图层审计记录的业界参照 |
| S6 Visa TAP RFC 9421 签名 | agent 请求三签名：强身份（Key Store 验）/防篡改（覆盖 method/path/headers）/消费者识别；Ed25519+RSA-PSS | 本集群身份层当前无 HTTP 消息签名外发机制——若集群 agent 直连商户/网络方 API，TAP 是接入凭证 | 缺口（外发签名） | 集群 agent 对外发起支付类 HTTP 请求时需持有 TAP 类签名能力（密钥托管+签名构造）——登记为 pay-infra 接口约束，本卡不动 |
| S7 Visa Rules §4.1.24 Agentic Platform Requirements | 平台（agentic platform）参与 Visa 网络的平台级要求；钱包可参与 agentic 交易 | 收单/钱包侧合规义务清单——若集群支付通道触达 Visa 卡基，通道参与方需满足；本集群是"自用 agent"非平台，直接义务弱、间接传导（经通道商） | 观察 | 合规引擎规则包：Visa 域规则包预留 `agentic` 通道标记（同 S1 扩展点） |
| S9 IETF 402 语义争议 | RFC 9110 402=reserved；x402 语义是事实标准但非 IETF 标准；httpbis 可能收编或另立 | 引用 x402 作合规结论时注明"事实标准，非 RFC"；合规风险评估中 402 通道的法律确定性低于 ISO 20022 类报文标准 | 观察 | 合规引擎规则包字段 `standard_basis` 取值含 `x-fact-standard`（事实标准）与 `ietf-rfc`（正式标准）分级——已隐含，无需改 |
| W1 OpenID agent identity claims（观察项） | `agent_spend_limit`/`agent_sanctions_status`/`agent_trust_level` 直接是授权/限额/名单筛查三维度 | 与运行时层金额上限、AML 名单筛查、客户风险评级逐条对口——若定稿可直接作本集群 agent 身份 token 的 claim 词汇表 | 一致（词汇级） | aipay-sec §三身份层增补参考：agent 身份 claim 词汇以 W1 草案为候选基线（草案期，标注状态） |

---

## 三、双周更新流程（SOP）

**节奏**：每双周第一个周一，owner=pay-fintech；由 pay-orchestrator 在域雷达排程中挂检查点（或本 SOUL 记忆触发）。

**机械检查清单**（每项=版本锚点+检查动作，无变化则勾"无变化"）：

| 步骤 | 对象 | 检查点 URL | 动作 |
|------|------|-----------|------|
| 1 | x402 spec 版本 | https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md （Version History 表） | 版本/日期变化 → S1 行更新+EVENTS 登记+48h 评估 |
| 2 | x402 schemes/扩展 | https://github.com/x402-foundation/x402/tree/main/specs/schemes | 新 scheme（exact/upto/batch-settlement 之外）→ §二 S1 条款行复核 |
| 3 | AP2 版本 | https://github.com/google-agentic-commerce/AP2 （releases + docs/spec） | v0.3+ → S3 行更新；重点看 mandate 类型增删 |
| 4 | FIDO agentic spec | https://fidoalliance.org/fido-alliance-agentic-ai/ | TWG 出 draft spec → S4 升实锚点+三维度评估 |
| 5 | Visa Rules 版本 | https://corporate.visa.com/content/dam/VCOM/download/about-visa/visa-rules-public.pdf （封面日期+§4.1.24） | 新生效日期/agentic 节增删 → S7 行更新（注意 2026-07-25 fraud 响应码落地核对） |
| 6 | IETF 402 动态 | https://datatracker.ietf.org/doc/draft-nottingham-httpbis-402/ （若存在）+ datatracker 搜 x402 | httpbis 立 WG/adopt → S9 升级为 A3 级（影响 x402 合规地位判断） |
| 7 | W1 OpenID 草案 | https://datatracker.ietf.org/doc/html/draft-sharif-openid-agent-identity | 过期/立 WG/定稿 → W1 升降级 |

**输出纪律**：
- 有变化 → 更新本矩阵对应行 + `EVENTS.md` 追加事件行 + 按 `TRACKER.md` 48h SLA 出评估简报（复用事件线，不另建流程）
- 无变化 → 本文件 §五变更日志追加一行「YYYY-MM-DD 双周检查：7 步全无变化」（≤1 行，防日志膨胀）
- 季度：W1-W3 观察项复核一次，可升级入主线或移除

---

## 四、与既有线的分工边界

| 线 | 载体 | 维度 | 触发 |
|----|------|------|------|
| 事件线（既有） | `TRACKER.md`+`EVENTS.md`+`assessments/` | 发布事件 → 48h 三维度影响评估 | 雷达/新闻命中纳入清单 |
| **本矩阵（新）** | `STANDARDS-MATRIX.md`（本文件） | 标准**版本/条款**存量 + 系统约束映射 | 双周机械检查 + 事件线评估结论回写条款行 |
| 知识面（既有） | aipay-sec（三层防护）/ aipay v4（三要素）/ compliance-engine（规则包） | 系统设计与合规实现 | 本矩阵条款行"系统接口影响标注"触发其小节增补 |

闭环关系：事件线评估简报的结论若涉及版本/条款（如"v0.2 新增 HNP"）→ 回写本矩阵条款行；本矩阵双周检查发现版本变化 → 反向登记事件线。两条线共享 EVENTS.md 一个日志。

---

## 五、变更日志（append-only）

- 2026-10-09 建线（gap-20260927-013 / t_113b7ff5）：首批盘点 9 标准+3 观察项，全部带官方锚点；首轮双周检查与建线盘点合并执行（S1-S9 现值即基线）；同日发布首个评估简报 `assessments/ASSESS-20261009-x402v2-fido-ap2.md`（x402 v2 + FIDO 双 TWG + AP2 v0.2 收编）。
