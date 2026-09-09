---
name: osint-asset-mapping
description: "Map a Chinese company's full public-asset footprint across all open channels: business registration, domain/DNS/ICP filing, bidding & procurement records, WeChat Official Account + articles, email systems, IP geolocation, patents/trademarks, and financing history. Use when the user asks to 测绘/排查/调研 a company's assets, do due diligence, or collect public intel on a Chinese entity. Covers the search-engine fallback ladder (which engines survive anti-bot), DNS/email reconnaissance, bidding-site scraping, and the structured 7-layer report format."
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [osint, reconnaissance, chinese-companies, dns, bidding, wechat, due-diligence]
    related_skills:
      - deep-research-workflow
      - wechat-article-research
      - wechat-article-search
      - scope-discipline
---

# OSINT Asset Mapping (Chinese Companies)

Map a company's complete public-facing footprint from open channels only. **Every data point must be backed by a real tool call** — never fabricate registration numbers, IP addresses, or bidding records. If a source is blocked, say so and move on.

## When to use

- User asks to 测绘 / 排查 / 调研 a company's assets (e.g. "对行芯科技所有资产进行测绘")
- Due diligence: "collect everything public about company X"
- Competitive intelligence: bidding records, financing rounds, product lines, team size
- Pre-engagement reconnaissance: domains, subdomains, email infrastructure, web tech stack

## The 7-layer asset map

Produce a report with these sections (skip a layer only if genuinely no public data exists after real search):

1. **Business entity** — full name, 法定代表人, 统一社会信用代码, 注册资本, 成立日期, 经营范围, 分支机构/子公司
2. **Domain & network assets** — ICP备案, 公网安备, NS/MX/TXT/A records, subdomains, web server tech stack
3. **Email infrastructure** — MX records, SPF → email provider identification, mail server IPs + geolocation
4. **Contact channels** — phone, emails, recruitment platform links (Moka, 拉勾, Boss)
5. **Bidding & procurement** — 中标 records (as winner), 招标 records (as buyer), project numbers, scores
6. **WeChat Official Account** — account name + ID, recent article titles, third-party accounts that repost
7. **IP & financing** — patents (国家知识产权局), trademarks (阿里云商标), financing rounds + investors

## Search-engine fallback ladder (critical, verified 2026-07)

Chinese search engines aggressively block automated queries. This is the verified working ladder:

| Engine | Status | Best for | Parsing pattern |
|--------|--------|----------|-----------------|
| **360 Search (so.com)** | ✅ Most reliable | Bidding records, company info, news | `<li class="res-list">` → `<a>` title + `<p>` summary |
| **Sogou (sogou.com)** | ⚠️ First 1-2 queries work, then blocks | Initial discovery, news | `data-url` attr = real target URL; `<h3>` = title |
| **Sogou WeChat (weixin.sogou.com)** | ✅ Works | WeChat articles + account discovery | `type=2` (articles) finds content; `type=1` (accounts) often returns "暂无" |
| **DuckDuckGo (html endpoint)** | ⚠️ First 1-2 queries only | Western company / English results | `class="result__a"` + `uddg=` URL param |
| **Google** | ❌ CAPTCHA | — | Blocked; do not rely on |
| **Bing** | ❌ CAPTCHA ("solve challenge") | — | Blocked |
| **Baidu** | ❌ 安全验证 page (~1488 bytes) | — | Blocked |
| **searx instances** | ❌ 429 / HTML-only | — | Do not use |

**Strategy**: Start with 360 Search for everything. Use Sogou for first-pass discovery. Use Sogou WeChat for WeChat content. If an engine returns <6KB or a title like "安全验证" / "百度安全验证" / bare "DuckDuckGo", you are blocked — **switch engines, do not retry the same one**.

### 360 Search parsing

```python
import re
# curl -sL --compressed "https://www.so.com/s?q=<query>"
items = re.findall(r'<li class="res-list[^"]*"[^>]*>(.*?)</li>', body, re.S)
for item in items:
    t = re.search(r'<a[^>]*>(.*?)</a>', item, re.S)
    p = re.search(r'<p[^>]*>(.*?)</p>', item, re.S)
    if t:
        title = re.sub(r'<[^>]+>', '', t.group(1)).strip()
        summary = re.sub(r'<[^>]+>', '', p.group(1)).strip()[:200] if p else ""
        # summary often contains the date + key facts
```

### Sogou WeChat parsing

```
https://weixin.sogou.com/weixin?type=2&query=<keyword>&ie=utf8
# type=2 = articles, type=1 = accounts
```
Article results show `来源:<公众号名>(ID:<wechat_id>)` in the摘要 — this is how you discover the official account ID even when `type=1` account search returns empty.

## DNS & email reconnaissance

```bash
# Full DNS records
dig +short NS domain.com @8.8.8.8
dig +short MX domain.com @8.8.8.8
dig +short TXT domain.com @8.8.8.8   # SPF → email provider
dig +short SOA domain.com @8.8.8.8

# Subdomain enumeration (brute common names)
for s in www mail oa api git dev ci vpn admin portal cdn app m en; do
  ip=$(dig +short A $s.domain.com @8.8.8.8 | head -1)
  [ -n "$ip" ] && echo "$s.domain.com -> $ip"
done

# IP geolocation
curl -sL "http://ip-api.com/json/<IP>?lang=zh-CN"
```

**SPF → email provider mapping** (read from `v=spf1 include:...`):
- `include:_s.corp-email.com` → 263企业邮箱 (or similar corp-email provider)
- `include:spf.163.com` → 网易企业邮箱
- `include:mail.zoho.com` → Zoho
- `include:_spf.google.com` → Google Workspace
- `include:qiye.aliyun.com` → 阿里云企业邮箱

**NS → registrar hint**: `dns*.hichina.com` = 阿里云万网; `dns*.dnspod.net` = DNSPod/腾讯云.

## Bidding-site scraping

| Site | curl works? | Notes |
|------|------------|-------|
| **ebnew.com (必联网)** | ✅ Full content | Detail pages return complete 中标公示 text; amounts shown as `****` (login required) |
| **ccgp.gov.cn (中国政府采购网)** | ✅ Full content | Official gov source; direct URL from search results |
| **chinabidding.cn** | ❌ JS-rendered | Use search-engine cache instead |
| **qianlima.com (千里马)** | ⚠️ gzip | Add `--compressed` flag |
| **bidcenter.com.cn** | ❌ 404 on search | Do not use |

**Strategy**: Use 360 Search with `site:ccgp.gov.cn <company>` and `site:chinabidding.cn <company>` queries — the search-engine cache carries the摘要 with project numbers, dates, and scores even when the original page is JS-rendered or requires login.

## Execution discipline

1. **Use `execute_code` for HTML parsing**, NOT `curl | python3` — the latter triggers security scan [HIGH] flags for "pipe to interpreter: Downloaded content will be executed without inspection". Fetch with `curl` to a temp file, then parse with `execute_code` reading the file.
2. **Batch independent DNS lookups** — run all subdomain `dig` queries in one `execute_code` call, not one terminal call per subdomain.
3. **Tag every data point with its source** — the report must show verification method per row (`官网底部` / `dig MX` / `ip-api.com` / `360搜索快照` / `必联网原文`).
4. **Report format**: structured Markdown tables per section, with a "测绘方法说明" footer listing tools used and anti-bot limitations encountered.

## Pitfalls

- **Do NOT claim "未找到" from session_search alone** when a direct source (URL, domain) was provided — inspect the original source first.
- **Company aliases**: Chinese companies often have a full name (杭州行芯科技有限公司), short name (行芯科技), English name (Phlexing), and brand name. Search all variants across engines.
- **Branch offices ≠ subsidiaries**: 分公司 (branch) has no independent legal status; 子公司 (subsidiary) does. Check 工商 info carefully — a "分公司" will share the parent's 统一社会信用代码.
- **Financing rounds can overlap**: "B轮" may be reported twice (announcement vs. 工商变更). Cross-reference with 注册资本 changes to date rounds accurately.
- **WeChat account ID ≠ account name**: The ID (e.g. PHLEXING) appears in article source attribution `来源:行芯科技(ID:PHLEXING)`, not in the account-search (`type=1`) which often returns empty.
- **GitHub usernames may collide**: `phlexing` on GitHub is an unrelated Ruby project (marcoroth/phlexing), not the Chinese [已移除] company. Always verify org/user ownership before attributing a GitHub repo to a company.
- **Baidu Baike requires JS** — `baike.baidu.com/item/<company>` returns "百度安全验证" under curl; use search-engine cache instead.

## Output report structure

```
# <Company> 公开资产测绘报告
> 测绘时间 | 数据来源 | 验证声明(每项数据可追溯)
## 一、主体工商信息 (table)
## 二、域名与网络资产 (DNS table + subdomain table + tech stack)
## 三、邮件系统 (MX table + provider analysis)
## 四、联系方式 (phone/email/recruitment table)
## 五、招投标公开记录 (as winner / as buyer tables)
## 六、产品线 (table)
## 七、微信公众号 (account + article list)
## 八、知识产权 (patents + trademarks tables)
## 九、荣誉与资质 (timeline table)
## 十、创始人/核心团队
## 十一、合作伙伴与客户
## 测绘方法说明 (tools used + anti-bot limitations + what could not be retrieved)
```

## Related skills

- **deep-research-workflow** — for multi-source academic/industry research with parallel subagents (broader, subagent-heavy)
- **wechat-article-research** — for extracting a single WeChat article's content (narrower)
- **wechat-article-search** — for searching WeChat articles by keyword
- **scope-discipline** — when user constrains to "只调研不开发"

## References

See `references/search-engine-ladder.md` for detailed per-engine parsing patterns, blocked-page signatures, and the fallback decision tree.
