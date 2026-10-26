# Agentic 支付责任分配法律层跟踪（liability gap radar）

> 目的：跟踪 agentic payments 的**法律责任分配**维度——谁为 AI agent 越权交易买单。与 `STANDARDS-MATRIX.md`（标准版本/条款维度）、`TRACKER.md`+`EVENTS.md`（发布事件维度）互补，本文件是**法律/责任维度**的单一跟踪点。
> 建线：2026-10-22（gap-20261014-011，kanban t_f579a824）｜owner：pay-fintech
> 口径纪律：法条以 eCFR（12 CFR）为第一锚点；行业立场标注协会/律所来源；观点文章（opinion）结论降一级引用，不单独作依据
> markings: TLP:GREEN/CLEAR

---

## 一、核心问题（一句话）

AI agent 超越用户授权（mandate）交易时，损失在消费者/发卡行/网络/商户/AI 工具商之间如何分配——**美国现行消费者金融法没有明确规则**，且三大既有保护框架在 agent 场景下各有适用缺口。

## 二、三大框架缺口明细（2026-10-22 核验）

### L1. Reg E（借记/EFT 语境）——access-device 排除条款

- **机制**：12 CFR §1005.6 借记卡责任限制（两营业日内报失 $50 上限）只覆盖"unauthorized electronic fund transfer"；而 §1005.2(m) 将**消费者主动提供访问设备（access device）给他人**后该人发起的转账**排除**在"未授权"之外（除非消费者通知金融机构撤销对该人的授权）。
- **官方评注更进一步**（Commentary to §1005.2(m)）：即使被授权人**超越**所授权限，消费者仍可能担责。Reg E 的"person"定义含自然人与组织（含公司）。
- **缺口**：凭证（卡号/密码/token）交给**公司运营的软件**（AI agent）是否触发排除——法规未说。触发则消费者为 agent 错误全额买单。
- 锚点：eCFR 12 CFR §1005.2(m)/§1005.6；CBA 白皮书 Key Finding 1（consumerbankers.com，2026-01）；PaymentsDive opinion 2026-10-09。

### L2. Reg Z / TILA（信用卡语境）——authority 三分框架

- **机制**：Truth in Lending Act（Reg Z, 12 CFR §1026.12/13）的未授权使用框架取决于使用人是否具有 **actual / implied / apparent authority**（实际/默示/表见授权）。
- **缺口**：AI 工具代表持卡人行动时，三种授权如何映射到"用户给了 agent 一个泛指令"（如"找最优价就买"）——无判例无指引。
- 锚点：PaymentsDive opinion 2026-10-09（Cheiffetz）；CBA 白皮书 Executive Summary。

### L3. 零责任政策（Visa/MC）——"未授权"定性依赖

- **机制**：Visa/Mastercard 零责任政策超出联邦法保护，但**仍以交易被归类为 unauthorized 为前提**。
- **缺口**：消费者授权 agent 交易、但争议**特定购买是否落在授权范围内**（mandate scope dispute）时——交易既非完全"未授权"也非完全授权，零责任政策不解决。这正是 agent 场景最高频的争议形态（agent 理解偏差/过度执行）。
- 锚点：PaymentsDive opinion 2026-10-09；CBA 白皮书 Key Finding 2（新轨道场景下保护更弱）。

## 三、后果推演（CBA + 原文共识）

1. **发卡行防御性行为**：只与成熟 AI 工具商签谈判合同共享凭证、采用繁重身份确认流程、或直接拒付某些交易——风险未被定价时的理性选择。
2. **竞争扭曲**：防御性门槛偏向在位大平台，挤压初创 AI 工具商。
3. **轨道漂移风险**（CBA Key Finding 2）：agentic 工具为省 interchange 可能路由到 stablecoin/crypto 等新轨道，联邦法（EFTA/TILA）可能不适用——消费者保护进一步稀释。
4. **银行承接申诉**（CBA Key Finding 3）：agent 交易量指数级增长 → 客户投诉同比例增长，银行是事实上的最后受理方。

## 四、原文三建议 + 与本集群技术栈的映射

Cheiffetz（2026-10-09）主张至少三件事，逐条映射：

| # | 法律层建议 | 技术层对应（本集群既有/在跟） | 判级 |
|---|-----------|------------------------------|------|
| 1 | 法律区分消费者自身行为 vs 他人（含 AI 工具）行为 | 无技术对应——纯立法诉求，观察 | 观察 |
| 2 | 授权参数（金额/商户/时间/限额）以**支付系统可用的形式**文档化 | aipay-sec §一意图层 mandate 三段式（Intent / Cart / Payment Mandate，open/closed 两阶段）= 该建议的技术实现；AP2 v0.2 open/closed mandate 哈希绑定（S3）；Mastercard Verifiable Intent（S5）；Visa TAP 三签名（S6）——法律诉求与协议标准在此汇合 | 一致（已有等价机制） |
| 3 | 发卡行/网络/商户/AI 工具商之间的损失分配不应是消费者的问题 | 无对应——责任分摊规则取决于网络方 agentic frameworks 正式条款（Visa/MC 开发中）+ 未来立法 | 观察 |

**汇合点结论**：建议 2 证明本集群意图层 mandate 结构化设计方向正确且是法律层的必要条件——没有机器可读的 mandate 记录，任何责任分配规则都无法执行（无法判定"越权"）。这是"技术标准先行、法律规则滞后"格局下的关键杠杆：mandate 记录既是风控输入，也是未来争议裁决的证据基础。

## 五、观察项（复评触发器）

| # | 观察项 | 触发动作 |
|---|--------|---------|
| O-L1 | CFPB/美联储对 agentic payments 出指引或执法案例 | 升级为独立评估卡（A2/A3 判级） |
| O-L2 | Visa/MC agentic payment frameworks 正式发布——看责任条款如何分配 mandate scope dispute | 进 EVENTS.md + 48h 评估（TRACKER §三 SOP） |
| O-L3 | CBA 后续白皮书/国会听证（Trump 政府观望期结束信号） | 更新本文件 §二/§三 |
| O-L4 | Reg E/Reg Z 涉 agent 判例出现 | 本文件升格为判例跟踪 |
| O-L5 | stablecoin 轨道上 agent 支付的消费者保护争议（EFTA/TILA 适用性挑战） | 关联 STABLECOIN-SCENARIO-LIBRARY.md |

## 六、来源

1. PaymentsDive opinion: "How agentic payments present risk"（Aaron Cheiffetz，2026-10-09）https://www.paymentsdive.com/news/how-agentic-payments-artificial-intelligence-risk/832601/ ——观点文章，作者为金融服务业顾问（AI 治理/合规方向）；其 Reg E/Reg Z 条款转述经 CBA 白皮书交叉验证
2. CBA 白皮书: "Agentic AI Payments: Navigating Consumer Protection, Innovation, and Regulatory Frameworks"（Consumer Bankers Association × Davis Wright Tremaine LLP，2025 秋研讨会、2026-01 发布）https://consumerbankers.com/research/agentic-ai-payments-navigating-consumer-protection-innovation-and-regulatory-frameworks/ ——一手行业权威；81% 消费者期望 AI 购物 / 42% 愿全权代购至少一品类 / 影响 $1.3T 在线商务
3. eCFR 12 CFR Part 1005 (Reg E) / Part 1026 (Reg Z)——法条锚点（经 CBA/原文转述，未逐条直读 eCFR 原文，标注：条款号以转述为准）
