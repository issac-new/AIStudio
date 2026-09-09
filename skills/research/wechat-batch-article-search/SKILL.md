---
name: wechat-batch-article-search
description: Batch-find WeChat articles via Sogou search by account name.
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [research, wechat, batch-search, sogou, anti-bot]
    related_skills:
      - wechat-article-research
      - real-browser-antibot-bypass
      - web-search-antibot-research
---

# WeChat Batch Article Search (Sogou Weixin)

Batch-discover articles from WeChat Official Accounts using Sogou's WeChat search engine. Use when the user provides account names (not URLs) and asks for recent articles.

## When to Use

- User asks "获取公众号 X 的最近文章" or "批量获取多个公众号的文章列表"
- User provides a list of WeChat account names (not article URLs)
- Building a corpus of articles from specific accounts for research/analysis
- Monitoring multiple WeChat accounts for new content

## Critical: Use weixin.sogou.com, NOT www.sogou.com/web

| Endpoint | Result | Why |
|----------|--------|-----|
| `www.sogou.com/web?query=site:mp.weixin.qq.com+...` | **CAPTCHA** | Always triggers antispider |
| `weixin.sogou.com/weixin?type=2&query=<account>` | **Works** | With proper headers |

## Required Request Headers

```bash
curl -sL \
  -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36" \
  -H "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" \
  -H "Accept-Language: zh-CN,zh;q=0.9,en;q=0.8" \
  -H "Cookie: SNUID=<any_value>; SUV=<any_value>" \
  "https://weixin.sogou.com/weixin?type=2&query=<urlencoded_account>&ie=utf8"
```

**Key points:**
- **Cookie is mandatory** — SNUID/SUV values can be arbitrary; without them Sogou blocks with CAPTCHA
- Desktop UA is more stable than mobile UA
- Rate limit: 2-3 seconds between requests; 10-second cooldown after CAPTCHA trigger

## HTML Parsing Patterns

Article blocks are `<li id="sogou_vr_...">` elements. Extract:

| Field | Pattern | Notes |
|-------|---------|-------|
| Title | `<h3><a[^>]*>(.*?)</a></h3` | Strip HTML tags |
| URL | `href="(/link?url=[^"]*)"` | Sogou redirect, NOT direct weixin URL |
| Snippet | `<p class="txt-info">(.*?)</p>` | Strip HTML tags |
| Account | `<a class="account">` or `<a uigs="account_name_\d+">` | May be empty |
| Timestamp | `timeConvert\('(\d+)'\)` | Unix timestamp in script tag |
| biz_id | `mmbiz\.qpic\.cn/mmbiz_jpg/([^/]+)/` | From thumbnail URL (URL-encoded) |

### Full extraction example

```python
import re
from datetime import datetime

def parse_sogou_block(block):
    # Title
    title_m = re.search(r'<h3>\s*<a[^>]*href="([^"]*)"[^>]*>(.*?)</a>\s*</h3>', block, re.DOTALL)
    if not title_m:
        return None
    
    url_path = title_m.group(1).replace('&amp;', '&')
    title = re.sub(r'<[^>]+>', '', title_m.group(2)).strip()
    
    # Clean HTML entities
    title = title.replace('&ldquo;', '"').replace('&rdquo;', '"').replace('&amp;', '&')
    
    # Snippet
    snippet_m = re.search(r'<p class="txt-info">(.*?)</p>', block, re.DOTALL)
    snippet = re.sub(r'<[^>]+>', '', snippet_m.group(1)).strip() if snippet_m else ''
    
    # Timestamp
    time_m = re.search(r"timeConvert\('(\d+)'\)", block)
    pub_time = datetime.fromtimestamp(int(time_m.group(1))).strftime('%Y-%m-%d') if time_m else ''
    
    # biz_id from thumbnail
    img_m = re.search(r'mmbiz_jpg%2F([^%]+)%2F', block)
    biz_id = img_m.group(1) if img_m else ''
    
    return {
        'title': title,
        'url': f"https://weixin.sogou.com{url_path}" if url_path.startswith('/') else url_path,
        'snippet': snippet[:200],
        'pub_time': pub_time,
        'biz_id': biz_id
    }
```

## Sogou Redirect URLs — Key Limitation

The URLs returned (`/link?url=...`) are **session-bound redirects** that:
- Expire in minutes
- Cannot be resolved to `mp.weixin.qq.com` via curl (returns antispider page)
- Cannot be resolved via headless browser (also blocked)

**Workarounds:**
1. **Save biz_id + title** — use for later manual lookup or alternative resolution
2. **Use computer_use + real browser** — see `real-browser-antibot-bypass` skill
3. **Signed links** — some results contain `mp.weixin.qq.com/s?src=11&timestamp=...&signature=...` links; use immediately (minutes-valid)

## Batch Processing Pattern

```python
import subprocess, re, json, time
from urllib.parse import quote

accounts = ["FreeBuf", "乌云安全", "奇安信CERT", "老刘说NLP", "开源AI项目"]
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36..."

results = []
for account in accounts:
    url = f"https://weixin.sogou.com/weixin?type=2&query={quote(account)}&ie=utf8"
    html = subprocess.run([
        "curl", "-sL", "-A", UA,
        "-H", "Cookie: SNUID=xxx; SUV=xxx",
        "--max-time", "15", url
    ], capture_output=True, text=True).stdout
    
    if "antispider" in html or "验证码" in html:
        time.sleep(10)
        continue
    
    blocks = re.findall(r'<li id="sogou_vr_.*?</li>', html, re.DOTALL)
    articles = [parse_sogou_block(b) for b in blocks[:5] if parse_sogou_block(b)]
    
    results.append({
        "account": account,
        "articles": articles
    })
    
    time.sleep(3)  # Rate limit

with open('batch_articles.json', 'w', encoding='utf-8') as f:
    json.dump(results, f, ensure_ascii=False, indent=2)
```

## Output Format

```json
{
  "account": "FreeBuf",
  "articles": [
    {
      "title": "FreeBuf 2020年度数据盘点...",
      "url": "https://weixin.sogou.com/link?url=...",
      "snippet": "2020年,或许你本想冲刺FreeBuf作者榜...",
      "pub_time": "2021-01-05",
      "biz_id": "qq5rfBadR39LtibgVcQ5o5iaYGV99bARBxr56wK4cRR6LI2PMAEiaePvibXYyJP24mbic7gRbstAXeSibkaknic6Dibrtw"
    }
  ]
}
```

## Pitfalls

### CAPTCHA triggers
- **Symptom**: HTML contains "antispider" or "验证码"
- **Fix**: Wait 10 seconds, retry with same headers; ensure Cookie is present

### Empty results
- **Symptom**: `<li id="sogou_vr_...">` blocks not found
- **Fix**: Check if account name is correct; try shorter/more common name variant

### Rate limiting
- **Symptom**: First few requests work, then CAPTCHA
- **Fix**: Increase delay to 3-5 seconds between requests; add random jitter

### Old articles for some accounts
- **Symptom**: Results from 2016-2019 for accounts that should have newer content
- **Cause**: Sogou's index doesn't always surface the most recent articles
- **Fix**: None reliable; consider this a limitation of the discovery method

## Related Skills

- **wechat-article-research** — Fetch and analyze individual WeChat articles when you have URLs
- **real-browser-antibot-bypass** — Use real browser to resolve Sogou redirect URLs to actual mp.weixin.qq.com links
- **web-search-antibot-research** — General anti-bot techniques for web search
