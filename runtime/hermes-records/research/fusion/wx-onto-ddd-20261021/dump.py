#!/usr/bin/env python3
"""按 slug 打印文章全文（标题+正文），供会话通读。用法: python3 dump.py <slug>... [--dir=corpus-ddd]"""
import json, sys, os
d = "corpus-onto"
args = sys.argv[1:]
if args and args[0].startswith("--dir="):
    d = args[0].split("=", 1)[1]; args = args[1:]
for slug in args:
    fp = os.path.join(d, slug + ".json")
    if not os.path.exists(fp):
        print(f"### {slug} MISSING"); continue
    a = json.load(open(fp))
    print(f"\n===== [{slug}] {a.get('title','')} (len={a.get('len')}) =====")
    c = a.get("content", "")
    # 去掉首行 js_content 残渣
    if c.startswith('id="js_content"'):
        c = c[c.find("\n") + 1:]
    print(c.strip())
