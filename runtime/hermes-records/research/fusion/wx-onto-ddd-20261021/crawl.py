#!/usr/bin/env python3
"""WeChat corpus crawler - verified 2026-10-21. curl + js_content 标记切边法."""
import subprocess, re, html as H, json, sys, os, time

WS = "/Users/YOURNAME/.hermes/shared/research/wx-onto-ddd-20261021"

def curl(url, timeout=90):
    r = subprocess.run(["curl","-sL","--max-time",str(timeout),"-A",
     "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36", url],
     capture_output=True, text=True, timeout=timeout+15)
    return r.stdout

def extract(url):
    h = curl(url)
    t = re.search(r"var\s+msg_title\s*=\s*['\"]([^'\"]*)['\"]", h)
    if not ('js_content' in h) or '参数错误' in h:
        return {"url":url, "error":"no content", "bytes":len(h)}
    idx = h.find('id="js_content"')
    ends = [h.find(mk, idx) for mk in ['id="js_tags"','class="rich_media_tool','id="js_profile_qrcode"']]
    ends = [e for e in ends if e>0]
    end = min(ends) if ends else idx+500000
    seg = h[idx:end]
    seg = re.sub(r'<script[^>]*>.*?</script>','',seg,flags=re.DOTALL)
    text = re.sub(r'<[^>]+>','\n',seg)
    text = re.sub(r'\n{3,}','\n\n',text)
    text = H.unescape(text.strip())
    t = H.unescape(t.group(1)) if t else ''
    return {"url":url, "title":t, "len":len(text), "content":text}


def run(manifest_path, corpus_dir):
    import os as _os
    lock = manifest_path + ".lock"
    if _os.path.exists(lock):
        print("LOCKED: another crawler holds", lock, "- exit")
        return
    _os.makedirs(lock)
    try:
        _run_inner(manifest_path, corpus_dir)
    finally:
        import shutil as _shutil
        _shutil.rmtree(lock, ignore_errors=True)

def _run_inner(manifest_path, corpus_dir):
    manifest = json.load(open(manifest_path))
    done = {e.get("title") for e in manifest if e.get("status")=="ok"}
    for it in manifest:
        if it.get("status") == "ok":
            continue
        # slug: msgid-idx
        m = re.search(r'mid=(\d+)&idx=(\d+)', it["link"])
        slug = f'{m.group(1)}-{m.group(2)}' if m else re.sub(r'\W','_',it["title"])[:40]
        out_json = f"{corpus_dir}/{slug}.json"
        if os.path.exists(out_json) and os.path.getsize(out_json) > 3000:
            it["status"] = "ok"; it["file"] = out_json
            continue
        d = extract(it["link"].replace("#rd",""))
        if "error" in d:
            it["status"] = "fail"; it["error"] = d["error"]
        else:
            d["list_title"] = it["title"]
            json.dump(d, open(out_json,"w",encoding="utf-8"), ensure_ascii=False, indent=1)
            it["status"] = "ok"; it["file"] = out_json; it["chars"] = d["len"]
        json.dump(manifest, open(manifest_path,"w",encoding="utf-8"), ensure_ascii=False, indent=1)
        time.sleep(6)   # pacing: 6-10s/篇，防频控
        print(f'[{it["status"]}] {it["title"][:50]}')
    okn = sum(1 for e in manifest if e.get("status")=="ok")
    print(f"MANIFEST DONE: {okn}/{len(manifest)}")

if __name__ == "__main__":
    run(sys.argv[1], sys.argv[2])
