import feedparser
feeds = {
 "jiqizhixin":"https://www.jiqizhixin.com/rss",
 "qbitai":"https://www.qbitai.com/feed",
 "infoq":"https://www.infoq.cn/feed",
 "hn":"https://hnrss.org/frontpage",
 "arxiv":"http://export.arxiv.org/rss/cs.AI",
 "36kr":"https://36kr.com/feed",
 "freebuf":"https://www.freebuf.com/feed",
}
for k,u in feeds.items():
    f=feedparser.parse(u)
    print("=== %s (%d entries) ===" % (k, len(f.entries)))
    for e in f.entries[:2]:
        title = getattr(e,'title','')
        link = getattr(e,'link','')
        pub = getattr(e,'published', getattr(e,'updated',''))
        desc = getattr(e,'description','') or getattr(e,'summary','')
        print("  T: " + title[:90])
        print("  L: " + link[:90])
        print("  P: " + str(pub)[:50])
        print("  D: " + desc[:140].replace("\n"," "))
    print()
