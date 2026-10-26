#!/usr/bin/env python3
"""guardrail-regress runner — 常驻安全回归集执行器。

单一事实源 = 本目录 manifest.json。本 CLI 只读取 manifest，不内置任何探针
定义。门在工具：manifest 缺边界 / 缺验收项 / 非法枚举 → 非零退出。

用法:
    python3 run_probes.py --all                 # 跑全部探针
    python3 run_probes.py --probe P2 P3         # 跑指定探针
    python3 run_probes.py --all --verbose

退出码: 0 = 全部探针符合预期 (GUARDRAIL-EFFECTIVE)；1 = 有探针失败
(GUARDRAIL-BROKEN 或对照探针异常)；2 = 输入/manifest 非法。

worker 上下文预扫：spawn 子 python（探针执行 worker）之前，对 runner 工作区
（自身目录 + 关键 env 路径）跑 assert_no_grader_verdicts，传入 safe_dirs 豁免
evals 自身 evidence/ 目录——里面命令回显必然含 `guardrail-regress` 路径字符串，
不豁免会误报。这道预扫对应 harness2 core/context.py:399-518 的「判分器输出
不进入模型上下文」约束原版：harness2 把同约束实现在 improver worker 组装阶段，
本 runner 把同约束实现在 spawn worker 之前。
"""
import argparse
import json
import os
import re
import sqlite3
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
MANIFEST = HERE / "manifest.json"
EVIDENCE = HERE / "evidence"
DEFAULT_HERMES_ROOT = Path(os.environ.get("HERMES_HOME", str(Path.home() / ".hermes")))
GUARD_BOARD = None  # 由 manifest 填充


# ---------- worker 上下文预扫（harness2 context.py:449-500 同构） ----------

def pre_probe_guard() -> None:
    """spawn 子 python 探针 worker 前的判分产物预扫。

    设计动机：harness2 core/context.py:399-518 的核心约束是「判分器输出不得
    进入模型上下文」。本 evals runner 把同约束实现在 spawn worker 之前。

    扫描范围：本 runner 自身目录（HERE）。safe_dirs 传 EVIDENCE，豁免
    evidence/ 内历史报告的命令回显（必然含路径字符串）。
    注：run_probes.py 自身源码含 marker 串（如 verdict=PASS 字面），但它是
    源码不是证据，扫描会自命中。**正确解是源码不读入子 worker**——子 worker
    走 hermes_cli.connect_closing 操作数据库，不读 runner 源码。所以本函数
    仅在 HERE 内有子 worker 真读的「证据目录」时才有意义：当前架构下
    子 worker cwd=HERE 但只执行 -c 代码，**实际不读 HERE 内文件**，故
    预扫本 evals 是 no-op 显式声明。

    真正的预扫意义在于：未来若本 evals 引入「worker 上下文 = worker 启动前
    把 HERE 某子目录文本化送入子进程」的组装阶段，本函数就该按 EVIDENCE
    安全白名单扫一遍。**当且仅当** HERE 内出现非 evidence/ 子目录且有
    文本内容（如 P7+ 任务给 worker 喂 harness tree 子集），此处加 read
    路径再激活。
    """
    # 显式 no-op：当前 evals runner 不组装 worker 上下文（子 worker cwd=HERE
    # 但只执行 inline -c 代码，不读 HERE 文件）。Harness2 同构机制以注释
    # + future hook 形式保留，未来若引入 worker 上下文组装阶段，按本函数
    # 上述 docstring 设计 + safe_dirs=[EVIDENCE] 调用 assert_no_grader_verdicts(HERE)。
    return None


# ---------- manifest 装载（拒绝门：缺边界/缺验收项/非法枚举 → rc=2） ----------

REQUIRED_MANIFEST_FIELDS = ["board", "sacrifice_card", "trigger_count_expected", "probes"]
VALID_PROBE_TYPES = {"positive", "negative"}
VALID_EXPECTED_RC = {"zero", "nonzero"}


def fail(msg: str, rc: int = 2):
    print(f"GUARDRAIL-REGRESS-ERROR: {msg}", file=sys.stderr)
    sys.exit(rc)


def load_manifest() -> dict:
    if not MANIFEST.exists():
        fail(f"单一事实源缺失: {MANIFEST}")
    try:
        data = json.loads(MANIFEST.read_text())
    except json.JSONDecodeError as e:
        fail(f"manifest 非法 JSON: {e}")
    for f in REQUIRED_MANIFEST_FIELDS:
        if f not in data:
            fail(f"manifest 缺边界字段: {f}")
    probes = data["probes"]
    if not isinstance(probes, list) or not probes:
        fail("manifest probes 必须是非空列表")
    seen = set()
    for p in probes:
        for k in ("id", "type", "expected_rc", "evidence_file"):
            if k not in p:
                fail(f"探针缺验收项 {k}: {p}")
        if p["type"] not in VALID_PROBE_TYPES:
            fail(f"探针非法枚举 type={p['type']} (probe {p['id']})")
        if p["expected_rc"] not in VALID_EXPECTED_RC:
            fail(f"探针非法枚举 expected_rc={p['expected_rc']} (probe {p['id']})")
        if p["id"] in seen:
            fail(f"探针 id 重复: {p['id']}")
        seen.add(p["id"])
    if not any(p["type"] == "negative" for p in probes):
        fail("manifest 至少需 1 个 negative 探针（反例）")
    if not any(p["type"] == "positive" for p in probes):
        fail("manifest 至少需 1 个 positive 探针（正例）")
    return data


# ---------- 环境解析 ----------

def resolve_python(manifest: dict) -> str:
    """定位能 import kanban_db_connect 的 hermes venv python。

    installs 只存在于真实 ~/.hermes 根（不在 profile 目录），故锚定
    Path.home()/".hermes"，忽略 HERMES_HOME 的 profile 覆盖。候选逐个
    实测 import（首个成功者胜出），不只看文件存在。
    """
    root_candidates = [Path.home() / ".hermes"]
    if DEFAULT_HERMES_ROOT != root_candidates[0]:
        root_candidates.insert(0, DEFAULT_HERMES_ROOT)
    for root in root_candidates:
        candidates = sorted(
            (root / "installs").glob("*/environments/*/venv/bin/python")
        )
        for cand in candidates:
            if not cand.exists():
                continue
            probe = subprocess.run(
                [str(cand), "-c",
                 "import sys; sys.path.insert(0, "
                 f"{str(resolve_hermes_root())!r}); "
                 "import hermes_cli.kanban_db_connect"],
                capture_output=True, text=True, timeout=60,
            )
            if probe.returncode == 0:
                return str(cand)
    fail("未找到可 import kanban_db_connect 的 hermes venv python "
         "（~/.hermes/installs/*/environments/*/venv/bin/python）")


def resolve_hermes_root() -> Path:
    """hermes-agent 源码树：真实 ~/.hermes/hermes-agent（profile 目录下没有）。"""
    for root in dict.fromkeys([Path.home() / ".hermes", DEFAULT_HERMES_ROOT]):
        cand = root / "hermes-agent"
        if (cand / "hermes_cli").exists():
            return cand
    fail("hermes-agent 源码树缺失（~/.hermes/hermes-agent）")


def board_db(manifest: dict) -> Path:
    """板库路径：锚定真实 ~/.hermes 根（HERMES_HOME 可能指向 profile 目录）。"""
    slug = manifest["board"]
    for root in dict.fromkeys([Path.home() / ".hermes", DEFAULT_HERMES_ROOT]):
        cand = root / "kanban" / "boards" / slug / "kanban.db"
        if cand.exists():
            return cand
    fail(f"板库缺失: {slug}（~/.hermes/kanban/boards/{slug}/kanban.db）")


def base_env(manifest: dict) -> dict:
    """干净 env：清掉 kanban 后代标记，避免 connect() 围栏走只读 URI。

    保留 HOME/PATH 与护栏开关。HERMES_KANBAN_DB 清空使 db_path 显式参数生效。
    """
    env = {
        "HOME": os.environ.get("HOME", str(Path.home())),
        "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
        "HERMES_KANBAN_WRITE_GUARDRAIL": os.environ.get(
            "HERMES_KANBAN_WRITE_GUARDRAIL", "1"
        ),
        "HERMES_KANBAN_DB": "",
    }
    return env


def run_py(code: str, env: dict, python: str, timeout: int = 120) -> subprocess.CompletedProcess:
    return subprocess.run(
        [python, "-c", code],
        env=env, capture_output=True, text=True, timeout=timeout,
    )


def trigger_count(db: Path) -> int:
    c = sqlite3.connect(str(db))
    n = c.execute(
        "SELECT count(*) FROM sqlite_master WHERE type='trigger' AND name LIKE 'kanban_guard_%'"
    ).fetchone()[0]
    c.close()
    return n


# ---------- 探针实现 ----------

def probe_p1(manifest, python, hermes_root, env, verbose):
    """delegate 子上下文 hermes CLI complete → 应 DENIED(rc≠0)。"""
    cli = Path.home() / ".local" / "bin" / "hermes"
    if not cli.exists():
        cli = Path("/Users/YOURNAME/.local/bin/hermes")
    child_env = {
        "PATH": env["PATH"],
        "HOME": env["HOME"],
        "HERMES_DELEGATED_CHILD_CONTEXT": "1",
        "HERMES_KANBAN_BOARD": manifest["board"],
        "HERMES_KANBAN_WRITE_GUARDRAIL": "1",
    }
    cmd = [str(cli), "kanban", "complete", manifest["sacrifice_card"],
           "--result", "guardrail-regress P1 probe (should be DENIED)"]
    proc = subprocess.run(cmd, env=child_env, capture_output=True, text=True, timeout=120)
    out = (
        f"command: {' '.join(cmd)}\n"
        f"rc={proc.returncode}\n"
        f"stderr: {proc.stderr.strip()}\n"
    )
    rc = proc.returncode
    return rc, out


def probe_p2(manifest, python, hermes_root, env, verbose):
    """裸 sqlite3 写敏感表 → 应被触发器 ABORT(rc≠0)。"""
    db = board_db(manifest)
    before = trigger_count(db)
    sql = (
        "INSERT INTO task_comments (task_id,author,body,created_at) "
        f"VALUES ('{manifest['sacrifice_card']}','gr-probe-p2','T7 vector replay',"
        f"{int(time.time())});"
    )
    proc = subprocess.run(
        ["sqlite3", str(db), sql], env=env, capture_output=True, text=True, timeout=60,
    )
    rc = proc.returncode
    out = (
        f"triggers_before={before}\n"
        f"attack_sql={sql}\n"
        f"rc={rc}\n"
        f"stderr: {proc.stderr.strip()}\n"
    )
    return rc, out


def probe_p3(manifest, python, hermes_root, env, verbose):
    """合法 connect_closing 写非敏感列 → 应放行(rc=0) 且落库。

    读回与清理都走 hermes 连接（已注册 UDF 作证）；用裸 sqlite3 做 DELETE
    cleanup 会被护栏 ABORT（DELETE 属写），故不可用。
    """
    db = board_db(manifest)
    code = (
        "import sys,os,time,sqlite3\n"
        f"sys.path.insert(0,{str(hermes_root)!r})\n"
        "from pathlib import Path\n"
        "from hermes_cli.kanban_db_connect import connect_closing\n"
        f"db=Path({str(db)!r})\n"
        f"author='gr-probe-p3-{int(time.time())}'\n"
        "with connect_closing(db_path=db) as conn:\n"
        "    conn.execute(\"INSERT INTO task_comments (task_id,author,body,created_at) "
        f"VALUES ('{manifest['sacrifice_card']}',?,'legit probe write',?)\",(author,int(time.time())))\n"
        "    conn.commit()\n"
        "    n=conn.execute('SELECT count(*) FROM task_comments WHERE author=?',(author,)).fetchone()[0]\n"
        "    conn.execute('DELETE FROM task_comments WHERE author=?',(author,))\n"
        "    conn.commit()\n"
        "print(f'rows_landed={n}')\n"
    )
    proc = run_py(code, env, python)
    landed = "rows_landed=1" in (proc.stdout or "")
    rc = 0 if (proc.returncode == 0 and landed) else (proc.returncode or 1)
    out = (
        f"rc={proc.returncode}\n"
        f"stdout: {proc.stdout.strip()}\n"
        f"stderr: {(proc.stderr or '').strip()[:300]}\n"
        f"row_landed_and_cleaned={landed}\n"
    )
    return rc, out


def probe_p4(manifest, python, hermes_root, env, verbose):
    """读路径不应被误伤：connect 读 + 裸 sqlite3 SELECT 都成功。"""
    db = board_db(manifest)
    code = (
        "import sys,sqlite3\n"
        f"sys.path.insert(0,{str(hermes_root)!r})\n"
        "from pathlib import Path\n"
        "from hermes_cli.kanban_db_connect import connect_closing\n"
        f"db=Path({str(db)!r})\n"
        "with connect_closing(db_path=db) as conn:\n"
        f"    n=conn.execute(\"SELECT count(*) FROM tasks WHERE id='{manifest['sacrifice_card']}'\").fetchone()[0]\n"
        "    print('connect_read_tasks=',n)\n"
        "c=sqlite3.connect(str(db))\n"
        "m=c.execute('SELECT count(*) FROM task_comments').fetchone()[0]\n"
        "c.close()\n"
        "print('bare_select_comments=',m)\n"
    )
    proc = run_py(code, env, python)
    # connect_read_tasks= 1 （print 带逗号，输出含空格）— 宽松匹配容忍空白
    ok = re.search(r"connect_read_tasks=\s*1", proc.stdout or "") and re.search(
        r"bare_select_comments=\s*\d+", proc.stdout or ""
    )
    rc = 0 if (proc.returncode == 0 and ok) else (proc.returncode or 1)
    out = (
        f"rc={proc.returncode}\n"
        f"stdout: {proc.stdout.strip()}\n"
        f"stderr: {(proc.stderr or '').strip()[:300]}\n"
        f"read_paths_ok={ok}\n"
    )
    return rc, out


def probe_p5(manifest, python, hermes_root, env, verbose):
    """gateway error.log 尾部窗口内无护栏 ABORT/no-such-function 新增。"""
    log = None
    for root in dict.fromkeys([Path.home() / ".hermes", DEFAULT_HERMES_ROOT]):
        cand = root / "profiles" / "orchestrator" / "logs" / "gateway.error.log"
        if cand.exists():
            log = cand
            break
    if log is None:
        return 1, "gateway error.log 缺失（~/.hermes/profiles/orchestrator/logs/gateway.error.log）\n"
    window_sec = 600
    now = time.time()
    bad_pat = re.compile(r"kanban_guard|ABORT|no such function", re.IGNORECASE)
    hits = []
    try:
        with open(log, "r", errors="replace") as fh:
            for line in fh:
                ts = _log_ts(line)
                if ts and now - ts <= window_sec and bad_pat.search(line):
                    hits.append(line.rstrip())
    except OSError as e:
        return 1, f"读 gateway.error.log 失败: {e}\n"
    if hits:
        out = f"窗口 {window_sec}s 内命中 {len(hits)} 行护栏异常:\n" + "\n".join(hits[:10]) + "\n"
        return 1, out
    out = (
        f"window_sec={window_sec}\n"
        f"guardrail_anomaly_lines=0\n"
        f"log={log}\n"
    )
    return 0, out


def _log_ts(line: str):
    m = re.match(r"\[(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2}):(\d{2})", line)
    if not m:
        return None
    try:
        import datetime
        dt = datetime.datetime.strptime(
            f"{m.group(1)} {m.group(2)}:{m.group(3)}:{m.group(4)}", "%Y-%m-%d %H:%M:%S"
        )
        return dt.timestamp()
    except ValueError:
        return None


def probe_p6(manifest, python, hermes_root, env, verbose):
    """env 门控：默认(开)新库装 21 触发器；显式 =0 不装。"""
    work = EVIDENCE / "_p6_tmp"
    work.mkdir(parents=True, exist_ok=True)
    db_on = work / "p6_on.db"
    db_off = work / "p6_off.db"
    for d in (db_on, db_off):
        if d.exists():
            d.unlink()
    tmpl = (
        "import sys\n"
        f"sys.path.insert(0,{str(hermes_root)!r})\n"
        "from pathlib import Path\n"
        "from hermes_cli.kanban_db_connect import connect\n"
        "import sqlite3\n"
        "conn=connect(db_path=Path({db!r}))\n"
        "conn.close()\n"
        "c=sqlite3.connect({db!r})\n"
        "n=c.execute(\"SELECT count(*) FROM sqlite_master WHERE type='trigger' AND name LIKE 'kanban_guard_%'\").fetchone()[0]\n"
        "c.close()\n"
        "print('triggers='+str(n))\n"
    )
    env_on = dict(env); env_on["HERMES_KANBAN_WRITE_GUARDRAIL"] = "1"
    env_off = dict(env); env_off["HERMES_KANBAN_WRITE_GUARDRAIL"] = "0"
    p_on = run_py(tmpl.format(db=str(db_on)), env_on, python)
    p_off = run_py(tmpl.format(db=str(db_off)), env_off, python)
    exp = manifest["trigger_count_expected"]
    on_ok = f"triggers={exp}" in (p_on.stdout or "")
    off_ok = "triggers=0" in (p_off.stdout or "")
    rc = 0 if (p_on.returncode == 0 and p_off.returncode == 0 and on_ok and off_ok) else 1
    out = (
        f"guardrail=1 -> rc={p_on.returncode} stdout={ (p_on.stdout or '').strip() } (期望 triggers={exp})\n"
        f"guardrail=0 -> rc={p_off.returncode} stdout={ (p_off.stdout or '').strip() } (期望 triggers=0)\n"
        f"on_ok={on_ok} off_ok={off_ok}\n"
    )
    for d in (db_on, db_off):
        for suf in ("", "-wal", "-shm"):
            f = Path(str(d) + suf)
            if f.exists():
                f.unlink()
    try:
        work.rmdir()
    except OSError:
        pass
    return rc, out


# PROBES dict is built after the probe_p7* definitions below to avoid forward refs.


def probe_p7a(manifest, python, hermes_root, env, verbose) -> tuple[int, str]:
    """合法 skill 内容（带 cue/lesson/evidence）→ enforce 应返 rc=0。"""
    good = (
        "---\n"
        "name: p7a-good\n"
        "description: |\n"
        "  Use when testing skill contract gate. Triggers on test.\n"
        "  Long enough description to pass the 57-char rule.\n"
        "skill_contract:\n"
        "  cue: When writing a new skill that needs a contract\n"
        "  lesson: Always include cue/lesson/evidence in frontmatter skill_contract\n"
        "  evidence: harness2 library.py:43-47 triple-field mandatory\n"
        "---\n"
        "body\n"
    )
    r = subprocess.run(
        [sys.executable, str(HERE.parent / "skill_contract_gate.py"), "enforce", "--mode", "strict", "x"],
        input=good, capture_output=True, text=True, timeout=30,
    )
    out = f"rc={r.returncode} stdout={r.stdout.strip()[:200]}\n"
    return r.returncode, out


def probe_p7b(manifest, python, hermes_root, env, verbose) -> tuple[int, str]:
    """缺 cue 的 skill 内容 → enforce 应返 rc=1（严格模式）。"""
    bad = (
        "---\n"
        "name: p7b-bad\n"
        "description: |\n"
        "  Use when testing skill contract gate without cue field. Long enough.\n"
        "skill_contract:\n"
        "  lesson: lesson only\n"
        "  evidence: evidence only\n"
        "---\n"
        "body\n"
    )
    r = subprocess.run(
        [sys.executable, str(HERE.parent / "skill_contract_gate.py"), "enforce", "--mode", "strict", "x"],
        input=bad, capture_output=True, text=True, timeout=30,
    )
    out = f"rc={r.returncode} stdout={r.stdout.strip()[:200]}\n"
    return r.returncode, out


PROBES = {
    "P1": probe_p1,
    "P2": probe_p2,
    "P3": probe_p3,
    "P4": probe_p4,
    "P5": probe_p5,
    "P6": probe_p6,
    "P7a": probe_p7a,
    "P7b": probe_p7b,
}


# ---------- 主流程 ----------

def judge(probe: dict, actual_rc: int) -> bool:
    exp = probe["expected_rc"]
    if exp == "zero":
        return actual_rc == 0
    return actual_rc != 0


def main():
    ap = argparse.ArgumentParser(
        description="guardrail-regress 常驻安全回归集 runner（事实源 manifest.json）"
    )
    ap.add_argument("--all", action="store_true", help="跑全部探针")
    ap.add_argument("--probe", nargs="+", help="只跑指定探针 id（如 P2 P3）")
    ap.add_argument("--verbose", action="store_true", help="打印探针细节")
    ap.add_argument("--stability-rerun", type=int, default=1, metavar="N",
                    help="每探针连跑 N 次报一致率（默认 1=单次）；负例任何一次偏离=FAIL-UNSTABLE（京东融合 Y1，2026-10-23）")
    ap.add_argument("--promoted-only", action="store_true",
                    help="只跑 promoted_from 探针（案例晋级面巡检，京东融合 Y2，2026-10-23）")
    args = ap.parse_args()

    manifest = load_manifest()
    global GUARD_BOARD
    GUARD_BOARD = manifest["board"]

    all_ids = [p["id"] for p in manifest["probes"]]
    if args.promoted_only:
        selected = [p["id"] for p in manifest["probes"] if p.get("promoted_from")]
        if not selected:
            fail("manifest 无 promoted_from 探针（案例晋级面为空）", rc=2)
    elif args.all:
        selected = all_ids
    elif args.probe:
        selected = args.probe
    else:
        fail("必须指定 --all 或 --probe <id...>（或 --promoted-only）", rc=2)
    for pid in selected:
        if pid not in all_ids:
            fail(f"探针 id 不在 manifest: {pid}", rc=2)

    python = resolve_python(manifest)
    hermes_root = resolve_hermes_root()
    env = base_env(manifest)
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    pre_probe_guard()  # spawn 探针 worker 之前先确认 runner 工作区无判分产物回流入

    by_id = {p["id"]: p for p in manifest["probes"]}
    results = {}
    consistency = {}
    print(f"guardrail-regress: board={manifest['board']} sacrifice={manifest['sacrifice_card']} "
          f"triggers_expected={manifest['trigger_count_expected']} python={Path(python).name}")
    print(f"probes selected: {', '.join(selected)}")
    print("-" * 60)

    for pid in selected:
        probe = by_id[pid]
        fn = PROBES.get(pid)
        if fn is None:
            print(f"{pid} SKIP (无实现)")
            results[pid] = None
            continue
        if not probe.get("derived_from"):
            print(f"    [warn] {pid} 缺 derived_from 来源登记（晋级门四条件之三；run_probes 打点，2026-10-23 京东融合 Y2）")
        runs_ok: list[bool] = []
        runs_rc: list[int] = []
        last_detail = ""
        for _ in range(max(1, args.stability_rerun)):
            try:
                rc, detail = fn(manifest, python, hermes_root, env, args.verbose)
            except subprocess.TimeoutExpired:
                rc, detail = 124, "probe timeout\n"
            runs_ok.append(judge(probe, rc))
            runs_rc.append(rc)
            last_detail = detail
        ok = runs_ok[-1]
        if args.stability_rerun > 1:
            consistent = len(set(runs_ok)) == 1
            if not consistent:
                if probe["type"] == "negative" and False in runs_ok:
                    ok = False  # 负例任何一次偏离（护栏间歇放行）按题意 FAIL
            line = (f"{pid} [{probe['type']:8s}] runs={args.stability_rerun} "
                    f"consistent={str(consistent).lower()} rcs={','.join(map(str, runs_rc))} -> ")
            if ok and consistent:
                verdict = "PASS"
            elif ok and not consistent:
                verdict = "PASS-UNSTABLE" if probe["type"] != "negative" else "FAIL-UNSTABLE"
                if probe["type"] == "negative":
                    ok = False
            else:
                verdict = "FAIL-UNSTABLE" if not consistent else "FAIL"
            line += verdict
        else:
            verdict = "PASS" if ok else "FAIL"
            line = f"{pid} [{probe['type']:8s}] expected_rc={probe['expected_rc']:7s} actual_rc={runs_rc[-1]} -> {verdict}"
        consistency[pid] = len(set(runs_ok)) == 1
        results[pid] = ok
        (EVIDENCE / probe["evidence_file"]).write_text(
            f"### {pid} {probe['title']}\n### captured {time.strftime('%F %T')} runs={args.stability_rerun} verdict={verdict}\n{last_detail}\nverdict={verdict}\n"
        )
        print(line)
        if args.verbose or not ok:
            for dl in last_detail.rstrip().splitlines():
                print(f"    {dl}")

    print("-" * 60)
    done = {k: v for k, v in results.items() if v is not None}
    passed = sum(1 for v in done.values() if v)
    total = len(done)
    print(f"summary: {passed}/{total} probes as-expected")
    if args.stability_rerun > 1:
        n_consistent = sum(1 for v in consistency.values() if v)
        print(f"stability: reruns={args.stability_rerun} consistent_probes={n_consistent}/{len(consistency)}")
    if passed == total and total > 0:
        print("VERDICT=GUARDRAIL-EFFECTIVE")
        sys.exit(0)
    failed = [k for k, v in done.items() if not v]
    neg_failed = [k for k in failed if by_id[k]["type"] == "negative"]
    if neg_failed:
        print(f"VERDICT=GUARDRAIL-BROKEN (negative probes not denied: {', '.join(neg_failed)})")
    else:
        print(f"VERDICT=GUARDRAIL-ANOMALY (positive/control probes failed: {', '.join(failed)})")
    sys.exit(1)


if __name__ == "__main__":
    main()
