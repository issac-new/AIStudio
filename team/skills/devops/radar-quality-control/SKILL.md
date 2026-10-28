---
name: radar-quality-control
description: "Use when 雷达报告被批样子货/扩源/邮件无摘要：先原料后模型诊断+扩源三关+邮件红线。"
version: 1.2.0
metadata:
  hermes:
    tags: [radar, intel, quality, rss, llm-input]
---

# Radar Quality Control — 情报雷达扩源与报告质量

管辖：`life-workbench/scripts/` 的雷达管线（radar_fetch / domain_nightly / build_domain_report /
build_[已移除]_report / radar_llm_brief / send_report_email）。管道运维（幂等/补跑/投递）见
nightly-radar-runbook 与 domain-nightly-ops；本 skill 管内容质量与源扩展。

## 诊断铁律：先原料，后模型

报告被批「样子货/空话」时按序查，**不要先动 prompt**：

1. **看产物体积**：域报告 PDF ~190KB ≈ LLM 失败的纯雷达模式，~530KB ≈ 正常生成；md <2KB = 纯标题列表。
2. **看 LLM 实际吃到的原料**：从 summary json 抽 top_items 的 snippet——含 `<figure><img`
   等 HTML 残片 = 原料污染；数输出里「标题判断，待读原文」出现率，>1/3 即原料不足。
3. **原料干净且充足仍空话，才调 prompt/换模型**——此时才允许怀疑 LLM。

根因法则：**原料层缺陷会伪装成「LLM 能力不行」——先看喂进去的是什么，再怪模型。**
历史根因 RC1（字段错位）/RC7（截断过薄）/RC8（HTML 穿透）全是这一类。

## 原料红线（always-on）

- strip_html 必须「剥标签 → unescape → 再剥」两轮 + 清 CDATA 壳——escaped 源
  （`&lt;img&gt;` 形式）的标签经 unescape 会变回真标签穿透；第三层 escaped
  字面量保留（`&lt;guardrail&gt;` 是合法代码记号，剥掉 = 过度清洗）。
- 改任何报告生成器前先核实上游字段名（是 `snippet` 不是 `summary`），不信记忆。
- prompt 每条原料 400 字；硬约束「标题判断 ≤1 条；摘要为空的条目跳过，宁缺毋滥」。
- 所有 LLM 调用走 `radar_llm.ask_llm_json`（3 次重试+线性退避+平衡括号 JSON 提取），禁止裸 spawn。
- 关键词打分：ASCII 词 word-boundary、中文词 in——substring 会中文恒 False + `agent` 误中 `user-agent`。
- GEO 投毒识别（来源：TC260《人工智能安全治理框架3.0》专栏四，2026-09-24 融合）：情报源被 GEO（生成式引擎优化）批量内容污染的信号——同一主张在多个低权威源集中出现、虚构评测数据、假冒专家身份、品牌评价异常密集。命中信号的条目降权或剔除，来源进拒收源清单；LLM 摘要不得把单一批量投放内容当成多源印证的共识。

## 登记佐证红线（gap_register 守门，t_3663d4e6）

- 两级判据（gap_register.py _ownership_adjudication_reason，add 与 dispatch 共用）：
  ① 破坏性断言（「X 板丢了卡」「Y 库缺数据」「被回滚/覆盖」）登记时刻文本无法自证
  （须 DB 取证比对全库卡 id），一律降级 needs_adjudication 待核查——带 id+路径也一样；
  ② 归属性断言（「误记到 X 板名下」）须附机械佐证：至少 1 个卡 id（t_xxxxxx）+
  可复查锚点（库/文件路径、事件行或时刻）。
- 降级 fail-open：仍入账、dispatch 不派工；佐证补齐（或改写为带佐证的归属性结论）
  后人工 update --set needs_adjudication=null 放行。LLM 登记环节不应依赖此兜底，
  建议环节就按佐证要求自查。
- 判例：gap-20261013-004——「swarm 板丢了 8 张 done 卡」实为 platform 板卡误记到
  swarm 板名下，无佐证入账派工浪费夜间预算；机械核查 16 库后判定 REJECT。

## LLM 限额兜底（always-on，2026-10-19 fin-sentinel 实证）

雷达/情报类报告的 LLM 研判段常因限额写不出（acp 限额 1310、provider 429、模型降级）。**默认是常态、不是例外**——配置层不要假设 LLM 总在。处置纪律：

- **不假装 LLM 段写过**——报告首行必须明示是 LLM 真研判版还是规则矩阵兜底版（用「`LLM 限额 <限额> 兜底`」模板）
- **兜底版不可降级为流水单**——必含三段骨架：① 机构×事件轴集中信号（≥2 条同轴即报）② 双轴分桶（事件轴+机构类别）③ 数据底座声明（源覆盖/原料厚度/限额重置时间）
- **Top 3 上限**——每事件轴最多 3 条，按 tier×关键词命中数打分，禁「60 条全列」堆叠
- **unmatched/cross 必留位**——读者要知道规则覆盖率，反向确认报告可信度
- **扫描所有缓存源、不用 worker 自报数**——worker 还在跑时自报数常是旧快照，缓存合并后才得真值
- **写完兜底版立刻让用户比较研判深度**——两版对比是兜底版的最大价值，避免「LLM 段装饰」错觉

完整模板与反模式见 `references/llm-quota-fallback-matrix.md`。

## 情报深度三层（报告被批「没有有效信息」时按此判级）

三层是递进不是并列，逐层校验缺哪层补哪层：
1. **统计层**（不合格）：条目罗列、五轴分布表、top N——聚合脚本就能产出，不是情报。
2. **研判层**：跨条目聚合——≥2 条同主题/同机构条目聚成一条信号，附 so_what（意味着什么）
   + 建议动作 + 证据条目标识。
3. **洞察层**：每条信号再加 essence（结构性驱动/因果机制——为什么会这样）+ constructive
   （面向目标读者的可执行意见，含验证方式）。「合规成本上升」「盘点单点故障」类咨询话术
   不算洞察。LLM 研判 prompt 直接按第 3 层模板写。

## 邮件红线（always-on）

- 标题必须自识别：报告类型+领域+日期（如【支付清结算】领域深度雷达 2026-09-07），
  禁止所有报告共用一个无差别标题。
- 正文必须有实质摘要（态势/关键信号/建议），数据来自 LLM 分析落盘 JSON
  （`llm_advice_<prefix>_<date>.json`）；LLM 段缺失显式标注，禁止静默、
  禁止只有「数据底座 N 源 M 条」一行充数。
- 邮件通道不受微信限流影响 = 兜底通道，其质量标准与微信同。

## 扩源流程（探针先行 + 三关 + 两复查）

0. **探针先行（orchestrator 派 fetcher 卡前亲自跑）**：凡卡的工作依赖外部 API/RSS 端点，
   派发前 orchestrator 自己 curl 一遍全部候选端点，把「HTTP 状态 + 真实条目数 + 结构样本
   + 修参方案」写进卡评论再派发——worker 按已验证端点实现，不踩 API 语义坑（实测判例：
   GHSA `published=` 参数是精确日期匹配非范围查询，探针 0 条当场暴露，修法入卡后才写
   fetcher）。探针结论同时**裁决下游卡范围**：本地 RSSHub 微博路由探针通（热搜/关键词通道
   都有真实条目），下游浏览器采集卡范围即时缩为仅登录墙通道，省掉整块浏览器依赖。社媒
   通道解锁成本排序：本地 RSSHub 路由 > 浏览器采集 > 平台 token——探针按此序先试便宜的。
   XML 条目计数用 `grep -o "<item>" | wc -l`，禁用 `grep -c`——`grep -c` 数的是含匹配的
   行数，单行 XML 几十条会被报成 1 条，直接误判源可用性。

1. **三关**：`curl -sL -A "Mozilla/5.0"` 返回 200 → `<item>`/`<entry>` ≥5 →
   description 非 HTML-escaped（escaped 源可入库但要登记备注）
2. **入库**：注册表登记 → py_compile → 该域真跑一次抓取 → sources_ok 全满才算过
3. **两复查**：① 来源分布——单一源占 Top10 一半以上 = 噪声重；
   ② **关键词命中率**（`_dscore>0` 占比）——命中率低先补该域 keywords 再上线
   （缺词 = 排名退化回 relevance 主键，新源噪声顶进 Top10）
4. 双份同步 `~/.hermes/scripts/` + diff 复核（两份并存不同步 = cron 跑旧版，
   修复静默不生效——无论改哪份，收工前 diff 两份必须一致）

## 扩源三层裁决（模型只提议，代码裁决，t_d6129454 融合）

上游锚：openexecutive monitoring/research/watch_policy.py:1-45——模型不再直接
调 add_watchlist（曾经模型提什么就上什么、无理由、live 生效），改为 propose →
确定性策略裁决。映射到雷达扩源，三层走：

1. **模型 propose**：LLM/调研只提出候选源（域名/feed URL + 理由），不落注册表。
2. **代码裁决**（确定性，不信任模型自评）：
   - grounding：候选源域名/主题须出现在本侧数据——已覆盖域关键词表、既有源
     同域、历史 gap 登记或报告主题词。哪样都不沾 = reject。
   - 预算上限：单次扩源 max 2 个 direct；启用源总量守上限（现 49 源 × 10 域）。
   - 拒绝名单硬约束：退役源/拒收源清单（见下节）+ 用户明确拒绝过的源，代码
     层拒收，模型换个别名也绕不过（按注册域归一判同源）。
   - 每个裁决留审计痕：决策（direct/suggest/reject）+ 分数 + 理由一行落日志。
3. **suggest 档 dry_run**：grounding 弱或首次出现的候选，先进 dry_run 观察一周
   （只抓取入库、不进 Top10、不触发派工），一周后按两复查判据（来源分布 +
   关键词命中率）决定转正或退役，转正须人工点头。

## 数字回查红线（报告投递前警示）

报告 md 中的数字样态（金额/百分比/计数）投递前过 `verify_numbers.py`
（`~/.hermes/scripts/verify_numbers.py`，输入报告 md + 源 summary/llm_advice
JSON，输出命中/未命中清单）。未命中=警示不阻塞（fail-open，exit 1 不拦投递），
但警示行必须在当晚复盘里过目——连续两天同位置未命中 = 原料或生成层有病，按
「先原料后模型」顺序查。缩写精度归一：$1.2M ≈ 1,234,567（展示几位小数容几位
半档）。锚：openexecutive briefing/grounding.py（2026-10-18 融合）。

## 退役源 / 拒收源（不要复试）

- 403（WAF/无公开 feed）：finextra rssing、devops.com/feed、thefinancialbrand.com、cadence community blog
- 200 但 0 items：americanbanker、usenix loginonline、36kr.com/feed、edutopia、langchain blog、anthropic.com/rss.xml、sre.google

当前注册表（49 源 × 10 域）落点：`domain_nightly.py` 的 `DOMAINS`（源 URL 明细以代码为准，
勿按记忆引用 references 文件——本 skill 的 references 明细表尚未建立）。

## Related

- `references/security-intel-sources.md` — 安全情报六类信源分层与端点参数坑 + 权威库×媒体双层互证设计
- nightly-intel-radar / nightly-radar-runbook / domain-nightly-ops — 管道与投递运维
- web-scraping-antibot — TLS 指纹/反爬选型
