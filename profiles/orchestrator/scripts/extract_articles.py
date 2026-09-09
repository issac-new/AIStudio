#!/usr/bin/env python3
"""提取微信文章全文内容

微信文章页 mp.weixin.qq.com 不封IP，可直接抓取
"""

import json
import re
import os
import time
import urllib.request
import html as htmlmod
from datetime import datetime

OUTPUT_DIR = "/Users/YOURNAME/hermes-docker-sandbox/workspace/life-workbench/wechat_daily"
TODAY = datetime.now().strftime("%Y-%m-%d")

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

def extract_article(url):
    """提取微信文章全文"""
    # Fix URL encoding issues (× etc in sogou redirect URLs)
    # sogou URLs contain × (U+00D7) in "×tamp" which breaks ASCII encoding.
    # Direct character replacement — no latin-1 round-trip (that converts
    # U+00D7 to U+FFFD replacement char, making subsequent replace fail).
    url = url.replace('\u00d7', 'x').replace('\ufffd', 'x')
    
    req = urllib.request.Request(url, headers={
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "zh-CN,zh;q=0.9",
    })

    try:
        resp = urllib.request.urlopen(req, timeout=20)
        html = resp.read().decode("utf-8", errors="replace")

        # Title
        title = ""
        title_m = re.search(r'var msg_title = "([^"]*)"', html)
        if title_m:
            title = htmlmod.unescape(title_m.group(1))
        if not title:
            title_m = re.search(r'<h1[^>]*class="rich_media_title"[^>]*>(.*?)</h1>', html, re.S)
            if title_m:
                title = htmlmod.unescape(re.sub(r'<[^>]+>', '', title_m.group(1))).strip()

        # Author
        author = ""
        author_m = re.search(r'var nickname = "([^"]*)"', html)
        if author_m:
            author = htmlmod.unescape(author_m.group(1))

        # Publish time
        pub_time = ""
        pt_m = re.search(r'var ct = "(\d+)"', html)
        if pt_m:
            pub_time = datetime.fromtimestamp(int(pt_m.group(1))).strftime("%Y-%m-%d %H:%M")

        # Content - extract text from #js_content
        content = ""
        content_m = re.search(r'<div[^>]*id="js_content"[^>]*>(.*?)</div>\s*<script', html, re.S)
        if not content_m:
            content_m = re.search(r'<div[^>]*id="js_content"[^>]*>(.*?)</div>', html, re.S)
        if content_m:
            raw = content_m.group(1)
            # Remove tags but keep text, preserve paragraph breaks
            raw = re.sub(r'<p[^>]*>', '\n', raw)
            raw = re.sub(r'<br\s*/?>', '\n', raw)
            raw = re.sub(r'<[^>]+>', '', raw)
            content = htmlmod.unescape(raw).strip()
            # Clean up whitespace
            content = re.sub(r'\n{3,}', '\n\n', content)
            content = re.sub(r'[ \t]+', ' ', content)

        # Description
        desc = ""
        desc_m = re.search(r'var msg_desc = "([^"]*)"', html)
        if desc_m:
            desc = htmlmod.unescape(desc_m.group(1))

        return {
            "title": title,
            "author": author,
            "pub_time": pub_time,
            "desc": desc,
            "content": content[:15000],  # Cap at 15K chars
            "content_length": len(content),
            "url": url,
            "error": None,
        }

    except Exception as e:
        return {"url": url, "error": str(e), "content": "", "title": "", "author": ""}


def main():
    articles_file = os.path.join(OUTPUT_DIR, f"articles_{TODAY}.json")
    
    with open(articles_file) as f:
        accounts_data = json.load(f)

    # Collect all article URLs
    all_articles = []
    for r in accounts_data:
        account = r["account"]
        for a in r.get("articles", []):
            all_articles.append({
                "account": account,
                "title": a["title"],
                "url": a["url"],
            })

    print(f"=== 提取 {len(all_articles)} 篇文章全文 ===\n")

    results = []
    for i, art in enumerate(all_articles, 1):
        print(f"  [{i}/{len(all_articles)}] {art['account']}: {art['title'][:40]}...", flush=True)
        
        full = extract_article(art["url"])
        full["account"] = art["account"]
        results.append(full)
        
        time.sleep(2)  # Be polite

    output_file = os.path.join(OUTPUT_DIR, f"full_articles_{TODAY}.json")
    with open(output_file, 'w') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    success = sum(1 for r in results if r.get("content"))
    total_chars = sum(r.get("content_length", 0) for r in results)
    print(f"\n=== 提取完成 ===")
    print(f"成功: {success}/{len(results)}")
    print(f"总字数: {total_chars:,}")
    print(f"输出: {output_file}")


if __name__ == "__main__":
    main()
