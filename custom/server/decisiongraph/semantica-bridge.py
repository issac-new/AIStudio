#!/usr/bin/env python3
"""semantica-bridge.py —— studio 决策图谱桥（乙4，2026-09-30 调研落地）。

studio server 经短生命周期 python 进程读写 Semantica ContextGraph KG 文件，
避免长驻 sidecar 的状态漂移。写操作进程内串行 + fcntl 文件锁 + tmp/rename 原子落盘。

用法（stdin 传 JSON 免 shell 转义坑）：
  bridge.py entity  --kg <path>            stdin: {id,type,props,force?}
                                                → stdout: {ok, added, conflicts:[{entityId,field,existing,incoming}]}
                                                已存在同 id 且 props 不一致 → 冲突上报不覆盖（force=true 才覆盖）
  bridge.py relation --kg <path>           stdin: {src,dst,type} → {ok, added}
  bridge.py kg-summary --kg <path>         → {ok, nodes, edges, byType, recent:[{id,type}]}
  bridge.py record  --kg <path>            stdin: {category,scenario,reasoning,outcome,confidence,decision_maker,metadata,link_precedent}
                                                → stdout: {ok, decisionId, precedentOf|null}
  bridge.py similar --kg <path>            stdin: {scenario, category?, max?, min_similarity?}
                                                → stdout: {ok, results:[{id,category,scenario,outcome,confidence,similarity,decidedBy}]}
  bridge.py chain  --kg <path> --id <uuid> → stdout: {ok, chain:[{id,category,scenario,outcome,confidence}]}
  bridge.py list   --kg <path> --limit N   → stdout: {ok, decisions:[{...}], total}
  bridge.py status --kg <path>             → stdout: {ok, exists, nodes, decisions}

退出码：0=成功；3=KG 文件缺席/损坏（读操作如实空结果不编造）；4=输入非法。
"""
import argparse
import json
import os
import sys
import tempfile
import time

KG_FIELDS = ("category", "scenario", "reasoning", "outcome", "confidence")


def load_graph(kg_path):
    from semantica.context import ContextGraph
    g = ContextGraph(graph_id="studio-decisions")
    if os.path.exists(kg_path):
        try:
            g.load_from_file(kg_path)
        except Exception:
            print(json.dumps({"ok": False, "error": "kg-corrupt"}))
            sys.exit(3)
    return g


def save_atomic(g, kg_path):
    os.makedirs(os.path.dirname(os.path.abspath(kg_path)) or ".", exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(os.path.abspath(kg_path)) or ".",
                               prefix=".kg-", suffix=".json")
    os.close(fd)
    try:
        g.save_to_file(tmp)
        os.replace(tmp, kg_path)
    except Exception:
        # 失败清理临时文件：残留 .kg-*.json 会在 semantica 目录里无限累积
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def with_lock(kg_path, fn):
    """写前取 .lock 排他锁（带超时，锁文件常驻无害）。
    无 fcntl 的平台（Windows）降级为无锁执行：单写者部署下正确性不受损，
    仅跨进程并发写失去互斥（fail-soft，不阻塞全部写操作）。"""
    try:
        import fcntl
    except ImportError:
        return fn()
    lock_path = kg_path + ".lock"
    os.makedirs(os.path.dirname(os.path.abspath(lock_path)) or ".", exist_ok=True)
    with open(lock_path, "w") as lf:
        deadline = time.time() + 10
        while True:
            try:
                fcntl.flock(lf, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except OSError:
                if time.time() > deadline:
                    print(json.dumps({"ok": False, "error": "lock-timeout"}))
                    sys.exit(5)
                time.sleep(0.1)
        try:
            return fn()
        finally:
            fcntl.flock(lf, fcntl.LOCK_UN)


def dec_dict(d):
    """Decision 对象（causal chain 返回）与 dict（find_similar 返回）双形态兼容。"""
    if isinstance(d, dict):
        return {
            "id": d.get("id") or d.get("decision_id"),
            "category": d.get("category"),
            "scenario": d.get("scenario"),
            "outcome": d.get("outcome"),
            "confidence": d.get("confidence"),
            "decidedBy": d.get("decision_maker") or d.get("decidedBy") or "unknown",
            "reasoning": d.get("reasoning"),
        }
    return {
        "id": d.decision_id,
        "category": d.category,
        "scenario": d.scenario,
        "outcome": d.outcome,
        "confidence": d.confidence,
        "decidedBy": getattr(d, "decision_maker", None) or "unknown",
        "reasoning": d.reasoning,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("op", choices=["record", "similar", "chain", "list", "status", "entity", "relation", "kg-summary", "entity-batch", "relation-batch"])
    ap.add_argument("--kg", required=True)
    ap.add_argument("--id")
    ap.add_argument("--limit", type=int, default=50)
    args = ap.parse_args()

    if args.op == "similar":
        req = json.loads(sys.stdin.read() or "{}")
        if not req.get("scenario"):
            print(json.dumps({"ok": False, "error": "scenario-required"}))
            sys.exit(4)
        if not os.path.exists(args.kg):
            print(json.dumps({"ok": True, "results": []}))
            return
        g = load_graph(args.kg)
        sims = g.find_similar_decisions(
            req["scenario"], category=req.get("category"),
            max_results=int(req.get("max", 3)),
            min_similarity=float(req.get("min_similarity", 0.3)))
        results = [{
            **dec_dict(s["decision"]),
            "similarity": round(float(s.get("similarity", 0)), 3),
        } for s in sims]
        print(json.dumps({"ok": True, "results": results}, ensure_ascii=False))
        return

    if args.op == "chain":
        if not args.id or not os.path.exists(args.kg):
            print(json.dumps({"ok": True, "chain": []}))
            return
        g = load_graph(args.kg)
        chain = [dec_dict(d) for d in g.get_causal_chain(args.id, direction="upstream")]
        print(json.dumps({"ok": True, "chain": chain}, ensure_ascii=False))
        return

    if args.op == "list":
        if not os.path.exists(args.kg):
            print(json.dumps({"ok": True, "decisions": [], "total": 0}))
            return
        g = load_graph(args.kg)
        # 决策存于 ContextGraph._decisions（id→Decision），不在 networkx 图节点里。
        store = getattr(g, "_decisions", None) or {}
        decisions = []
        for did, d in store.items():
            dd = dec_dict(d) if not isinstance(d, dict) else dec_dict(d)
            # Decision 模型的时间字段是 timestamp（无 created_at）；datetime 必须 isoformat
            # 成字符串，否则 json.dumps 直接 TypeError 且排序键恒空（新→旧排序名存实亡）。
            raw_at = (d.get("timestamp") or d.get("created_at")) if isinstance(d, dict) \
                else getattr(d, "timestamp", None) or getattr(d, "created_at", None)
            if raw_at is not None and hasattr(raw_at, "isoformat"):
                raw_at = raw_at.isoformat()
            decisions.append({
                "id": dd.get("id") or did,
                "category": dd.get("category"),
                "scenario": str(dd.get("scenario") or "")[:200],
                "outcome": dd.get("outcome"),
                "confidence": dd.get("confidence"),
                "decidedBy": dd.get("decidedBy"),
                "at": raw_at,
            })
        decisions = [d for d in decisions if d.get("id")]
        decisions.sort(key=lambda x: str(x.get("at") or ""), reverse=True)
        print(json.dumps({"ok": True, "decisions": decisions[:args.limit], "total": len(decisions)},
                         ensure_ascii=False))
        return

    if args.op == "status":
        if not os.path.exists(args.kg):
            print(json.dumps({"ok": True, "exists": False, "nodes": 0, "decisions": 0}))
            return
        g = load_graph(args.kg)
        store = getattr(g, "_decisions", None) or {}
        import networkx as _nx
        n = 0
        kg_attr = getattr(g, "kg", None)
        if kg_attr is not None and hasattr(kg_attr, "graph"):
            try: n = kg_attr.graph.number_of_nodes()
            except Exception: n = 0
        print(json.dumps({"ok": True, "exists": True, "nodes": n, "decisions": len(store)}))
        return

    if args.op == "kg-summary":
        if not os.path.exists(args.kg):
            print(json.dumps({"ok": True, "nodes": 0, "edges": 0, "byType": {}, "recent": []}))
            return
        try:
            with open(args.kg) as f:
                kg = json.load(f)
        except Exception:
            print(json.dumps({"ok": False, "error": "kg-corrupt"}))
            sys.exit(3)
        nodes = kg.get("nodes", [])
        edges = kg.get("edges", [])
        by_type = {}
        for n in nodes:
            props = n.get("properties", {}) or {}
            t = props.get("type") or n.get("type", "?")
            by_type[t] = by_type.get(t, 0) + 1
        recent = [{"id": n.get("id", ""),
                   "type": (n.get("properties", {}) or {}).get("type") or n.get("type", "?")}
                  for n in nodes[-10:]]
        print(json.dumps({"ok": True, "nodes": len(nodes), "edges": len(edges),
                          "byType": by_type, "recent": recent}, ensure_ascii=False))
        return

    if args.op == "entity":
        req = json.loads(sys.stdin.read() or "{}")
        if not req.get("id") or not req.get("type"):
            print(json.dumps({"ok": False, "error": "id/type-required"}))
            sys.exit(4)

        def do_entity():
            existing_props = None
            if os.path.exists(args.kg):
                try:
                    with open(args.kg) as f:
                        kg_raw = json.load(f)
                    for n in kg_raw.get("nodes", []):
                        if n.get("id") == req["id"]:
                            existing_props = n.get("properties", {})
                            break
                except Exception:
                    existing_props = None
            incoming = dict(req.get("props") or {})
            if existing_props is not None and existing_props != incoming:
                changed = {k: {"existing": existing_props.get(k), "incoming": incoming.get(k)}
                           for k in (set(existing_props) | set(incoming)) - {"content"}
                           if existing_props.get(k) != incoming.get(k)}
                if not req.get("force"):
                    # 冲突不覆盖（丙8）：如实上报，写保护；裁决后 force 重写。
                    return {"ok": True, "added": False,
                            "conflicts": [{"entityId": req["id"], "field": k, "existing": v["existing"],
                                           "incoming": v["incoming"]} for k, v in changed.items()]}
                # force 裁决=改争议字段，其余属性必须保留：semantica add_node 是整节点替换
                # （_add_internal_node 直接 self.nodes[id]=node），只传单字段 props 会把
                # title/status 等既有属性清空，且下轮同步因 props 不一致再报冲突（循环）。
                incoming = {**{k: v for k, v in existing_props.items() if k != "content"}, **incoming}
            g = load_graph(args.kg)
            g.add_node(str(req["id"])[:128], str(req["type"])[:64], **{
                str(k): v for k, v in incoming.items()})
            save_atomic(g, args.kg)
            return {"ok": True, "added": True, "conflicts": []}

        print(json.dumps(with_lock(args.kg, do_entity), ensure_ascii=False))
        return

    if args.op == "relation":
        req = json.loads(sys.stdin.read() or "{}")
        if not req.get("src") or not req.get("dst"):
            print(json.dumps({"ok": False, "error": "src/dst-required"}))
            sys.exit(4)

        def do_relation():
            g = load_graph(args.kg)
            g.add_edge(str(req["src"])[:128], str(req["dst"])[:128],
                       str(req.get("type", "related_to"))[:64])
            save_atomic(g, args.kg)
            return {"ok": True, "added": True}

        print(json.dumps(with_lock(args.kg, do_relation), ensure_ascii=False))
        return

    if args.op == "entity-batch":
        # 批量实体（丙7 性能根治）：单进程整板摄取；已存在同 id 异 props 的条目逐项
        # 上报冲突且不覆盖（与 entity 单条同语义），added 计新增数。
        req = json.loads(sys.stdin.read() or "{}")
        items = req.get("items") or []
        if not isinstance(items, list):
            print(json.dumps({"ok": False, "error": "items-required"}))
            sys.exit(4)

        def do_batch():
            existing = {}
            if os.path.exists(args.kg):
                try:
                    with open(args.kg) as f:
                        kg_raw = json.load(f)
                    for n in kg_raw.get("nodes", []):
                        existing[n.get("id")] = n.get("properties", {}) or {}
                except Exception:
                    existing = {}
            g = load_graph(args.kg)
            added, conflicts, skipped = 0, [], 0
            for it in items:
                nid = str(it.get("id") or "")[:128]
                ntype = str(it.get("type") or "entity")[:64]
                props = {str(k): v for k, v in (it.get("props") or {}).items()}
                if not nid:
                    skipped += 1
                    continue
                ex = existing.get(nid)
                if ex is not None and {k: v for k, v in ex.items() if k != "content"} != props:
                    changed = {k: {"existing": ex.get(k), "incoming": props.get(k)}
                               for k in (set(ex) | set(props)) - {"content"}
                               if ex.get(k) != props.get(k)}
                    conflicts.append({"entityId": nid,
                                      "fields": [{"field": k, "existing": v["existing"], "incoming": v["incoming"]}
                                                 for k, v in changed.items()]})
                    continue  # 冲突不覆盖（写保护）
                if ex is None:
                    g.add_node(nid, ntype, **props)
                    added += 1
            if added > 0:
                save_atomic(g, args.kg)
            return {"ok": True, "added": added, "skipped": skipped, "conflicts": conflicts}

        print(json.dumps(with_lock(args.kg, do_batch), ensure_ascii=False))
        return

    if args.op == "relation-batch":
        req = json.loads(sys.stdin.read() or "{}")
        items = req.get("items") or []
        if not isinstance(items, list):
            print(json.dumps({"ok": False, "error": "items-required"}))
            sys.exit(4)

        def do_rel_batch():
            g = load_graph(args.kg)
            added = 0
            for it in items:
                s, t, ty = str(it.get("src") or ""), str(it.get("dst") or ""), str(it.get("type") or "related_to")
                if not s or not t:
                    continue
                g.add_edge(s[:128], t[:128], ty[:64])
                added += 1
            if added > 0:
                save_atomic(g, args.kg)
            return {"ok": True, "added": added}

        print(json.dumps(with_lock(args.kg, do_rel_batch), ensure_ascii=False))
        return

    # record
    req = json.loads(sys.stdin.read() or "{}")
    for f in KG_FIELDS:
        if f not in req:
            print(json.dumps({"ok": False, "error": f"field-required:{f}"}))
            sys.exit(4)

    def do_record():
        g = load_graph(args.kg)
        did = g.record_decision(
            category=str(req["category"])[:64],
            scenario=str(req["scenario"])[:400],
            reasoning=str(req.get("reasoning", ""))[:400],
            outcome=str(req["outcome"])[:32],
            confidence=float(req.get("confidence", 0.8)),
            decision_maker=str(req.get("decision_maker", "studio"))[:64] or None,
            metadata=req.get("metadata") or {})
        precedent_of = None
        if req.get("link_precedent"):
            # max_results 取 3：榜首可能是刚记录的自身（相似度 1.0），跳过自身取首个真先例。
            sims = g.find_similar_decisions(str(req["scenario"])[:400], category=str(req["category"])[:64],
                                            max_results=3, min_similarity=0.4)
            for s in sims:
                pid = dec_dict(s["decision"])["id"]
                if pid and pid != did:
                    g.add_causal_relationship(pid, did, "PRECEDENT_FOR")
                    precedent_of = pid
                    break
        save_atomic(g, args.kg)
        return {"ok": True, "decisionId": did, "precedentOf": precedent_of}

    print(json.dumps(with_lock(args.kg, do_record), ensure_ascii=False))


if __name__ == "__main__":
    main()
