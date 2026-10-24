#!/usr/bin/env python3
"""ontology-cq-regression.py — ontology.md §六 15 问能力问题（CQ）季度回归测试

来源: kanban t_66d1140b (P1-3), ontology.md v1.3+ §六 (Grüninger & Fox TOVE 1995)
方法: 逐条 CQ 翻译为 SQL/grep/python 机械查询；每问输出 PASS/GAP/PARTIAL + 证据。
      答不出的 CQ 记录到 stdout 报告（--write-ledger 时附 4 字段 intervention yaml 块，
      供人工/调用方挂 kanban_comment，遵循 intervention-ledger.md 最小子集 schema）。
纪律: 所有 kanban DB 只读查询用 immutable=1（sqlite WAL 模式纪律）。零架构改动。
用法: ontology-cq-regression.py [--json] [--write-ledger] [--days N]
退出码: 0 = 15/15 PASS；1 = 存在 GAP/PARTIAL（供 cron no_agent 模式告警）。
"""
import argparse, glob, json, os, re, sqlite3, subprocess, sys, time
from pathlib import Path

HOME = Path.home()
BOARDS_DIR = HOME / ".hermes" / "kanban" / "boards"
PROFILES_DIR = HOME / ".hermes" / "profiles"
SHARED = PROFILES_DIR / "_shared"
ONTOLOGY = SHARED / "02-org-orchestration" / "ontology.md"
BIN = HOME / ".hermes" / "bin"
DAY = 86400

def now(): return int(time.time())

def boards():
    return sorted(p.parent.name for p in BOARDS_DIR.glob("*/kanban.db") if p.is_file())

def dbq(board, sql, args=()):
    """immutable read-only query against one board's kanban.db."""
    uri = f"file:{BOARDS_DIR/board/'kanban.db'}?immutable=1"
    con = sqlite3.connect(uri, uri=True)
    try:
        return con.execute(sql, args).fetchall()
    finally:
        con.close()

def table_cols(board, table):
    return {r[1] for r in dbq(board, f"PRAGMA table_info({table})")}

def grep_files(pattern, paths_glob, flags=0):
    """Return list of files whose content matches regex."""
    hits = []
    for f in glob.glob(str(paths_glob)):
        try:
            txt = Path(f).read_text(errors="replace")
        except OSError:
            continue
        if re.search(pattern, txt, flags):
            hits.append(f)
    return hits

def soul_files():
    return [p for p in PROFILES_DIR.glob("*/SOUL.md") if p.parent.name != "_shared"]

R = {}  # results: cq -> dict(status, evidence, detail)

def rec(cq, status, evidence, detail=""):
    R[cq] = {"status": status, "evidence": evidence, "detail": detail}

# ---------- CQ1: 哪些 profile 有权限处理带 PII 标记的任务？ ----------
def cq1():
    need = "PII"
    ok, lacking = [], []
    for cfg in PROFILES_DIR.glob("*/config.yaml"):
        prof = cfg.parent.name
        if prof == "_shared":
            continue
        txt = cfg.read_text(errors="replace")
        m = re.search(r"^clearances\s*:\s*(.+)$", txt, re.M)
        if not m:
            lacking.append(prof + "(no clearances)")
            continue
        if need in m.group(1):
            ok.append(prof)
        else:
            lacking.append(prof)
    if not ok:
        rec("CQ1", "GAP", f"无 profile 的 clearances 含 {need}", "ontology 定义 PII marking 但无 profile 可处理")
    elif lacking:
        rec("CQ1", "PASS",
            f"{len(ok)} profile 可处理 PII: {', '.join(ok)}; {len(lacking)} 不可: {', '.join(lacking[:6])}{'...' if len(lacking)>6 else ''}")
    else:
        rec("CQ1", "PASS", f"全部 {len(ok)} profile clearances 均含 {need}")

# ---------- CQ2: 任务 X 派生出的所有下游任务（传递闭包）？ ----------
def cq2():
    # 机制验证：task_links 存在且可递归传递闭包（用任一实际 parent 演示）
    total_links, boards_with = 0, []
    demo = None
    for b in boards():
        try:
            n = dbq(b, "SELECT COUNT(*) FROM task_links")[0][0]
        except sqlite3.Error:
            continue
        total_links += n
        if n:
            boards_with.append(f"{b}({n})")
            if demo is None:
                demo = (b, dbq(b, "SELECT parent_id, COUNT(*) c FROM task_links GROUP BY parent_id ORDER BY c DESC LIMIT 1")[0][0])
    if total_links == 0:
        rec("CQ2", "GAP", "task_links 表全集群为空", "无父子依赖数据可算闭包")
        return
    # 递归闭包演示
    b, root = demo
    seen, frontier = set(), [root]
    while frontier:
        nxt = []
        for p in frontier:
            if p in seen: continue
            seen.add(p)
            nxt += [r[0] for r in dbq(b, "SELECT child_id FROM task_links WHERE parent_id=?", (p,))]
        frontier = nxt
    rec("CQ2", "PASS",
        f"task_links 共 {total_links} 条 ({', '.join(boards_with[:5])}); 演示: board={b} root={root} 传递闭包={len(seen)} 个任务")

# ---------- CQ3: profile Y 当前在哪些 board 上有 running 任务？ ----------
def cq3():
    rows = []
    for b in boards():
        try:
            rows += [(b, r[0], r[1]) for r in dbq(
                b, "SELECT assignee, COUNT(*) FROM tasks WHERE status='running' GROUP BY assignee")]
        except sqlite3.Error:
            pass
    if not rows:
        rec("CQ3", "PASS", "当前全集群无 running 任务（查询机制可答：按 assignee×board 聚合 running）")
    else:
        ev = "; ".join(f"{a} @ {b}: {n}" for b, a, n in rows[:8])
        rec("CQ3", "PASS", f"{len(rows)} 个 assignee×board running 组合: {ev}")

# ---------- CQ4: 某 Artifact 的 markings 是什么、从哪里继承的？ ----------
def cq4():
    # Artifact 一等载体 = task_attachments + kanban_complete metadata 的 artifacts_produced
    try:
        n_att = sum(dbq(b, "SELECT COUNT(*) FROM task_attachments")[0][0] for b in boards())
    except sqlite3.Error:
        n_att = 0
    att_cols = table_cols(boards()[0], "task_attachments") if boards() else set()
    has_markings = "markings" in att_cols
    # metadata 通道：task_runs.metadata JSON 反查 artifacts_produced + markings
    n_art, n_marked = 0, 0
    for b in boards():
        try:
            rows = dbq(b, "SELECT metadata FROM task_runs WHERE metadata IS NOT NULL")
        except sqlite3.Error:
            continue
        for (m,) in rows:
            if not m or "artifacts_produced" not in m: continue
            try: md = json.loads(m)
            except (ValueError, TypeError): continue
            for a in md.get("artifacts_produced") or []:
                n_art += 1
                if isinstance(a, dict) and a.get("markings"): n_marked += 1
    ev = f"task_attachments {n_att} 行(markings列={'有' if has_markings else '无'}); task_runs.metadata 中 artifacts_produced {n_art} 条, 带 markings {n_marked} 条"
    if n_art == 0 and n_att == 0:
        rec("CQ4", "GAP", ev, "无任何 Artifact 实例可查 markings 继承")
    elif n_art and n_marked == 0:
        rec("CQ4", "PARTIAL", ev, "Artifact 存在但均未带 markings，继承链不可查")
    else:
        rec("CQ4", "PASS", ev)

# ---------- CQ5: 谁批准了决策 D、基于哪些证据？ ----------
def cq5():
    n_dec, n_full = 0, 0
    for b in boards():
        try:
            rows = dbq(b, "SELECT metadata FROM task_runs WHERE metadata IS NOT NULL")
        except sqlite3.Error:
            continue
        for (m,) in rows:
            if not m or '"decisions"' not in m: continue
            try: md = json.loads(m)
            except (ValueError, TypeError): continue
            for d in md.get("decisions") or []:
                if not isinstance(d, dict): continue
                n_dec += 1
                if d.get("decided_by") and d.get("rationale"): n_full += 1
    if n_dec == 0:
        rec("CQ5", "GAP", "task_runs.metadata 中无 decisions 对象实例", "Decision 对象类型有一等定义但无一等存储")
    else:
        st = "PASS" if n_full == n_dec else "PARTIAL"
        rec("CQ5", st, f"decisions {n_dec} 条, decided_by+rationale 齐全 {n_full} 条",
            "" if st == "PASS" else "部分 Decision 缺 decided_by/rationale")

# ---------- CQ6: 流程 P 从触发到交付用了多久、瓶颈在哪个阶段？ ----------
def cq6():
    # Process/value_chain_stage 无一等存储；用 tasks 生命周期阶段耗时近似（created→started→completed）
    stage_rows = []
    for b in boards():
        try:
            stage_rows += [(b,) + r for r in dbq(b, """
                SELECT COUNT(*),
                       AVG(CASE WHEN started_at IS NOT NULL THEN started_at-created_at END),
                       AVG(CASE WHEN completed_at IS NOT NULL AND started_at IS NOT NULL THEN completed_at-started_at END)
                FROM tasks WHERE created_at > ?""", (now() - 90*DAY,))]
        except sqlite3.Error:
            pass
    tot = sum(r[1] or 0 for r in stage_rows)
    if tot == 0:
        rec("CQ6", "GAP", "近 90 天无任务", "无数据可算阶段耗时")
        return
    waits = [r[2] for r in stage_rows if r[2]]
    runs = [r[3] for r in stage_rows if r[3]]
    ev = f"近90天 {tot} 任务; 平均排队 {sum(waits)/len(waits)/3600:.1f}h, 平均执行 {sum(runs)/len(runs)/3600:.1f}h" if waits and runs else f"近90天 {tot} 任务但阶段时间戳不全"
    rec("CQ6", "PARTIAL", ev,
        "可算任务级阶段耗时近似，但 Process 对象/value_chain_stage/baseline_metrics 无落地——瓶颈定位到『流程阶段』粒度不可答")

# ---------- CQ7: 过去 7 天每 board 的任务吞吐量？ ----------
def cq7(days):
    rows = []
    for b in boards():
        try:
            n = dbq(b, "SELECT COUNT(*) FROM tasks WHERE completed_at IS NOT NULL AND completed_at > ?",
                    (now() - days*DAY,))[0][0]
        except sqlite3.Error:
            n = 0
        rows.append((b, n))
    rec("CQ7", "PASS", f"近 {days} 天完成: " + ", ".join(f"{b}={n}" for b, n in rows))

# ---------- CQ8: 哪些任务被阻塞超过 24 小时、被谁阻塞？ ----------
def cq8():
    long_blocked, total_blocked = [], 0
    for b in boards():
        try:
            rows = dbq(b, "SELECT id, title, assignee FROM tasks WHERE status='blocked'")
        except sqlite3.Error:
            continue
        total_blocked += len(rows)
        for tid, title, assignee in rows:
            try:
                ev = dbq(b, "SELECT MIN(created_at) FROM task_events WHERE task_id=? AND kind IN ('blocked','unblocked')", (tid,))
            except sqlite3.Error:
                ev = [(None,)]
            # 最近一次 blocked 事件
            try:
                last = dbq(b, "SELECT kind, created_at FROM task_events WHERE task_id=? AND kind IN ('blocked','unblocked') ORDER BY created_at DESC LIMIT 1", (tid,))
            except sqlite3.Error:
                last = []
            if last and last[0][0] == 'blocked' and now() - last[0][1] > DAY:
                # 被谁阻塞：task_links 反查未完成 parent
                parents = dbq(b, """SELECT l.parent_id, t.status FROM task_links l
                                    LEFT JOIN tasks t ON t.id=l.parent_id WHERE l.child_id=?""", (tid,))
                blockers = [f"{p}({s})" for p, s in parents if s != 'done']
                long_blocked.append(f"{b}/{tid}[{assignee}] 阻塞 {(now()-last[0][1])//3600}h" +
                                    (f" 被 {', '.join(blockers)}" if blockers else " 无未完成parent(人工阻塞)"))
    ev = f"当前 blocked 任务 {total_blocked} 个; 其中 >24h: {len(long_blocked)} 个"
    if long_blocked:
        ev += ": " + "; ".join(long_blocked[:5])
    rec("CQ8", "PASS", ev)

# ---------- CQ9: 某 Process 失败后返工了几次？ ----------
def cq9():
    # task_events 中 completed→ready 回退计数（v1.3 修正后的事实源）
    rework = []
    for b in boards():
        try:
            rows = dbq(b, """
                SELECT task_id, kind, created_at FROM task_events
                WHERE kind IN ('completed','promoted','unblocked') ORDER BY task_id, created_at""")
        except sqlite3.Error:
            continue
        # 简化近似：同一 task 出现 >=2 次 promoted/ready 类事件且其间有完成态事件
        by_task = {}
        for tid, kind, ts in rows:
            by_task.setdefault(tid, []).append(kind)
        for tid, kinds in by_task.items():
            n = kinds.count('promoted')
            if n >= 2:
                rework.append(f"{b}/{tid}(promoted×{n})")
    if not rework:
        rec("CQ9", "PASS", "task_events 全集群扫描：无 completed→ready 多次回退的任务（返工 0 次，机制可答）")
    else:
        rec("CQ9", "PASS", f"检测到 {len(rework)} 个疑似返工任务: " + "; ".join(rework[:5]))

# ---------- CQ10: Finding F 的证据链完整吗？ ----------
def cq10():
    n_f, n_ev, n_broken = 0, 0, 0
    for b in boards():
        try:
            rows = dbq(b, "SELECT metadata FROM task_runs WHERE metadata IS NOT NULL")
        except sqlite3.Error:
            continue
        for (m,) in rows:
            if not m or '"findings"' not in m: continue
            try: md = json.loads(m)
            except (ValueError, TypeError): continue
            for f in md.get("findings") or []:
                if not isinstance(f, dict): continue
                n_f += 1
                ev = f.get("evidence") or f.get("source")
                if ev:
                    n_ev += 1
                    # 若 evidence 形如路径，验证存在
                    if isinstance(ev, str) and ("/" in ev) and not ev.startswith("http"):
                        p = Path(os.path.expanduser(ev))
                        if not p.exists(): n_broken += 1
    if n_f == 0:
        rec("CQ10", "GAP", "task_runs.metadata 中无 findings 实例", "Finding 对象无落地实例")
    else:
        st = "PASS" if n_broken == 0 and n_ev == n_f else "PARTIAL"
        rec("CQ10", st, f"findings {n_f} 条, 带 evidence/source {n_ev} 条, 路径类证据失效 {n_broken} 条",
            "" if st == "PASS" else "存在缺证据或证据路径失效的 Finding")

# ---------- CQ11: verification 字段覆盖率和证据强度分布？ ----------
def cq11():
    has_meta = "metadata" in table_cols(boards()[0], "tasks") if boards() else False
    if not has_meta:
        # 降级：task_runs.metadata 里有无 verification 键
        n_runs, n_ver = 0, 0
        for b in boards():
            try:
                rows = dbq(b, "SELECT metadata FROM task_runs WHERE metadata IS NOT NULL")
            except sqlite3.Error:
                continue
            for (m,) in rows:
                if not m: continue
                n_runs += 1
                if '"verification"' in m: n_ver += 1
        rec("CQ11", "GAP",
            f"tasks 表无 metadata 一等列（阻塞于 P1-1, swarm t_37053748）; task_runs.metadata 兜底扫描: {n_runs} 条含 metadata, 其中带 verification 键 {n_ver} 条",
            "按验收标准标 GAP 并注明阻塞于 P1-1，不绕过")
    else:
        rec("CQ11", "PASS", "tasks.metadata 列存在")

# ---------- CQ12: 哪些 Finding 被多个 worker 独立发现（同一性合并）？ ----------
def cq12():
    # 同一性判定需要 Finding.evidence 链比对（ontology v1.3 已补 Finding.evidence 字段定义）
    # 机械降级：按 (board 无关) description 归一化后跨 task_runs 查重
    seen = {}
    for b in boards():
        try:
            rows = dbq(b, "SELECT task_id, metadata FROM task_runs WHERE metadata IS NOT NULL")
        except sqlite3.Error:
            continue
        for tid, m in rows:
            if not m or '"findings"' not in m: continue
            try: md = json.loads(m)
            except (ValueError, TypeError): continue
            for f in md.get("findings") or []:
                if not isinstance(f, dict): continue
                key = re.sub(r"\W+", "", (f.get("description") or ""))[:80]
                if key:
                    seen.setdefault(key, set()).add(f"{b}/{tid}")
    dups = {k: v for k, v in seen.items() if len(v) > 1}
    total_f = sum(len(v) for v in seen.values())
    if total_f == 0:
        rec("CQ12", "GAP", "无 Finding 实例可做同一性比对", "与 CQ10 同根因：Finding 无一等存储")
    else:
        rec("CQ12", "PASS" if not dups else "PARTIAL",
            f"Finding {total_f} 条, 描述归一化后跨任务重复 {len(dups)} 组" +
            (": " + "; ".join(f"{k[:30]}→{sorted(v)[:3]}" for k, v in list(dups.items())[:3]) if dups else ""),
            "注：description 文本匹配是降级近似，严格同一性需 evidence 链比对")

# ---------- CQ13: 某任务的验收标准是什么、执行中是否被修改过？ ----------
def cq13():
    n_frozen, n_tasks, n_edited = 0, 0, 0
    for b in boards():
        try:
            rows = dbq(b, "SELECT id, body FROM tasks WHERE body LIKE '%验收标准%'")
        except sqlite3.Error:
            continue
        for tid, body in rows:
            n_tasks += 1
            if body and "frozen" in body.lower(): n_frozen += 1
            try:
                evs = dbq(b, "SELECT COUNT(*) FROM task_events WHERE task_id=? AND kind='updated'", (tid,))[0][0]
            except sqlite3.Error:
                evs = 0
            if evs: n_edited += 1
    if n_tasks == 0:
        rec("CQ13", "PARTIAL", "无任务 body 含『验收标准』段", "验收标准契约依赖 body 文本约定，无结构化 frozen 标志列")
    else:
        rec("CQ13", "PASS" if n_frozen else "PARTIAL",
            f"含验收标准任务 {n_tasks} 个, 标注 frozen {n_frozen} 个, 存在 updated 事件 {n_edited} 个",
            "frozen 判定靠 body 文本约定（frozen: true），非结构化字段")

# ---------- CQ14: 规则 R 被多少 profile 引用、哪些 profile 缺引用？ ----------
def cq14():
    audit = BIN / "audit-soul-rules.sh"
    souls = soul_files()
    ont_hits = grep_files(r"ontology\.md", PROFILES_DIR / "*/SOUL.md")
    missing = [p.parent.name for p in souls if str(p) not in ont_hits]
    rec("CQ14", "PASS",
        f"ontology.md 引用覆盖: {len(ont_hits)}/{len(souls)} SOUL.md; 缺引用: {', '.join(missing) if missing else '无'}; 复用脚本 {audit.name}({'存在' if audit.exists() else '缺失'})")

# ---------- CQ15: 哪些 skill 是零引用/90 天未更新？ ----------
def cq15():
    script = BIN / "skill-health-audit.sh"
    skills = list((HOME / ".hermes" / "skills").glob("*/*/SKILL.md")) + \
             list((HOME / ".hermes" / "skills").glob("*/SKILL.md"))
    stale = []
    cutoff = now() - 90 * DAY
    for s in skills:
        try:
            if s.stat().st_mtime < cutoff:
                stale.append(s.parent.name)
        except OSError:
            pass
    rec("CQ15", "PASS",
        f"skill 总数 {len(skills)}, 90 天未更新 {len(stale)} 个" +
        (f": {', '.join(stale[:8])}{'...' if len(stale)>8 else ''}" if stale else "") +
        f"; 复用脚本 {script.name}({'存在' if script.exists() else '缺失'})",
        "零引用判定由 skill-health-audit.sh 覆盖，本脚本负责时效维度")

CQS = [
    ("CQ1",  "身份权限", "哪些 profile 有权限处理带 PII 标记的任务？", cq1),
    ("CQ2",  "身份权限", "任务 X 派生出的所有下游任务（传递闭包）？", cq2),
    ("CQ3",  "身份权限", "profile Y 当前在哪些 board 上有 running 任务？", cq3),
    ("CQ4",  "身份权限", "某 Artifact 的 markings 是什么、从哪里继承的？", cq4),
    ("CQ5",  "身份权限", "谁批准了决策 D、基于哪些证据？", cq5),
    ("CQ6",  "流程产能", "流程 P 从触发到交付用了多久、瓶颈在哪个阶段？", cq6),
    ("CQ7",  "流程产能", "过去 7 天每 board 的任务吞吐量？", cq7),
    ("CQ8",  "流程产能", "哪些任务被阻塞超过 24 小时、被谁阻塞？", cq8),
    ("CQ9",  "流程产能", "某 Process 失败后返工了几次？", cq9),
    ("CQ10", "质量证据", "Finding F 的证据链完整吗？", cq10),
    ("CQ11", "质量证据", "verification 字段覆盖率和证据强度分布？", cq11),
    ("CQ12", "质量证据", "哪些 Finding 被多个 worker 独立发现？", cq12),
    ("CQ13", "质量证据", "某任务的验收标准是否被修改过？", cq13),
    ("CQ14", "治理演化", "规则 R 被多少 profile 引用、哪些缺引用？", cq14),
    ("CQ15", "治理演化", "哪些 skill 是零引用/90 天未更新？", cq15),
]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", action="store_true", help="输出 JSON")
    ap.add_argument("--write-ledger", action="store_true",
                    help="为 GAP/PARTIAL 问输出 intervention-ledger 4 字段 yaml 块（供挂 kanban_comment）")
    ap.add_argument("--days", type=int, default=7, help="CQ7 吞吐窗口天数")
    args = ap.parse_args()

    if not BOARDS_DIR.exists():
        print(f"FATAL: {BOARDS_DIR} 不存在", file=sys.stderr); sys.exit(2)

    for cq, cat, q, fn in CQS:
        try:
            fn(*([args.days] if cq == "CQ7" else []))
        except Exception as e:  # 单问失败不拖垮全局，记 GAP
            rec(cq, "GAP", f"查询执行异常: {type(e).__name__}: {e}", "查询本身失败 = 该问当前不可答")

    n_pass = sum(1 for v in R.values() if v["status"] == "PASS")
    n_part = sum(1 for v in R.values() if v["status"] == "PARTIAL")
    n_gap = sum(1 for v in R.values() if v["status"] == "GAP")
    ts = time.strftime("%Y-%m-%d %H:%M %Z")

    if args.json:
        print(json.dumps({"timestamp": ts, "ontology_version": "1.4",
                          "summary": {"pass": n_pass, "partial": n_part, "gap": n_gap},
                          "results": R}, ensure_ascii=False, indent=2))
    else:
        print(f"# Ontology CQ 季度回归报告 — {ts}")
        print(f"ontology: {ONTOLOGY} (v1.4) | boards: {len(boards())} | profiles: {len(soul_files())}")
        print(f"结果: PASS {n_pass}/15, PARTIAL {n_part}/15, GAP {n_gap}/15\n")
        cur_cat = None
        for cq, cat, q, _ in CQS:
            if cat != cur_cat:
                print(f"## {cat}类"); cur_cat = cat
            v = R[cq]
            mark = {"PASS": "✅", "PARTIAL": "🟡", "GAP": "❌"}[v["status"]]
            print(f"{mark} {cq} [{v['status']}] {q}")
            print(f"   证据: {v['evidence']}")
            if v["detail"]:
                print(f"   备注: {v['detail']}")
        if args.write_ledger:
            print("\n## Intervention Ledger 条目（GAP/PARTIAL，4 字段格式，挂 kanban_comment）")
            for cq, cat, q, _ in CQS:
                v = R[cq]
                if v["status"] in ("GAP", "PARTIAL"):
                    print(f"\n```yaml\n# {cq} — {q}")
                    print(f"intervention: \"CQ 季度回归 {ts[:10]}: {cq} {v['status']} — {q}\"")
                    print(f"outcome: {'regressing' if v['status']=='GAP' else 'unchanged'}")
                    print(f"evidenceRef: \"ontology-cq-regression.py run {ts}; {v['evidence'][:120]}\"")
                    print(f"owner: \"platform-ontology-curator\"\n```")
    sys.exit(0 if (n_part + n_gap) == 0 else 1)

if __name__ == "__main__":
    main()
