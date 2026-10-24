# Agentic 支付标准追踪线（AgentPay Standards Tracker）

> 目的：网络方/卡组织/清算基础设施方发布 agentic 支付相关规则、协议、产品标准后，**48h 内**产出授权/委托/限额三维度影响评估。
> 建线：2026-09-24（gap-20260918-004，kanban t_6389999c）｜owner 见 §五
> markings: TLP:GREEN/CLEAR

---

## 一、追踪范围与触发

**纳入**（满足其一即登记 EVENTS.md 并启动 48h SLA）：
- 网络方/卡组织 agentic 支付规则发布（Visa/Mastercard/银联/网联 NUC 等）
- 清算基础设施方 agentic 产品标准（Stripe/Adyen/Circle/PayPal 等的 agent 支付协议、钱包、token 规则）
- 央行/监管对 agent 支付的规则性文件（授权边界、委托语义、限额要求）
- 跨组织协议标准演进（AP2/ACP/x402/A2A/MCP 支付相关版本发布）

**不纳入**：纯市场情报（融资/人事/销量）→ 夜间雷达报告承载；已 REJECT 的雷达占位条目不重复登记。

**触发源**：nightly radar 自动登记 pay 域事件（gap_register pay_pymnts/pay_paymentsdive 前缀）→ pay-orchestrator 复判命中"纳入"清单 → 登记本追踪线 + 建评估卡派 pay-fintech。

## 二、三维度评估模型（术语锚点）

评估任何一条规则/标准发布，固定回答三个问题：

| 维度 | 问题 | 术语锚点 |
|------|------|---------|
| **授权（Authorization）** | 用户支付意图如何被确认与凭证化？一次性还是可复用？谁能签发？ | aipay v4 要素一「意图确认」：mandate 链/意图凭证/一次性 token/consume-once；NUC 问题清单 Q9（意图凭证无用户签名）、Q15（MainToken 至 2099 长期有效）、Q27（72h 有效+版本递增张力） |
| **委托（Delegation）** | agent 以什么身份代表用户？绑定关系如何证明？可否 per-agent 吊销？ | aipay v4 要素二「可信识别」：AgentCard/per-agent token/KYA/委托语义（RFC 8693 act）；NUC Q16（无 agent 实例身份）、Q17（KYA 只有名词）、Q18（绑定关系 UA 自证） |
| **限额（Limits）** | 额度模型挂在哪一层（账户/机构/agent/意图凭证）？风控输入有哪些 agent 特征？ | aipay v4 要素三「安全调用」：逐调用授权/金额上限/scenario 约束；NUC Q11（pmtCstr 校验粒度）、Q25（限额无 agent 维度容器） |

**术语基座**（评估简报统一引用，禁止另造口径）：
- `workspace/research/AI支付三要素完整设计方案-v4.md`（三要素框架主文档）
- `workspace/research/aipay-main-report-v2.md` + 子报告 01–07（厂商/协议/NUC 全景）
- `workspace/research/aipay-06-nuc-spec-analysis.md`（NUC v11.0.6 三十项问题清单，Q 编号体系）
- `references/agentpay/EVENTS.md`（本追踪线事件日志）

## 三、48h SLA 流程

```
T+0h   事件登记：EVENTS.md 追加一行（含 URL/日期/网络方/类型）
T+2h   路由判定：pay-orchestrator 确认纳入范围 + 建评估卡（assignee=pay-fintech，附 URL）
T+24h  事实摘要：来源三角验证（官方发布 + 至少 1 独立报道/文档），填 ASSESS-TEMPLATE §一
T+48h  三维度评估：按 §二 锚点逐维度打分（A0–A3）+ 建议动作，产出简报落 references/agentpay/assessments/
T+48h  回写：EVENTS.md 状态列更新；若触发集群适配 → gap 登记/知识库更新；简报结论 comment 到评估卡
```

**分级口径**：A0 无影响｜A1 观察（登记即可）｜A2 需适配（知识库/设计约束更新）｜A3 立即动作（影响现有方案 P0 项）

## 四、文件清单

| 文件 | 用途 |
|------|------|
| `TRACKER.md`（本文件） | 追踪线总纲：范围/模型/SLA/owner |
| `EVENTS.md` | 事件日志（append-only，一行一事件） |
| `ASSESS-TEMPLATE.md` | 48h 影响评估简报模板 |
| `assessments/ASSESS-20260924-seed4.md` | 首批种子评估（收编 4 事件 dry-run） |
| `STANDARDS-MATRIX.md` | **条款级跟踪矩阵（2026-10-09 新增，gap-20260927-013）**：x402 v2/FIDO 双 TWG/AP2 v0.2/Visa TAP+Rules §4.1.24/IETF 402 争议等 9 标准 + 3 观察项，版本/条款 + 系统约束映射 + 双周 7 步检查 SOP |

**与矩阵的分工边界**：本线管**事件**（发布 → 48h 评估）；`STANDARDS-MATRIX.md` 管**版本/条款存量**（双周机械检查 + 评估结论回写条款行）。两条线共享 EVENTS.md 一个日志：事件线结论涉及版本/条款 → 回写矩阵条款行；矩阵双周检查发现版本变化 → 反向登记本线。

## 五、Owner 与持续运营

- **评估执行**：pay-fintech（简报产出、三维度判级、监管面补充）
- **路由与登记**：pay-orchestrator（事件纳入复判、建卡、SLA 时钟）
- **基础设施面复核**：pay-infra（A2/A3 级时对通道/网关设计约束的适配意见）
- 首批 4 事件（Circle Arc / Mastercard-Alchemy / Stripe wallet / Net 30）已由 pay-orchestrator 完成 dry-run 种子评估（2026-09-24），后续新事件按 SLA 流程走。
