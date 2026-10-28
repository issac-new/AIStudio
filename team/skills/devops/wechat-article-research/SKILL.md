---
name: wechat-article-research
description: >-
  Fetch and extract content from WeChat Official Account (mp.weixin.qq.com) articles using curl + regex parsing, then produce structured analysis reports. Use when the user provides WeChat article URLs and asks for research, analysis, or content extraction.
version: 1.3.0
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
- User gives one or more **seed article URLs** and wants the whole series/account — do NOT start with Sogou: extract `album_id` / prev-next links from the seed HTML and enumerate directly (see 合集/互链发现 below); Sogou is the no-seed fallback

## Fetching Strategy

### curl + regex extraction (reliable, no dependencies)

The `wechat-article-extractor` skill requires npm packages (cheerio, dayjs, request-promise) that may not be installed. Use curl + regex as a zero-dependency alternative:

```python
import subprocess, re, html as html_module

r = subprocess.run(
    ["curl", "-sL", "--max-time", "90", "-A",
     "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
     url],
    capture_output=True, text=True, timeout=100
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

> ⚠️ 上述正则的适用边界（2026-09-24 AgenticOps 文 3.6MB 实证）：正文区含**内联 `<script>`** 的文章会把边界锚到正文内第一个内联 script——抓回 1.6MB 尾部脚本而非正文。此时改用**标记切边法**（同日实证有效）：① `html.find('id="js_content"')` 定起点；② 从起点向后找后继标记 `['id="js_tags"', 'class="rich_media_tool', 'id="js_profile_qrcode"']`，取首个命中位截断；③ **先** `re.sub(r'<script[^>]*>.*?</script>', '', seg, flags=re.DOTALL)` 剥净 script 块，**再**去标签。另：30s subprocess timeout 对 3.6MB 页面不够（curl 超时实测），`--max-time 90` 经 terminal 一次成功。

### 原文回源——中文转述文必须找原始出处

微信技术文常是外文原文（X/Twitter 长文、博客）的中文转述。转述文只当导读：常省略代码示例、实现细节与尾节实操清单，拿它当唯一源做融合/复刻会吸收残缺版。

- **找链接**：文首/文末常带「原文作者 + 原文链接」；无链接时用原标题 + 作者名 web_search 定位（X 长文常被聚合站镜像）。
- **X 长文登录墙的镜像通道**：x.com 直抓与 firecrawl 均失败时，试 `https://threadnavigator.com/thread/<status_id>`——纯 curl + 浏览器 UA + 去标签即可拿到接近全文（实测 ~25K chars），status_id 取 x.com URL 路径段（`/status/<id>` 或 `/article/<id>`）。
- **逐节保真度对照**：回源后将原文全文落盘存档（如 `research/<topic>/original-*.txt`），分析/融合引用以原文锚点为准，转述差异显式声明。
- **GitHub 开源项目回源（2026-10-21 Cloudflare 实证）**：转述对象是开源 repo（非博客长文）时，回源正典=**repo 的 README（含分支结构/版本/数字/机制清单）+ 官方博客全文**，比 X 镜像/聚合站更全更稳——README 可 curl 直抓 raw.githubusercontent.com，博客用 web_extract 通读落盘（含结语/免责/附注尾节）。核心数字（星数/版本/机制数）以 repo 页为锚，禁只凭转述文写进裁决矩阵。

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

- Never fetch more than 1 article per ~10s. Never turn pages faster than ~2.5s. Burning Sogou blocks the account-name search — but it is NOT the only discovery path: 有种子 URL 时先走下方合集/互链通道，零反爬拿全列表，Sogou 只是无种子时的兜底。
- Sogou 被墙且手里无种子 URL 时，勿用 `site:` / 关键词搜索兜底——微信文章 URL 不含账号名，结构上搜不出「某账号的全部文章」（实证全空）。直接向用户要一篇该号种子文章，走合集/互链通道；聚合镜像站（今天看啥等）专栏需登录，同样不作发现通道。
- If a fetch returns `sogou_blocked`, fall back to the title/keyword re-search in Step 3 — do NOT hammer the same sogou link.

## 合集/互链发现 — 有种子 URL 时首选通道（Sogou 被墙的替代路）

Sogou 对代理出口 IP 会连续弹点选验证码：连解 2-3 轮仍换新图 = 该 IP 已被标记，**立即弃通道**（继续点选是无限循环）。用户给了种子文章 URL 时直接走种子自带的两条通道——零反爬、一次拿全列表，实测一个 110 篇合集 + 一个 19 篇合集全部枚举成功。

### 通道 1：合集（album）——同系列全量枚举，首选
1. 在种子文章 HTML 源码（正文互链或页面内联变量）里找 `album_id=<数字>`；同页可取 `var biz` 与 `var nickname`（账号名）。
2. 合集页 `https://mp.weixin.qq.com/mp/album?__biz=<biz>&album_id=<id>` 是 JS 动态渲染——curl 只拿到壳，须 browser 打开读 DOM。
3. 条目**不是 `<a>` 锚点**（innerText 有全部标题但 `querySelector('a')` 为空）：每条是 `li[data-link="..."]`，取 `data-link` 属性即完整 mp.weixin URL。
4. 列表懒加载：在页面内滚动到页底直至条目数连续两次不变（单合集可上百篇）。
5. data-link 里的 URL 用 curl 直抓正文即可——反爬墙只挡「列表发现」层，微信文章页本身无墙。

### 通道 2：系列互链——无合集时逐级爬
- 系列文正文带往期链接（`?__biz=...&mid=N&idx=N&sn=...` 形式）与「下一篇预告」；顺链逐级走，`mid-idx` 可当文件 slug。
- mid/idx 形式链接的响应是中间页，需解析出完整 sn+chksm 后才是最终可 curl 的 URL。

### 批量爬取工程化（几十篇以上必做）
- **manifest 状态机**：JSON 数组逐条 `{title, link, status(ok/fail/pending), file, chars}`，每篇处理完立即整体重写落盘——任何时刻中断/重启都幂等续跑（`status=ok` 且正文文件 >3KB 直接跳过）。
- **文件锁防多实例竞写**：可能另有爬虫在跑同一目录（kanban 派起的 worker、上轮残留进程）——脚本先抢 `<manifest>.lock`（存在即等待/退出），比事后杀进程、修竞写数据便宜得多。
- 限速 6-10s/篇，实测连爬百篇未触发频控；跑完对 fail 条目单独重试一轮补齐，仍 fail 按下节信号定性。

### 「文章已删」与频控的判别
响应 ~30KB 壳页且同时满足：无 `js_content`、无 `msg_title`、去标签后只剩 CSS 与「赞/在看/分享」交互文案——这是发布者已删除/链接失效，不是频控。隔 10s+ 重试两轮仍如此 → manifest 记终态，不再重爬。聚合镜像站（今天看啥等）专栏需登录，不作发现通道。

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

## Pitfalls

### 验收侧：调研/亲读类卡的锚点对账（2026-10-21 实证）

worker 自述「亲读 N 篇/N 万字」时，禁止按声明收卡，必须做产物锚点对账：
- **msgid 锚点法**：manifest 每篇的 `mid-idx` 与阅读笔记「来源：」行机械匹配，覆盖率即真实阅读覆盖（wx-onto-ddd-20261021 实测：「128/129 亲读」实际 122/128，含用户种子文漏读）。
- **字数重数法**：语料总量 sum(len(content)) 重数，不信自述（实测自述 90 万字实际 67.3 万，虚报 25%）。
- **疑点不过夜**：抽查 MISSING 时先换更可靠锚点（编号制/msgid）复核，仍 MISSING 即列漏读清单——不许用「笔记是缩写制」这类解释放过（本例当时被放过，用户复审才纠正）。
- 漏读篇由验收方补读裁决或退回补读；裁决落 corrections 文件，原报告头部加勘误声明。

## Key Pitfalls

### WeChat HTML structure varies

Not all articles use the same div structure. Some use `class="rich_media_content"` instead of `id="js_content"`. Always implement a fallback regex.

**`js_content` 完全缺失（find 返回 -1，curl 抓回 MB 级 HTML 却定位不到正文 div）**：正文改由 JS 渲染注入，静态 HTML 无正文容器。不要反复换 regex——先取 `og:description` / `var msg_desc` 当摘要确认主题（该 meta 通常完整带出正文前几百字），再走 browser 通道：`browser_exec` 打开 URL 后 `document.getElementById('js_content')||document.querySelector('.rich_media_content')` 读 `innerText`，判定阈值 `content.length > 500`。

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
- For "research all articles from account X and apply to domain Y" (e.g. improve EDA team from readsemi), map each article to the relevant profile/team via keyword scoring, produce a coverage matrix, then a capability-gap list. See `references/account-research-template.md` for a ready-made report skeleton.

## Related Skills

- **wechat-article-extractor** — npm-based extraction with metadata (author, publish time, account info). Use when you need full metadata or the curl+regex approach fails on complex article structures.
- **evidence-based-research** — Anti-hallucination research methodology. Every factual claim must be traceable to a source.
