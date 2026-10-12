# 48h 规则影响评估简报：x402 v2 + FIDO 双 TWG + AP2 v0.2（三事件收编）

> 用途：网络方规则发布后的影响评估，SLA 48h（见 TRACKER.md §三）
> 纪律：每个关键结论必须带来源锚点（URL 或 file:line）；引用限额/阈值/版本号前先查 `references/standards/known-conflicts.md`
> 说明：本简报为**补评估**——三事件系 2026-09-27 夜间雷达登记 gap-20260927-013（见矩阵建线卡），2026-10-09 按矩阵首批条款盘点一并完成三维度评估

---

## 元信息

- 事件ID：AP-0005（合并评估，x402 v2）／AP-0006（FIDO 双 TWG 收编 AP2+VI）／AP-0007（AP2 v0.2）
- 事件：x402 协议 v2 落地+Foundation 运营启动；FIDO 成立 Agentic Auth/Payments 双 TWG 并收编 AP2 v0.2 与 Verifiable Intent
- 发布方/日期：x402 Foundation（2025-12-09 spec v2 / 2026-07-14 Foundation 运营）；FIDO Alliance（2026-04-28）；Google/Mastercard→FIDO（2026-04-28 AP2 v0.2 同日发布）
- 来源（三角验证 ≥2，每事件官方一手+独立报道）：
  - x402：https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md （spec Version History）；https://linuxfoundation.org/press/linux-foundation-announces-operational-launch-of-x402-foundation-to-standardize-internet-native-payments-for-ai-agents-and-applications （LF 官方）
  - FIDO：https://fidoalliance.org/fido-alliance-to-develop-standards-for-trusted-ai-agent-interactions/ （FIDO 官方）；https://ppc.land/fido-alliance-forms-working-groups-to-lock-down-ai-agent-payments （PPC Land 独立报道）
  - AP2：https://github.com/google-agentic-commerce/AP2 （Apache 2.0，spec docs/ 与 schemas/）；https://fidoalliance.org/fido-alliance-to-develop-standards-for-trusted-ai-agent-interactions/ （捐赠确认）
- 评估人/日期：pay-fintech / 2026-10-09（原登记 2026-09-27，补评估）
- 评级结论：**A2**（需适配：知识库+矩阵层面已适配，设计层三条约束登记为观察不落地）

## 一、事件事实摘要（≤200 字，全部带来源）

x402 发布协议 v2（CAIP-2 网络标识、PaymentRequired/PaymentPayload 重构、extensions 机制、authorization/upfront/escrow 三种支付流，spec Version History 落款 2025-12-09），Coinbase 捐赠协议，x402 Foundation 于 2026-07-14 在 Linux Foundation 下运营启动（40 组织，TSC 现 3 人）。2026-04-28 FIDO Alliance 成立 Agentic Authentication TWG（CVS/Google/OpenAI 主席）与 Payments TWG（Mastercard/Visa 主席），Google 捐赠 AP2（同日发 v0.2，新增 Human-Not-Present 流，mandate 模型改为 Checkout/Payment 各含 open/closed 变体），Mastercard 捐赠 Verifiable Intent（tamper-proof 意图记录）。

## 二、三维度影响评估

### 2.1 授权（Authorization）— 用户意图如何被确认
- 机制：AP2 v0.2 open mandate（用户在场签边界约束，含金额/商户/时窗）→ closed mandate（agent 在边界内代签实例），选择性披露哈希绑定 closed↔open，closed 不得超出 open；x402 v2 授权流 verify→resource→settle，协议层**不管预算**（spec §5.1/§12.1 明示 budget management 属 implementation-specific）
- 对照锚点：aipay v4 要素一「意图确认」（mandate 链/意图凭证/一次性 token/consume-once）；与 aipay-sec §一意图层 mandate 三段式同构
- 对我方影响：AP2 HNP 的 open/closed 两段式是本集群意图层**尚未显式建模**的形态——spec 开发期（FIDO TWG 流程），登记为观察项；x402 预算留本集群侧与既有设计一致，无影响

### 2.2 委托（Delegation）— agent 以什么身份代表用户
- 机制：FIDO Agentic Auth TWG 三范围（Verifiable User Instructions/Agent Authentication/Trusted Delegation for Commerce），路线=WebAuthn/passkey 延伸，服务方验证"agent 是否代表已认证用户且在授权参数内"（FIDO 官方稿三大范围）；Visa TAP 走 RFC 9421 HTTP 消息签名+Key Store 路线（并行，非 FIDO 系）
- 对照锚点：aipay v4 要素二「可信识别」（AgentCard/per-agent token/KYA/委托语义）；aipay-sec §三身份层 DID/VC/TEE
- 对我方影响：FIDO spec 尚未产出（TWG 2026-04-28 才成立），评估基线不变；身份层 DID/VC 路线与 FIDO passkey 延伸**互补非替代**——双周盯 TWG 初版，若成事实标准再评估加 passkey 绑定通道

### 2.3 限额（Limits）— 额度模型挂在哪层
- 机制：x402 协议无 agent 限额维度（budget 留实现侧）；AP2 open mandate 的金额上限/时窗/商户范围挂在意图凭证层（credential type `mandate.payment.open.1` 的 constraints）；Visa Rules §4.1.24 Agentic Platform Requirements（2026-04-18 生效）是平台级要求
- 对照锚点：aipay v4 要素三「安全调用」（逐调用授权/金额上限/scenario 约束）；aipay-sec §四 agent 钱包低余额+日上限+JIT 充值
- 对我方影响：限额挂**意图凭证层**（AP2）与挂**钱包层**（我方）是两层容器并存——未来接入 AP2 类通道时需明确双层限额取交集（min 值），登记为设计约束观察项；Visa Rules 对我方（自用 agent 非平台）无直接义务，经通道商间接传导

## 三、判级依据与建议动作

- 判级：**A2**——三事件均为**规范层**更新（spec/治理/捐赠），非对本集群的强制规则；但条款级影响已确认（HNP open/closed 建模缺口、双层限额并存、TAP 签名缺口），需知识库+矩阵层面适配，设计层约束登记为观察
- 建议动作：
  - [x] 知识库更新：新建 `agentpay/STANDARDS-MATRIX.md`（9 标准+3 观察项条款矩阵，双周 SOP）；本简报入 `assessments/`；EVENTS.md 追加 AP-0005/0006/0007 三行
  - [x] 设计约束登记：矩阵 §二条款行「系统接口影响标注」列已登记三条（x402 upfront/escrow 计入日上限口径；AP2 HNP open/closed 建模观察；TAP 外发签名接口约束）——均为 spec 开发期/观察级，**不动** aipay-sec/aipay v4 正文，待 TWG 初版 spec 再复评
  - [ ] gap 登记：无新 gap（gap-20260927-013 即本 gap，complete 后回填）
  - [ ] 无动作项不适用

## 四、证据与置信度

| 结论 | 证据等级 | 来源锚点 |
|------|---------|---------|
| x402 spec v2 存在且含三支付流/extensions | Exercised（官方仓库 spec 全文抓取核验 Version History） | https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md |
| x402 Foundation 2026-07-14 运营启动、40 组织、TSC 3 人 | Present（LF 官方新闻稿+独立报道双源） | linuxfoundation.org press；xenospectrum.com 独立报道 |
| FIDO 双 TWG 2026-04-28 成立、三范围、主席名单 | Present（FIDO 官方稿全文+PPC Land 独立报道） | fidoalliance.org 官方稿；ppc.land 报道 |
| AP2 v0.2 HNP+open/closed mandate 类型 | Wired（官方 repo README 结构+多源 spec 解读一致；类型 identifier 待 spec 正文逐字核验标 [待核]） | github.com/google-agentic-commerce/AP2；agentspay.ai v0.2 类型表（次级） |
| Visa Rules §4.1.24 agentic 条款（2026-04-18 生效） | Present（官方规则 PDF 搜得节号与生效日） | corporate.visa.com visa-rules-public.pdf |
| IETF 402 语义争议（httpbis 竞争提案） | Present（IETF 邮件列表原文+datatracker 草案页） | lists.w3.org/Archives/Public/ietf-http-wg/2026JulSep/0232.html；datatracker draft-hawkins-x402-dns-discovery-03 |

> 证据分级口径见集群 output-contract；本简报结论至少 Present，仅 [推断]/[待核] 的不作 A2/A3 依据。
