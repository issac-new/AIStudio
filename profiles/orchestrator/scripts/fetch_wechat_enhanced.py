#!/usr/bin/env python3
"""增强版微信公众号文章检索器

解决当前痛点：
1. 搜狗移动端 10-15 次后封 IP → 集成代理轮换 + Bing RSS 备用
2. 微信文章页 curl 拿不到正文 → 分层提取（BrowserAct → crawl4ai → urllib → computer_use）
3. 签名链接分钟级过期 → 实时重新搜索取新链接

架构：L0直接请求 → L1代理轮换/Bing RSS → L2分层浏览器渲染 → L3 computer_use
"""

import json
import os
import re
import sys
import time
import random
import subprocess
import urllib.request
import urllib.parse
import html as htmlmod
from datetime import datetime

# 分层检索模块（BrowserAct → crawl4ai → urllib）
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
try:
    from wechat_retrieval_layers import check_browseract_available, extract_article_layered as _layered_extract
except ImportError:
    def check_browseract_available():
        return False, False, "wechat_retrieval_layers not installed"
    def _layered_extract(url):
        return {"content": "", "error": "wechat_retrieval_layers not installed", "method": "failed"}

# ─── 配置 ───
OUTPUT_DIR = "/Users/YOURNAME/hermes-docker-sandbox/workspace/life-workbench/wechat_daily"
TODAY = datetime.now().strftime("%Y-%m-%d")

# 代理配置（可选，填入住宅代理）
PROXY_LIST = [
    # 示例格式："http://user:pass@host:port"
    # 免费代理列表可从 https://free-proxy-list.net 获取
]

MOBILE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
DESKTOP_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

UA_POOL = [
    MOBILE_UA,
    DESKTOP_UA,
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
]

# ─── L1: 代理轮换请求 ────────────────────────────────

class ProxyRotator:
    def __init__(self, proxies=None):
        self.proxies = proxies or PROXY_LIST
        self.current = 0
        self.ua_pool = UA_POOL
        self.ua_index = 0
    
    def get_proxy(self):
        if not self.proxies:
            return None
        proxy = self.proxies[self.current]
        self.current = (self.current + 1) % len(self.proxies)
        return proxy
    
    def get_ua(self):
        ua = self.ua_pool[self.ua_index]
        self.ua_index = (self.ua_index + 1) % len(self.ua_pool)
        return ua
    
    def request(self, url, timeout=20):
        """带代理和UA轮换的请求"""
        ua = self.get_ua()
        proxy = self.get_proxy()
        
        req = urllib.request.Request(url, headers={
            "User-Agent": ua,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        })
        
        if proxy:
            req.set_proxy(proxy, "http")
        
        try:
            resp = urllib.request.urlopen(req, timeout=timeout)
            return resp.read().decode("utf-8", errors="replace"), None
        except Exception as e:
            return None, str(e)


# ─── L1: Bing RSS 备用搜索 ───────────────────────────

def bing_rss_search(query, count=15, mkt="zh-CN"):
    """Bing RSS 搜索 — 搜狗被封时的备用方案"""
    url = (f"https://www.bing.com/search?format=rss"
           f"&setmkt={mkt}&setlang=zh-CN"
           f"&q={urllib.parse.quote(query)}&count={count}")
    
    rotator = ProxyRotator()
    data, err = rotator.request(url, timeout=20)
    if err or not data:
        return []
    
    items = re.findall(r"<item>(.*?)</item>", data, re.DOTALL)
    results = []
    for it in items:
        title = re.search(r"<title>(.*?)</title>", it, re.DOTALL)
        link = re.search(r"<link>(.*?)</link>", it, re.DOTALL)
        desc = re.search(r"<description>(.*?)</description>", it, re.DOTALL)
        results.append({
            "title": htmlmod.unescape(title.group(1)) if title else "",
            "link": link.group(1).strip() if link else "",
            "desc": htmlmod.unescape(re.sub(r"<[^>]+>", "", desc.group(1)))[:300] if desc else "",
        })
    return results


# ─── L1: 搜狗移动端搜索（带代理轮换）──────────────────

def sogou_mobile_search(account_name, rotator=None):
    """搜狗移动端搜索公众号文章"""
    if not rotator:
        rotator = ProxyRotator()
    
    keyword = f"site:mp.weixin.qq.com {account_name}"
    query = urllib.parse.quote(keyword)
    url = f"https://m.sogou.com/web/searchList.jsp?keyword={query}&page=1"
    
    html, err = rotator.request(url, timeout=20)
    if err or not html:
        return {"account": account_name, "error": err, "articles": []}
    
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
    
    # 去重
    seen = set()
    deduped = []
    for a in articles:
        if a["url"] not in seen:
            seen.add(a["url"])
            deduped.append(a)
    
    return {"account": account_name, "articles": deduped, "error": None}


# ─── L2: 分层提取（BrowserAct → crawl4ai → urllib）─────

def extract_with_crawl4ai(url):
    """用 crawl4ai undetected browser 提取微信文章正文
    
    需要安装: pip install crawl4ai
    """
    try:
        from crawl4ai import AsyncWebCrawler
        import asyncio
        
        async def _extract():
            async with AsyncWebCrawler(verbose=False) as crawler:
                result = await crawler.arun(url=url)
                return result
        
        result = asyncio.run(_extract())
        
        if result and result.markdown:
            return {
                "title": result.metadata.get("title", ""),
                "content": result.markdown[:15000],
                "content_length": len(result.markdown),
                "error": None,
            }
        return {"error": "no content", "content": "", "content_length": 0}
        
    except ImportError:
        return {"error": "crawl4ai not installed", "content": "", "content_length": 0}
    except Exception as e:
        return {"error": str(e)[:80], "content": "", "content_length": 0}


def browseract_session_extract(article_url, session="wx-daily", browser_id="110937460570776440", timeout=60):
    """用 wx-daily stealth 浏览器（已人工验证、cookie 持久化）提取微信文章正文
    
    完整链路（2026-08-05 实测通过，无需验证码）：
    1. 从搜狗搜索拿跳转链接（stealth-extract 穿透）
    2. 在 wx-daily 浏览器内 navigate 到跳转链接（cookie 已持久化）
    3. 302 到微信文章页 → get markdown 提取正文
    
    返回: {"content", "title", "error", "method"}
    """
    try:
        # 1. 打开浏览器（复用已有 session 连接）
        subprocess.run(
            ["browser-act", "--session", session, "browser", "open", browser_id, "about:blank"],
            capture_output=True, text=True, timeout=timeout + 10,
        )
        
        # 2. 导航到文章 URL（可能是搜狗跳转链接或直接微信链接）
        subprocess.run(
            ["browser-act", "--session", session, "navigate", article_url],
            capture_output=True, text=True, timeout=timeout + 10,
        )
        
        # 3. 等待渲染
        time.sleep(6)
        
        # 4. 提取 markdown
        result = subprocess.run(
            ["browser-act", "--session", session, "get", "markdown"],
            capture_output=True, text=True, timeout=timeout,
        )
        out = (result.stdout or "") + (result.stderr or "")
        
        # 检查验证码门
        if "wappoc_appmsgcaptcha" in out or "antispider" in out or "验证码" in out:
            return {"content": "", "error": "captcha_gate_requires_human", "method": "browseract_session"}
        
        # 检查正文是否提取成功（有实际内容）
        content = out.strip()
        if len(content) > 100 and "Parameter error" not in content:
            # 提取标题（第一行非空）
            lines = [l.strip() for l in content.splitlines() if l.strip()]
            title = lines[0] if lines else ""
            return {"content": content[:20000], "title": title[:100], "error": None, "method": "browseract_session"}
        
        return {"content": "", "error": "empty_or_parameter_error", "method": "browseract_session"}
    
    except Exception as e:
        return {"content": "", "error": f"browseract_session: {str(e)[:60]}", "method": "browseract_session"}


def fetch_article_full_automatic(article_url, use_session=True, prefer="auto"):
    """全自动微信文章正文提取（优先 session 登录态，降级到分层提取）
    
    策略（2026-08-05 实测）：
    1. wx-daily session 浏览器（已人工验证码，cookie 持久化）→ 直接正文
    2. 降级到 extract_article_layered（BrowserAct stealth-extract → crawl4ai → urllib）
    """
    if use_session:
        result = browseract_session_extract(article_url)
        if result.get("content") and not result.get("error"):
            return result
    
    # 降级到分层提取
    return extract_article_layered(article_url)


def extract_article_layered(url):
    """分层提取文章正文（集成 wechat_retrieval_layers）
    
    优先级：BrowserAct（有key）→ crawl4ai → urllib
    返回: {"content", "title", "error", "method"}
    """
    try:
        result = _layered_extract(url)
        return {
            "content": result.get("content", ""),
            "title": result.get("title", ""),
            "error": result.get("error"),
            "method": result.get("method", "failed"),
        }
    except Exception as e:
        return {"content": "", "title": "", "error": str(e)[:80], "method": "failed"}


def extract_with_urllib(url):
    """urllib 直接提取（签名链接有效时可用）"""
    # 修复 URL 编码问题
    url = url.replace('\u00d7', 'x').replace('\ufffd', 'x')
    
    req = urllib.request.Request(url, headers={
        "User-Agent": DESKTOP_UA,
        "Accept": "text/html",
        "Accept-Language": "zh-CN,zh;q=0.9",
    })
    
    try:
        resp = urllib.request.urlopen(req, timeout=15)
        html = resp.read().decode("utf-8", errors="replace")
        
        # 提取标题
        title = ""
        m = re.search(r'var msg_title = "([^"]*)"', html)
        if m: title = htmlmod.unescape(m.group(1))
        if not title:
            m = re.search(r'<h1[^>]*class="rich_media_title"[^>]*>(.*?)</h1>', html, re.S)
            if m: title = htmlmod.unescape(re.sub(r'<[^>]+>', '', m.group(1))).strip()
        
        # 提取正文
        content = ""
        m = re.search(r'<div[^>]*id="js_content"[^>]*>(.*?)</div>\s*<script', html, re.S)
        if not m:
            m = re.search(r'<div[^>]*id="js_content"[^>]*>(.*?)</div>', html, re.S)
        if m:
            raw = m.group(1)
            raw = re.sub(r'<p[^>]*>', '\n', raw)
            raw = re.sub(r'<br\s*/?>', '\n', raw)
            raw = re.sub(r'<[^>]+>', '', raw)
            content = htmlmod.unescape(raw).strip()
            content = re.sub(r'\n{3,}', '\n\n', content)
            content = re.sub(r'[ \t]+', ' ', content)
        
        return {
            "title": title,
            "content": content[:15000],
            "content_length": len(content),
            "error": None,
        }
    except Exception as e:
        return {"error": str(e)[:80], "content": "", "content_length": 0}


# ─── 主流程 ───────────────────────────────────────────

# ─── L1: BrowserAct 搜狗搜索（穿透反爬）───────────────

def sogou_search_with_browseract(account_name, timeout=60):
    """用 BrowserAct stealth-extract 穿透搜狗微信搜索反爬
    
    实测验证（2026-08-05）：curl 对 weixin.sogou.com 直接封 IP/验证码，
    BrowserAct stealth-extract 可完整拿到搜索结果（标题+签名链接+摘要）。
    返回格式与 sogou_mobile_search 一致。
    """
    query = urllib.parse.quote(account_name)
    url = f"https://weixin.sogou.com/weixin?type=2&query={query}&ie=utf8"
    
    try:
        result = subprocess.run(
            ["browser-act", "stealth-extract", url,
             "--content-type", "markdown", "--timeout", str(timeout)],
            capture_output=True, text=True, timeout=timeout + 20,
        )
        out = (result.stdout or "") + (result.stderr or "")
        
        # 检查错误
        if "API key required" in out or "Error 230103" in out:
            return {"account": account_name, "error": "browseract_api_key_required", "articles": []}
        if "Error 230305" in out or "timed out waiting" in out:
            return {"account": account_name, "error": "browseract_timeout", "articles": []}
        if "Error 230404" in out:
            return {"account": account_name, "error": "browseract_captcha_gate", "articles": []}
        if "Error" in out and "以下内容来自微信公众平台" not in out:
            err_line = re.search(r"(Error \d+: .+)", out)
            return {"account": account_name, "error": err_line.group(1)[:60] if err_line else "browseract_error", "articles": []}
        
        # 解析文章（搜狗链接格式）
        articles = []
        # 模式: ### [标题](weixin.sogou.com/link?url=...)
        for m in re.finditer(r'###\s*\[([^\]]+)\]\((https?://[^)]+)\)', out):
            title = htmlmod.unescape(m.group(1)).strip()
            link = m.group(2).strip()
            if "weixin.sogou.com/link" in link or "mp.weixin.qq.com" in link:
                articles.append({"title": title, "url": link, "source": "browseract_sogou"})
        
        if not articles:
            return {"account": account_name, "error": "browseract_no_articles", "articles": []}
        
        return {"account": account_name, "articles": articles, "error": None, "source": "browseract"}
    
    except subprocess.TimeoutExpired:
        return {"account": account_name, "error": "browseract_subprocess_timeout", "articles": []}
    except Exception as e:
        return {"account": account_name, "error": f"browseract: {str(e)[:60]}", "articles": []}


def fetch_account_articles_enhanced(account_name, use_proxy=False, use_bing_fallback=True, use_browseract=True):
    """增强版公众号文章抓取
    
    策略（实测 2026-08-05）：
    1. 优先 BrowserAct stealth-extract（穿透搜狗反爬，最强）
    2. 搜狗移动端（带代理轮换，搜狗解封时可用）
    3. 搜狗被封时，用 Bing RSS 备用
    """
    # Step 0: BrowserAct（穿透搜狗反爬）
    if use_browseract:
        cli_ok, key_ok, _ = check_browseract_available()
        if cli_ok and key_ok:
            result = sogou_search_with_browseract(account_name)
            if result.get("error") is None and result.get("articles"):
                return result
            # 记录失败原因，继续降级
    
    rotator = ProxyRotator() if use_proxy else None
    
    # Step 1: 搜狗移动端
    result = sogou_mobile_search(account_name, rotator)
    
    # Step 2: 搜狗被封时，Bing RSS 备用
    if result.get("error") == "antispider" and use_bing_fallback:
        print(f"  [Bing RSS fallback] {account_name}")
        bing_results = bing_rss_search(f"site:mp.weixin.qq.com {account_name}")
        
        articles = []
        for r in bing_results:
            if "mp.weixin.qq.com/s?" in r.get("link", ""):
                articles.append({
                    "title": r["title"],
                    "url": r["link"],
                    "source": "bing_rss",
                })
        
        if articles:
            result = {"account": account_name, "articles": articles, "error": None, "source": "bing_rss"}
    
    return result


def main():
    """主流程：批量抓取 + 正文提取"""
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--accounts", type=str, default="", help="公众号列表文件")
    parser.add_argument("--proxy", action="store_true", help="使用代理轮换")
    parser.add_argument("--bing-fallback", action="store_true", default=True, help="搜狗被封时用Bing RSS备用")
    parser.add_argument("--extract-content", action="store_true", help="提取正文")
    parser.add_argument("--use-crawl4ai", action="store_true", help="用crawl4ai提取正文")
    args = parser.parse_args()
    
    # 加载公众号列表
    if args.accounts and os.path.exists(args.accounts):
        with open(args.accounts) as f:
            accounts = json.load(f)
    else:
        accounts = ["机器之心", "量子位", "AI前线", "DeepSeek", "AI与安全"]
    
    print(f"=== 增强版微信公众号检索 ===")
    print(f"日期: {TODAY}")
    print(f"公众号: {len(accounts)} 个")
    print(f"代理轮换: {args.proxy}")
    print(f"Bing RSS 备用: {args.bing_fallback}")
    print(f"提取正文: {args.extract_content}")
    print()
    
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    all_results = []
    
    for i, account in enumerate(accounts, 1):
        print(f"[{i:2d}/{len(accounts)}] {account}...", end=" ", flush=True)
        
        result = fetch_account_articles_enhanced(
            account,
            use_proxy=args.proxy,
            use_bing_fallback=args.bing_fallback,
        )
        
        n = len(result.get("articles", []))
        err = result.get("error")
        
        if err == "antispider":
            print("❌ 搜狗封IP")
        elif err:
            print(f"⚠️ {err[:30]}")
        else:
            print(f"✅ {n}篇")
        
        all_results.append(result)
        
        # 延迟
        if i < len(accounts):
            time.sleep(random.uniform(8, 15))
    
    # 保存
    output_file = os.path.join(OUTPUT_DIR, f"enhanced_{TODAY}.json")
    with open(output_file, 'w') as f:
        json.dump(all_results, f, ensure_ascii=False, indent=2)
    
    total = sum(len(r.get("articles", [])) for r in all_results)
    print(f"\n=== 抓取完成 ===")
    print(f"成功: {len(all_results)}/{len(accounts)} 号")
    print(f"总文章: {total} 篇")
    print(f"输出: {output_file}")
    
    # 提取正文（分层：BrowserAct → crawl4ai → urllib）
    if args.extract_content:
        print(f"\n=== 提取正文（分层 fallback）===")
        method_stats = {}
        for r in all_results:
            for a in r.get("articles", []):
                url = a.get("url", "")
                if not url:
                    continue
                
                # 用分层提取（自动降级）
                full = extract_article_layered(url)
                
                a["full_content"] = full.get("content", "")
                a["content_length"] = len(full.get("content", ""))
                a["extract_error"] = full.get("error")
                a["extract_method"] = full.get("method", "failed")
                
                method = a["extract_method"]
                method_stats[method] = method_stats.get(method, 0) + 1
        
        # 保存带正文的版本
        full_file = os.path.join(OUTPUT_DIR, f"enhanced_full_{TODAY}.json")
        with open(full_file, 'w') as f:
            json.dump(all_results, f, ensure_ascii=False, indent=2)
        
        extracted = sum(1 for r in all_results for a in r.get("articles", []) if a.get("content_length", 0) > 100)
        print(f"正文提取: {extracted}/{total} 篇")
        print(f"方法分布: {method_stats}")
        print(f"输出: {full_file}")


if __name__ == "__main__":
    main()
