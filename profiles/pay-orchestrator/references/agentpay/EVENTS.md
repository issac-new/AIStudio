# Agentic 支付标准追踪线 · 事件日志

> append-only：一行一事件；状态 ∈ pending(评估中)/assessed(已评估)/watch(持续观察)
> 评级列引用 assessments/ 下简报；来源 URL 必须可访问验证

| 事件ID | 登记日 | 发布方 | 日期 | 类型 | 一句话 | 来源 URL | 评级 | 状态 |
|--------|--------|--------|------|------|--------|----------|------|------|
| AP-0001 | 2026-09-24 | Circle | 2026-09-16 | 清算基础设施/区块链 | Arc 主网上线：USDC 结算 L1，为 agentic 经济设计；Agent Wallets 带范围权限与预算上限；x402 代理支付；Arc Portal 提供委托+限额+监控界面 | https://www.pymnts.com/blockchain/2026/circle-debuts-agentic-commerce-focused-blockchain-arc/ | A2 | assessed |
| AP-0002 | 2026-09-24 | Mastercard×Alchemy | 2026-09-17 | 卡组织规则/产品 | AgentCard：面向开发者的 agent 身份+钱包+一次性支付凭证；"checkout button is dying"定位 | https://www.pymnts.com/news/artificial-intelligence/2026/mastercard-alchemy-partner-enable-everyday-agentic-payments/ | A2 | assessed |
| AP-0003 | 2026-09-24 | Stripe | 2026-09-18 | 清算基础设施/钱包 | Link 钱包接入 Meta Muse/xAI 等 bot：一次性卡号隔离（agent 不见真卡）；4 月已发布 Link agent 支付能力；300M 用户/1M 商户 | https://www.paymentsdive.com/news/stripes-digital-wallet-paypal-embraces-ai-bots-agentic-commerce/830753/ | A1 | assessed |
| AP-0004 | 2026-09-24 | PYMNTS（行业展望） | 2026-09-23 | 行业标准趋势/B2B | Agentic treasury 使 Net 30 变连续定价：机器可读财资政策+硬性授权限额（hurdle rate/金额上限/人审触发线）是前置条件；引 JPMorgan 2026-06 展望（无现行实现） | https://www.pymnts.com/news/b2b-payments/2026/agentic-ai-could-make-net-30-obsolete/ | A1 | assessed |
| AP-0005 | 2026-10-08 | Block | 2026-09-24 | 清算基础设施/协议标准 | Block 加入 x402 Foundation 并贡献 Bitcoin Lightning 接入（规范已合入 2026-09-23、实现待 review、无产品时间表）；结算轨扩展为稳定币+卡+Lightning 三轨，授权/委托/限额三维度零机制变化 | https://www.pymnts.com/news/artificial-intelligence/2026/block-joins-x402-foundation-to-drive-agentic-commerce-standards/ | A1 | assessed |
| AP-0006 | 2026-09-27（评估 2026-10-09） | x402 Foundation / Linux Foundation | 2025-12-09（spec v2）/ 2026-07-14（Foundation 运营） | 协议标准/结算层 | x402 spec v2：CAIP-2 网络标识+extensions+authorization/upfront/escrow 三支付流；Foundation 运营启动 40 组织、TSC 3 人——HTTP 402 支付成事实标准但非 RFC（httpbis 有竞争提案 draft-nottingham-httpbis-402） | https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md ；https://linuxfoundation.org/press/linux-foundation-announces-operational-launch-of-x402-foundation-to-standardize-internet-native-payments-for-ai-agents-and-applications | A2 | assessed |
| AP-0007 | 2026-09-27（评估 2026-10-09） | FIDO Alliance | 2026-04-28 | 标准治理/身份委托 | FIDO 成立 Agentic Authentication TWG（CVS/Google/OpenAI 主席）+Payments TWG（Mastercard/Visa 主席）；Google 捐 AP2、Mastercard 捐 Verifiable Intent 作初始技术输入；三范围=Verifiable User Instructions/Agent Authentication/Trusted Delegation for Commerce；60+ 组织承诺 | https://fidoalliance.org/fido-alliance-to-develop-standards-for-trusted-ai-agent-interactions/ | A2 | assessed |
| AP-0008 | 2026-09-27（评估 2026-10-09） | Google → FIDO | 2026-04-28 | 协议标准/授权层 | AP2 v0.2 发布（同日捐 FIDO）：新增 Human-Not-Present 流；mandate 模型由 Intent/Cart 演进为 Checkout/Payment 各含 open/closed 变体（mandate.checkout.1 / .open.1 / mandate.payment.1 / .open.1），选择性披露哈希绑定 closed↔open 防越界 | https://github.com/google-agentic-commerce/AP2 （Apache 2.0） | A2 | assessed |

> 收编说明：AP-0001~0004 分别收编雷达事件 gap-20260917-pay-8360c5 / gap-20260918-001 / gap-20260921-012 / gap-20260924-010（均已 dropped duplicate_of gap-20260918-004）。种子评估见 `assessments/ASSESS-20260924-seed4.md`。AP-0005 收编 gap-20260927-011（评估见 `assessments/ASSESS-20261008-block-x402.md`，SLA 逾期归因夜间管线 spawn 故障，见简报头注）。AP-0006~0008 收编 gap-20260927-013（矩阵建线卡 t_113b7ff5，补评估 2026-10-09，三事件合并评估见 `assessments/ASSESS-20261009-x402v2-fido-ap2.md`，条款矩阵见 `STANDARDS-MATRIX.md`）。

<!-- 新事件在此行之上插入 -->
