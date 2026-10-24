# 种子评估：首批 4 事件（dry-run，2026-09-24）

> 评估人：pay-orchestrator（dry-run，验证模板可渲染；后续正式评估归 pay-fintech）
> 模板：`../ASSESS-TEMPLATE.md`｜事件日志：`../EVENTS.md`
> 时效：来源均为 2026-09-16~23 发布/报道，检索验证时间 2026-09-24

---

## AP-0001 Circle Arc 主网上线（2026-09-16）

**事实**（来源：PYMNTS 报道 https://www.pymnts.com/blockchain/2026/circle-debuts-agentic-commerce-focused-blockchain-arc/ ；三角验证：betabriefing/ainvest 转载一致）：
- USDC 计价 L1，为 AI agent 作为"经济行为体"设计；sub-second finality；USDC 占 agent 驱动交易量 98.8%（Circle 自报口径）
- Agent Stack（2026-05 起）：Agent Wallets 带 scoped permissions 与 budget caps；Arc Portal 支持用户充值 agent 钱包、设消费限额、委托任务、监控活动
- x402 代理支付（proxy payments）：agent-to-agent 结算的管理接入路径

**三维度**：
- 授权：Portal 委托+任务级授权，钱包策略绑定 → 意图确认在平台层而非协议层（对照 aipay v4 要素一"平台托管 mandate"范式）
- 委托：agent 钱包为一等身份（policy-bound wallet），per-wallet 吊销可行 → 正面样板，对照 NUC Q16（缺 agent 实例身份）
- 限额：budget caps/政策绑定钱包 = 限额容器挂在 agent 钱包层 → 对照 NUC Q25（国内规范无 per-agent 限额容器）

**评级 A2**（需适配）：跨境收款/稳定币结算设计需把"策略绑定 agent 钱包 + 预算上限"纳入约束；关联稳定币情景库 `STABLECOIN-SCENARIO-LIBRARY.md` 的可插拔结算适配层。

## AP-0002 Mastercard×Alchemy AgentCard（2026-09-17）

**事实**（来源：PYMNTS https://www.pymnts.com/news/artificial-intelligence/2026/mastercard-alchemy-partner-enable-everyday-agentic-payments/ ；Alchemy 官方 X 帖，Mastercard 本周铺开）：
- AgentCard = 面向开发者的 agent 身份 + 钱包 + 一次性（one-time）支付凭证
- 定位："checkout button is dying"，agent 代用户发现/比价/购买

**三维度**：
- 授权：一次性凭证 = consume-once 语义的商用落地 → 对照 aipay v4 要素一运行时层；NUC Q27（意图凭证 72h 可版本递增）形成反差
- 委托：AgentCard 即 agent 身份卡（identity），per-agent 粒度 → 对照 NUC Q16/Q17
- 限额：单次额度内嵌于一次性凭证；细节未公开 [推断：按卡组织 agent token 限额惯例] → 待正式评估补

**评级 A2**：卡组织 agent token 路线（一次性+限额+身份卡）与我方外卡收单知识域 `waika-shoudan-analysis.md` 的 token 化趋势交汇，知识库需登记。

## AP-0003 Stripe Link 钱包接入 AI bot（2026-09-18）

**事实**（来源：Payments Dive https://www.paymentsdive.com/news/stripes-digital-wallet-paypal-embraces-ai-bots-agentic-commerce/830753/ ；三角验证：Yahoo Finance 全文转载、Meta 2026-09-08 官方新闻稿）：
- Meta Muse 等 bot 接入 Link：结算时生成一次性卡号，agent 不接触真实卡号（"agent never sees your real card"）
- Link：300M 全球用户、约 1M 商户；2026-04 已发布 Link payments for AI agents；另与 OpenClaw/Claude/ChatGPT/Gemini/Copilot 生态合作
- 附带保障：损坏/丢失/降价/免手续费退货等 free coverage

**三维度**：
- 授权：card-on-file 委托 + 每次交易派生一次性卡 → 意图确认弱（无 mandate 链）但风险敞口受一次性卡约束；对照 aipay v4 要素一生物识别/mandate/托管三范式中的"钱包托管"变体
- 委托：钱包层代理（bot 持 Link 凭证而非用户卡）→ 委托边界清晰在钱包侧
- 限额：靠一次性卡+保障覆盖控制敞口，未见 per-agent 限额容器公开细节 → [推断]

**评级 A1**（观察）：钱包托管模式市占扩张（300M 用户基础）值得持续跟踪，暂无我方设计约束变化。

## AP-0004 Agentic AI 与 Net 30（2026-09-23）

**事实**（来源：PYMNTS https://www.pymnts.com/news/b2b-payments/2026/agentic-ai-could-make-net-30-obsolete/ ）：
- B2B 展望文章（引 JPMorgan 2026-06 展望；**无现行实现**，原文自述"prospective"）
- 核心论点：payment terms 变连续定价；前置条件 = 机器可读财资政策、数据确定性与**硬性授权限额**（hurdle rate 之上才可提前付款、金额上限、重大流动性变更须人审）

**三维度**：
- 授权：机器可执行政策（"financial constitution"）= 委托授权的边界表达 → 对照 aipay v4 要素一"分层意图确认"中策略层
- 委托：treasury agent 与 counterparty agent 协商，权限来自政策翻译 → 对照 NUC Q17（能力声明/限额档缺失）同类缺口
- 限额：hurdle rate/金额/人审触发线三要素 = 限额模型完整表达 → B2B 场景限额设计参考样板

**评级 A1**（观察）：前瞻观点非落地规则；其"硬性授权限额三要素"可作我方 B2B agent 支付限额模型的口径参考。

---

## 汇总与判级分布

| 事件 | 授权 | 委托 | 限额 | 评级 |
|------|------|------|------|------|
| AP-0001 Circle Arc | 平台托管委托 | agent 钱包一等身份（正面样板） | budget caps 政策绑定 | A2 |
| AP-0002 MC-Alchemy | 一次性凭证 consume-once | AgentCard per-agent | 单次内嵌（细节待补） | A2 |
| AP-0003 Stripe Link | 钱包托管+一次性卡 | 钱包层代理 | 敞口控制型 | A1 |
| AP-0004 Net 30 | 机器可读政策边界 | 政策翻译授权 | hurdle/金额/人审三要素 | A1 |

**dry-run 结论**：模板可完整渲染 4 类异质事件（基础设施/卡组织/钱包/行业展望）；三维度锚点（aipay v4 + NUC Q 编号）足够定位每条事件；[推断] 项在 2 处显式标注，符合证据纪律。后续正式评估按 TRACKER.md §三 SLA 归 pay-fintech 执行。
