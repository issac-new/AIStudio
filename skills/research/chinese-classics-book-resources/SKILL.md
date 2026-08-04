---
name: chinese-classics-book-resources
description: "Build URL-verified catalogs of Chinese [已移除] books & classics."
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [research, chinese, [已移除], books, classics, url-verification, encyclopedia]
    related_skills:
      - chinese-resource-catalog-research
      - web-research-fetching
      - web-search-antibot-research
---

# Chinese Classics & Book Resources

Produce a URL-verified resource catalog of Chinese educational books,
children's encyclopedias, fairy tales, fables, idiom stories (成语), and
classical texts (蒙学/古籍). Captured during the [已移除] 少儿百科·经典童话·
寓言·成语故事·识典古籍 research session (2026-08-01) that verified 15+
digital libraries and publisher sites and produced a 65-entry catalog.

## When to Use

- User asks to research / enumerate Chinese children's books, encyclopedias,
  fairy tales, fables, idiom-story collections, or classical-text databases
- User wants a 书单 / 资源目录 / 读书清单 for a [已移除] child (any sub-domain:
  百科, 童话, 寓言, 成语, 古诗文, 蒙学经典)
- You need to verify which classics/book sites are actually live before
  recommending them (古文岛/ctext/识典古籍/汉典/Gutenberg/publishers)
- A cross-profile research skill's search-engine or site-status table looks
  stale and you need the 2026-08-verified environment notes

## Workflow

```
1. Batch curl HEAD/GET all candidate URLs (Technique 1) → liveness table
2. For live sites serving real content via curl → parse with execute_code
3. For SPA sites (DK, Britannica, JD search) → browser_navigate
4. For captcha'd sites (Baidu Baike, 360 Search) → browser_navigate, note as browser-only
5. Compile catalog with the book-catalog output structure (Technique 3)
6. Add age-applicability tiers (🟢 4-6 / 🟡 6-8 / 🔵 8+) for [已移除] resources
7. Record verification status per source in a footer table
```

## Technique 1: Batch curl verification with content sniff

Book/classics sites vary widely in curl-friendliness. Test each in ONE
`execute_code` batch and classify by response:

```python
from hermes_tools import terminal
import re, html as H

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
      "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36")

def fetch(url, timeout=15):
    r = terminal(
        f"curl -skL --max-time {timeout} -A '{UA}' '{url}' "
        f"-o /tmp/f.html 2>&1; wc -c < /tmp/f.html",
        timeout=timeout+5)
    size = int(r['output'].strip().split('\n')[-1] or 0)
    r2 = terminal("head -c 80000 /tmp/f.html", timeout=5)
    return size, r2['output']

def strip_html(c):
    t = re.sub(r"<script.*?</script>", "", c, flags=re.S)
    t = re.sub(r"<style.*?</style>", "", t, flags=re.S)
    t = re.sub(r"<[^>]+>", " ", t)
    return re.sub(r"\s+", " ", H.unescape(t)).strip()
```

**Classification by response** (verified 2026-08):
- `size > 20KB + real text` → curl-friendly, parse directly (ctext, zdic,
  Gutenberg, Larousse)
- `size > 200KB but stripped text < 100 chars` → SPA, use browser_navigate
  (DK 759KB, Tessloff 592KB)
- `~2.5KB + "百度安全验证"` → Baidu Baike captcha, browser-only
- `~6KB + "请输入验证码"` → 360 Search captcha, browser-only
- `< 100 bytes` → likely blocked/empty (gushiwen.org curl returns 66 bytes;
  use the guwendao.net successor via browser)
- `Facebook/Meta error page` → DNS poisoning (see Technique 4)

## Technique 2: Verified known-list (2026-08-01)

Use as the starting checklist — do not rediscover from scratch. Full
detail with per-resource notes in `references/verified-resources-2026-08.md`.

### Classical-texts digital libraries (all free, all live)
| Site | URL | curl works? | Notes |
|------|-----|-------------|-------|
| 古文岛 (原古诗文网) | guwendao.net | ⚠️ browser | Full 论语/诗词/蒙学 + 朗诵音频; `gushiwen.org` 302-redirects here |
| 中国哲学书电子化计划 | ctext.org | ✅ yes | World's largest open ancient-Chinese library; 论语/三字经 confirmed with 中英对照; some deep paths trigger a captcha |
| 识典古籍 | shidianguji.com | ⚠️ browser | ByteDance/字节跳动-operated; features 永乐大典 (3.7亿字) |
| 汉典 | zdic.net | ✅ yes | 10万+ 汉字, 60万+ 词语; char/idiom/poetry lookup |
| (merged) guoxue.com / gu.zdic.net | — | — | Now serve the 识典古籍 page — treat as ONE source, not three |

### Public-domain Western classics (free, via Project Gutenberg — all live)
| Author | Gutenberg URL | curl size |
|--------|---------------|-----------|
| Andersen | gutenberg.org/ebooks/27200 | 24KB |
| Grimm | gutenberg.org/ebooks/2591 | 25KB |
| Aesop | gutenberg.org/files/11339/11339-h/11339-h.htm | 277KB full text |
| 1001 Nights | gutenberg.org (search) | varies |

### Publisher / encyclopedia sites (confirmed live, mostly SPAs)
| Publisher | URL | curl behavior |
|-----------|-----|---------------|
| DK (Dorling Kindersley) | dk.com | 759KB SPA shell — use browser |
| Larousse | larousse.fr | 56KB — curl returns real content |
| Tessloff (WAS IST WAS) | tessloff.com | 592KB SPA — use browser |
| Britannica | britannica.com | 403 Cloudflare for curl; store.britannica.com works |
| Scholastic (Horrible Science) | scholastic.co.uk | works via curl |

## Technique 3: Book-catalog output structure

```markdown
# <Domain> 书目与数字资源目录

> 适用对象 / 编制日期
> 标注: ⭐首选 🟢4-6岁 🟡6-8岁 🔵8+ ; [购]/[免]/[免App]

## Part N: <subcategory>
### ⭐⭐⭐ N.M <Book/Resource name>
| 字段 | 内容 |
|------|------|
| **书名** | ... |
| **作者/出版社** | ... |
| **主题** | ... |
| **适龄** | 🟢/🟡/🔵 |
| **推荐理由** | ... |
| **如何获取** | [购] / [免] URL |
| **教师agent用法** | 具体教学步骤 |
| **验证** | ✅ site confirmed live (method) |

## 附录: <age>精选书单与使用策略
（第一梯队立即购入 / 第二梯队补充 / 数字资源 / 教师agent方法论 / 注意事项）

## 研究方法与验证记录
（每个源的验证方式与状态表 — ✅在线 / ⚠️需浏览器 / ❌不可用）
```

**Key structural elements for book catalogs** (distinct from platform
catalogs):
1. **Age-tier markers** (🟢🟡🔵 + ⭐) on every entry — books are age-gated
   in a way platforms aren't.
2. **如何获取 column** — [购] (JD/Dangdang/Douban) vs [免] (free online)
   vs [免App] (free app), because book access is purchase-gated.
3. **教师agent用法** — concrete teaching steps, since these catalogs feed
   an education agent that needs to know HOW to use each book, not just
   that it exists.
4. **验证 footer** — per-source liveness method, because free digital
   libraries move/die (gushiwen.org→guwendao.net is the canonical example).
5. **Pitfall callouts** — e.g. "原版格林/安徒生含黑暗情节，5.5岁务必选
   改编绘本版" is a safety note unique to book catalogs.

## Technique 4: DNS-poisoning detection (2026-08 environment note)

In some network environments, `wikipedia.org` (en/zh) is **DNS-poisoned**:
`nslookup en.wikipedia.org` resolves to a Facebook/Meta IP range
(`31.13.x.x`), and curl returns a Meta "Sorry, something went wrong" error
page (1542 bytes, HTTP 200 from the WRONG server) — not a Wikipedia page.

**Detection rule**: Before concluding "Wikipedia has no article on X" or
"Wikipedia is down", run `nslookup <domain>`. If the IP is in `31.13.x.x`
/ `157.240.x.x` (Facebook/Meta range), the DNS is poisoned. The site
itself is fine — this is environment-specific. Switch to DoH, a VPN, or
rely on the Chinese domestic libraries (古文岛/ctext/识典古籍) which are
directly reachable.

**Do NOT record "Wikipedia unavailable" as a durable rule** — it is
environment-specific and will bite you when the environment changes. The
durable lesson is the DETECTION technique (nslookup → check IP range),
not the blockage.

## Technique 5: Search-engine status (2026-08, this environment)

The cross-profile `web-research-fetching` skill carries a 2026-07 table
marking 360 Search as "✅ Works." A 2026-08 re-test contradicted this —
360 Search (`so.com`) triggered a CAPTCHA ("请输入验证码") on a single
query from a fresh IP. Treat all Chinese search engines as unreliable
for batch work:

| Engine | 2026-08 status |
|--------|----------------|
| 360 Search (so.com) | ⚠️ Captcha on first query — use browser_navigate for ad-hoc only |
| Baidu Baike | ⚠️ "百度安全验证" page for curl — browser-only |
| Sogou WeChat (weixin.sogou.com) | ✅ Works for WeChat article discovery |
| DuckDuckGo / Google / Bing | ❌ Blocked (captcha/challenge) |

**For book research without a search engine**: rely on publisher sitemaps,
known-URL construction (Gutenberg ebook IDs, ctext canonical paths), the
verified known-list above, and Douban/JD via browser for book metadata.
Do NOT waste tool calls on captcha'd search engines.

## Pitfalls

### Do NOT treat guoxue.com / gu.zdic.net as separate from 识典古籍
All three return the identical 识典古籍 page (38043 bytes, verified
2026-08-01). They have merged into one ecosystem. Listing them as three
independent sources inflates the catalog and confuses verification.

### Do NOT trust JD/Dangdang/Douban curl HTML for product lists
Their search pages return the chrome with "正在搜索..." — product results
load via JS. Use browser_navigate, or look up a known ISBN/douban subject
ID. Parsing curl HTML yields zero book titles.

### Do NOT read original Grimm/Andersen to a young child
Original editions contain dark/violent episodes (cruel stepmothers, death,
mutilation). For under-7, always recommend the 改编绘本版 / 注音版. This is
a safety note that belongs in any children's-book catalog.

### Do NOT claim a classics site is dead when curl returns captcha/403
ctext.org serves real content for major texts (论语 analects/xue-er/zhs,
三字经 three-character-classic/zhs) but triggers a captcha on some
less-traveled paths. A captcha response means "use browser" or "try the
canonical path", not "site is down."

## Related Skills & Overlap

- **chinese-resource-catalog-research** (lives in [已移除]-* sibling profiles) —
  the sibling skill for Chinese PLATFORM catalogs (video courses, MOOCs).
  This skill is the BOOK/classics complement. The two should eventually
  merge under one umbrella; they're separate here only because the sibling
  is cross-profile-read-only from orchestrator. **The foreground curator
  should fold this skill's `references/verified-resources-2026-08.md` into
  `chinese-resource-catalog-research/references/` and delete this skill.**
- **web-research-fetching** (lives in [已移除]-* sibling profiles) — its
  search-engine status table is STALE (marks 360 Search "✅ Works",
  contradicted 2026-08). The foreground curator should patch that table
  with Technique 5's data above. I could not patch it from here because
  `skill_manage` does not cross profiles.
- **web-search-antibot-research** — Bing RSS fallback for English search.
- **deep-research-workflow** — multi-source research orchestration.
