#!/usr/bin/env python3
"""Bing 搜索补充今日 AI/科技新闻 — 当搜狗被封时的备用通道

用 site: 搜索定向抓取 mp.weixin.qq.com + 科技媒体站点，
补充到 articles_{TODAY}.json 的 "Bing补充" 条目。
重跑幂等：每次先移除旧的 Bing补充 条目再追加新结果。
"""
import json, os, re, urllib.request, urllib.parse
import html as htmlmod
from datetime import datetime

TODAY = datetime.now().strftime("%Y-%m-%d")
WECHAT_DIR = "/Users/YOURNAME/hermes-docker-sandbox/workspace/life-workbench/wechat_daily"
EXISTING = os.path.join(WECHAT_DIR, f"articles_{TODAY}.json")

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

# 用 site: 定向搜索，比泛搜命中率更高
QUERIES = [
    "site:mp.weixin.qq.com AI 大模型 2026年8月",
    "site:mp.weixin.qq.com DeepSeek 最新",
    "site:mp.weixin.qq.com Agent 智能体",
    "site:36kr.com AI 2026",
    "site:ithome.com AI 大模型",
    "site:cnbeta.com AI 大模型",
]

# 来源域名 → 中文标签映射
DOMAIN_TAGS = [
    ("mp.weixin.qq.com", "微信公众号"),
    ("36kr.com", "36氪"),
    ("ithome.com", "IT之家"),
    ("cnbeta.com", "cnBeta"),
    ("zhihu.com", "知乎"),
    ("csdn.net", "CSDN"),
    ("infoq.cn", "InfoQ"),
    ("juejin.cn", "掘金"),
    ("cnblogs.com", "博客园"),
    ("bilibili.com", "哔哩哔哩"),
]

# 排除域名（Bing 官方页、微软等无价值结果）
EXCLUDE_DOMAINS = ["bing.com", "microsoft.com", "go.microsoft"]


def get_source_tag(url):
    for domain, tag in DOMAIN_TAGS:
        if domain in url:
            return tag
    return "科技媒体"


def bing_search_articles(query, max_results=8):
    url = f"https://www.bing.com/search?q={urllib.parse.quote(query)}"
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "zh-CN,zh;q=0.9"})
    try:
        resp = urllib.request.urlopen(req, timeout=15)
        raw = resp.read().decode("utf-8", errors="replace")
        articles = []
        # Bing 搜索结果链接 — h2 可能有 class 属性
        for m in re.finditer(r'<h2[^>]*><a[^>]*href="(https?://[^"]+)"[^>]*>(.*?)</a>', raw, re.S):
            link = htmlmod.unescape(m.group(1))
            title = htmlmod.unescape(re.sub(r"<[^>]+>", "", m.group(2))).strip()
            if not title:
                continue
            if any(d in link for d in EXCLUDE_DOMAINS):
                continue
            articles.append({"title": title, "url": link, "account": get_source_tag(link)})
            if len(articles) >= max_results:
                break
        return articles
    except Exception as e:
        print(f"  Bing error: {e}", flush=True)
        return []


def main():
    # 加载已有
    existing = []
    if os.path.exists(EXISTING):
        existing = json.load(open(EXISTING))

    # 先移除旧的 Bing补充 条目（重跑幂等）
    existing = [a for a in existing if a.get("account") != "Bing补充"]

    seen_urls = set()
    for acc in existing:
        for a in acc.get("articles", []):
            seen_urls.add(a.get("url", ""))

    new_articles = []
    for q in QUERIES:
        print(f"搜索: {q}...", flush=True)
        arts = bing_search_articles(q)
        added = 0
        for a in arts:
            if a["url"] not in seen_urls:
                seen_urls.add(a["url"])
                new_articles.append(a)
                added += 1
        print(f"  新增 {added} 篇", flush=True)

    if new_articles:
        existing.append({"account": "Bing补充", "articles": new_articles, "error": None})
    json.dump(existing, open(EXISTING, "w"), ensure_ascii=False, indent=2)
    print(f"\n总计补充 {len(new_articles)} 篇新文章")
    print(f"已更新: {EXISTING}")


if __name__ == "__main__":
    main()
