---
name: web-search-antibot-research
description: >-
  Autonomous web search when DuckDuckGo/Bing HTML and Zhihu/corp SPA
  endpoints are bot-blocked. Use the Bing RSS endpoint as the primary
  search interface, Wikipedia as the most reliable curl target, and
  vendor /docs/ subdomains for SPA-blocked corp sites. Use when the agent
  needs to do web search via curl/urllib (no browser) and DDG or Bing
  returns CAPTCHA or empty JS shells.
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [research, web-search, anti-bot, bing-rss, curl]
    related_skills:
      - deep-research-workflow
      - research-then-improve
      - wechat-article-research
---

# Web Search Anti-Bot Research

Autonomous web search techniques for when the standard search and content
endpoints are bot-blocked. Captured during the Palantir org-patterns
research session (2026-07-31) where DDG, Bing HTML, Zhihu, and
Palantir.com all blocked curl/urllib access.

## When to Use

- Agent needs to do web search via curl/urllib (no browser available)
- DuckDuckGo returns CAPTCHA ("Unfortunately, bots use DuckDuckGo too")
- Bing HTML returns a JS shell with no organic results in raw HTML
- A specific site (Zhihu, Palantir.com) returns 403 or SPA shells to curl
- User asks for "深入调研" and no browser tool is available or appropriate

## The Bing RSS Technique (PRIMARY)

Bing's regular HTML SERP is JS-rendered — `curl` or `urllib` gets a
shell with nav/ads but no organic `<h2><a>` result links. However, Bing
exposes an **RSS** endpoint that returns parseable XML with real titles,
links, and descriptions, no JS execution required.

### The helper function

```python
import urllib.request, re, urllib.parse

def bing_rss(query, count=20, mkt="en-US"):
    url = (f"https://www.bing.com/search?format=rss"
           f"&setmkt={mkt}&setlang=en-US"
           f"&q={urllib.parse.quote(query)}&count={count}")
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                      "AppleWebKit/537.36 (KHTML, like Gecko) "
                      "Chrome/120.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
    })
    resp = urllib.request.urlopen(req, timeout=20)
    data = resp.read().decode("utf-8", errors="replace")
    items = re.findall(r"<item>(.*?)</item>", data, re.DOTALL)
    results = []
    for it in items:
        title = re.search(r"<title>(.*?)</title>", it, re.DOTALL)
        link = re.search(r"<link>(.*?)</link>", it, re.DOTALL)
        desc = re.search(r"<description>(.*?)</description>", it, re.DOTALL)
        results.append({
            "title": title.group(1) if title else "",
            "link": link.group(1).strip() if link else "",
            "desc": re.sub(r"<[^>]+>", "", desc.group(1))[:300] if desc else "",
        })
    return results
```

### The `setmkt` parameter is CRITICAL

Bing localizes by IP. From HK the default SERP returns `zh-HK` market
results — Chinese-language, even for English queries. You MUST set
`setmkt` explicitly:

| `setmkt` | Use case |
|----------|----------|
| `en-US` | English-language sources (international research) |
| `zh-CN` | Simplified Chinese sources (domestic vendor research) |
| omitted | Defaults by IP — often wrong for the research target |

### Query strategy

- **Bing returns the same ~10 results for many query phrasings.** Vary
  vocabulary and use `site:` operators rather than rephrasing the same
  keywords — the result set barely changes across minor rephrasings.
- **`site:` operator is effective:** `'Palantir "forward deployed
  engineer" site:palantir.com'` narrows to the primary domain.
- **Quoted phrases force exact match:** `"forward deployed engineer"`
  returns more relevant results than unquoted.
- **Run 8-12 queries** to cover all research dimensions; each returns
  10 results with overlap, yielding ~40-60 unique URLs after dedup.

## Blocked Endpoints Catalog

| Endpoint | Block Type | Symptom | Alternative |
|----------|-----------|---------|-------------|
| `html.duckduckgo.com/html/` | CAPTCHA | "Unfortunately, bots use DuckDuckGo too" + image challenge | Bing RSS |
| `www.bing.com/search` (HTML) | JS-rendered | Raw HTML shell; no `<h2><a>` organic results | Bing RSS (`?format=rss`) |
| `zhuanlan.zhihu.com` (Zhihu) | HTTP 403 | Forbidden regardless of User-Agent | Tencent News (`news.qq.com`), Baidu Baike |
| `www.palantir.com` (SPA pages) | Next.js SPA | JS bootstrap shell (~14 chars: "/sitemap.xml") | `/docs/` subdomain or secondary sources |
| Next.js/React corp sites generally | SPA | `curl` returns `/_next/static/chunks/...` with no body | `/docs/` path, or Wikipedia/WIRED/Built In |

## Reliable Curl Targets (no anti-bot)

### 1. Wikipedia — always server-rendered

```python
import urllib.request, re

def fetch_wiki(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    resp = urllib.request.urlopen(req, timeout=15)
    t = resp.read().decode("utf-8", errors="replace")
    t = re.sub(r"<[^>]+>", " ", t)
    t = re.sub(r"\s+", " ", t)
    return t
```

**Pitfall:** Wikipedia TOC repeats section names. To find the actual
content section (not the TOC entry), search for the second occurrence:
```python
first = text.find("AI-assisted targeting tools")
second = text.find("AI-assisted targeting tools", first + 30)
```

### 2. Tencent News (news.qq.com) — curl-friendly Chinese source

Returns full article text to curl with a standard User-Agent. Good
fallback when Zhihu blocks 403.

### 3. Vendor /docs/ subdomains (for SPA-blocked corp sites)

Many Next.js/React SPA corporate sites have a `/docs/` path that IS
server-rendered:
- `palantir.com/docs/foundry/ontology/overview/` → works (12KB text)
- `palantir.com/careers/...` → blocked (SPA shell)
- `palantir.com/about/` → blocked (SPA shell)

Check if the vendor has a separate docs subdomain or path before
giving up on primary-source access.

## Workflow: Search → Fetch → Extract

```
1. bing_rss(query, mkt="en-US")          # 8-12 queries covering all dimensions
2. Dedup URLs across queries
3. For each unique URL:
   a. If Wikipedia → fetch_wiki() + section extraction
   b. If news.qq.com or curl-friendly → fetch + clean_html()
   c. If Zhihu → skip (403) or use secondary source
   d. If SPA corp site → try /docs/ path; else use secondary source
4. Save each cleaned text to <name>.txt in research dir
5. Keyword-search each .txt for relevant sections
6. Compile findings into report with [source] citations
```

## HTML Cleaning Helper

```python
def clean_html(path):
    with open(path, 'r', encoding='utf-8', errors='replace') as f:
        html = f.read()
    html = re.sub(r'<script[^>]*>.*?</script>', '', html, flags=re.DOTALL|re.IGNORECASE)
    html = re.sub(r'<style[^>]*>.*?</style>', '', html, flags=re.DOTALL|re.IGNORECASE)
    text = re.sub(r'<[^>]+>', ' ', html)
    text = text.replace('&nbsp;', ' ').replace('&amp;', '&').replace('&lt;', '<')
    text = text.replace('&gt;', '>').replace('&#39;', "'").replace('&quot;', '"')
    text = re.sub(r'\s+', ' ', text)
    return text
```

## Pitfalls

### Do NOT waste turns on DDG HTML or Bing HTML

If `curl` or `urllib` returns a page that says "bots use DuckDuckGo too"
or a Bing page with no visible results in the raw HTML, switch to Bing
RSS immediately. Do not retry with different User-Agents — the block is
not User-Agent based.

### Do NOT rely on Zhihu as a primary source

Zhihu articles (`zhuanlan.zhihu.com/p/...`) return HTTP 403 to curl/urllib
with any User-Agent. They require a logged-in browser session. For
autonomous research, use Tencent News, Baidu Baike, or SmartCity-team
articles instead — these are curl-friendly.

### Do NOT expect Bing to return different results for minor rephrasings

`"Palantir forward deployed engineer"` and `"Palantir FDE role"` return
nearly identical result sets. Vary the vocabulary and use `site:`
operators to get diversity:
- `"forward deployed" site:palantir.com`
- `"deployment engineer" Palantir interview experience`
- `Palantir FDE quora OR medium OR substack`

### SPA corp sites: check /docs/ before giving up

Before concluding "primary source is inaccessible," check if the vendor
has a `/docs/`, `/help/`, or `/api/` subpath — these are often
server-rendered even when the marketing pages are SPAs.

## Related Skills

- **deep-research-workflow** — the broader research workflow this
  complements with search-specific anti-bot techniques (lives in default
  profile; cannot be patched from orchestrator)
- **research-then-improve** — research-external-to-improve-internal
  pattern that benefits from this search technique (lives in default
  profile)
- **wechat-article-research** — WeChat-specific article fetching with
  curl + regex (lives in default profile)
