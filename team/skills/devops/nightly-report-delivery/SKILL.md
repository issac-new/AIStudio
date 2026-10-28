---
name: nightly-report-delivery
version: 1.0.0
description: Use when delivering nightly report briefs or PDF emails.
---

# nightly-report-delivery — 夜间日报投递通道

覆盖主雷达/8域/[已移除] 日报的投递环节：微信简报、邮件 PDF、正文质量标准。
（管道韧性/幂等/zcode 路由见 default 库 `nightly-radar-runbook`，本技能只管投递。）

## 投递策略（用户裁定，永远生效）

- **【2026-09-21 裁决覆盖以下两条旧策略】夜间 Loop = 一封合并邮件 + 一个合并 PDF**（`nightly_digest.py`），11 封独立邮件（主雷达/[已移除]/8域/evo）停发；**微信投递全停**（iLink 持续限流无意义）——报告管道不再有任何微信触点（心跳/域简报/[已移除]/loop-graph/docsync 的 deliver 已全部改 local，补投队列 tick 已 pause）。
- 合并机制：各报告仍独立生成产物（md/PDF 不变，supervisor 补跑逻辑不变）；投递侧 `nightly_digest.py` 在 unified 入口末尾跑——PyMuPDF 拼接 10 份 PDF 成 `nightly_digest_<date>.pdf`（带书签 TOC）+ 正文聚合各报告 LLM 核心段（研判/周重点/领域态势/evo）成一封 agent mail。幂等 marker `cache/radar/.digest_sent_<date>.json`（含 pdf sha1）。
- evo 晨报不另发：`evo_nightly_wrapper.sh` 只写 s6 状态文件（delivery=merged-into-digest），正文段由 digest 并入。
- **微信 = 纯文字要点简报**（历史策略，通道恢复前不适用），禁止投 PDF 附件。简报必须是「有判断的内容」。
- **邮件 = PDF 完整版唯一通道**，收件人 __ROTATED-20261014__，发件身份 **agent mail（swarmstudio@agent.qq.com）**，正文 **Markdown 渲染**。
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
  - 附件与 `--body-file` 都只收相对路径（限 cwd 子树，绝对路径报 unsafe）——`cd` 到报告所在目录再执行，或先 `attachment +upload` 换 file_id；`--body-file` 必须指向实际 HTML 文件，不能误写成 PDF 附件名。
  - 限额：日 50 封 / 时 200 次 / 分 10 次；附件单件+总计 20MB。
  - 送达验证：`agently-cli message +list --dir sent` 查 from/subject/附件标志。
- 正文的内容源仍统一用 Markdown（# 标题 / > 引用块数据底座 / **粗体信号名** / 列表 / --- 分隔线），但发送前必须显式渲染为 HTML；不要把 Markdown 直接交给邮件 API 并假定客户端会渲染。HTML 正文应通过临时 `--body-file` 传入，SMTP 回退用 `MIMEText(html, 'html', 'utf-8')`。

## 管道契约（邮件正文的原料）

- **每个报告生成器必须落盘 `llm_advice_<prefix>_<date>.json`**（域报告/[已移除] 均已接；字段名分型：域/主雷达 = outlook/signals/actions，[已移除] = weekly_focus/relevant/suggestions）。缺 JSON 时邮件正文自动降级为「纯雷达罗列」——这正是空洞日报的成因，新报告类型接入时先补落盘。
- `send_report_email.py build_body` 按 prefix 分型渲染，[已移除] 与域报告字段不同，勿合并。
- **禁止把缓存刷新 glob 写成 `*_<date>.json`**：[已移除]/域雷达的 summary 与 llm_advice 同以 `_<date>.json` 结尾且先于主雷达运行，宽 glob 会在主雷达刷新时清空兄弟管道当日原料（邮件正文退化 + 研判段丢失）。只清本管道自有前缀（summary_<date> / llm_advice_nightly_radar_<date> 等）。

## 正文与 PDF 分层（用户裁定：正文关键简述，PDF 详细版）

- **正文 ≠ PDF 复制品**：同源 llm_advice 原样拷进正文会被判「和 PDF 完全一样」——这是分层缺陷非排版缺陷。正文只放一句话版信号（标题+why 前置判断）与建议本体+成本；完整论证/评估研判只在 PDF。已落 build_body（域/主雷达/[已移除] 三型）。
- **digest 正文=内参的四条红线**（合并邮件正文的形态标准；问题全部出在聚合层 `nightly_digest.py`，不动报告生成器）：
  - 内容选取走结构化原料，不走段内硬截断——`_md_section` 按行数截 md 会砍掉行动清单/信号表这类核心段。主雷达研判收全文；每域走 `_domain_core()`：llm_advice JSON 直取 3 条信号（title+why 各截 150/160 字，`_clip` 中文句读断）+ Top1 建议（what 90 字+cost，尾标「评估全文见 PDF」）；缺 JSON 回退抓 md 信号表。新报告类型接入 digest 必过：正文要独立成立为内参，不是 PDF 的目录页。
  - 各级标题禁统计快照——「（X源X条）」类计数是数据底座元信息，属黄页化源头；底座数字只在 PDF 数据底座声明段出现，标题=内容定位（域/主题）。删计数后同步清理失去调用者的辅助函数——死代码即漂移源。
  - 探针/巡检类段落合成研判句，不搬运清单——违规明细原文与扫描计数（「扫描 N 个」「缺失 N 条」）是缺失清单+元数据=流水账，信息密度低。合成结构：健康结论（done/失败比）→ 风险定性（点名对象+性质定性如「SOUL 协议合规缺失、非功能故障」+待核卡号）→ 能力沉淀白话 → 行动项（积压/待裁决）。数字全部取自原料原文，禁止编造；结构化解析失败回退原样输出，格式漂移不断供。
  - 段落锚定先看原料结构，标题锚不可假设——判断段常在第一个 `## ` 标题之前（evo 三点式：资源效率/系统风险/能力沉淀），`r'^## '` 锚永远抓不到，按内容锚抓；上游 cron 提示词噪声（CRON_FAILURE/RECURSION 字样）显式过滤。
- **聚合 Markdown 送渲染前必须过块结构修复 + li 计数断言**——聚合器若删空行，段落与 `- ` 列表间无空行时 python-markdown 走 lazy continuation，列表并进段落挤成一行（源 md 本身也可能 `**行动清单**：` 后无空行直接接列表）。修法：抽段保留空行（max_lines 只数非空行），出口统一过 `_fix_blocks()`——列表行紧贴异类块（段落/异型列表）自动补空行，`_md_section` 与 `_evo_core` 共用；验证=渲染后数 `<li>` 个数与信号+行动项数一致，不信「源 md 本身格式正确」。
- evo 段回归断言：`CRON_FAILURE not in body`、`扫描 profile not in body`、`集群产出 in body`。
- **digest 六项整体改版（2026-10-20 用户裁定，document-writing-craft 驱动）**：
  - [已移除] 段空洞根因=只抓 md 的 `<div class="suggest">` 2 条；改走 llm_advice JSON（weekly_focus+relevant 3 条 why+suggestions 3 条），缺 JSON 回退 md。
  - 「EDA」更名「集成电路全产业链」需双处落：digest 的 `DOMAIN_TITLES` + domain_nightly 的 `spec['title']`，漏一处=正文与 PDF 书签不一致。
  - 独立「科技舆情」节：RSSHub 本地三通道（微博热搜/知乎热榜/36氪 hot-list）强科技词过滤；关键词表禁泛词（安全/数据/教育/模型——社媒语境会误中「安全感/骚乱安全」），必须带负向过滤（杀妻/宣判类社会新闻）与知乎广告条目（看山）过滤；舆情是发送时点实时快照。
  - 态势拗口的根在 prompt 不在聚合：build_domain_report outlook 任务增「首四字禁『今日信号』套话+禁破折号+说人话（资深研究员当面同步腔）」。
  - **节序与舆情深化（2026-10-20 追加裁定）**：正文节序=科技舆情→技术雷达→领域雷达→集群运行→[已移除]（舆情最前、[已移除] 压尾）。舆情段升级为「主要事实+观点逻辑」：`_public_pulse_analysis` 喂 RSSHub 标题+描述（描述含主体/事件/数字，非裸标题）走 zcode LLM——输出事实句（≤12字）+观点组（theme+trend 趋势句+组内条目）+others，prompt 硬约束「与硬科技无关条目直接丢弃」+「只引用描述里有的信息」；LLM 失败回退纯标题罗列（不断供）。断言：节序 grep 顺序正确、舆情段含 `：`观点句。
  - **舆情本质洞察层（2026-10-20 追加）**：观点组加 `insight` 字段（≤50字渲染≤70）——结构性驱动/因果机制：为什么现在发生、谁在推动、改变了什么利益/力量格局。prompt 给反例锚定：「XX加速」是现象、「因为YY门槛/利润/监管变了所以XX」是机制；允许基于描述合理推断、禁编造具体数字/机构名/人物。渲染为组标题下 `- 本质：…` 缩进行。实测：zcode 首试超时会自动降级 direct 同模型成功（降级链设计生效），洞察质量判据=写机制不写现象复述。
  - 全文去 AI 味：标题/落款 emoji 删除、`——` 归一为 `：`、落款平实句。
  - 附件瘦身：`_slim_pdf` 从「差距复盘」页起裁掉台账倾倒段（主雷达 37 页中 33 页是台账），找不到锚点原样返回不误裁；合并 PDF 63→30 页。
- **PDF 能力改进建议必须带三问评估**（build_domain_report prompt 内置）：actions=dict{what,gap,gain,cost}——现状缺口（具体，勿臆测已有）/提升路径+**验证信号**（可验证真提升）/成本（人日/周/月级+值不值）；空泛无法验证的建议直接丢弃。渲染 .eval 蓝框区分建议黄框；LLM 字段嵌 HTML 前必须 `_esc()` 转义。正文侧 dict 只取 what+cost 并标注「评估全文见 PDF」；渲染兼容旧 str。
- gap 闭环占位符治理：proposed_fix 仍是「待领域团队分析」占位即派工质量缺陷，评估回填后才能进 done。

## [已移除] 源可用性台账（扩源前先查，勿重复踩）

- ✅ 稳定 8 源：additude/mindshift/hechinger/scidaily_child/**the74**/36kr(RSSHub)/qbitai(wp-json)/jiemodui。
- ❌ Cloudflare 指纹挑战不可入库（curl 简单 UA 时通时断、完整 Chrome 串反被挑战、urllib 全拦）：edutopia/psypost/readingrockets/commonsensemedia/[已移除]/zhihu(404)。fetch 函数保留备用并注明状态；接 computer_use 后可复用。纯 RSS 扩源空间已近上限。
- RSSHub 容器会静默 Exited——某源突断先查 `docker ps | grep rsshub`，`docker start rsshub` 即恢复。

## digest 聚合层修改闭环

改 `nightly_digest.py` 后按序执行，缺一不可：
1. 离线渲染：import 模块 → `build_digest_pdf(date)` + `build_body(date, parts, evo)` + `build_html(body)`，跑断言（无流水账标题、无探针元数据、`<li>` 计数、研判句在位）；同时落 md+HTML 双预览文件（如 `~/nightly_digest_body_<date>.md/.html`）供用户浏览器过目——用户要预览时给绝对路径。
2. `py_compile` 终验后 `nightly_digest.py <date> --force` 补发当日版，让修复立即落地，不等当晚 Loop。
3. grep sent 目录核验 from=swarmstudio@agent.qq.com 且 has_attachments=true——用户看的是邮箱实发版，不是离线渲染版。

## 验收清单

- [ ] 调用输出含 `via agent mail`（出现 `smtp-fallback` 即需排查 agently-cli）
- [ ] sent 目录可见 from=swarmstudio@agent.qq.com 且 has_attachments=true
- [ ] 正文含 LLM 判断段（态势/建议），无「?源?条」「（X源X条）」「无 LLM 建议 JSON」「扫描 profile」字样
- [ ] PDF 附件与 md 报告同日同前缀
- [ ] evo-nightly 晨报：当日 evo 日志含 `[agent-mail] sent` 且 s6 防重状态文件已生成（wrapper 恒 exit 0，cron ok 不作数）

## references/agently-cli-quickref.md — agently-cli 发信速查（+me 限额/两步确认/cwd 相对路径/JSON 落盘解析/sent 验证）
