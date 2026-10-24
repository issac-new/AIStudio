---
name: wechat-batch-discovery
description: Batch find WeChat articles by account name via Sogou search.
version: 1.0.0
metadata:
  hermes:
    tags: [research, wechat, batch, content-discovery]
    related_skills: [wechat-article-research, real-browser-antibot-bypass]
---

# WeChat Batch Article Discovery

When `wechat-article-research` handles ONE article URL, this skill
handles BATCH discovery: given a list of account names, find their recent
articles via Sogou WeChat Search. Validated Aug 2026: 180 accounts, 886
articles, 100% success rate.

## When to Use

- User wants to survey articles from multiple WeChat Official Accounts
- User asks to "调研公众号文章" (research WeChat account articles)
- User provides a list of account names (not URLs) and wants recent content
- User wants to build a knowledge base from their WeChat subscriptions

## The Pipeline

```
Account name list
    ↓
weixin.sogou.com/weixin?type=2&query=<name>  (curl, no anti-bot)
    ↓
Parse HTML: <li id="sogou_vr_11002601_box_N"> blocks
    ↓
Extract: title, timestamp (timeConvert), snippet
    ↓
Filter by date (optional) → JSON output
```

## Key Insight: Which Sogou Endpoint Works

| Endpoint | Anti-bot | Use for |
|----------|----------|---------|
| `weixin.sogou.com/weixin?type=2` | Stable | **Article search** (this skill) |
| `weixin.sogou.com/weixin?type=1` | Stable | Account profile search |
| `weixin.sogou.com/link?url=...` | CAPTCHA | Article redirect (AVOID) |
| `www.sogou.com/web?query=...` | 403 after 3 reqs | Web search (AVOID) |
| `wap.sogou.com/web/...` | Sometimes | Mobile fallback |

**The ONLY stable path for batch article discovery is
`weixin.sogou.com/weixin?type=2`.**

## Rate Limiting

- 5-8 seconds between accounts, random jitter
- 2 pages per account (10 results max) is enough
- Serial execution preferred over parallel subagents (shared IP rate limit)
- If anti-spider triggered: wait 30s, switch to `wap.sogou.com`

## Parsing Details

Each result block in the HTML:
```html
<li id="sogou_vr_11002601_box_0">
  <h3 class="vr-title">
    <a href="...">ARTICLE TITLE</a>
  </h3>
  <p class="txt-info">SNIPPET TEXT...</p>
  <script>timeConvert('1234567890')</script>
</li>
```

Extract with:
```python
title = re.search(r'<h3[^>]*>.*?<a[^>]*>(.*?)</a>', block, re.DOTALL)
ts = re.search(r"timeConvert\('(\d{10})'", block)
snippet = re.search(r'<p class="txt-info"[^>]*>(.*?)</p>', block, re.DOTALL)
```

## Full-Text Caveat

Sogou returns **metadata only** (title/date/snippet), NOT full text.
For full text you need a valid `mp.weixin.qq.com/s?...` URL with fresh
signature — these expire in minutes. Options:
1. Use `computer_use` to drive WeChat desktop app (most reliable)
2. Use `www.sogou.com/web?query=<account> site:mp.weixin.qq.com` to get
   signature URLs (works but rate-limited after 3 requests)
3. Accept metadata-only if title+snippet is sufficient for analysis

## Pitfalls

- **type=1 vs type=2**: `type=1` = account profiles (wrong), `type=2` =
  articles (correct). Easy to mix up.
- **Old index bias**: Sogou surfaces historical articles for some
  accounts. Filter by `pub_time` if recency matters.
- **Chinese encoding**: URL-encode account names with
  `urllib.parse.quote()`.
- **Subagent rate limits**: If dispatching batch scraping to concurrent
  subagents, each may independently trigger rate limits. Better to run
  a single serial script from orchestrator.

## Scripts

- `scripts/batch-discovery.py` — Full robust batch scraping script with
  rate limiting, checkpointing, and anti-bot fallback.

## Related Skills

- **wechat-article-research** — Single-article fetch and analysis.
- **real-browser-antibot-bypass** — For full-text extraction via browser.
