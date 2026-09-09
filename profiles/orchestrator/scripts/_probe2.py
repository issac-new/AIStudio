import feedparser, urllib.request, gzip, io
for name, url in [("jiqizhixin","https://www.jiqizhixin.com/rss"), ("36kr","https://36kr.com/feed")]:
    print("=== %s ===" % name)
    ua={"User-Agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36", "Accept":"application/rss+xml,application/xml,text/xml,*/*"}
    req=urllib.request.Request(url, headers=ua)
    raw = urllib.request.urlopen(req, timeout=20).read()
    print("raw bytes:", len(raw), "head:", raw[:80])
    # try feedparser with raw bytes
    f = feedparser.parse(raw)
    print("entries from raw:", len(f.entries), "bozo:", f.bozo, "exc:", f.get("bozo_exception"))
    if f.entries:
        print("  first:", f.entries[0].title[:70])
    # try with response_headers
    f2 = feedparser.parse(url, request_headers=ua)
    print("entries from url+headers:", len(f2.entries), "bozo:", f2.bozo)
    print()
