---
name: chinese-web-platform-research
description: Verify Chinese web platforms; build verified site catalogs.
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [research, chinese-web, url-probing, catalog, anti-bot]
    related_skills:
      - web-search-antibot-research
      - web-research-fetching
      - deep-research-workflow
---

# Chinese Web Platform Research

Techniques for researching Chinese-language websites (教案/教辅 platforms,
vendor sites, news portals, gov/教研 sites) and producing a verified
platform catalog. Captured during the Chinese [已移除] lesson-plan platform
survey (2026-08-01), where 60+ candidate URLs were probed and ~30 were
verified as live with structure details.

## When to Use

- Task asks to research/catalog Chinese-language platforms (教育平台,
  vendor sites, news, 教研网) and verify which are alive
- Need to confirm URL availability, free/paid status, subject coverage,
  and per-site quirks before dispatching team members
- Deliverable is a markdown catalog with verification status per entry

## Core Technique: Parallel Batch URL Probing

Do NOT browse candidate sites one at a time. Probe 20-60 URLs in parallel
with a desktop-Chrome UA + zh-CN Accept-Language, extract `<title>`, and
classify by response length. This yields a verified status table in ~10
seconds and shows which sites need browser escalation.

```python
import urllib.request, re, json, concurrent.futures

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
}

def probe(url, name):
    try:
        req = urllib.request.Request(url, headers=HEADERS, method='GET')
        with urllib.request.urlopen(req, timeout=8) as r:
            content = r.read(20000)
            try: txt = content.decode('utf-8', errors='replace')
            except: txt = content.decode('gb18030', errors='replace')
            m = re.search(r'<title[^>]*>(.*?)</title>', txt, re.I | re.DOTALL)
            return {'name': name, 'url': url, 'status': r.status,
                    'title': m.group(1).strip()[:80] if m else '?', 'len': len(txt)}
    except Exception as e:
        return {'name': name, 'url': url, 'status': -1, 'error': str(e)[:120]}

with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
    for r in ex.map(probe, urls, names):
        print(json.dumps(r, ensure_ascii=False))
```

### Classification heuristics (verified 2026-08)

| Result | Meaning | Action |
|---|---|---|
| `len > 500`, real title | Live, serving content | Record title + note |
| `len ~77-84`, title `?` | Anti-bot/WAF stub or JS shell | Escalate to `browser_navigate` |
| `status -1` SSL/EOF error | Scheme mismatch or weak cert | Retry the `http://` variant |
| DNS failure (nodename) | Dead domain | Add to dead-site list |
| 403 / "Please verify" | WAF-blocked | Try browser; else dead-list |
| Title is mojibake (`������`) | Wrong decode path | Fall back to `gb18030` |

### The http-vs-https split — ALWAYS probe both variants

Many Chinese sites serve on ONLY one scheme:
- `yejs.com.cn` (幼儿教师网): https fails with connection-reset, http works
- `math100.com`: https fails (weak cert), http serves a parked page
- Old portal sites (ASP/GBK era) often dropped https or have broken certs

Build both `https://www.X` and `http://www.X` into the probe list from
the start — it costs one extra parallel call and avoids a full retry
round.

### Keep a dead-site list in the catalog

Sites that fail curl AND browser (DNS dead, parked domain, WAF 403)
should be written into the catalog's "已失效/不可达" section. Future
sessions and team members skip re-probing them. Verify-before-delete:
check a domain twice (curl + browser) before declaring it dead.

## Search Pitfall: Bing HTML + Chinese Queries = Dictionary Noise

`www.bing.com/search` HTML is sometimes parseable via curl (`<li
class="b_algo">` blocks) — try it once before assuming blocked. BUT for
Chinese-language queries, Bing tokenizes the phrase into individual
characters and returns dictionary/baike noise (baike.baidu.com character
entries, zidian pages, hanzi-meaning sites) instead of the intended
results. Quoted phrases do NOT fix this.

**Do not iterate on Bing Chinese query phrasings** — each attempt is
equally useless. Instead:
1. Probe candidate URLs directly (the batch technique above) — guess
   domain patterns (`www.<name>.com` / `.cn` / `.com.cn`)
2. Use `site:` + a known domain to verify what a specific site hosts
3. Use browser_navigate to Baidu/so.com if a browser is available
4. For Chinese content discovery, check so.com (360) — it survives
   anti-bot better than Baidu/DuckDuckGo in this environment

## Extracting Structure From a Live Site

After probing, use browser_navigate on the 3-5 most important sites to
extract: navigation links (subjects/categories), pricing signals
(免费/会员/充值/VIP wording), content-format samples (open one article to
confirm full text is reachable), and publisher provenance. For education
sites, capture the category URL pattern (e.g. `21cnjy.com/2/` = 语文,
`/3/` = 数学) — these map directly to catalog entries.

## Catalog Deliverable Format

Organize the final catalog with, per platform:
URL(s) (all live variants), 内容类型, 学科与年级, 免费/付费 status, 质量
notes, 实测证据 (what was verified), 教师/Agent 用法, and age-specific
recommendations. Include a TL;DR priority table at top and a dead-site
table at bottom.

## Worked Example: Chinese [已移除] Lesson-Plan Platforms (verified 2026-08-01)

Survey for 5-7岁 (preschool/一年级) teaching. Statuses drift — re-verify.

### Top national platforms (FREE, official)
- 国家中小学智慧教育平台 https://basic.smartedu.cn — official MOE. 课程教学
  (课时课程包: video+教学设计+任务单+练习) 一年级~高三; 学前教育 channel
  (幼小衔接/保教实践); 教材 e-textbooks; 教师研修. Grade-1 语文统编版上册
  = 62 packs by 人教社 teachers.
- 人民教育出版社 https://www.pep.com.cn — official textbook publisher;
  e-textbooks free; 人教教学资源 (pep.com.cn/jxzy/).
- 学习强国 https://www.xuexi.cn — free; 教育频道, 诗词吟唱 (国学启蒙 source).
- 国图公开课 http://open.nlc.cn — National Library courses (绘本讲读).
- 教育部官网 https://www.moe.gov.cn — 新课标, 《3-6岁儿童学习与发展指南》.

### Major [已移除] networks (free+paid mix)
- 学科网 https://www.zxxk.com — largest [已移除] site; 教案/课件/试题/学案;
  AI备课工具; 免费专区 zxxk.com/activity/mianfei/; 组卷 zujuan.xkw.com.
- 21世纪教育网 https://www.21cnjy.com — 教案/课件/试卷/学案; 小学频道
  xiaoxue.21cnjy.com (语文 /2/, 数学 /3/, 英语 /4/, 科学 /5/, 音乐 /1006/,
  美术 /1008/, 体育 /1010/); 剑桥少儿英语 for 启蒙; beike.21cnjy.com 在线备课.
- 菁优网 https://www.jyeoo.com — 组卷/试卷分析/备课平台.
- 组卷网 https://www.zujuan.com — 在线组卷.
- 百度文库 wenku.baidu.com — huge 教案 pool; curl 403s; free preview only.
- 豆丁/道客巴巴/原创力/人人文库 docin.com, doc88.com, max.book118.com,
  renrendoc.com — preview free, download paid; docin.com/tag/教案 works.

### Preschool / 幼儿园 / 幼小衔接 (free full-text)
- 幼教网 https://www.youjiao.com — 幼儿园教案 by 班型×科目, 说课稿, 课件,
  幼升小 (政策/真题). 教案页 youjiao.com/kjja/jiaoan/.
- 中国儿童教育网 https://www.cnfirst.net — 教案分类最全 (大/中/小/托班 ×
  科目, 蒙氏数学, 节日主题, 说课评课, 观察记录). Full text with
  活动目标/准备/过程/反思.
- 幼儿教师网 http://www.yejs.com.cn — 幼教门户. NOTE: https fails, http works.
- 中国幼儿教育网 http://www.cn0-6.com — 儿歌/故事/教案.

### Subject-specific / supplementary
- 新世纪小学数学网 https://www.xsj21.com — 北师大版 math (教案/课件/试题).
- 古诗文网 https://www.gushiwen.cn — 唐诗宋词 full library (启蒙文本).
- 品诗文网 https://www.pinshiwen.com — 唐诗宋词鉴赏.
- 第一PPT https://www.1ppt.com — 课件 PPT templates (curl stub, browser works).
- 优文网 https://www.unjs.com/jiaoan/ — 教案大全/模板 (含小班安全教案).
- 教研网 https://www.zgjiaoyan.com — 教研资讯/课改动态.
- 智学网 https://www.zhixue.com — 科大讯飞考试测评 (教师组卷/学情).
- 电子课本导航 http://www.dzkbw.com — 各版电子课本导航.

### Dead / unreachable (verified 2026-08-01, do NOT re-probe)
猫骚语文网 maosaoyuwen.com (DNS dead) · 数学100 math100.com (parked) ·
大语文资源网 dayuwen8.com (DNS dead) · 5ykj.com (DNS dead) · 北京教研网
bjjy.net (DNS dead) · 第一课件网 xkb1.com (conn reset) · jy135.com (403 WAF)
· 06abc.com 闪亮儿童网 (conn reset) · qbaobei.com / baby-edu.com /
youjiaotoutiao.com (conn/DNS dead) · oh100.com 百分网 / fwsir.com 范文先生
(expired certs)

### Standard lesson-plan formats (for generation/validation)
- 小学一年级 ([已移除]) 8 sections: 教学目标(三维/核心素养) → 教学重点 → 教学难点
  → 教学准备 → 教学过程(导入/新授/巩固/小结/拓展, 5 min 导入) → 板书设计 →
  作业布置(分层) → 教学反思
- 幼儿园大班 (5-6岁) 7 sections (verified from cnfirst.net full text):
  活动名称 → 设计意图 → 活动目标(3-5条) → 活动重难点 → 活动准备(经验+物质)
  → 活动过程(导入/展开/结束, 师幼互动+提问设计) → 活动延伸+反思
- 说课稿 8 sections: 说教材 → 说学情 → 说目标 → 说重难点 → 说教法学法 →
  说教学过程 → 说板书 → 说反思

## Pitfalls

- **Don't trust a single probe result.** Chinese sites are flaky —
  SSL handshake timeouts, connection resets, and 403s can be transient.
  Retry once via the other scheme before declaring dead.
- **Don't spend turns on Bing Chinese searches** — see the CJK pitfall
  above; direct probing wins.
- **Baidu Wenku / docin / doc88 return 403 to curl** — they're
  user-upload document platforms; use browser for search there, and
  expect paywalls (free preview only).
- **Provincial 教研网 domains are unstable** — most independent
  provincial teaching-research sites (bjjy.net etc.) are dead or
  parked; route users to national platforms or city gov education
  bureaus instead.
- **Record verification date + method** in the catalog (e.g. "2026-08-01,
  HTTP 200"). Site status changes; dating entries lets future sessions
  know how stale a verification is.

## Related Skills

- **web-search-antibot-research** (default profile) — Bing RSS fallback,
  blocked-endpoint catalog; complements this skill's direct-probe approach
- **web-research-fetching** (default profile) — SPA/browser escalation,
  sitemap crawling; the browser step of this workflow
- **resource-catalog-verification** — the general (non-Chinese) version of
  this catalog-verification technique; if both are loaded, cross-reference
  the taxonomy tables
- **deep-research-workflow** (default profile) — multi-source research
  orchestration this feeds into
