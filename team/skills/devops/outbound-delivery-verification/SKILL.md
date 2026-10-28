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

1. `default:devops/[已移除]` — 网关映射过时（8651 已废弃，统一 multiplexer 8650）；新增 Rule 2b（deliver 字段机制 vs prompt 自述 + dated bak 漂移检测）；checklist 两行替换。
2. `default:devops/[已移除]` — 新增 Step 10「给家长写使用说明」规程（溯源优先/数字锚定/降级通道显式标注/示例可抄/速查卡）。
3. `default:devops/orchestrator-lessons` — 新增「九、对外承诺投递」节（内容同本 skill 核验规则）。

落地方式：在 default profile 会话里 `hermes -p default` 或直接文件工具编辑 `/Users/YOURNAME/.hermes/skills/devops/<name>/SKILL.md`。落地后删除本节对应条目。

## 重发已生成但投递无回执的回复（用户说「再发一次」时）

回复已生成、外发无成功回执（只有发送动作日志，既无 message_id 也无失败记录）= **不确定送达，不是已送达**。重发前先分清是不是真的丢了：

1. **先判是否需要重发**：日志里有投递尝试行但零回执，且对端此后无新消息 = 无法证实送达，重发合理；对端已回复或已确认收到则不要重发（重复内容比缺内容更伤）。把「不确定」如实告诉用户，由用户决定。
2. **取回原文重发，不重新生成**：回复正文在 profile 的 session store（`state.db`）里，按当日会话定位消息行。重新生成会造成两次回答口径不一，而用户已经看过（或本该看到）第一版。用日志里的字符数与取回原文长度对账（如 `Sending response (1230 chars)` vs 原文 1230 字符），对不上说明取错会话或取错消息，继续找而不是先发。
3. **正文里引用的看板卡/附件要复核仍有效**：重发前查被引用卡的 status 与产物路径；卡已被打回或归档时，要么先说明再发，要么等状态收敛。回复正文保持原样，状态问题单独告知。
4. **回执判据**：iLink 成功返回 `{"message_id": <id>}`，**响应体里没有 `ret`/`errcode` 键**。判成功 = `message_id` 存在且 `ret`/`errcode` 缺失或为 0；缺 `ret` 不等于失败。这个 id 记进汇报，是唯一的送达证据。
5. **直调 iLink 前先读报文形态**：`ret -2` 是 iLink 的通用「请求被拒」码，四种无关情况共用（缺参 / 报文错形 / 频限 / 按会话封禁），**只看 `errmsg` 判读**。`invalid arguments` = 报文错形，不是频限，等多久都没用。权威形态在 `gateway/platforms/weixin.py` 的 `_send_items()`：外层 `msg` 包裹，文本在 `item_list[].text_item.text`，`type`/`message_type`/`message_state` 三个常量必须用 adapter 的定义值。凭记忆写字段名（`item_type`、`text.content`）是最常见的错法。
6. **无 `context_token` 也能发**：对端未在本机发过消息时没有 peer token 可用，iLink 接受无 token 发送（cron 推送靠的就是这条路）。不要因为没拿到 token 就判定发不出去。
7. **优先走 adapter 而非手写 HTTP**：真实发送用 `send_weixin_direct`（自带长文本切块、频限门控、重试退避）。手写 HTTP 只用于只读诊断，或网关路径不可用时的重发。
8. **发完仍不能说「已送达」**：回执 = 服务端受理，真正的端到端确认只能来自对端回复。报告写「已重发，iLink 受理号 X，服务端已受理；对端是否收到需她确认」。

## Related

- `[已移除]`（default，Rule 2/2b 领地）
- `weixin-send-troubleshooting`（外发失败诊断）
- `orchestrator-lessons`（default，实战教训库）