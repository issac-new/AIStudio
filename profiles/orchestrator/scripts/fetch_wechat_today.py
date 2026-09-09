#!/usr/bin/env python3
"""批量拉取50个公众号的今日文章URL（搜狗移动端通道）

验证于 2026-08-05：移动端 m.sogou.com 可连续10-15次后封IP
端点：m.sogou.com/web/searchList.jsp
UA：移动端 Safari
间隔：10-15s随机（移动端封禁阈值更低，间隔需更长）
"""

import json
import time
import random
import re
import os
import urllib.request
import urllib.parse
import html as htmlmod
from datetime import datetime

OUTPUT_DIR = "/Users/YOURNAME/hermes-docker-sandbox/workspace/life-workbench/wechat_daily"
os.makedirs(OUTPUT_DIR, exist_ok=True)

TODAY = datetime.now().strftime("%Y-%m-%d")
OUTPUT_FILE = os.path.join(OUTPUT_DIR, f"articles_{TODAY}.json")
DONE_LOG = os.path.join(OUTPUT_DIR, "done.log")

MOBILE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"

def fetch_account_articles(account_name):
    """用 m.sogou.com 移动端搜索拉取公众号最近文章"""
    keyword = f"site:mp.weixin.qq.com {account_name}"
    query = urllib.parse.quote(keyword)
    url = f"https://m.sogou.com/web/searchList.jsp?keyword={query}&page=1"

    req = urllib.request.Request(url, headers={
        "User-Agent": MOBILE_UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9",
    })

    try:
        resp = urllib.request.urlopen(req, timeout=20)
        html = resp.read().decode("utf-8", errors="replace")

        if "antispider" in html or "用户您好" in html or "验证码" in html:
            return {"account": account_name, "error": "antispider", "articles": []}

        articles = []

        # Parse mobile results
        # Real article URLs are in url= parameter of sogou redirect links
        for m in re.finditer(r'href="\./id=[^"]*?&amp;url=([^&"]+)[^"]*"[^>]*>(.*?)</a>', html, re.S):
            real_url = urllib.parse.unquote(m.group(1))
            if "mp.weixin.qq.com/s?" not in real_url:
                continue
            real_url = re.sub(r'&qbExtraParams.*$', '', real_url)
            real_url = re.sub(r'&scene=.*$', '', real_url)
            real_url = htmlmod.unescape(real_url)
            title = htmlmod.unescape(re.sub(r"<[^>]+>", "", m.group(2))).strip()

            if title and real_url:
                articles.append({
                    "title": title,
                    "url": real_url,
                    "pub_date": "",
                    "pub_ts": 0,
                    "snippet": "",
                })

        # Deduplicate by URL
        seen_urls = set()
        deduped = []
        for a in articles:
            if a["url"] not in seen_urls:
                seen_urls.add(a["url"])
                deduped.append(a)
        
        return {"account": account_name, "articles": deduped, "error": None}

    except Exception as e:
        return {"account": account_name, "error": str(e), "articles": []}


def main():
    with open("/tmp/wechat_50.json") as f:
        accounts = json.load(f)

    # Load existing results (incremental)
    all_results = []
    done_accounts = set()
    if os.path.exists(OUTPUT_FILE):
        with open(OUTPUT_FILE) as f:
            try:
                all_results = json.load(f)
                done_accounts = {r["account"] for r in all_results}
            except:
                all_results = []

    remaining = [a for a in accounts if a not in done_accounts]
    print(f"=== 微信公众号文章批量抓取（移动端通道）===")
    print(f"日期: {TODAY}")
    print(f"已完成: {len(done_accounts)}, 待抓取: {len(remaining)}")
    print(f"间隔: 10-15s（移动端封禁阈值低）")
    print(flush=True)

    consecutive_fail = 0

    for i, account in enumerate(accounts, 1):
        if account in done_accounts:
            continue

        print(f"  [{i:2d}/{len(accounts)}] 🔄 {account}...", end=" ", flush=True)
        result = fetch_account_articles(account)

        n_articles = len(result.get("articles", []))
        error = result.get("error")

        if error == "antispider":
            print("❌ 被封IP！停止抓取。")
            consecutive_fail += 1
            if consecutive_fail >= 2:
                with open(OUTPUT_FILE, 'w') as f:
                    json.dump(all_results, f, ensure_ascii=False, indent=2)
                print(f"连续封禁，保存退出。已完成 {len(all_results)} 号")
                break
            # Wait longer before retry
            print(f"等待60s后继续...")
            time.sleep(60)
            continue
        elif error:
            print(f"⚠️  {error[:40]}")
            consecutive_fail = 0
        else:
            print(f"✅ {n_articles}篇")
            consecutive_fail = 0

        all_results.append(result)
        done_accounts.add(account)

        # Incremental save
        with open(OUTPUT_FILE, 'w') as f:
            json.dump(all_results, f, ensure_ascii=False, indent=2)

        with open(DONE_LOG, 'a') as f:
            f.write(f"{account}\n")

        if i < len(accounts):
            delay = random.uniform(10, 15)
            time.sleep(delay)

    # Summary
    total_articles = sum(len(r.get("articles", [])) for r in all_results)
    print()
    print(f"=== 抓取完成 ===")
    print(f"成功: {len(all_results)}/{len(accounts)} 号")
    print(f"总文章: {total_articles} 篇")
    print(f"输出: {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
