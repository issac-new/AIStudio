# 告警分级与分发规则（Alert Triage Rules）

> 来源：SenteLabsAI/OpenExecutive `prompts/triage_prompt.py` 全文翻译适配（2026-09-03 源码级调研）
> 适用：一切 agent 主动推送给用户的告警/通知（Gateway 推送、cron 产出、kanban 事件通知、监控告警）
> 配套：`_shared/06-observability/outbound-guard.md`（防骚扰门）——本文件定**级别与去向**，outbound-guard 管**发不发**

---

## 一、四级分级（存疑取低档——"False urgents destroy trust faster than missed mediums"）

| 级别 | 判定标准 | 例子 |
|------|---------|------|
| **urgent** | 24 小时内必须行动；安全/资金/数据风险；12 小时延迟造成实际损害 | 护栏被绕过实锤、provider 全线熔断、数据丢失 |
| **high** | 本周内需决策；关键系统指标实质变化；合同/合规义务触发 | 磁盘 >90%、cron 连续失败 3 次、看板阻塞超 24h |
| **medium** | 与进行中的任务相关但不阻塞；值得知道不急着处理 | 任务完成通知、调研报告产出、周常提醒 |
| **low** | FYI；例行确认；值得记录不值得打断 | 日常统计、心跳、低价值通知 |

**判定纪律**：两级之间存疑时**取低档**。误报 urgent 对信任的破坏 > 漏报 medium。

## 二、渠道映射（级别 → 推送渠道）

| 级别 | 渠道 |
|------|------|
| urgent | TUI 高亮 + 微信 +（Matrix 如配置）+ 落盘持久化 |
| high | TUI + 微信 + 落盘 |
| medium | TUI + 落盘 |
| low | 仅落盘（不主动推送） |

**持久化必选**：任何级别都必须落盘（写日志/事件），保证可回溯。

## 三、隐私不变量（non-negotiable，对应 triage_prompt.py 广播禁令）

以下内容**绝不进广播渠道**（群发/公开房间/共享频道），只能点对点发指定决策人：

- 薪酬、人事、法律事务细节
- 财务明细（收入、估值、具体金额条款）
- 孩子/家庭成员 PII（[已移除] 域：孩子姓名/学校/地址/健康细节）
- 密钥、凭证、API key 相关内容（即使脱敏后）

**违反 = 不可谈判红线**，无例外条款。

## 四、使用位置

| 场景 | 用法 |
|------|------|
| cron 推送前 | 产出定级 → 按级别选渠道 → 过 outbound-guard 三控制 → 发 |
| kanban 事件通知 | complete=medium / block=high / 安全事件=urgent |
| Matrix 房间消息 | 涉及隐私不变量内容时强制 DM 不发房间 |
| 用户明确要求静默 | `[SILENT]` 规则优先于本分级 |

## 五、与既有机制的衔接

- **Matrix 七层防线**：管「bot 对话是否收敛」（接收侧）；本文件管「告警怎么分级去哪」（发送侧）
- **outbound-guard**：级别判定后仍须过三控制（去重/限频/安静时段）；urgent 可豁免安静时段（`urgent_bypass: true`）
- **mandatory-privacy.md**：PII 保护通用规则；本文件 §三 是其在告警分发场景的具体化
