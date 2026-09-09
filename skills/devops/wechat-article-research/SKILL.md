---
name: wechat-article-research
description: >-
  Fetch and extract content from WeChat Official Account (mp.weixin.qq.com) articles using curl + regex parsing, then produce structured analysis reports. Use when the user provides WeChat article URLs and asks for research, analysis, or content extraction.
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [research, wechat, content-extraction, analysis]
    related_skills: [wechat-article-extractor, evidence-based-research]
---

# WeChat Article Research

Fetch, extract, and analyze WeChat Official Account articles (`mp.weixin.qq.com/s/...` URLs) when the user provides links and asks for research, deep-dive analysis, or content reproduction.

## When to Use

- User provides one or more `mp.weixin.qq.com` URLs
- User asks to "调研分析" (research and analyze) WeChat articles
- User wants to "复刻" (reproduce) technology described in a WeChat article
- User asks to extract structured content from WeChat articles
- User names a **WeChat account** (e.g. `readsemi`) and asks to research "all its articles" / "the whole account" — no URLs given → use Sogou discovery (see below)

## Fetching Strategy

### curl + regex extraction (reliable, no dependencies)

The `wechat-article-extractor` skill requires npm packages (cheerio, dayjs, request-promise) that may not be installed. Use curl + regex as a zero-dependency alternative:

```python
import subprocess, re, html as html_module

r = subprocess.run(
    ["curl", "-sL", "-A",
     "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
     url],
    capture_output=True, text=True, timeout=30
)
html = r.stdout

# Extract content from rich_media_content div
content_match = re.search(
    r'id="js_content"[^>]*>(.*?)</div>\s*<script',
    html, re.DOTALL
)
if content_match:
    text = re.sub(r'<[^>]+>', '\n', content_match.group(1))
    text = re.sub(r'\n{3,}', '\n\n', text)
    text = html_module.unescape(text.strip())
```

### Batch fetching

For multiple URLs, loop in `execute_code` and save results as JSON:

```python
results = []
for url in urls:
    # ... fetch and extract ...
    results.append({"url": url, "title": title, "content": text})

with open("wechat-articles.json", "w", encoding="utf-8") as f:
    json.dump(results, f, ensure_ascii=False, indent=2)
```

## Sogou Discovery — "research all articles from account X" (no URLs given)

When the user names a WeChat account (e.g. `readsemi`) and wants the **whole account** researched, there are no URLs to fetch. Use Sogou WeChat search as the discovery layer, then resolve each result to a real `mp.weixin.qq.com` article and extract. **Verified working 2026-08-27** (readsemi account: 43 results → 41 articles extracted, ~125K chars).

### Step 1 — Discover all result links (paginate the Sogou search)

- Search URL: `https://weixin.sogou.com/weixin?type=2&query=<account>&page=<N>&ie=utf8`
- Paginate `page=1..N` (readsemi had 10 pages, 43 results). Collect anchors whose `href` contains `/link?url=`.
- Selector that worked: `#wrapper a` filtered by `textContent.length > 10 && href.includes('/link?url=')`.
- Sogou result DOM loads via JS; the `browser_exec` helper + `goto_url` + `wait_for_load()` each page is the reliable path (curl on Sogou returns a redirect/anti-bot wall).
- Account name appears in the result card (e.g. "芯联汇" for readsemi) — verify the named account matches before fetching.

### Step 2 — Resolve each Sogou link to the real article (click-through)

- **捷径（2026-09-06 FDE 18-20 补充调研实证）**：`m.sogou.com/web/searchList.jsp` 结果页 HTML 的跳转链接 `url=` 参数里**已内嵌完整签名的 mp.weixin.qq.com URL**（~200 字符，含 timestamp/ver/signature）——无需打开浏览器点击跳转，直接 unquote 提取后 **curl 直抓微信文章页即可**（桌面 UA，间隔 10-15s，3/3 成功未触发反爬）。仅当 curl 抓回环境错误页（「链接已过期/环境异常」）时才退回浏览器点击通道。
- A Sogou `link?url=` href does **not** redirect via curl — it must be opened in a browser. Inside `browser_exec`, navigate to the sogou link; it auto-jumps to `mp.weixin.qq.com/s?src=...&signature=...`.
- **Pacing**: Sogou blocks bursts (~403/anti-bot). Empirically safe cadence: `time.sleep(10)` between article fetches, `time.sleep(2.5)` between page turns. Going faster (e.g. 2s) triggers sogou_blocked (final URL stays on sogou, not mp.weixin).
- Per-article extraction in-browser:
  ```python
  c = document.getElementById('js_content') or document.querySelector('.rich_media_content')
  content = c ? c.innerText : ''
  title = (document.querySelector('.rich_media_title')||{}).textContent || document.title
  account = (document.getElementById('js_name')||{}).textContent || ''
  ```
- `status='ok'` requires `content.length > 500`; sogou_blocked / too_short (<17 chars) means retry.

### Step 3 — Retry strategy for blocked/too_short articles

- **First retry**: re-search Sogou with the **article title** (not the account) as query, click the first `/link?url=` result. This recovers most articles that failed via the account search.
- **Second retry**: use a **keyword-rich sub-query** (drop the colon/star punctuation, keep 2-3 technical keywords, e.g. `BSPDN 背面供电 三星`). This recovers articles with generic-titled failures.
- Empirically ~18 of 43 needed a title/keyword re-search after the first pass (3 ok, rest blocked/too_short). All 41 semiconductor-relevant articles recovered; 2 InnoDB MVCC reposts were irrelevant and excluded.

### Step 4 — Dedup & cluster

- Dedup by title (Sogou pagination may repeat). Save `clean` JSON = unique `status='ok'` articles.
- Map each article to a target profile/theme via keyword scoring; cluster for the analysis report.

### Anti-403 / pacing hard rules

- Never fetch more than 1 article per ~10s. Never turn pages faster than ~2.5s. Sogou is the only discovery path; burning it blocks the whole job.
- If a fetch returns `sogou_blocked`, fall back to the title/keyword re-search in Step 3 — do NOT hammer the same sogou link.

## Analysis Report Structure

After fetching all articles, produce a structured analysis report:

```markdown
# <Topic> Analysis Report

## Article N: <Title> (<source>)

### Core Architecture / Technology
- Key technical components and their relationships
- What is novel vs. established

### Reproducibility Assessment
| Component | Can reproduce? | Approach |
|-----------|---------------|----------|
| Software algorithms | Yes | Python/JS implementation |
| Hardware components | No | Requires physical devices |
| Frameworks | Yes | Open-source equivalents |

### Module Decomposition
Break the technology into implementable modules with clear boundaries. Each module should be assignable to a developer/team.

## Reproduction Plan
- Tech stack selection
- Module list with dependencies
- Team composition recommendation
```

## Key Pitfalls

### WeChat HTML structure varies

Not all articles use the same div structure. Some use `class="rich_media_content"` instead of `id="js_content"`. Always implement a fallback regex.

### Title extraction

The `<title>` tag is often empty for WeChat articles. Fallback chain（2026-08-25 FDE 文章抓取实证有效）：
1. `re.search(r"var\s+msg_title\s*=\s*['\"]([^'\"]*)['\"]", html)` — 首选
2. `<meta property="og:title" content="...">` — msg_title 缺失时
3. 账号名：`var nickname` → `<meta name="author">` 依次 fallback

### Content length varies dramatically

Articles can be 2K-10K chars（实测长文 HTML 3.5MB / 正文 10.8K chars 仍可用同一 `js_content` regex 一次抓全）。Long articles may be truncated by the regex if the closing `</div>` pattern appears inside the content——抓到后核对正文末尾是否为完整结语（微信文章通常以总结段收尾），若语气戛然而止说明被截断，需换更宽松的边界重抓。

### Account-research integration

The Sogou-discovery workflow above feeds directly into the **Analysis Report Structure** below:
- Treat the discovered+sogou-resolved articles as the `urls` batch.
- Each extracted article already carries `title` + `content`; cluster by keyword, then write the report.
- For "research all articles from account X and apply to domain Y" (e.g. improve [已移除] team from readsemi), map each article to the relevant profile/team via keyword scoring, produce a coverage matrix, then a capability-gap list. See `references/account-research-template.md` for a ready-made report skeleton.

## Related Skills

- **wechat-article-extractor** — npm-based extraction with metadata (author, publish time, account info). Use when you need full metadata or the curl+regex approach fails on complex article structures.
- **evidence-based-research** — Anti-hallucination research methodology. Every factual claim must be traceable to a source.
