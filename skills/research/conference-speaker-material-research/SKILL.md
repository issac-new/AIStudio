---
name: conference-speaker-material-research
description: Find a speaker's conference slides at Chinese tech events.
version: 1.2.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [research, chinese-conference, speaker, slides, wechat, icdia, [已移除]]
    related_skills:
      - wechat-article-search
      - web-research-fetching
      - osint-asset-mapping
      - deep-research-workflow
---

# Conference Speaker Material Research (中文行业会议演讲材料检索)

Find a specific person's talk at a Chinese tech conference: confirm the talk exists (title, venue, date, forum), locate the agenda article, mine WeChat official-account articles for detail, and give the user realistic paths to slides/photos — or honestly report what is gated.

## When to use

- User asks: 全网检索 X 在某会议（ICDIA 2021/2022、ICCAD、IDAS、集微峰会等）上的演讲材料/PPT/照片
- User wants to verify a talk title + speaker identity before citing it
- User needs "各种缓存快照都不要放过" — exhaustive multi-channel search

## Workflow

### 1. Confirm the talk exists — multi-engine quoted-title search

Search the exact talk title in quotes across multiple engines. Not all engines work on the same day — try them in order and use whichever is not captcha-blocked:

- **Bing RSS** (`www.bing.com/search?format=rss&setmkt=zh-CN`): fast, no JS, but poor CJK tokenization — single-character dictionary hits for Chinese queries. Still useful for English/mixed queries.
- **360 search via BROWSER** (`browser_navigate("https://www.so.com/s?q=\"<title>\"")`): **browser only; curl returns an HTML shell with zero results** (so.com is JS-rendered). The "AI智能回答" block synthesizes an answer AND cites REAL source URLs (`news.qq.com/rain/a/...`, `finance.sina.com.cn/...`) — extract those URLs and navigate directly; the `so.com/link?m=...` redirects return HTTP 400 via curl.
- **Tencent News / Sina Finance direct URLs**: post-conference summaries and agenda announcements are often full-text and directly fetchable with curl. `news.qq.com/rain/a/<ID>` and `finance.sina.com.cn/cj/<date>/doc-<id>.shtml` are the most reliable curl targets for Chinese conference content.
- **Baidu / Google**: both trigger CAPTCHA frequently from server IPs; Baidu returns `wappass.baidu.com` slider captcha, Google returns `sorry/index` — do not burn calls retrying.

**Pitfall**: after sustained use, so.com starts serving `qcaptcha.so.com` (slider CAPTCHA) even in browser. Bing `setmkt=zh-CN` returns dictionary hits for CJK instead of conference articles. Prefer 360 (browser) + Tencent News direct when available.

### 2. Company official news sites — press-article URL pattern + news-ID brute-force scan

Many Chinese company sites expose press items as `news_desc.html?id=N` / `news.html?pid=N` style URLs (e.g. phlexing.com). The listing page is often JS-rendered and shows ONLY the latest ~6 items — older conference coverage is invisible in the UI. **Brute-force scan the ID space with curl** — this was the decisive move that found the exact talk title:

```bash
# loop IDs 1..160; keep only 200-OK pages with size > 3000; then grep bodies
for nid in $(seq 1 160); do
  curl -sL "https://www.phlexing.com/news_desc.html?id=$nid" -A "Mozilla/5.0" \
    --max-time 6 -o /tmp/px_$nid.html -w "%{http_code}|%{size_download}\n"
done
# grep /tmp/px_*.html for ICDIA / <talk-title keywords> / 演讲
```

- Full scan of ~160 IDs takes ~50s; `--max-time 6` per request keeps it fast.
- **Filter by BODY keywords, not `<title>`** — many pages share a generic title template (`<公司名>-领先的[已移除]工具链提供商`) while the body holds the real content. Drop pages where `size <= 3000` (homepage shell or redirect).
- Corporate articles confirming a talk usually DO include the exact talk title + a content summary (Modelling Effect / 3D Extraction / 2.5D Extraction style breakdown), but often do NOT name the speaker — combine with WeChat metadata to tie title → speaker.
- The company's own news archive is the single best source for talk-content evidence.

### 3. WeChat official accounts — metadata is enough to confirm facts

Use the `search_wechat.js` script (wechat-article-search skill). The company's own account + industry media (芯榜, TechSugar, CIC集成电路) publish participation articles:

- Search patterns: `<公司名> <会议名>` / `<公司名> <演讲标题关键词>`
- Titles + dates + summaries confirm participation, booth presence, and product focus — article bodies are captcha-gated (sogou antispider), so don't burn calls trying to open them.
- **Rate-limit rhythm (critical)**: sogou weixin returns `"total": 0` or an antispider captcha after ~2-4 queries. Wait **5-15 s between queries**; after a total:0, wait 15s+ and retry — it recovers. `-r` (resolve-url) mode triggers limits faster and often returns 0 wholesale — use plain mode for metadata, browser for content.
- **Recovery pattern**: a `total:0` result does NOT mean "no articles" — it is the rate-limit signature even for queries that previously returned hits. Retry the exact previously-working broad query after the wait; narrow queries fail first under throttling.

### 4. Wayback Machine — recover paginated news lists + article snapshots

- **CDX domain query**: `web.archive.org/cdx/search/cdx?url=<domain>&matchType=domain&output=json&limit=3000&filter=statuscode:200&collapse=urlkey` — gives all archived URLs with timestamps.
- **Paginated list recovery**: `news.html?pid=N&page=M` snapshots captured on different dates each show ~6 items. Collect multiple date snapshots of the same list URL to recover the full article ID→title mapping, even if each capture shows only recent items.
- **Fetch snapshots**: `https://web.archive.org/web/{timestamp}id_/{url}` — the `id_` flag returns raw archived HTML without Wayback toolbar. Sequential fetch with 2 retries/URL, 0.3-1s sleep; treat `len(data) < 5000` as a wayback 404.
- **Rate limiting is real**: parallel curl succeeds for ~30 files, then fails. Use sequential Python (urllib) with retries.
- **Empty CDX array `[]` = genuinely zero captures** — report as a confirmed gap, not a failure.

### 5. Extract and verify photos with vision_analyze

Company news articles often embed event photos. Extract `<img src=...>` URLs from the article HTML, download with curl (set `Referer` header to the article page), and analyze each with `vision_analyze`:

- **Distinguishes**: live speech photos (speaker at podium, PPT projection visible) / venue welcome banners / exhibition booth panoramas / digital announcement graphics (award notices, not event photos).
- **Readable from speech photos**: podium text (conference name, theme, date, location), backdrop screen text (forum name, session topic), and partially legible projected PPT slide content.
- **Key insight**: photos dated near the event date (e.g. `image/20210721/` for a July 15-16 event) are likely event photos; photos with much later dates (`img/20260310_`) are digital announcement banners added during site redesigns.

### 6. Document-sharing sites — quick check, rarely fruitful

- Baidu Wenku search (`wenku.baidu.com/search?word=...`) returns ~775KB HTML with results embedded in JSON; regex `"title":"..."` and `"url":"https://wenku.baidu.com/view/..."` extracts docs without an API. Use it to check for uploaded PPTs of the talk; expect generic tutorials instead.
- doc88.com / docin.com often 404 or block curl — don't loop on them.

### 7. Honest reporting — slides are rarely public

- PPT/photo files are usually NOT publicly indexed. Report: (a) confirmed facts with source URLs, (b) what was gated/blocked, (c) realistic acquisition paths:
  - 微信 App 内搜索公司公众号（正文只在微信内）
  - 联系公司市场部（官网 footer 邮箱）
  - 行业论坛（EETOP bbs.eetop.cn）站内搜索公司名/产品名 — curl gets 403, needs logged-in browser
- Never fabricate a PPT link. State exactly what was verified vs gated.
- Deliverable: write the findings to a report file (`<会议>_<演讲者>_演讲材料调研报告.md`) with a source-URL table, gated-items table, and acquisition paths.

## Pitfalls

- **curl on 360 search** → ~50KB HTML shell, zero result items. Browser only.
- **so.com/link?m=... redirects** → curl -L HTTP 400; browser_click often stays on the results page. Use the AI block's cited URLs instead.
- **search.sohu.com / m.sohu.com/search** → returns "抱歉，没有找到相关结果" even for articles that exist. Skip it.
- **Guessing article URLs** (sohu.com/a/<id>_<acc>, elecfans.com/article/<id>, eepw.com.cn) → 404. Resolve via search first.
- **Wayback Machine** `archive.org/wayback/available` → 429 when looped; CDX → 503; add delays; many Chinese conference sites have no snapshots at all.
- **Bing RSS for CJK** → poor organic coverage for Chinese conference queries; exact quoted Chinese phrases return dictionary hits (单字分词). Prefer 360 (browser) + Tencent News direct.
- **Sogou WeChat article links** (`weixin.sogou.com/link?url=...`) → antispider character-CAPTCHA ("请依次点击【部,典,鞠,惩】") even in browser; no bypass without a human. Metadata from the search index is still trustworthy evidence.
- **Baidu / Google** → captcha from server IPs. Don't burn calls; use Tencent News direct URLs or 360 browser search instead.
- **`total:0` from sogou weixin** → rate-limit signature, NOT "no articles". Wait and retry.

## References

See `references/icdia-xingxin-2021-2022.md` for the full worked example (speaker 崔晓亮 @ 行芯/Phlexing, ICDIA 2021+2022, what was found vs blocked, including the phlexing.com news-ID brute-force scan technique and vision_analyze photo verification).
