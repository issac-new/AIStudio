---
name: daily-intel-brief
description: 生产每日技术情报内参（公众号文章→深度分析→PDF→微信推送）。
version: 1.0.0
platforms: [macos]
metadata:
  hermes:
    tags: [wechat, intel, report, pdf, weixin, research]
    related_skills: [sogou-wechat-batch-fetch, personal-life-workbench, weixin-send-troubleshooting, report-data-verification]
---

# Daily Intel Brief（每日技术情报内参）

把用户关注的公众号今日文章加工成一份 CTO/CIO 定位的内参 PDF 并推送到微信。输出文件落在 `~/hermes-docker-sandbox/workspace/life-workbench/reports/`。

## When to Use

- 用户要求"根据我关注的公众号今日文章，分析汇总生成参考研报/内参/读物"
- 用户要求"合并到生活工作塔每日日报，转 PDF 推送"
- 任何"把公众号文章变成有洞察的分析文档"的诉求

## 🔴 用户风格红线（不可违反）

用户明确纠正过："日报不要标题总结这种样子货，要分析汇总凝练具体内容、核心观点、举措、数据等"。

**禁止**：
- 只列标题 + "字少事大"式空泛概括
- 无数据的判断（"性价比极高"而不给 $0.14/百万Token、1/105 这类数字）
- 只写"说了什么"，不写"意味着什么"

**要求**：
- 每条关键情报带硬数据（价格/跑分/时间线/百分比），可核验
- 有判断（对 CTO/CIO 的含义）、有举措（可执行建议）、有对比（参照系）
- 体裁可参考：IDC/赛迪/AI前线Insider（技术决策者）、36氪/甲子光年（商业研判）、FreeBuf/安全内参（威胁研判）——用户选"综合情报"时三者融合
- 结尾必须有"行动清单"（给决策者可直接执行的 3-5 条）
- 诚实标注核验缺口：公众号提及但无独立信源的项，写明"待核验"，不编造

## Pipeline（8 步）

1. **定范围**：问用户公众号范围（核心21号/中等50号/全部180号）与推送目标（微信/TUI/仅存文件）。中等50号约1.5h，全部180号约5h且高风险封IP。
2. **先查历史批次**：`workspace/wechat_research/batch_all.json`（180号886篇）按 `pub_time` 过滤今日/昨日文章——**先复用，避免重复抓搜狗**。snippet 截断~80字是已知限制。
3. **补充抓取**（如需）：`weixin.sogou.com/weixin?type=2` + 桌面 UA + 5-8s 间隔（验证过180号0失败）。**移动端 m.sogou.com 约10-15次后整站403封IP**，看到 `HTTP 403 Forbidden` 立即停止。搜狗返回的 URL 是签名 URL（`×tamp` 里的 `×` 是 U+00D7 编码 bug），修复用**直接字符替换**：`url.replace('\u00d7','x').replace('\ufffd','x')`——禁止 latin-1 往返编码（会把 U+00D7 变 U+FFFD 导致 replace 失效）。签名 URL 全文提取不可靠，只有 `__biz=` 标准 URL 持久可用。
4. **全网交叉验证**（LLM 限流时的替代）：delegate_task 子代理可能因 API 429（5小时上限）失败——**改用本地 urllib 直连 Bing**（不耗 API 额度）：
   ```python
   # https://www.bing.com/search?q=<query> + UA + regex 去标签 → 结果文本
   # 完整 query（如 "DeepSeek V4 Flash 价格 0.14 百万token"）比短词命中率高
   ```
   Bing HTML 结构：结果在"个结果"之后，含域名/日期/标题/摘要，足够交叉验证。
5. **撰写内参**：结构 = 卷首速览表（60秒读完）→ 头条研判 → 专题（2-3个）→ 竞争情报速览 → 行动清单 → 数据来源与核验说明。详见 `references/intel-brief-template.md`。
6. **生成 PDF**：pandoc（md→html）+ 内参风格 CSS（A4竖版，10.5px 紧凑专业，深蓝+红色强调）+ Chrome headless 打印。
   ```bash
   pandoc in.md -o out.html --standalone -V lang=zh-CN
   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu --no-sandbox --print-to-pdf=out.pdf --print-to-pdf-no-header out.html
   ```
   页数验证用二进制 `/Type /Page` 计数（mdls 可能返回 null）。
7. **推送到微信**：先文字摘要（分条，含核心数据），再 `MEDIA:<pdf>` 附件。若报 "No home channel set for weixin"，先 `hermes config set WEIXIN_HOME_CHANNEL <channel_id>`（channel 用 `hermes send -t weixin --list` 查，如 `o9cq...@im.wechat`）。
8. **留痕**：若来自 Gateway 渠道，按复杂度规则 kanban 留痕；TUI 直接执行不需留痕。

## Pitfalls

- **LLM 限流 ≠ 调研失败**：delegate_task 子代理 API 429 失败时，本地 urllib 抓 Bing/官网是零额度替代路径。子代理失败转本地抓取是可复用的兜底模式（勿把 429 当死路）。
- **搜狗封禁是 IP 级**：browser 工具同 IP 也会撞验证码页，换 UA/cookie 无效。不要自动重试循环。
- **签名 URL 全文提取 0 字**：搜狗签名 URL 即使修好 `×tamp`，timestamp 过期后 `js_content` 提取为空——优先用 `__biz=` URL。
- **PDF 页数验证**：mdls 的 kMDItemNumberOfPages 可能返回 null（新生成文件未索引），用 `content.count(b'/Type /Page')` 二进制计数。
- **内参 ≠ 日报**：日报偏个人活动统计（生活工作塔），内参偏行业情报（CTO/CIO 视角）。用户要"内参/调研报告"时做后者，不要混入个人活动数据占篇幅。
- **数据核验**：所有数字必须来自工具调用（公众号原文/Bing 结果），标注来源；无独立信源的项写"待核验"——用户对编造数据零容忍。

## 产出位置

- 内参 markdown：`~/hermes-docker-sandbox/workspace/life-workbench/reports/daily_intel_<date>.md`
- PDF：同目录 `daily_intel_<date>.pdf`
- 抓取中间产物：`life-workbench/wechat_daily/`（articles_/fulltext_/today_content_ json）

## Related Skills

- **sogou-wechat-batch-fetch** — 搜狗抓取通道细节（research 类，跨 profile，需时另行加载）
- **wechat-article-extractor** — 单篇 mp.weixin.qq.com 全文提取
- **weixin-send-troubleshooting** — 微信推送失败诊断（iLink errcode、home channel）
- **report-data-verification** — 报告数字核验
