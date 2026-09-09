---
name: nightly-report-delivery
description: Use when delivering nightly report briefs or PDF emails.
---

# nightly-report-delivery — 夜间日报投递通道

覆盖主雷达/8域/[已移除] 日报的投递环节：微信简报、邮件 PDF、正文质量标准。
（管道韧性/幂等/zcode 路由见 default 库 `nightly-radar-runbook`，本技能只管投递。）

## 投递策略（用户裁定，永远生效）

- **微信 = 纯文字要点简报**，禁止投 PDF 附件。简报必须是「有判断的内容」：域报告取「今日领域态势」整段，[已移除] 取「本周家庭重点+今日定制建议」，主雷达取文字摘要。
- **邮件 = PDF 完整版唯一通道**，收件人 your@example.com，发件身份 **agent mail（your-bot@example.com）**，正文 **Markdown 渲染**。
- **发件身份规则覆盖所有报告邮件管道**（主雷达/8域/[已移除]/evo-nightly 晨报/未来新报告）：新报告类型接线时必须 agent mail 主通道 + SMTP 显式回退；只接 SMTP 的发送器 = 通道缺陷。症状信号：同类报告 from 身份不一致（有的经 swarmstudio、有的是自发自收）= 有管道绕过了 agent mail，先查该管道自己的发送器。
- 失败语义：**邮件失败 = 步骤失败**（PDF 唯一完整通道，必须送达，supervisor 补跑）；微信简报失败不阻断。
- 正文质量标准（用户原话级要求）：「是一份内参而不是一份黄页摘录」——正文必须携带 LLM 的判断（态势/why/建议动作），禁止裸标题罗列、禁止只有「N源M条+详见PDF」的空壳。

## 通道机制

### 微信简报（no_agent cron stdout 即投递）

- no_agent 模式下 **cron 脚本的 stdout 本身就是投递消息**，简报用 awk 从报告 md 提取目标段落后 echo 即可，不要额外调 `hermes send` 发附件。
- iLink 账号级惩罚冷却：连败十几次触发、跨重启持续、**重试即续期冷却**——限流期禁止用测试发送去探通道，让首份真实简报做验证。

### 邮件（agent mail 主通道 + SMTP 回退）

- 一律调用 `life-workbench/scripts/send_report_email.py <date> <prefix>`（v2+：agent mail 主通道，失败自动回退 SMTP 并在主题标 `[smtp-fallback]`）。prefix：`nightly_radar` / `[已移除]` / `domain_<域>`。
- **evo-nightly 晨报走独立发送器 `~/.hermes/evo/evo_send_email.py <report.md>`**（agent mail 主通道 + SMTP 显式 `[fallback]` 回退），勿路由进 send_report_email.py（prefix 分型不覆盖 evo）；幂等靠 wrapper 的 `~/.hermes/evo/cache/s6_<date>.json` 防双发，发送器内不另做防重。
- **evo wrapper 恒 exit 0**（真实输出全在 `~/.hermes/evo/logs/evo_<date>.log`）：cron last_status=ok ≠ 投递成功。验收 grep 当日日志的 `[agent-mail] sent` / `[smtp-fallback]` / `[error]` 行，并确认 s6 防重状态文件当日已生成。
- 手工走 agently-cli 时：
  - 两步确认：`message +send` 首调返回 `confirmation_token`，二调带 `--confirmation-token` 且**参数逐字节一致**（内容一变即 `Request content modified` 拒发）。
  - 附件与 `--body-file` 都只收相对路径（限 cwd 子树，绝对路径报 unsafe）——`cd` 到报告所在目录再执行，或先 `attachment +upload` 换 file_id。
  - 限额：日 50 封 / 时 200 次 / 分 10 次；附件单件+总计 20MB。
  - 送达验证：`agently-cli message +list --dir sent` 查 from/subject/附件标志。
- 正文必须是 Markdown（# 标题 / > 引用块数据底座 / **粗体信号名** / 列表 / --- 分隔线）；agently 自动检测格式。

## 管道契约（邮件正文的原料）

- **每个报告生成器必须落盘 `llm_advice_<prefix>_<date>.json`**（域报告/[已移除] 均已接；字段名分型：域/主雷达 = outlook/signals/actions，[已移除] = weekly_focus/relevant/suggestions）。缺 JSON 时邮件正文自动降级为「纯雷达罗列」——这正是空洞日报的成因，新报告类型接入时先补落盘。
- `send_report_email.py build_body` 按 prefix 分型渲染，[已移除] 与域报告字段不同，勿合并。
- **禁止把缓存刷新 glob 写成 `*_<date>.json`**：[已移除]/域雷达的 summary 与 llm_advice 同以 `_<date>.json` 结尾且先于主雷达运行，宽 glob 会在主雷达刷新时清空兄弟管道当日原料（邮件正文退化 + 研判段丢失）。只清本管道自有前缀（summary_<date> / llm_advice_nightly_radar_<date> 等）。

## 正文与 PDF 分层（用户裁定：正文关键简述，PDF 详细版）

- **正文 ≠ PDF 复制品**：同源 llm_advice 原样拷进正文会被判「和 PDF 完全一样」——这是分层缺陷非排版缺陷。正文只放一句话版信号（标题+why 首 80 字判断）与建议本体+成本；完整论证/评估研判只在 PDF。已落 build_body（域/主雷达/[已移除] 三型）。
- **PDF 能力改进建议必须带三问评估**（build_domain_report prompt 内置）：actions=dict{what,gap,gain,cost}——现状缺口（具体，勿臆测已有）/提升路径+**验证信号**（可验证真提升）/成本（人日/周/月级+值不值）；空泛无法验证的建议直接丢弃。渲染 .eval 蓝框区分建议黄框；LLM 字段嵌 HTML 前必须 `_esc()` 转义。正文侧 dict 只取 what+cost 并标注「评估全文见 PDF」；渲染兼容旧 str。
- gap 闭环占位符治理：proposed_fix 仍是「待领域团队分析」占位即派工质量缺陷，评估回填后才能进 done。

## [已移除] 源可用性台账（扩源前先查，勿重复踩）

- ✅ 稳定 8 源：additude/mindshift/hechinger/scidaily_child/**the74**/36kr(RSSHub)/qbitai(wp-json)/jiemodui。
- ❌ Cloudflare 指纹挑战不可入库（curl 简单 UA 时通时断、完整 Chrome 串反被挑战、urllib 全拦）：edutopia/psypost/readingrockets/commonsensemedia/k12digest/zhihu(404)。fetch 函数保留备用并注明状态；接 computer_use 后可复用。纯 RSS 扩源空间已近上限。
- RSSHub 容器会静默 Exited——某源突断先查 `docker ps | grep rsshub`，`docker start rsshub` 即恢复。

## 验收清单

- [ ] 调用输出含 `via agent mail`（出现 `smtp-fallback` 即需排查 agently-cli）
- [ ] sent 目录可见 from=your-bot@example.com 且 has_attachments=true
- [ ] 正文含 LLM 判断段（态势/建议），无「?源?条」「无 LLM 建议 JSON」字样
- [ ] PDF 附件与 md 报告同日同前缀
- [ ] evo-nightly 晨报：当日 evo 日志含 `[agent-mail] sent` 且 s6 防重状态文件已生成（wrapper 恒 exit 0，cron ok 不作数）

## references/agently-cli-quickref.md — agently-cli 发信速查（+me 限额/两步确认/cwd 相对路径/JSON 落盘解析/sent 验证）
