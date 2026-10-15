#!/usr/bin/env python3
"""sim hermes 垫片·无板聚合器（2026-10-15 root-cure：产品巡检官卡类采集面依赖
boardless `kanban list`，sim CLI 无板形态是状态相关空态——垫片在此归一为
确定性全板聚合。60s 文件缓存 + 板级并行（单次 execFile 30s 超时内完成）。
其余子命令原样透传 bin/hermes-sim。"""
import json, os, stat, subprocess, sys, time
from concurrent.futures import ThreadPoolExecutor

REAL = "/Volumes/nvme2230/lab/ncwk-sim-mux/bin/hermes-sim"
CACHE = "/tmp/hermes-shim-cache." + str(os.getuid())

def run(args):
    return subprocess.run([REAL] + args, capture_output=True, text=True, timeout=25)

def boardless_list(argv):
    status = None
    if "--status" in argv:
        i = argv.index("--status")
        if i + 1 < len(argv):
            status = argv[i + 1]
    os.makedirs(CACHE, exist_ok=True)
    key = status or "all"
    out = os.path.join(CACHE, f"list.{key}.json")
    if os.path.exists(out) and time.time() - os.path.getmtime(out) < 60:
        cached = open(out).read()
        if cached.startswith("["):  # 坏/空缓存（并发截断遗物）当 miss 重算
            sys.stdout.write(cached)
            return 0
    boards = subprocess.run([REAL, "kanban", "boards", "list"], capture_output=True, text=True, timeout=20).stdout
    slugs = [ln.split()[0] for ln in boards.splitlines()[2:] if ln.strip()]
    def one(b):
        args = ["kanban", "--board", b, "list"]
        if status:
            args += ["--status", status]
        args += ["--json"]
        try:
            r = run(args)
            return json.loads(r.stdout) if r.stdout.strip() else []
        except Exception:
            return []
    merged = []
    with ThreadPoolExecutor(max_workers=6) as ex:
        futs = {ex.submit(one, b): b for b in slugs}
        for f, b in futs.items():
            for c in f.result():
                c["_board"] = b
                merged.append(c)
    payload = json.dumps(merged, ensure_ascii=False)
    tmp = f"{out}.{os.getpid()}.tmp"
    with open(tmp, "w") as f:
        f.write(payload)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, out)
    sys.stdout.write(payload)
    return 0

def main():
    argv = sys.argv[1:]
    if len(argv) >= 2 and argv[0] == "kanban" and argv[1] == "list" and "--board" not in argv:
        return boardless_list(argv[2:])
    sys.exit(subprocess.run([REAL] + argv).returncode)

if __name__ == "__main__":
    main()
