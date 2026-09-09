import feedparser, urllib.request
candidates = {
 "jiqizhixin_alt1":"https://www.jiqizhixin.com/rss/all.rss.xml",
 "jiqizhixin_alt2":"https://www.jiqizhixin.com/rss",
 "36kr_alt1":"https://36kr.com/feed",
 "36kr_alt2":"https://36kr.com/feed.xml",
 "36kr_atom":"https://36kr.com/feed.atom",
}
ua={"User-Agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"}
for k,u in candidates.items():
    try:
        req=urllib.request.Request(u, headers=ua)
        raw=urllib.request.urlopen(req, timeout=15).read()
        is_html = raw[:40].lstrip().lower().startswith(b"<!doctype") or raw[:20].lstrip().lower().startswith(b"<html")
        f=feedparser.parse(raw)
        print("%-22s %dB html=%s entries=%d" % (k, len(raw), is_html, len(f.entries)))
    except Exception as e:
        print("%-22s ERR %s" % (k, e))
