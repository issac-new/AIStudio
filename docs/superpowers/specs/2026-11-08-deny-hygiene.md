# 2026-11-08 DENY 卫生批（真敏感脱敏＋gitleaks allowlist 挂钩＋deps 基线补刷）

> 来源：run28 收尾批批 C 暴露的三真卫生项清偿——GATE_ENFORCE_DENY 完整白名单恢复的前置。

## 变更

1. **真凭证脱敏**：`runtime/.../wechat-raw.html` 内 2 处微信广告 `ad_token`（128 hex 真实凭证，2026-10-23 调研抓取原文带入）→ `[REDACTED-credential-128hex-prefix…]`（保留 16 hex 前缀可溯源，真值消除）。
2. **`.gitleaks.toml` allowlist（仓根，登记制）**：generic-api-key 对 TS 对象键名的 5 值误报精确豁免（`ia2.att.sub*`/`ia2.notify.sub*`/`ia2_notify_prefs`/`waitP95Seconds`/`A7_prompt_leak`——业务键名字符串非凭证）；regexTarget=match 逐值登记，**不按文件放宽**（新增误报须逐值追加）。
3. **门实现挂钩**（技能资产 gates-warn.sh）：gitleaks 调用加 `--config "$PROJECT_DIR/.gitleaks.toml"`（存在时）——gitleaks 不自动发现 source 目录外配置，须显式传；另 deps 门 vendor 排除同步至 gates-warn.sh 内嵌副本（gates/process/deps.sh 已改而执行面走内嵌副本的盲区）。
4. **deps 基线补刷**（aistudio-dev 技能 codebase.md）：typescript ~6.0.2→~6.0.3（qgate devDeps 自包含批 0fefc03ff 升级、基线未随批刷的 10-01 欠账）。

## 决策记录

| # | 决策 | 备选与否决理由 |
|---|------|----------------|
| D1 | 脱敏保留 16 hex 前缀 | 全删失去可溯源性（哪次抓取带入可对照）；16 hex 前缀不足以重建凭证 |
| D2 | allowlist 逐值登记制而非按文件排除 | 文件级豁免=该文件后续真泄密也不报；值级 fingerprint 最小豁免面 |
| D3 | 基线补刷而非回退 ts | 升级批正当（devDeps 自包含），欠的是基线行；回退破坏 10-01 批意图 |

## 验证

- deps 门：全绿（vendor 6 条消＋ts 基线对齐）。
- gitleaks 带 --config 残检 0（harness 目录实测）；sensitive 门合并主树后复验。
- 脱敏后 `grep ad_token` 仅剩 REDACTED 形态。

## 设计文档影响

DESIGN_SYNC: none——安全卫生处置与门禁配置面，不触及整合正本与数字总账。
