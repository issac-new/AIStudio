---
name: chinese-book-data-douban
description: "Get Douban ratings for Chinese books via API. Use for 书单."
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [research, chinese, books, douban, curl, anti-bot, [已移除], ratings]
    related_skills:
      - chinese-web-fact-finding
      - web-search-antibot-research
      - chinese-classics-book-resources
---

# Chinese Book Data via Douban

Reliable, curl/urllib-friendly technique for gathering **verified** Douban
ratings and publication metadata for Chinese books. This is the book-data
analog of `chinese-web-fact-finding`'s Baike LemmaCard API: a clean JSON/HTML
endpoint that bypasses the anti-bot walls every search engine throws at
automated Chinese book queries.

Captured 2026-08-01 during a [已移除] 科普/哲学/数学/历史 book-catalog research
session where the goal was a 70-book annotated reading list with real Douban
ratings, not guesses.

## When to Use

- User asks to research / enumerate Chinese books and you need **real Douban
  ratings** (not "豆瓣未收录" placeholders or invented scores)
- User wants a 书单 / 阅读清单 / [已移除] 书目 with credibility data
- You tried Baidu / Sogou / Bing / Google search for book info and hit
  captcha / 百度安全验证 / antispider / dictionary-hijack pages
- You need author / publisher / year / summary for many Chinese books fast

## The Core Problem This Solves

Every general search engine bot-blocks automated Chinese book queries after
~1 successful call (verified 2026-08):

| Engine | Failure on Chinese book queries |
|--------|---------------------------------|
| Baidu (`baidu.com/s`) | 百度安全验证 captcha after 1 call |
| Sogou (`sogou.com/web`) | antispider image captcha |
| Bing (cn) | dictionary hijack (returns 华 the character, not 华杯赛) |
| Bing (intl) | works once, then tokenizes CJK into single chars |
| Google / DuckDuckGo | SSL_ERROR_SYSCALL / timeout from sandbox |

**Douban's own endpoints never trigger any of these.** No captcha, no JS
rendering required, no auth. This turns "research 50 Chinese books" from a
captcha-fight into a deterministic ~4-minute loop.

## Technique 1: Douban Suggest API (resolve title → subject ID)

```
GET https://book.douban.com/j/subject_suggest?q=<urlencoded book title>
```

Returns JSON array, no auth, no captcha:
```json
[
  {"id":"4852833","title":"小牛顿科学馆","author_name":"台湾牛顿出版公司"},
  {"id":"1103152","title":"时间简史","author_name":"[英] 史蒂芬·霍金"}
]
```

**Use this to RESOLVE a book title to a Douban subject ID.** Never guess
subject IDs — Douban IDs are opaque (三体=2567698, 苏菲的世界=1063421) and
guessing returns wrong books (one guessed ID returned 比较诗学视野下的萧纲研究).

A bare `User-Agent: Mozilla/5.0` and `Referer: https://book.douban.com/`
header suffice. Empty array `[]` means "no match" — retry with a variant
title (e.g. "小牛顿科学馆 步印" → "小牛顿科学馆").

## Technique 2: Douban Subject Page (full metadata)

```
GET https://book.douban.com/subject/<id>/
```

Server-rendered HTML (NOT an SPA shell). Parse with regex:

| Field | Regex |
|-------|-------|
| rating | `<strong[^>]*class="ll rating_num[^"]*"[^>]*>\s*([\d.]+)\s*</strong>` |
| rating count | `(\d+)人评价` |
| title | `<title>([^<]*)</title>` (strip " (豆瓣)") |
| author block | inside `id="info"(...)(?:<div class="rating\|<div id="collect)`, then `作者[^<]*</span>\s*(.*?)(?:<br\|</div>)` |
| publisher | `出版社:\s*(.*?)(?:<br\|<span)` |
| year | `出版年:\s*(.*?)(?:<br\|<span)` |
| summary | `<div class="intro">(.*?)</div>` then `<p>(.*?)</p>` within |

## Technique 3: Polite rate limiting (CRITICAL)

Sleep **2.5–3.5 seconds** between calls. Douban will silently serve degraded
responses if hammered. A 70-book batch at this cadence completes in ~4 min
with zero blocks. Going faster risks empty pages that look like "no data".

## Reusable Script

`scripts/douban-book-data.py` — standalone, stdlib-only, copy-paste-runnable:

```bash
# Resolve a title to candidate subject IDs
python3 douban-book-data.py suggest "小牛顿科学馆"

# Fetch full metadata for one subject ID (JSON output)
python3 douban-book-data.py book 2567698

# Batch: resolve + fetch in one shot, one line per book
python3 douban-book-data.py batch "小牛顿科学馆" "三体" "苏菲的世界"
# → ✓ ★ 9.3 | 小牛顿科学馆 | 台湾牛顿出版公司
#   ✓ ★ 8.9 | 三体 | 刘慈欣
#   ✓ ★ 9.0 | 苏菲的世界 | [挪威] 乔斯坦·贾德
```

Importable too: `from douban_book_data import douban_suggest, douban_book, research_book`.

## Workflow: Chinese Book Catalog Research

```
1. Draft the book list (titles from the user, a syllabus, a known series).
2. For each title:
   a. douban_suggest(title)        → resolve to subject ID
   b. douban_book(subject_id)      → rating + author + publisher + summary
   c. sleep 2.5-3.5s between calls
3. For titles returning [] : retry with a variant (add/remove author name,
   add publisher, drop volume number).
4. For series (e.g. 如果历史是一群喵 1-13): query each volume separately —
   Douban rates per-volume, and later volumes often score higher.
5. Compile catalog with VERIFIED ratings only. Never fill a rating field
   with a guess. "豆瓣未收录/分散未聚合" is a valid status for套装.
6. Spot-check: re-fetch 2-3 books after writing the doc to confirm the
   ratings you cited match what Douban actually served (anti-fabrication).
```

## Pitfalls

### Do NOT guess Douban subject IDs
IDs are opaque. Guessing returns plausible-looking but WRONG books. Always
resolve via the suggest API first. (Verified: a guessed "1080423" returned
"充满张力的生活空间-勒温的动力心理学" instead of the intended physics book.)

### Do NOT conclude "no Douban entry" from a single empty suggest result
Some titles need a variant query: "小小牛顿科学馆" → [] but "小小牛顿" → hits;
"第一推动丛书 时间" → [] but "时间简史" → hits. Try 2-3 phrasings before
marking a book "豆瓣未收录".

### Do NOT hammer Douban faster than 1 req / 2.5s
Faster calls return truncated/empty pages that masquerade as "no data". The
2.5-3.5s sleep is what makes this reliable, not optional.

### Do NOT trust Douban search HTML (search.douban.com)
The search results page returns "Bad Request" or a JS shell to curl. Use the
**suggest API** (`/j/subject_suggest`) instead — it is the curl-friendly path.
The subject *page* (`/subject/<id>/`) is also curl-friendly; only the search
page is not.

### Do NOT aggregate series ratings into one number
A series like "如果历史是一群喵" has 13 volumes scored 8.0-9.0 individually.
Citing a single "series rating" is a fabrication risk. Cite per-volume, or
say "豆瓣按单册分散收录，无聚合评分" for套装 that Douban splits.

## Verification (anti-fabrication)

After compiling the catalog, re-run the script on 2-3 cited books and diff
the ratings against what you wrote in the doc. If any mismatch, the rating
was either guessed or mistyped — fix it. This step caught zero errors in the
2026-08-01 session (all 121 ratings were real), but it is the guardrail that
makes "every rating verified" a true claim rather than an aspiration.

## Related Skills & Overlap

- **chinese-web-fact-finding** (sibling profile) — the Baike LemmaCard API is
  the fact-lookup analog of this skill's Douban API; together they cover
  Chinese entity research (organizations → Baike, books → Douban). The
  foreground curator may eventually fold this skill into
  `chinese-web-fact-finding` as "Technique 4: Douban book-data API".
- **web-search-antibot-research** (sibling profile) — English-language Bing
  RSS fallback; complements this skill's Chinese Douban route.
- **chinese-classics-book-resources** (sibling profile) — the [已移除] book-catalog
  *output shape* (age tiers ⭐🟡🔵, 如何获取 column, 教师 agent 用法); this skill
  provides the *rating-data input* that feeds that output shape.
