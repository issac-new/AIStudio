---
name: chinese-web-research
description: Use 360搜索 via browser when researching Chinese web sources.
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [research, chinese, web-search, 360, anti-bot, gov.cn]
    related_skills:
      - web-search-antibot-research
      - web-research-fetching
      - resource-catalog-verification
---

# Chinese-Language Web Research

Proven path for researching Chinese-language resources (special education,
health, policy documents, orgs, institutions) when the standard search
routes fail. Validated 2026-08 on a 50+ URL special-education catalog where
Bing RSS, Baidu, and Sogou all failed and 360搜索 + direct verification
succeeded.

## When to Use

- Task = "research Chinese resources" / 调研中文资源 on any domain (教育,
  医疗, 政策, 机构)
- Bing/DDG returns irrelevant results for a Chinese query (almost certainly
  tokenization, not a bad query)
- Baidu/Sogou hit CAPTCHA
- Need to verify a named Chinese org/hospital/policy doc exists (not search —
  verify known candidate URLs directly)

## Search Engine Status for Chinese Queries (verified 2026-08)

| Engine | Status | Failure signature / note |
|--------|--------|--------------------------|
| **Bing RSS** (`bing.com/search?format=rss&setmkt=zh-CN`) | ❌ broken for Chinese | Tokenizes compound terms: 孤独症 → 孤独 (loneliness), 星星雨 → 星星 (stars). Returns unrelated Baidu-Baike/star-symbol pages. Quoted phrases DO NOT fix it. English queries with setmkt=en-US still fine |
| **Baidu** (`baidu.com/s`) | ❌ CAPTCHA | `wappass.baidu.com/static/captcha/tuxing_v2.html` — slider challenge ("拖动左侧滑块使图片为正") for scripted AND browser clients |
| **Sogou** (`sogou.com/web`) | ❌ CAPTCHA | `antispider` character-click challenge ("请依次点击【录,陀,艾,烤】") |
| **360搜索** (`so.com`) | ✅ WORKS | Only reliable Chinese search from this network. curl gets a JS shell, but the browser renders organic results (see workflow below) |
| **B站** (`search.bilibili.com`) | ✅ browser / ❌ API | Browser search page renders results in the accessibility snapshot; JSON API (`api.bilibili.com/x/web-interface/search/type`) returns anti-bot HTML |
| **Zhihu** | ❌ bots | 403 to curl/urllib with any UA; needs logged-in browser session |

**Pivot rule**: first Bing-RSS attempt that returns obviously-wrong results
for a Chinese query → do NOT rephrase, do NOT retry — switch to 360搜索 in
the browser immediately. Chinese tokenization failure is not fixable by
query rewording.

## 360搜索 Browser Workflow (the working path)

1. `browser_navigate("https://www.so.com/s?q=<urlencoded query>")` — results
   render in the accessibility snapshot.
2. Organic result links are wrapped: `https://www.so.com/link?m=<token>`.
   Ad links use `e.so.com/search/eclk?p=...` — filter those out.
3. Extract organic links with `browser_console` JS:
   ```js
   Array.from(document.querySelectorAll('a')).filter(a => {
     const h = a.href || '';
     return h.startsWith('http') && !h.includes('so.com/search/eclk') && !h.includes('360tres') && !h.includes('360.cn');
   }).map(a => ({href: a.href.substring(0,120), text: (a.textContent||'').trim().substring(0,80)}));
   ```
4. **Resolve so.com/link wrappers**: `browser_navigate` to a wrapped link —
   the browser follows it and the real URL appears in the final URL bar.
   This is how hidden real URLs (e.g. gov.cn policy documents) are found.
5. `browser_console` snippets run in-page are the cheap way to harvest many
   links from one result page without clicking each.

## Verify-don't-Search for Known Chinese Orgs

For named orgs/hospitals/platforms, batch-verify candidate URLs directly
instead of searching. urllib sweep with title extraction:

```python
import urllib.request, re, ssl
ctx = ssl.create_default_context(); ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE
def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0",
        "Accept-Language": "zh-CN,zh;q=0.9", "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"})
    resp = urllib.request.urlopen(req, timeout=15, context=ctx)
    data = resp.read(3000)
    m = re.search(rb"<title[^>]*>(.*?)</title>", data, re.DOTALL | re.IGNORECASE)
    return resp.status, resp.geturl(), m.group(1).decode("utf-8", "replace")[:70] if m else ""
```

- `Accept-Language: zh-CN` matters — many Chinese sites serve different
  content/locale without it.
- **title regex** (`<title>`) is the fastest ground-truth check: a 200 with a
  sensible Chinese title = confirmed alive; a 200 with "for sale"/domain-
  parking title = dead.
- Some Chinese org sites **reset connections to non-CN IPs**
  (`ConnectionResetError` via urllib AND browser `ERR_CONNECTION_RESET`,
  e.g. autismchina.org) — that is a geo/anti-bot block, NOT proof the org is
  defunct. Check the org's WeChat presence (公众号) before declaring dead.
- Track three statuses: ✅ 200+sensible title / ⚠️ blocked-but-real (403,
  reset, CAPTCHA) / ❌ dead (DNS failure, parking page). Never mark blocked
  as dead.

## gov.cn Policy Discovery

- gov.cn URLs are **not guessable** — `content_XXXX.htm` IDs are opaque;
  blind patterns 404.
- Find real URLs via 360搜索: search `"<document title>" site:gov.cn` (or
  with `国务院部门文件`), then **resolve the so.com/link wrapper** to reveal
  the `https://www.gov.cn/zhengce/zhengceku/...` URL.
- `sousuo.www.gov.cn` site-search is JS-driven; its JSON API returns
  `{"code":1001,"msg":"抱歉，没有找到相关结果"}` for keyword searches that
  do have hits — don't trust it.
- Full-text policy pages (`gov.cn/zhengce/...`) DO fetch fine via urllib
  once you have the real URL. Strip to text with the standard
  script/style/tag regex for the document body.
- CDPF (中国残联) policy files live at
  `cdpf.org.cn/zwgk/zcwj/...` and are curl-friendly; its homepage reveals
  sub-channels (康复, 教育就业) via link extraction.

## Chinese Medical/Educational Domain Notes

- **Assessment-tool authority**: the official 0-6岁 screening protocol
  (国卫办妇幼发〔2022〕12号) names the standard tools — M-CHAT, ABC,
  儿心量表-II, CARS — and their cutoffs. Quote the document, not third-party
  pages. See `references/chinese-special-ed-resources.md` for the verified
  catalog (policy docs, hospitals, intervention orgs, parent support).
- **量表/评估 documents**: many are on wenku.baidu.com / doc88 (login-walled)
  — treat as secondary; prefer gov.cn / hospital primary sources.
- **Hospital sites**: zssy.com.cn (中山三院) and pkuh6.cn (北医六院) fetch
  fine; dept pages are often behind JS nav — grab links from the homepage
  HTML with the `<a href>` regex, then fetch dept pages directly.

## Pitfalls

- **Do NOT rephrase Chinese queries on Bing RSS** — tokenization is the bug,
  not the query. Switch engines.
- **Do NOT try Baidu/Sogou repeatedly** — both CAPTCHA on first hit.
- **Do NOT cite Baidu Baike titles as evidence of liveness** — Bing RSS
  surfaces Baike entries even when they're irrelevant matches; verify the
  actual URL.
- **so.com/link wrappers expire** — a stale wrapper shows "对不起，您所访问
  的页面不存在". Re-search rather than re-click old links.
- **B站 API ≠ B站 browser search**: API calls return `<!DOCTYPE HTML`
  anti-bot pages; the browser search page works. Use
  `search.bilibili.com/all?keyword=<kw>` and read the snapshot.
- **Baidu Baike & zh.wikipedia handshake timeouts** from non-CN IPs — if the
  handshake hangs, don't block on it; use 360百科 or so.com results instead.
- **Never fabricate catalog facts** for sites that couldn't be opened:
  "⚠️ blocked from this network — user spot-check needed" is a valid
  catalog status (see resource-catalog-verification).

## Related Skills

- **web-search-antibot-research** (other profile) — English-language Bing RSS
  fallback; this skill is the Chinese-language complement.
- **web-research-fetching** (other profile) — browser/curl fetch patterns,
  Wikipedia REST extraction.
- **resource-catalog-verification** (other profile) — the verify-at-scale
  bulk sweep this skill's org-verification section extends.
- **real-browser-antibot-bypass** — computer_use host-browser CAPTCHA bypass
  for WeChat full-text when bot walls persist.
