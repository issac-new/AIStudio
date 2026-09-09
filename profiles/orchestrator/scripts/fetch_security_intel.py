#!/usr/bin/env python3
"""网络安全 + 舆情情报抓取器

直接抓取安全门户首页文章（比搜索引擎命中率更高），补充到 articles_{TODAY}.json 的 "安全情报" 条目。
来源：FreeBuf、SecWiki、阿里云先知、嘶吼等

用法：python3 fetch_security_intel.py
输出：合并写入 wechat_daily/articles_{TODAY}.json
"""
import json, os, re, urllib.request, urllib.parse
import html as htmlmod
from datetime import datetime

TODAY = datetime.now().strftime("%Y-%m-%d")
WECHAT_DIR = "/Users/YOURNAME/hermes-docker-sandbox/workspace/life-workbench/wechat_daily"
EXISTING = os.path.join(WECHAT_DIR, f"articles_{TODAY}.json")

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

# 安全门户首页 — 直接抓最新文章列表
SECURITY_SOURCES = [
    {
        "name": "FreeBuf",
        "url": "https://www.freebuf.com/",
        "tag": "FreeBuf",
        # FreeBuf 文章链接模式：/articles/xxx/数字.html
        "link_pattern": r'href="(/articles/[^"]*?\d{4,}[^"]*?\.html)"[^>]*>(.*?)</a>',
    },
    {
        "name": "FreeBuf-AI安全",
        "url": "https://www.freebuf.com/articles/ai-security",
        "tag": "FreeBuf",
        "link_pattern": r'href="(/articles/[^"]*?\d{4,}[^"]*?\.html)"[^>]*>(.*?)</a>',
    },
    {
        "name": "SecWiki",
        "url": "https://www.sec-wiki.com/news",
        "tag": "SecWiki",
        "link_pattern": r'href="(/news/\d+)"[^>]*>(.*?)</a>',
    },
]

# Bing 补充搜索 — 安全+舆情关键词（不加日期，提高命中率）
BING_QUERIES = [
    "FreeBuf 网络安全 漏洞 2026",
    "AI安全 大模型 攻击防护 2026",
    "数据泄露 勒索软件 APT 2026",
    "深度伪造 deepfake 检测 安全",
    "AI 舆情监测 情报分析 2026",
    "zero-day vulnerability CVE 2026",
]

# 安全相关域名 → 标签
SECURITY_DOMAINS = [
    ("freebuf.com", "FreeBuf"),
    ("sec-wiki.com", "SecWiki"),
    ("secrss.com", "安全客"),
    ("anquanke.com", "安全客"),
    ("xz.aliyun.com", "先知"),
    ("huoxian.cn", "火线安全"),
    ("qianxin.com", "奇安信"),
    ("nsfocus.com", "绿盟"),
    ("knownsec.com", "知道创宇"),
]


def get_source_tag(url):
    for domain, tag in SECURITY_DOMAINS:
        if domain in url:
            return tag
    if "mp.weixin" in url:
        return "微信公众号"
    return "安全媒体"


def scrape_portal(portal):
    """直接抓取安全门户首页文章"""
    req = urllib.request.Request(portal["url"], headers={
        "User-Agent": UA, "Accept-Language": "zh-CN,zh;q=0.9"
    })
    try:
        resp = urllib.request.urlopen(req, timeout=15)
        raw = resp.read().decode("utf-8", errors="replace")
        articles = []
        seen = set()
        for m in re.finditer(portal["link_pattern"], raw, re.S):
            href = htmlmod.unescape(m.group(1))
            title = htmlmod.unescape(re.sub(r"<[^>]+>", "", m.group(2))).strip()
            if len(title) < 8 or href in seen:
                continue
            seen.add(href)
            full_url = urllib.parse.urljoin(portal["url"], href)
            articles.append({"title": title, "url": full_url, "account": portal["tag"]})
        return articles
    except Exception as e:
        print(f"  [{portal['name']}] 抓取失败: {e}", flush=True)
        return []


def bing_search_security(query, max_results=8):
    """Bing 搜索安全相关文章"""
    url = f"https://www.bing.com/search?q={urllib.parse.quote(query)}"
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "zh-CN,zh;q=0.9"})
    try:
        resp = urllib.request.urlopen(req, timeout=15)
        raw = resp.read().decode("utf-8", errors="replace")
        articles = []
        for m in re.finditer(r'<h2[^>]*><a[^>]*href="(https?://[^"]+)"[^>]*>(.*?)</a>', raw, re.S):
            link = htmlmod.unescape(m.group(1))
            title = htmlmod.unescape(re.sub(r"<[^>]+>", "", m.group(2))).strip()
            if not title:
                continue
            if any(d in link for d in ["bing.com", "microsoft.com", "go.microsoft", "baike.baidu",
                                        "hanyuguoxue", "zdic.net", "ai-bot.cn", "doubao.com",
                                        "deepin.org", "deepseek.com", "jimeng.jianying"]):
                continue
            articles.append({"title": title, "url": link, "account": get_source_tag(link)})
            if len(articles) >= max_results:
                break
        return articles
    except Exception as e:
        print(f"  [Bing:{query[:15]}] 错误: {e}", flush=True)
        return []


def main():
    import time

    # 加载已有数据
    existing = json.load(open(EXISTING)) if os.path.exists(EXISTING) else []
    # 移除旧的"安全情报"条目（重跑幂等）
    existing = [a for a in existing if a.get("account") != "安全情报"]
    seen_urls = set()
    for acc in existing:
        for a in acc.get("articles", []):
            seen_urls.add(a.get("url", ""))

    all_security_articles = []

    # 1. 直接抓取安全门户首页
    print("=== 安全门户直抓 ===", flush=True)
    for portal in SECURITY_SOURCES:
        print(f"抓取: {portal['name']}...", flush=True)
        arts = scrape_portal(portal)
        added = 0
        for a in arts:
            if a["url"] not in seen_urls:
                seen_urls.add(a["url"])
                all_security_articles.append(a)
                added += 1
        print(f"  新增 {added} 篇", flush=True)
        time.sleep(2)

    # 2. Bing 补充搜索
    print("\n=== Bing 安全+舆情搜索 ===", flush=True)
    for q in BING_QUERIES:
        print(f"搜索: {q[:30]}...", flush=True)
        arts = bing_search_security(q)
        added = 0
        for a in arts:
            if a["url"] not in seen_urls:
                seen_urls.add(a["url"])
                all_security_articles.append(a)
                added += 1
        print(f"  新增 {added} 篇", flush=True)
        time.sleep(1)

    # 3. 保存
    if all_security_articles:
        existing.append({"account": "安全情报", "articles": all_security_articles, "error": None})
    json.dump(existing, open(EXISTING, "w"), ensure_ascii=False, indent=2)
    print(f"\n总计安全+舆情文章: {len(all_security_articles)} 篇")
    print(f"已更新: {EXISTING}")


if __name__ == "__main__":
    main()
