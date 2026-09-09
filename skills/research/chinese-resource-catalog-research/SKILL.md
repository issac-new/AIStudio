---
name: chinese-resource-catalog-research
description: "Build URL-verified 资源目录 of Chinese web platforms and B站 UP主."
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [research, chinese, platform-catalog, url-verification, bilibili, [已移除]]
    related_skills:
      - web-research-fetching
      - deep-research-workflow
      - web-search-antibot-research
---

# Chinese Resource Catalog Research

Produce a structured, URL-verified resource catalog of Chinese web
platforms in a specific domain. Captured during the [已移除] video-course
platform research session (2026-08-01) that produced a 19-platform +
B站 UP主-table catalog with every URL verified via batch curl HEAD.

## When to Use

- User asks to research / enumerate Chinese web platforms in a domain
  (education, MOOC, video courses, government services, healthcare, etc.)
- User wants a "structured resource catalog" or "资源目录"
- User provides a domain ([已移除], healthcare, finance) and wants live URLs +
  coverage notes + applicability per platform
- User asks to enumerate B站 (Bilibili) video resources / UP主 for a
  specific topic (少儿启蒙, 编程教学, 数学启蒙, etc.)
- You need to verify which platforms are actually live (not just which
  domains resolve in DNS)

## Workflow

```
1. Batch curl HEAD all candidate URLs → liveness table
2. For live platforms: browser_navigate to extract content/structure
3. For B站 video resources: search per topic, extract Top N from snapshot
4. Compile catalog with the standard output structure (Technique 4)
5. Add age/applicability column if the catalog targets specific users
6. Add teacher/analyst team 分工表 if the catalog serves a team
```

## Technique 1: Batch curl HEAD URL Verification

When cataloging N platforms, verify each URL's liveness in ONE
`execute_code` call — not N browser_navigate calls.

```python
import subprocess

urls = [
    "https://basic.smartedu.cn",
    "https://www.icourse163.org",
    "https://zh.khanacademy.org",
    "https://open.nlc.cn",        # https → NO RESPONSE
    "http://open.nlc.cn",         # http → 403 (use browser)
    # ... 15-20 URLs
]

for url in urls:
    try:
        r = subprocess.run(
            ["curl", "-sIL", "--max-time", "12", "-A", "Mozilla/5.0", url],
            capture_output=True, text=True, timeout=15
        )
        lines = r.stdout.split("\n")
        status_lines = [l for l in lines if l.startswith("HTTP/")]
        final_status = status_lines[-1] if status_lines else "NO RESPONSE"
        loc_lines = [l for l in lines if l.lower().startswith("location:")]
        final_loc = loc_lines[-1].strip() if loc_lines else ""
        reachable = "200" in final_status or "301" in final_status or "302" in final_status
        print(f"{url:42s} | {final_status:25s} | {final_loc[:50]:50s} | reachable={reachable}")
    except Exception as e:
        print(f"{url:42s} | ERROR: {str(e)[:40]}")
```

**Decision rule after verification**:
- 200/301/302 → fetch content via curl (fast) or browser_navigate
- 403 or NO RESPONSE → use `browser_navigate` (renders JS + sends proper
  headers)
- Cloudflare challenge page (`"Client Challenge"` title) → browser only
- `http://` variant of an `https://` URL that returned NO RESPONSE
  often reveals a 403 or redirect — always test both schemes

## Technique 2: B站 (Bilibili) Search as Resource Discovery

B站 has enormous educational content but no official search API.
Use the web search endpoint and extract results from the browser
accessibility-tree snapshot.

### Search URL pattern

```
https://search.bilibili.com/all?keyword=<URL-encoded-keyword>&order=click
```

- `keyword`: URL-encoded Chinese keywords (e.g. `小学数学启蒙`)
- `order=click`: sort by play count (highest first). Alternatives:
  `pubdate` (newest), `dm` (most comments), `stow` (most收藏).

### Extracting results from the snapshot

After `browser_navigate` to the search URL, the snapshot contains
structured result entries. Each result has:
- Title + BV号 in the video link: `link "title... views comments duration"`
  with `/url: //www.bilibili.com/video/BVxxxxx/`
- UP主 name + space link in the author link:
  `link "UP主名 · date"` with `/url: //space.bilibili.com/UID`
- 播放量 (views), 弹幕数 (comments), 时长 (duration) as text nodes

**Age inference from title**: "幼儿"/"宝宝"/"早教" → 2-5岁;
"小学"/"一年级"/"拼音" → 5-7岁; "奥数"/"1-6年级" → 6-12岁.

### B站 search pitfalls

- **URL-encode the keyword**: Chinese characters must be percent-encoded.
- **Snapshot truncation**: Search results pages are dense (>15000 chars).
  Use `read_file` on the returned path to page through remaining results.
- **`order=click` may change**: If results look unsorted, try
  `order=totalrank` (综合排序, default).
- **stealth_warning**: `browser_navigate` may warn about bot detection.
  Keep searches to ≤10 per session to avoid CAPTCHA.
- **ERR_ABORTED on navigate**: Keyword encoding may be malformed.
  Re-encode using Python's `urllib.parse.quote(keyword)`.

## Technique 3: Chinese [已移除] / Education Platform Known List

Verified 2026-08-01. Use as a starting checklist — don't start from
scratch. Full table in `references/chinese-platform-catalog-research.md`.

**National official (all free, HTTP 200)**:
- 国家中小学智慧教育平台: basic.smartedu.cn (K1-12 全学科 + 学前 + 教师研修)
- 国家智慧教育总入口: www.smartedu.cn
- 国家中小学网络云课堂: www.eduyun.cn
- 学习强国: www.xuexi.cn

**MOOC**: 中国大学MOOC (icourse163.org), 学堂在线 (xuetangx.com),
网易公开课 (open.163.com), 可汗学院中文版 (zh.khanacademy.org),
国图公开课 (open.nlc.cn — use http:// prefix)

**Provincial**: Always check basic.smartedu.cn "地方频道" dropdown
before guessing provincial domains — provincial domains are unstable.

## Technique 4: Catalog Output Structure

```markdown
# <Domain> 中文平台与资源目录

> 任务背景 | 所有 URL 经 curl HEAD 实测或浏览器验证 (date)
> ⚠️ 适龄/适用提示

## 一、国家级官方平台（首选）
### N. 平台名 domain
- **URL**: https://...
- **性质**: 主办方, 免费/付费
- **覆盖**: 板块列表
- **目标用户用法**: 具体入口路径
- **教师用法**: 备课/教研价值
- **实测**: HTTP 200 ✓, 日活数据

## 二、MOOC 平台（同结构）

## 三、视频平台（B站分科 UP主表）
### <subject> 启蒙
| UP主 | space 链接 | 代表作(BV号) | 播放量 | 适用年龄 |
|---|---|---|---|---|

## 四、省市平台（表格: 省 | 域名 | 实测状态）

## 五、<目标人群>推荐使用方案
（每日/每周资源组合 + 教师团队分工表）

## 六、验证说明
### 实测可达 (HTTP 200/301/302)
### 需浏览器访问
### B站 BV号说明（均来自搜索结果页实际抓取）
```

**Key structural elements**:
1. **Verification note** at top — "所有 URL 经实测 (date)"
2. **Age/applicability column** for resources targeting specific users
3. **Real BV号 / space links** — never fabricate; always from actual
   search snapshots
4. **实测可达 vs 需浏览器** sections — distinguish curl-friendly from
   browser-only
5. **分工表** — if the catalog serves a team, map resources to roles

## Pitfalls

### Do NOT fabricate BV号 or space links

B站 BV号 must come from actual search-result-page snapshots. Never
construct plausible-looking `BVxxxxx` strings — they will not resolve.
If you haven't run the B站 search, you don't have the BV号.

### Do NOT claim a platform is dead when curl returns 403

A 403 means the server is up but blocks curl. Always note "需浏览器访问"
and verify via `browser_navigate` before declaring a platform unreachable.

### Do NOT skip the http:// variant

When `https://` returns NO RESPONSE (SSL/TLS failure), always test
`http://` before concluding the site is down. open.nlc.cn is the
canonical example: https fails, http returns 403 (browser works).

### Do NOT guess provincial domains

Provincial education domains (basic.gd.gov.cn, scedu.net, etc.) are
unstable and often return 403/no-response. Always use the national
umbrella site's "地方频道" dropdown as the entry point.

## Related Skills

- **web-research-fetching** — general web fetching techniques (JS-rendered
  sites, Wikipedia REST API, sitemap crawling) that complement this
  skill's URL verification and B站 extraction
- **deep-research-workflow** — multi-source research with parallel
  subagents and transcript mining
- **web-search-antibot-research** — search-engine fallback when DDG/Bing
  are blocked (Bing RSS technique for English-language search)

## Overlap Note

This skill overlaps with `web-research-fetching` (general web fetching)
and `deep-research-workflow` (multi-source research). The overlap is
intentional: those skills live in the default profile and are read-only
from sub-profiles; this skill captures the Chinese-platform-catalog-
specific techniques (batch URL verification, B站 search extraction,
known platform list, catalog structure) in a self-contained skill that
sub-profiles can patch and extend. The background curator can
consolidate them at scale.
