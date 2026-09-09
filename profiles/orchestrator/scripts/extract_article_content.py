#!/usr/bin/env python3
"""正文提取器 — 为已抓取的文章 URL 批量提取正文。

解决"样子货"根因：daily_intel_report.py 只拿 title+url，没有正文。
本脚本复用 wechat_retrieval_layers.py 的分层提取（BrowserAct → crawl4ai → urllib），
为每篇文章提取正文，回填到增强数据文件。

用法：
  python3 extract_article_content.py [--date YYYY-MM-DD] [--input articles.json] [--limit N]

输出：wechat_daily/enriched_articles_<date>.json（带正文的完整数据）
策略：
  1. BrowserAct stealth-extract（最强，穿透微信反爬）— 优先
  2. crawl4ai（本地 undetected browser）— 降级
  3. urllib（签名链接有效时）— 最后
  4. 非 weixin URL（bing 补充）→ urllib 直接提取 + 简易 HTML 正文解析

反爬节流：BrowserAct 请求间 8-12s 抖动；搜狗链接解封约 5 次/日。
"""

import json
import os
import re
import sys
import time
import random
import subprocess
from datetime import datetime

SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPTS_DIR)

LIFE_DIR = "/Users/YOURNAME/hermes-docker-sandbox/workspace/life-workbench"
WECHAT_DIR = os.path.join(LIFE_DIR, "wechat_daily")

# 复用分层提取模块
from wechat_retrieval_layers import (
    check_browseract_available,
    browseract_extract,
    crawl4ai_extract,
    urllib_extract,
)

DESKTOP_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"


def is_wechat_url(url):
    return "mp.weixin.qq.com" in url


def extract_wechat_article(url):
    """提取微信文章正文（分层 fallback）。

    优先 BrowserAct stealth-extract（实测可穿透 wappoc_appmsgcaptcha 环境），
    降级 crawl4ai，最后 urllib。
    """
    # 1. BrowserAct（最强反爬）
    cli_ok, key_ok, _ = check_browseract_available()
    if cli_ok and key_ok:
        result = browseract_extract(url)
        if result.get("content") and len(result.get("content", "")) > 100:
            return result

    # 2. crawl4ai
    result = crawl4ai_extract(url)
    if result.get("content") and len(result.get("content", "")) > 100:
        return result

    # 3. urllib
    result = urllib_extract(url)
    if result.get("content") and len(result.get("content", "")) > 100:
        return result

    return {"content": "", "error": "all_methods_failed", "method": "failed"}


def extract_generic_article(url):
    """提取非微信 URL 正文（bing 补充的 datalearner/aliyun 等）。

    urllib 拿 HTML → 去 script/style → 提取 <article>/<main>/<div class=content> → 纯文本。
    """
    import urllib.request
    import html as htmlmod

    req = urllib.request.Request(url, headers={
        "User-Agent": DESKTOP_UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    })
    try:
        resp = urllib.request.urlopen(req, timeout=20)
        html = resp.read().decode("utf-8", errors="replace")

        # 去除脚本/样式
        html = re.sub(r'<script[^>]*>.*?</script>', '', html, flags=re.S)
        html = re.sub(r'<style[^>]*>.*?</style>', '', html, flags=re.S)
        html = re.sub(r'<nav[^>]*>.*?</nav>', '', html, flags=re.S)
        html = re.sub(r'<footer[^>]*>.*?</footer>', '', html, flags=re.S)
        html = re.sub(r'<header[^>]*>.*?</header>', '', html, flags=re.S)

        # 尝试常见正文容器
        content = ""
        for pattern in [
            r'<article[^>]*>(.*?)</article>',
            r'<main[^>]*>(.*?)</main>',
            r'<div[^>]*class="[^"]*article[^"]*"[^>]*>(.*?)</div>\s*(?:<footer|<div class="comment)',
            r'<div[^>]*id="[^"]*content[^"]*"[^>]*>(.*?)</div>',
            r'<div[^>]*class="[^"]*content[^"]*"[^>]*>(.*?)</div>',
        ]:
            m = re.search(pattern, html, re.S)
            if m:
                raw = m.group(1)
                raw = re.sub(r'<p[^>]*>', '\n', raw)
                raw = re.sub(r'<br\s*/?>', '\n', raw)
                raw = re.sub(r'<[^>]+>', '', raw)
                raw = htmlmod.unescape(raw).strip()
                raw = re.sub(r'\n{3,}', '\n\n', raw)
                raw = re.sub(r'[ \t]+', ' ', raw)
                if len(raw) > 200:
                    content = raw
                    break

        # 兜底：整个 body 的文本
        if not content or len(content) < 200:
            m = re.search(r'<body[^>]*>(.*?)</body>', html, re.S)
            if m:
                raw = re.sub(r'<p[^>]*>', '\n', m.group(1))
                raw = re.sub(r'<br\s*/?>', '\n', raw)
                raw = re.sub(r'<[^>]+>', '', raw)
                content = htmlmod.unescape(raw).strip()
                content = re.sub(r'\n{3,}', '\n\n', content)
                content = re.sub(r'[ \t]+', ' ', content)

        # 提取标题
        title = ""
        m = re.search(r'<title[^>]*>(.*?)</title>', html, re.S)
        if m:
            title = htmlmod.unescape(re.sub(r'\s+', ' ', m.group(1))).strip()

        if len(content) < 100:
            return {"content": "", "error": "content_too_short", "method": "generic_urllib"}

        return {"content": content[:15000], "title": title, "error": None, "method": "generic_urllib"}
    except Exception as e:
        return {"content": "", "error": f"generic_urllib: {str(e)[:80]}", "method": "generic_urllib"}


def clean_content(content):
    """清洗正文：去尾部推荐/版权/广告噪音。"""
    if not content:
        return content
    # 截断常见尾部噪音
    cut_markers = [
        "\n推荐阅读", "\n往期回顾", "\n你或许还想看", "\n延伸阅读",
        "\n更多内容", "\n扫码关注", "\n长按关注", "\n点击阅读原文",
        "赞\n分享\n推荐\n写留言", "IFRAME", "wxa-pcopensdk",
        "\n阅读原文", "\n----\n来源：", "\n免责声明",
    ]
    for marker in cut_markers:
        idx = content.find(marker)
        if idx > 200:
            content = content[:idx].rstrip()

    # 去多余空行
    content = re.sub(r'\n{3,}', '\n\n', content)
    content = re.sub(r'[ \t]{3,}', '  ', content)
    return content.strip()


def extract_publish_date(content):
    """从正文中提取发布日期。"""
    # 2026年8月13日 / 2026-08-13 / 2026.08.13
    patterns = [
        r'(\d{4}年\d{1,2}月\d{1,2}日)',
        r'(\d{4}-\d{1,2}-\d{1,2})',
        r'(\d{4}\.\d{1,2}\.\d{1,2})',
        r'(\d{4}/\d{1,2}/\d{1,2})',
    ]
    for pat in patterns:
        m = re.search(pat, content[:500])
        if m:
            return m.group(1)
    return ""


def enrich_articles(input_file, output_file, limit=None, delay_range=(8, 12), skip_wechat=False, wechat_only=False):
    """为文章列表批量提取正文。

    Args:
        input_file: articles_<date>.json 输入
        output_file: enriched_articles_<date>.json 输出
        limit: 最多处理 N 篇（测试用）
        delay_range: BrowserAct 请求间随机延迟（秒）
        skip_wechat: 跳过微信文章（反爬强，优先提取非微信源）
        wechat_only: 只处理微信文章
    """
    with open(input_file) as f:
        accounts = json.load(f)

    # 来源优先级排序：安全情报 > Bing补充 > sogou/其他
    # 确保高价值的安全/舆情文章优先获得 enrich 配额
    PRIORITY = {"安全情报": 0, "Bing补充": 1}
    accounts_sorted = sorted(accounts, key=lambda a: PRIORITY.get(a.get("account", ""), 2))

    stats = {"success": 0, "failed": 0, "by_method": {}}
    total = sum(len(a.get("articles", [])) for a in accounts)
    processed = 0

    for account in accounts_sorted:
        for art in account.get("articles", []):
            if limit and processed >= limit:
                break

            url = art.get("url", "")
            title = art.get("title", "")
            if not url:
                continue

            # 按参数过滤微信/非微信文章
            is_wx = is_wechat_url(url)
            if skip_wechat and is_wx:
                continue
            if wechat_only and not is_wx:
                continue

            processed += 1
            print(f"[{processed}/{total}] [{account.get('account','')[:8]}] {title[:40]}...", end=" ", flush=True)

            # 提取
            if is_wechat_url(url):
                result = extract_wechat_article(url)
            else:
                result = extract_generic_article(url)

            content = clean_content(result.get("content", ""))
            art["content"] = content
            art["content_length"] = len(content)
            art["extract_error"] = result.get("error")
            art["extract_method"] = result.get("method", "failed")
            art["extracted_title"] = result.get("title", "")

            # 提取发布日期
            pub = extract_publish_date(content) or extract_publish_date(title)
            if pub:
                art["content_pub_date"] = pub

            if content and len(content) > 100:
                stats["success"] += 1
                method = art["extract_method"]
                stats["by_method"][method] = stats["by_method"].get(method, 0) + 1
                print(f"✅ {len(content)}字 [{art['extract_method']}]")
            else:
                stats["failed"] += 1
                print(f"❌ {art.get('extract_error','')[:40]}")

            # 节流
            if processed < total:
                time.sleep(random.uniform(*delay_range))

        if limit and processed >= limit:
            break

    # 保存
    with open(output_file, "w") as f:
        json.dump(accounts, f, ensure_ascii=False, indent=2)

    print(f"\n=== 提取完成 ===")
    print(f"成功: {stats['success']}/{processed}")
    print(f"失败: {stats['failed']}")
    print(f"方法分布: {stats['by_method']}")
    print(f"输出: {output_file}")
    return stats


def main():
    import argparse
    parser = argparse.ArgumentParser(description="为文章 URL 批量提取正文")
    parser.add_argument("--date", type=str, default="", help="日期 YYYY-MM-DD（默认今天）")
    parser.add_argument("--input", type=str, default="", help="直接指定输入文件")
    parser.add_argument("--output", type=str, default="", help="直接指定输出文件")
    parser.add_argument("--limit", type=int, default=None, help="最多处理 N 篇")
    parser.add_argument("--delay-min", type=float, default=8.0, help="请求间最小延迟（秒）")
    parser.add_argument("--delay-max", type=float, default=12.0, help="请求间最大延迟（秒）")
    parser.add_argument("--skip-wechat", action="store_true", help="跳过微信文章（反爬强，优先提取非微信源）")
    parser.add_argument("--wechat-only", action="store_true", help="只处理微信文章")
    args = parser.parse_args()

    date = args.date or datetime.now().strftime("%Y-%m-%d")
    input_file = args.input or os.path.join(WECHAT_DIR, f"articles_{date}.json")
    output_file = args.output or os.path.join(WECHAT_DIR, f"enriched_articles_{date}.json")

    if not os.path.exists(input_file):
        print(f"❌ 输入文件不存在: {input_file}")
        sys.exit(1)

    print(f"=== 正文提取 ===")
    print(f"日期: {date}")
    print(f"输入: {input_file}")
    print(f"输出: {output_file}")
    print(f"节流: {args.delay_min}-{args.delay_max}s")
    if args.limit:
        print(f"限量: {args.limit} 篇")
    print()

    enrich_articles(input_file, output_file, limit=args.limit, delay_range=(args.delay_min, args.delay_max),
                    skip_wechat=args.skip_wechat, wechat_only=args.wechat_only)


if __name__ == "__main__":
    main()
