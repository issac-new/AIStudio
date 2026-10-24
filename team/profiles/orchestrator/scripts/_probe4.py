import feedparser
for name,url in [("qbitai","https://www.qbitai.com/feed"),("freebuf","https://www.freebuf.com/feed"),("hn","https://hnrss.org/frontpage")]:
    f=feedparser.parse(url)
    print("=== %s ===" % name)
    for e in f.entries[:3]:
        d = (getattr(e,'description','') or getattr(e,'summary','')).replace("\n"," ")
        print("  T:", e.title[:70])
        print("  D:", d[:200])
    print()
# arxiv full abstract sample
f=feedparser.parse("http://export.arxiv.org/rss/cs.AI")
print("=== arxiv sample ===")
for e in f.entries[:3]:
    d = getattr(e,'description','')
    print("  T:", e.title[:70])
    print("  D:", d[:280])
    print()
