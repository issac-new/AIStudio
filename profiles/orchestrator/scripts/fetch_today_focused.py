#!/usr/bin/env python3
"""聚焦抓取今日公众号文章 — 供手动补跑使用

从搜狗移动端抓取关键 AI/科技公众号最新文章，写入 wechat_daily/articles_{TODAY}.json
然后 daily_intel_report.py 会自动读取。
"""
import json, os, re, sys, time, urllib.request, urllib.parse
import html as htmlmod
from datetime import datetime

TODAY = datetime.now().strftime("%Y-%m-%d")
WECHAT_DIR = "/Users/YOURNAME/hermes-docker-sandbox/workspace/life-workbench/wechat_daily"
MOBILE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"

# 关键账号（控制数量避免搜狗封禁，≤8个，每个间隔12s）
KEY_ACCOUNTS = [
    "机器之心", "量子位", "新智元", "AI前线",
    "DeepSeek", "智谱AI", "老刘说NLP", "InfoQ",
]

def fetch_account(account_name):
    keyword = f"site:mp.weixin.qq.com {account_name}"
    query = urllib.parse.quote(keyword)
    url = f"https://m.sogou.com/web/searchList.jsp?keyword={query}&page=1"
    req = urllib.request.Request(url, headers={
        "User-Agent": MOBILE_UA,
        "Accept-Language": "zh-CN,zh;q=0.9",
    })
    try:
        resp = urllib.request.urlopen(req, timeout=20)
        html = resp.read().decode("utf-8", errors="replace")
        if "antispider" in html or "用户您好" in html or "验证码" in html:
            return {"account": account_name, "error": "antispider", "articles": []}
        articles = []
        for m in re.finditer(r'href="\./id=[^"]*?&amp;url=([^&"]+)[^"]*"[^>]*>(.*?)</a>', html, re.S):
            real_url = urllib.parse.unquote(m.group(1))
            if "mp.weixin.qq.com/s?" not in real_url:
                continue
            real_url = re.sub(r'&qbExtraParams.*$', '', real_url)
            real_url = re.sub(r'&scene=.*$', '', real_url)
            real_url = htmlmod.unescape(real_url)
            title = htmlmod.unescape(re.sub(r"<[^>]+>", "", m.group(2))).strip()
            if title and real_url:
                articles.append({"title": title, "url": real_url})
        seen, deduped = set(), []
        for a in articles:
            if a["url"] not in seen:
                seen.add(a["url"])
                deduped.append(a)
        return {"account": account_name, "articles": deduped, "error": None}
    except Exception as e:
        return {"account": account_name, "error": str(e)[:60], "articles": []}

def main():
    os.makedirs(WECHAT_DIR, exist_ok=True)
    all_results = []
    total_articles = 0
    for i, acc in enumerate(KEY_ACCOUNTS):
        print(f"[{i+1}/{len(KEY_ACCOUNTS)}] 抓取: {acc}...", flush=True)
        r = fetch_account(acc)
        all_results.append(r)
        n = len(r["articles"])
        total_articles += n
        status = f"✓ {n}篇" if r["error"] is None else f"✗ {r['error']}"
        print(f"  {status}", flush=True)
        if r["error"] == "antispider":
            print("  ⚠️ 搜狗触发反爬，停止后续抓取", flush=True)
            break
        if i < len(KEY_ACCOUNTS) - 1:
            time.sleep(12)  # 防封禁
    out_path = os.path.join(WECHAT_DIR, f"articles_{TODAY}.json")
    with open(out_path, "w") as f:
        json.dump(all_results, f, ensure_ascii=False, indent=2)
    print(f"\n总计: {total_articles} 篇文章，{len(all_results)} 个账号")
    print(f"已保存: {out_path}")

if __name__ == "__main__":
    main()
