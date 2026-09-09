#!/usr/bin/env python3
"""正文抓取器 - 支持微信公众号/量子位/InfoQ/FreeBuf/通用网页"""
import urllib.request
import re
from html.parser import HTMLParser

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

class TextExtractor(HTMLParser):
    """从HTML提取正文，跳过script/style/nav/header/footer"""
    SKIP_TAGS = {'script', 'style', 'nav', 'header', 'footer', 'aside', 'noscript', 'iframe'}
    CONTENT_TAGS = {'p', 'article', 'section', 'div', 'li', 'h1', 'h2', 'h3', 'h4', 'blockquote'}
    
    def __init__(self):
        super().__init__()
        self.skip_depth = 0
        self.paragraphs = []
        self.current_text = []
        self.current_tag = None
    
    def handle_starttag(self, tag, attrs):
        if tag in self.SKIP_TAGS:
            self.skip_depth += 1
        self.current_tag = tag
    
    def handle_endtag(self, tag):
        if tag in self.SKIP_TAGS and self.skip_depth > 0:
            self.skip_depth -= 1
        if tag in ('p', 'div', 'section', 'article', 'li', 'h1', 'h2', 'h3', 'blockquote') and self.skip_depth == 0:
            text = ''.join(self.current_text).strip()
            if len(text) > 15:
                self.paragraphs.append(text)
            self.current_text = []
    
    def handle_data(self, data):
        if self.skip_depth == 0:
            self.current_text.append(data)
    
    def get_text(self):
        # 收尾
        text = ''.join(self.current_text).strip()
        if len(text) > 15:
            self.paragraphs.append(text)
        return '\n'.join(self.paragraphs)


def fetch_article(url, timeout=12):
    """抓取URL，返回清洗后的正文文本"""
    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": UA,
            "Accept": "text/html,application/xhtml+xml",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        })
        resp = urllib.request.urlopen(req, timeout=timeout)
        raw = resp.read()
        
        # 编码检测
        for enc in ['utf-8', 'gb18030', 'gbk']:
            try:
                html = raw.decode(enc)
                break
            except:
                continue
        else:
            html = raw.decode('utf-8', errors='replace')
        
        # 提取正文
        extractor = TextExtractor()
        try:
            extractor.feed(html)
        except:
            pass
        text = extractor.get_text()
        
        # 清理
        text = re.sub(r'\n{3,}', '\n\n', text)
        text = re.sub(r'&[a-z]+;', ' ', text)
        text = re.sub(r'&#\d+;', ' ', text)
        
        return text.strip()
    except Exception as e:
        return f"[抓取失败: {str(e)[:50]}]"


if __name__ == "__main__":
    # 测试
    test_urls = [
        ("量子位", "https://www.qbitai.com/2026/08/472208.html"),
    ]
    for name, url in test_urls:
        text = fetch_article(url)
        print(f"=== {name} ===")
        print(f"正文长度: {len(text)}")
        print(f"前500字:\n{text[:500]}")
        print()
