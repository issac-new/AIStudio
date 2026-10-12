---
name: outbound-delivery-verification
description: "Verify delivery claims against mechanism fields first."
version: 1.0.0
metadata:
  hermes:
    tags: [delivery, cron, weixin, capability-claims, verification, silent-degradation]
---

# Outbound Delivery Verification

对外承诺任何自动推送/自动投递能力之前，机械核验机制字段。声称≠机制；本 skill 沉淀「文档自述会撒谎」一类的实测教训。

## 核验规则（落笔/承诺前逐条过）

1. **机制字段为准，prompt 自述为文档**：承诺「自动推送到 X」前，先读 `cron/jobs.json` 的 `deliver` 字段；prompt 里"系统会自动推送到…"的句子在通道漂移后仍会留在原地——它是文档，不是机制。
2. **last_status 语义**：`ok` 只证明任务执行成功，不证明送达任何目的地。`deliver: local` + `last_status: ok` = 只落盘不外发的死通道，外表健康。
3. **漂移机械检测**：对比同目录 dated 备份（`jobs.json.bak-*`）与现行文件的 deliver/通道字段即可检出漂移；weixin→local 类降级若无用户裁决记录 = 静默降级。
4. **静默降级的上报契约**（建设期纪律）：显式报告 + 给家长/用户拉取式替代（如「微信里说『发一下今天的统计』」）+ 升级路径（如「恢复推送请找运维方」）。禁静默省略，也禁照旧承诺。

## 能力文档化（给终端用户写使用说明时）

- 每条能力主张先溯源到活配置（SOUL/规则文件/jobs.json/档案锚点）；溯源不到不写。数字（推送时刻、限额、基线）逐个对配置文件核。
- 「自动推送」类功能落笔前先过上面四条；降级中的通道写 ⚠️ 现状说明，不写旧能力。
- **发送完成的声明必须绑定本次发送的可验证回执**：至少记录成功状态、实际目标标识和消息/附件标识；内部任务 comment、worker summary、日志中的「准备发送」不算送达证据。缺回执时写「未验证送达」，不要写「已发送」。
- 示例消息直接可抄优于功能散文；结尾给可截图速查卡；教师团队指代用中性集体词。

## 跨 profile 排队（skill_manage 拒改时的处置）

skill_manage 只接受本 profile 注册的 skill；skill_view 可读其他 profile 的 skill 但不可写。拟好的 patch 不丢弃，排队记录在此，等目标 profile 的会话落地：

1. `default:devops/[已移除]-family-message-handling` — 网关映射过时（8651 已废弃，统一 multiplexer 8650）；新增 Rule 2b（deliver 字段机制 vs prompt 自述 + dated bak 漂移检测）；checklist 两行替换。
2. `default:devops/[已移除]-team-deployment` — 新增 Step 10「给家长写使用说明」规程（溯源优先/数字锚定/降级通道显式标注/示例可抄/速查卡）。
3. `default:devops/orchestrator-lessons` — 新增「九、对外承诺投递」节（内容同本 skill 核验规则）。

落地方式：在 default profile 会话里 `hermes -p default` 或直接文件工具编辑 `/Users/YOURNAME/.hermes/skills/devops/<name>/SKILL.md`。落地后删除本节对应条目。

## Related

- `[已移除]-family-message-handling`（default，Rule 2/2b 领地）
- `weixin-send-troubleshooting`（外发失败诊断）
- `orchestrator-lessons`（default，实战教训库）