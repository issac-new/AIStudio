---
name: nightly-intel-radar
version: 1.0.0
description: "构建/运维定时多源情报雷达管道（fetch→报告→PDF→微信→差距派工闭环）。"
metadata:
  hermes:
    tags: [intel, radar, cron, weixin, pdf, rsshub, antibot, pipeline]
    related_skills: [daily-intel-brief, cron-script-wrapper-pattern, web-scraping-antibot, weixin-send-troubleshooting, sogou-wechat-batch-fetch]
---

# Nightly Intel Radar（定时多源情报雷达管道）

定时（夜间窗口）自动跑批的多源技术情报管道：抓取 → 差距复盘 → 派工闭环 → PDF 推微信。
本机运行实例：cron `fa8b11f3d382`「夜间深度调研日报」每晚 23:00 跑 `~/.hermes/scripts/nightly_radar.sh`，
代码在 `life-workbench/scripts/{radar_fetch,build_report}.py`（15 源基线，渠道详情见 `references/radar-channel-playbook.md`）。

## When to Use

- 搭建/修改「定时抓取多源信息 → 汇总报告 → 推送」类管道
- 给现有雷达扩渠道（新增 RSS/API/社交平台源）
- 管道夜间跑失败/数据不新鲜/推送双发等排障
- 验证 worker 交付的 archify/archify 类自包含 HTML 状态页（PASS 收据 sha256 与当前文件实测一致才可信）

## archify 类 HTML 状态页验收配方（实证的通用解法）

archify deliver 产出的「N/N checks pass」文字自述**不可直接采信**——它的 visual-check 收据可能 status=fail（viewport-overflow）。验收三步：

1. **打开收据原文**（不是看 deliver 的数字）：`visual-check.pass.json` 的 `status`/`diagnostics` 字段；PASS 时 `containment.viewports[]` 里每个视口的 `scrollHeight == innerHeight && ok == true`
2. **sha 对账**：`deliver.json` 的 `artifact.sha256` 必须与当前 HTML 文件实测 sha256 一致——防「收据是旧文件的」冒领
3. **旧收据留档对照**：`.FAIL-archive.json` 的 artifact sha 应与更新前 HTML 一致——证明修复真实发生过（新 HTML ≠ 旧 HTML）

根因判据：viewport-overflow 通常是真实缺陷而非工具误报——viewer 的自适应布局有启用门槛（`WIDE_RATIO`，viewBox 宽高比低于阈值时全宽渲染超高页面）。修复方向：压缩节点 Y 向偏移让 viewBox 宽高比过门槛。

## 管道架构（2026-09-04 起为三 job 韧性链）

**生产入口 = `nightly_radar.py`（幂等分步+断点续跑），不是 .sh！** 三个 cron job 共用它（详见 ops-devops 的 nightly-radar-runbook skill）：

```
job 56b0cd499076 wrapper（23:00 agent，deliver=local）→ nightly_radar.py --refresh --supervise
job 413c65d20f1c/133c0de3f284 supervisor（23:30/00:00 no_agent，deliver=weixin=真投递出口）
  → nightly_radar_supervisor.sh → 幂等检查 → nightly_radar.py --supervise 补跑
```

nightly_radar.py STEPS（每步落盘 wrapper_state，failed 必重试）：
radar_fetch → **mcp_guard**（MCP 护栏 all；rc 0/1/2=业务事实写 mcp_guard_meta，3/超时=故障重试；
告警段由 build_weixin_summary 按 rc 生成，clean 静默）→ radar_report → gap_closure → pandoc → Chrome PDF → 验页 → weixin_push（幂等防双推）。

旧 `nightly_radar.sh` 已退役：job fa8b11f3d382（orchestrator）paused，仅 dormant 备份。
改 `.py` 无需 copy 双份（cron/supervisor 绝对路径引用 workspace 原件）；改 `~/.hermes/scripts/` 下的 `.sh` 才需与 life-workbench 源同步。

## 🔴 用户授权窗口纪律

夜间任务的浏览器操作（computer_use）**仅限 23:00-09:00**，且仅允许 Chrome 与微信客户端内公众号/服务号内容，
禁聊天与支付。wrapper 内置小时守卫：窗口外运行记日志警告。当前 HTTP/RSS 通道不受限，此纪律为浏览器扩展预留。

## 新增渠道流程

1. 查 `references/radar-channel-playbook.md` 渠道矩阵（已实测 ✅/🔄/❌），避免重复踩坑
2. 实现新 fetch 函数，**签名必须是 `fetch_x(cfg, deadline) -> (items, note)`**，用现有 helper
   （make_item/keep_top_scored/strip_html/normalize_date），别自造不存在的 helper（本会话踩过 `_parse_rss` NameError）
3. SOURCES 列表登记（key/kind/domain/fn/top_n）；py_compile + 单源冒烟（清 `scripts/__pycache__` 再测）
4. `TEST=1 nightly_radar.sh` 干跑全链路（跳过发送），验证 exit=0 + stdout 干净 + summary 数字增长
5. 改完工作区脚本必须**重新 copy 到 `~/.hermes/scripts/`**（cron 只认该目录，两份并存不同步=跑旧版）

## 09-07 全域扩源（27→49 源，已全部实测抓取验证）

单源域（pay）与双源域导致：单一视角无交叉验证、源故障即空报告。扩源原则：
候选先过三关（HTTP 200 + 有 items/entries + description 非 HTML-escaped），
入库后每域真跑一次 domain_nightly 确认 sources_ok。

| 域 | 原→新 | 新增源 |
|---|---|---|
| hack | 2→5 | HackerNews(krebsonsecurity 那份是 feedburner 的 TheHackersNews)、Krebs on Security、Trail of Bits |
| [已移除] | 2→5 | EDN、EE Times、AnySilicon |
| pay | 1→4 | PYMNTS、Ledger Insights(区块链/CBDC)、Cointelegraph |
| data | 3→5 | DevClass、InfoQ EN |
| ops | 2→4 | r/sre RSS、dev.to sre tag |
| platform | 3→5 | Martin Fowler、Pragmatic Engineer |
| product | 2→5 | NN/g、UX Collective、SVPG |
| aiteam | 3→5 | DeepMind blog、极客公园 |
| [已移除] | 5→6 | The 74 |

伴生修复：platform 域关键词补 `llm/agent/coding agent/ai tooling/prompt`
（simonwillison 全是 LLM 工具链内容却大面积 0 分）——扩源后必须复查
**关键词命中率**（`_dscore>0` 占比），命中率低=排名退化回 relevance 主键，
新源噪声会顶到 Top10。403 源（finextra/devops.com/financialbrand）与 0-item
源（americanbanker/usenix）不要复试。

### 09-07 权威性复审（用户裁决：确保源高质量与权威性）

分级标准：T1=监管机构一手/顶级研究机构/行业标杆刊物；T2=成熟行业媒体（有编辑
审校）；T3=社区 UGC/自媒体（无编辑责任）。**T3 一律不得入库。**

- 首轮扩源混入 4 个 T3 已全部替换：cointelegraph→Fed/ECB 官方新闻稿（监管一手，
  pay 域最需要的正是监管动向）；r/sre+dev.to→AWS Ops Blog+Kubernetes 官方博客；
  uxdesign.cc(Medium 策展)→Product Talk（Cagan 体系权威）。
- 复审后全舰队 49 源：T1×24、T2×25、T3×0。原 27 源亦补审通过（arxiv/HF/Apache
  release/ADDITUDE/Hechinger 等均 T1）。
- 关键词表必须覆盖源的语言域：pay 加 Fed/ECB 后命中 0/15——监管稿用
  bank/enforcement/stablecoin 等英文词，中文关键词表打不中。扩英文源必须同步补
  英文 keywords。复审后 pay 15/15、product 13/15。
- 源分层认知：监管一手源（Fed/ECB）条目是"公告体"（announce termination of…），
  信息密度低但权威性最高，适合作为合规信号的锚点而非时效头条。

- **RC8 strip_html 顺序缺陷（本轮「样子货」根因）**：旧实现先剥标签后 unescape，
  而 paymentsdive/data_dew/simonwillison 等源的 description 是 HTML-escaped
  （`&lt;figure&gt;&lt;img…`）——unescape 后标签原样穿透，300 字截断预算被
  `<figure><img src=…>` 吃光，LLM 原料只剩半句话 → 3 条信号全标「标题判断，
  待读原文」的看标题编空话报告。修复：剥标签→unescape→再剥（两轮）+ 清 CDATA 壳；
  保留第三层 escaped 字面量（用户内容里的 `&lt;guardrail&gt;` 是合法记号）。
  实证：修复后同域重跑，why 引用摘要具体数据（21 家机构/1.55 亿美元），
  「标题判断」0 条。**教训：原料层缺陷会伪装成「LLM 能力不行」——先看喂进去的是什么再怪模型。**
- **RC8 伴生**：`ask_llm_json` prompt 原料 220→400 字（build_domain_report /
  build_[已移除] / radar_llm_brief 三处）；prompt 加「至多 1 条标题判断、
  空摘要条目跳过宁缺毋滥」硬约束。
- **邮件质量升级**（send_report_email.py 重写）：标题带类型+领域（原「深度调研日报
  2026-09-07」不分报告）；正文从 llm_advice_<prefix>_<date>.json（新增落盘）提取
  今日态势/关键信号/改进建议，无 advice 时退 summary Top5 并显式标注「LLM 研判段缺失」。
- 域报告 PDF 大小判别：~190KB（近空）vs ~530KB（正常）——排查时先看体积。

## 报告被批「样子货/空话」：三步定位（先原料，后模型）

收到报告质量投诉时按序查，**不要先动 prompt**：

1. **看产物体积**：域报告 PDF ~190KB≈LLM 失败的纯雷达模式，~530KB≈正常生成；
   md <2KB=纯标题列表。体积正常再往下查内容。
2. **看 LLM 实际吃到的原料**：从 summary json 抽 top_items 的 snippet——
   含 `<figure><img` 等 HTML 残片 = 原料污染（RC8 类）；数输出里「标题判断，
   待读原文」出现率，超过 1/3 即原料不足以支撑分析（RC1/RC7 类）。
3. **原料干净且充足仍空话，才调 prompt/换模型**——此时才允许怀疑 LLM。

根因法则：**原料层缺陷会伪装成「LLM 能力不行」——先看喂进去的是什么，再怪模型。**
RC1（字段错位）、RC7（截断过薄）、RC8（HTML 穿透）全是这一类。

## 09-05 报告质量事故根因（RC1-RC7，修复已落地）

用户判「夜间深度调研报告质量普遍很差」，解剖出 7 个叠加根因：
- **RC1 字段名错位**：`build_domain_report.py`/`build_[已移除].py` 读 `it.get('summary')`，
  但 `make_item()`（radar_fetch.py:153）产出的字段是 `snippet` → LLM 原料全空，深度分析退化成看标题猜。
  改报告生成器时**必须先核实上游字段名**，别信记忆。
- **RC2 LLM 调用无重试**：单次 hermes -z，夜间限流窗一次失败=整份报告静默降级「纯雷达模式」。
  已修：公共层 `scripts/radar_llm.py`（ask_llm_json：3 次重试+线性退避 25/50s+平衡括号 JSON 提取）。
- **RC3 幽灵承诺**：radar_report.py 报告头写「研判由夜间 LLM 段补充」但 wrapper STEPS 无此步。
  已修：新增 `scripts/radar_llm_brief.py`（生成「## 〇、今日研判」）接线 nightly_radar.py 步骤 2.5（timeout 1300s）。
- **RC4 打分退化**：domain_nightly.py `_dscore` 用 substring 匹配，中文关键词对英文文本恒 False →
  全 0 分排序失效，垃圾条目混入 Top10。已修：ASCII 词 word-boundary + 中文 keyword in。
- **RC5 gap 命中泛词假阳性**：`for`/`security` 等停用词漏网，差距复盘证据全是噪声。
  已修：radar_report.py STOP_ASCII 扩表。
- **RC6 双管道 + 看板狗复活旧 job**：旧 job fa8b11f3d382（跑废弃 build_report.py，改进建议是硬编码三行）
  被 `cron_paused_watchdog.sh` 每 6h 自动 resume（白名单里有它！）→ 00:29 catch-up 触发，
  用简陋版报告**覆盖**新管道产物。已修：白名单移除 + cronjob pause。**教训：pause job 前先查有没有 watchdog 会复活它。**
- **RC7 原料过薄**：snippet 截 300 字符，LLM 可分析文本不足。prompt 侧已放宽到 220 字/条入 prompt。
- 修复后实测：aiteam 报告从 1.4KB「纯标题列表」→ 4KB 带态势研判/硬数据信号/可执行建议；
  [已移除] 报告恢复「夜探+火箭+幼小衔接」定制化；主报告插入研判段（Gated DeltaNet 4-bit 等带分数引证）。

## Pitfalls（全部实测）

- **找插入点前先读 cron jobs.json 全量**：早期文档写的入口可能已被韧性改造替代——以 enabled job 的 script/prompt 为准，别信文档记忆。
- **jobs.json 直改在 macOS 无 flock 命令**：`flock` 是 Linux util-linux 工具，macOS 未内置——
  用 python `fcntl.flock()` 替代（open lockfile + LOCK_EX），锁-读-改-原子替换-解锁同一进程内完成，
  改后重读复核。Linux 上才可用 shell flock 包装。
- **并行 worker 会改同一文件**：patch 报 old_string 不匹配=文件被外部修改的信号，重读合并别盲试；收工前 diff .bak 确认两波改动共存且 py_compile 过。
- **step_done sticky-failed 坑（已修）**：旧逻辑「有 done_at=完成」让 failed 步永不重试、supervisor 补跑空转。现已只认 status=done；新步骤依赖此语义，勿回退。
- **TLS 指纹是反爬第一性原理**：urllib 被 FreeBuf 阿里云 WAF（`aliyun_waf_aa` 挑战页）拦而 curl 可过，补浏览器 headers 无效。`http_get` 用 curl 子进程打底；**curl 必须带 `-L`**（arXiv http→301 无 -L 时 body 空）；API URL 直接写 https 终态。详见 web-scraping-antibot skill。
- **幂等缓存 vs 定时新鲜度**：23:00 重抓前必须 `rm -f cache/*_<today>.json`，否则幂等跳过让「最新」停留在白天——用户明确要求「截止撰写时刻最新」。
- **cron no_agent stdout = 直投微信**：wrapper stdout 只放给用户看的几行摘要，日志 `>> cron.log 2>&1`；wrapper 内再调 `hermes send` 会与 stdout 投递**双发**。只用一种投递方式。
- **iLink 限流是两层，不是一层**：常规冷却 30s（条间 `sleep 36` 即可）；但连续失败十几次升级为**账号级惩罚冷却**——持续远超 30s，且期间**每次 send 尝试都会续期冷却**。处置：全面停发，让补投队列的指数退避自然避开，长静默（小时级）后单次手工探测确认恢复；重试循环硬烧只会无限续期。附带诊断纪律：`hermes send` 失败时 stderr 首行常是通用的「update pulled new code 未重启」警告，与真实死因无关——**真实错误永远是输出的最后一行**（如 `iLink sendmessage rate limited`），别被首行警告带偏。
- **CLI 发微信需 `export WEIXIN_HOME_CHANNEL=...`**（shell 会话内不自带）；**持久修复是 config.yaml 的 `platforms.weixin.home_channel` 块**——`hermes send` 无显式 channel 时经 gateway config 解析 home channel，env var 只是单次 inline 变通（详见 weixin-send-troubleshooting §2）。home channel 缺失时自动重试脚本（如补投队列 tick）会在必败路径上白烧尝试次数——先修配置再重排队列。
- **`hermes cron edit --script` 只认相对路径**（`~/.hermes/scripts/` 下文件名），绝对路径被拒；**改后 job 可能静默 paused**（`cron list` 不显示），用 `cron list --all` 查 + `cron resume` 恢复并核对 Next run。
- **PDF 页数验证**：`data.count(b'/Type /Page') - data.count(b'/Type /Pages')` 二进制计数（mdls 可能 null）。
- **报告动态数字从 summary json 读**（totals.sources_ok/totals.items），勿硬编码——源数随扩容变化。
- **报告强度受数据底座限制，勿越界包装**：单源域（如 pay 仅 1 源）的「关键信号」本质是单源观点，报告只能如实标注 `N/M 源`，不得写成多源交叉验证的口吻；判「样子货」投诉前先查该域源数——1-2 源的域上限就是转述+单点判断。

## 闭环（区别于一次性报告的关键）

报告「差距复盘」章节与 `life-workbench/gap_register.yaml` 对齐：调研发现 → 登记差距（编号/severity/证据/团队）
→ dispatcher 派工 → 后续报告复盘印证 → 差距状态流转。没有差距登记的雷达只是新闻聚合，不构成能力迭代闭环。

### done→设计文档回写的双触发（时序缺陷已根治）

docsync 原只挂在每条管线收尾（建卡后立即跑），但 worker 完成分析总晚于建卡时刻 15~60 分钟
→ **收尾跑的 docsync 永远追不上当天完成的卡**，每晚 6~10 条 done 差距漏回写设计文档，只能人工补。
修复后双触发并存：

1. **管线收尾随跑**（原有）——只能补到前天的账；
2. **`docsync_catchup.sh` 每日 08:00 cron**（`docsync-daily-catchup`，no-agent，deliver=weixin）
   对全部十域补跑 docsync——昨日完成的差距次晨自动落进设计文档。

两条路径均幂等：docsync 只认 `status=done` 且设计文档无 `<!-- gap-closed:<id> -->` 标记的条目，重复跑零副作用。
新增域时**必须同步把域名加进 catchup 脚本的 DOMAINS 列表**，否则该域永久漏回写。
验证幂等性的标准手法：向 gap_register 注入一条假 done gap → 跑 catchup 应回写 1 条 → 清理假条目与文档标记 → 再跑应回 0。

### 信号类扩容并入邻近域（不轻率新设域）

新信号类（如 AI 基建安全）先查是否已被现有域的源组合覆盖——若该类信号曾由现有源捕获过实证，
并入邻近域扩 keywords 即可，不单设新域（新域=新 cron+新板+新 assignee 的重复建设）。
**扩 keywords 后必须用真实缓存数据干跑打分**：重打近几日 summary 池的 `_dscore`，
检查进阈值候选的假阳性与 top 排序变化，确认无噪声涌入再落库。
现有防堆积护栏（同日同域上限 3 条 + 内容指纹去重）兜底，但护栏不替代干跑。

## 2026-09-08 夜间 loop graph 十项优化（L1+L2+L3 全落地）

**投递语义（必读）**：`run_weixin_push` 现为**纯入队语义**——PDF 入队即 done 并写 marker，文字直投仅 best-effort（失败不影响状态）。supervisor 不再因文字失败反复误报「推送未完成」。backlog 队列已修 head-of-line blocking：failed 条目按 attempts 指数退避（30min×2ⁿ 封顶 4h），attempts≥8 自动**挂起待人工审查**（建设期判死放宽，非放弃；复活：status 改回 pending + attempts=0），每次尝试落盘 `~/.hermes/cron/output/weixin_backlog_tick.log`。

**zcode 探针**：STEPS 首位新增 `zcode_preflight` 步（radar_llm.zcode_preflight）。窗开通道坏（Unknown ACP provider 类致命错）→ 步骤 failed + 微信摘要加「🔴 zcode 免费通道故障（建设期待修，勿默认计费回退）」行 + 自动跑 verify_zcode_channel.py 留诊断；白天窗 closed=非故障 ok=True。结果落盘 `cache/radar/zcode_preflight_<date>.json`。

**差距质量双门**：① STOP_ASCII 两轮增补（09-07 实锤弱词+回归暴露的介词/单字 CJK 词）——扩表后必须用近几日真实 summary 重放 `match_items_for_gap` 验证；② `gap_register add` 机械拦截「雷达证据占位标题+severity=high」（weak_markers 匹配）；③ `update` 拒绝占位符 proposed_fix 的 done（需 --set resolved_fix 结构化结论），夜间差距卡 body 已带收尾契约（判定 ADOPT/TRACK/REJECT/N-A+理由）。

**双雷达与心跳**：`scripts/session_friction_scan.py`（cron dae02132965e 02:20）扫 CC(~/.claude/projects)+Codex(~/.codex/sessions) 近 7 天会话首条用户消息，FRICTION_RULES 匹配≥3 次即登记 platform 域 high 差距（7 天冷却幂等）。Hermes TUI 会话不落盘（state.db 停在 07-21），该源尽力而为。`nightly_heartbeat.sh`（cron 8f66158ce97e 02:30，deliver=weixin）汇总当晚 radar/[已移除]/8 域/evo/zcode/队列状态——注意域报告命名=执行日，心跳的 HOUR<9→TODAY=昨天 对齐正确。L3-10 可视化已派卡 t_b4cf7190（worker-coder）。

**退役 job 终态纪律（09-09 修订）**：fa8b11f3 已删除且完整定义存档于 `retired_jobs.json`（user 裁决：建设期删除类操作必须先存档再删，保留复活通道）。`cron_paused_watchdog.sh` 加 BANNED 黑名单检测，复活即告警。教训：**pause 是可逆态会被批量操作洗掉；删除前先存档；复活前必须核对与现役管道的调度冲突**。

**⚠️ 建设期总纪律（2026-09-09 user 裁决，适用全部夜间管道设计）**：本机环境处于建设期——①高质量优先，**不激进优化 token 消耗**；②现状≠永久现状，环境缺口以「待建」视角登记 gap_register（如 TUI transcript 持久化缺失 gap-20260908-001、iLink 通道无探针 gap-20260908-002），禁止静默降级掩盖缺口；③判死参数放宽（backlog dead-letter 阈值 8 且语义=挂起待人工审查，非放弃）；④通道故障醒目告警（zcode 🔴 级），计费回退是兜底不是终点。

**⚠️ 已知非阻塞项**：① `hermes update` 的 fleet_restart_pending 义务未清偿（每次 CLI 启动打良性警告；下次用户跑 `hermes update` 自然清除）；② 09-08 午后 iLink 账号级惩罚冷却（连败 16+ 次），白天 tick 退避不烧冷却，夜间低频窗口自然恢复；③ 所有脚本改动经 py_compile/bash -n 验证，life-workbench 与 ~/.hermes/scripts 均不在 git 管理内（沿用既有惯例）。

## Related Skills

- **daily-intel-brief**（default profile）— 公众号内参体裁与用户风格红线（本 skill 管道是它的升级线）
- **web-scraping-antibot**（default profile）— 反爬工具矩阵/搜狗专项/真实浏览器路径
- **cron-script-wrapper-pattern**（default profile）— cron 脚本参数/wrapper 模式
- **weixin-send-troubleshooting** — iLink errcode 诊断
- **sogou-wechat-batch-fetch**（default profile）— 公众号批量抓取通道