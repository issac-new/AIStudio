---
name: personal-ai-consent-gate
description: Use when 个人/家庭AI服务加协议同意门或改版：儿童单独同意+服务端双勾+留痕链
---

# 个人 AI 服务同意门（协议起草/改版/工程落地）

适用：为自己搭建、面向亲友第三方的 AI 服务（对话 bot/邀请绑定）建立或修改「用户协议同意」机制。经验源：[已移除] 家庭邀请服务；多租户总览与邀请链路归 default profile 的 `[已移除]-multitenant-family`（该件为权威源），本件只管同意门与协议合规。

## 不变量（每次改版必须全部成立）

1. **双文本双同意**：用户协议之外，凡涉及不满 14 周岁未成年人信息，必须独立《儿童个人信息保护规则》+ 独立勾选框——敏感个人信息须监护人单独同意（PIPL 29/31 + 儿童个人信息网络保护规定），禁止并入用户协议一揽子勾选。
2. **强制在服务端**：同意校验放 QR/资源发放端点（缺任一同意 → 返回 need_consent 拒发），前端勾选只是入口——前端摆设等于没门。
3. **consent 幂等升级**：补勾判据用「缺哪个补哪个」（`not consent_at or not child_privacy_consent`），禁 `if not consent_at` 一次性写入——后者把分步勾选（先勾协议、后补儿童同意）锁死在半同意态，是真实用户路径上的静默死锁。
4. **版本+指纹纪律**：改任一协议文本必须升版本号并重算双 SHA；唯一事实源 = 服务脚本顶部常量（AGREEMENT_TEXT / CHILDREN_PRIVACY_TEXT 及配套 *_VERSION/*_SHA）。文档/SOUL/skill 不复制具体版本号与 SHA——升版即变旧值残留；引用时只写「以脚本顶部常量为准」。
5. **留痕证据链**：consent 事件（版本+sha+时间+IP/UA）+ bound 事件（关联平台身份 account_id/user_id）append-only 落盘，闭合「哪个文本 ↔ 谁 ↔ 何时同意」；同意页须让用户能保存/复制协议全文。
6. **对外前置**：协议内【管理员真实姓名及联系方式】占位未填不得对外；从免费转收费须执业律师审定全文（主体登记+消法口径收紧）。

## 条款审查清单

起草/改版逐项过 `references/consent-agreement-legal-review.md`（免责红线/删除分层/数据出境/变更重同意/管辖等中国法口径）。

## 工程位图（[已移除] 实例）

- 协议常量 + 页面模板 + consent/qr 门禁：`~/.hermes/bin/[已移除].py`（8660 公网页 / 8661 本机 admin）
- 留痕：`~/.hermes/[已移除]/consent-log.jsonl`
- 改后验收：py_compile → `launchctl kickstart -k gui/$(id -u)/ai.hermes.[已移除]` → curl 三路径（未同意拒发 / 分步补勾放行 / 一次双勾放行）→ 测试邀请置 expired 清理，不留 pending 任务
