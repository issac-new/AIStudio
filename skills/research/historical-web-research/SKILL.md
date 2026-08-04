---
name: historical-web-research
description: Use when researching a company's past via Wayback CDX.
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [research, wayback, cdx, chinese-web, corporate-site, recruitment, moka]
    related_skills:
      - web-research-fetching
      - web-search-antibot-research
      - osint-asset-mapping
---

# Historical Web Research (Wayback + CJK corporate sites)

Proven workflow for reconstructing a company's web history and mining structured
content (news, product pages, job postings) — captured while researching 行芯科技/
Phlexing (2026-07): full 2018→2026 company timeline recovered from the archive,
15+ JDs extracted, 76 news articles indexed.

## When to Use

- Task asks "what did X look like / say in the past" (company history, removed pages,
  product evolution, old team pages)
- Chinese corporate site research where the live site is thin and search engines
  return irrelevant results
- Mining recruitment JDs (tech stack inference) from corporate sites or Moka portals
- An older report claims "Wayback was down" — retry first, never trust stale negatives

## Step 1: CDX index (works via curl/urllib, fast)

```bash
curl -s "https://web.archive.org/cdx/search/cdx?url=example.com&matchType=domain&output=json&limit=2000&filter=statuscode:200&collapse=urlkey"
```

- `matchType=domain` catches all subdomains; `filter=statuscode:200` drops redirects
  (a 302 farm of `.well-known/*` junk can dominate otherwise); `collapse=urlkey`
  dedupes to newest capture per URL.
- **Empty array for a subdomain = genuinely zero captures** (verified: gitlab and
  hzsgd subdomains of phlexing.com → `[]`). Report as a confirmed gap, not a failure.
- The CDX rows give you the snapshot timestamp to fetch each URL with.

## Step 2: Fetch snapshots with `id_` (original HTML, no toolbar)

`https://web.archive.org/web/{timestamp}id_/{url}` — the `id_` flag returns the
raw archived page. Without it you get wayback chrome + rewritten links.

- **Rate limiting is real**: parallel curl (`xargs -P 6`) succeeds for ~30 files,
  then starts failing with empty/absent output files. Reliable pattern: sequential
  Python (urllib), 2 retries/URL, 0.3–1s sleep, try newest→older timestamps per URL;
  treat `len(d) < 5000` as a wayback 404 page. Budget ~4s/file → chunk fetches to
  stay under execute_code's 5-min cap, or run as a background script with flush=True.
- **Paginated lists trick**: php sites with `?page=N` often got one snapshot per
  page, taken on different dates. Collecting several different-date snapshots of the
  same list URL recovers the full item set even if each capture shows only ~6 items.
- Save RAW html/ files first; extract text to a separate txt/ dir afterwards.

## Step 3: Extract Chinese corporate news articles (date-anchor)

News pages like `news_desc.html?id=N` store the body in `<p>`/`<span>` divs; naive
tag-stripping leaves mostly nav boilerplate, and `<title>` is `Title|CompanyName`.

```python
t = re.sub(r'<(script|style).*?</\1>', ' ', raw, flags=re.S|re.I)
m = re.search(r'(\d{4}-\d{2}-\d{2})</span>', t)   # date block right after the title
start = m.end(); endm = t.find("精彩推荐")           # "recommended articles" = body end
seg = re.sub(r'<br\s*/?>|\n</p>', '\n', t[start:endm])  # then strip tags
```

- Article title: `re.search(r'([^<>]{6,80}?)\s*(?:公司动态|媒体报道)\s*(\d{4}-\d{2}-\d{2})', t)`.
- **Pitfall — never re-extract over the same output file with a different algorithm.**
  Doing so clobbered a good first pass (`[IMG]` overwrote real titles). Use distinct
  output names per pass (`_full.txt`) or re-derive from saved raw HTML.
- News list pages (`news.html?pid=N`) contain the title index per page — cheap way
  to build the article map before fetching full texts.

## Step 4: Moka ATS recruitment portals (app.mokahr.com)

Chinese companies route job postings through Moka: `https://app.mokahr.com/{social|campus}-recruitment/{company-slug}/{id}`.
It's a JS SPA — curl returns nothing, but browser_navigate works and the accessibility
snapshot contains FULL JD text (岗位职责/任职要求) inline, no extra clicks per job.
The `#/jobs` list page shows all open roles with inline JD excerpts; company官网
footers link the exact Moka URLs. Historical JDs live in wayback snapshots of the
company's own `recruit*.html` pages (social + campus sections).

## Step 5: When search engines fail — direct-source-first ladder

Bing RSS with `setmkt=zh-CN` can return garbage for CJK queries (single-character
tokenization: 行芯 → dictionary entries for 行; English queries → unrelated spam).
Don't burn calls retrying. Go: official site sitemap/news list → wayback CDX →
ATS portals (Moka) → industry press cited inside the company's own 媒体报道 page
(the company curates its best press — mine those article IDs).

## Worked example (Phlexing, 2026-07)

Full recipe + numbers in `references/wayback-cdx-recipes.md` — including the
homepage timeline capture set, the 76-article news index, and the JD id ranges.

## Pitfalls

- Do NOT trust an old report's "Wayback unavailable" claim — re-run the CDX query.
- Do NOT conclude "subdomain never existed" — CDX `[]` only means no captures;
  the site may have existed unarchived (cross-check DNS/other sources).
- Do NOT fetch hundreds of snapshots in parallel — sequential + retries wins.
- Do NOT overwrite extracted text files between passes — keep raw HTML.
