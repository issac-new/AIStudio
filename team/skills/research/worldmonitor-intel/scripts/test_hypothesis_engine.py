#!/usr/bin/env python3
"""intel-hypothesis-engine CLI 端到端验证测试。

用法: python3 test_hypothesis_engine.py
覆盖: trace-new / trace-add / trace-fork / trace-schedule / trace-fuse /
      trace-assess / trace-biases / trace-status 八个子命令 + py_compile +
      模块导入 + 核心类单元测试。
退出码: 0 = 全部通过; 1 = 有失败。
"""
import importlib.util
import json
import os
import subprocess
import sys
import tempfile

SCRIPT = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                      "intel-hypothesis-engine.py")


def run_cli(*args):
    return subprocess.run([sys.executable, SCRIPT, *args],
                          capture_output=True, text=True, timeout=30)


def load_json(text):
    return json.loads(text)


# ============ Module import + class unit tests ============

def test_module_import():
    """Verify the module loads and exposes expected classes/schedulers."""
    spec = importlib.util.spec_from_file_location("ihe", SCRIPT)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    assert hasattr(m, "Hypothesis"), "missing Hypothesis"
    assert hasattr(m, "Evidence"), "missing Evidence"
    assert hasattr(m, "IntelFeedback"), "missing IntelFeedback"
    assert hasattr(m, "IntelTrace"), "missing IntelTrace"
    assert hasattr(m, "MCTSScheduler"), "missing MCTSScheduler"
    assert hasattr(m, "DiversityScheduler"), "missing DiversityScheduler"
    assert hasattr(m, "trace_fusion"), "missing trace_fusion"
    assert hasattr(m, "competing_hypotheses_assessment"), "missing ACH"
    assert hasattr(m, "detect_cognitive_biases"), "missing bias detection"
    assert set(m.SCHEDULERS.keys()) == {"round_robin", "sota", "mcts", "diversity"}, \
        f"unexpected schedulers: {m.SCHEDULERS.keys()}"
    return "module_import PASS (%d classes/functions checked)" % 10


def test_hypothesis_roundtrip():
    """Hypothesis to_dict → from_dict round-trip preserves all fields."""
    spec = importlib.util.spec_from_file_location("ihe", SCRIPT)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    h = m.Hypothesis("test hyp", reason="because", concise_reason="cr",
                     concise_observation="obs", concise_knowledge="kn",
                     parent_id="p1", sibling_hypotheses=["s1"])
    h.confidence = 0.7
    d = h.to_dict()
    h2 = m.Hypothesis.from_dict(d)
    assert h2.hypothesis == "test hyp"
    assert h2.reason == "because"
    assert h2.confidence == 0.7
    assert h2.parent_id == "p1"
    assert h2.sibling_hypotheses == ["s1"]
    return "hypothesis_roundtrip PASS (all fields preserved)"


def test_evidence_roundtrip():
    """Evidence to_dict → from_dict round-trip preserves supports flag."""
    spec = importlib.util.spec_from_file_location("ihe", SCRIPT)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    e = m.Evidence("SAT", "armor buildup", supports=False, confidence=0.9,
                   url="http://x", evidence_type="geo")
    d = e.to_dict()
    e2 = m.Evidence.from_dict(d)
    assert e2.supports is False, "supports flag lost in roundtrip"
    assert e2.confidence == 0.9
    assert e2.evidence_type == "geo"
    return "evidence_roundtrip PASS (supports=False preserved)"


def test_intel_feedback_bool():
    """IntelFeedback.__bool__ returns decision field."""
    spec = importlib.util.spec_from_file_location("ihe", SCRIPT)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    fb_true = m.IntelFeedback("h1", decision=True)
    fb_false = m.IntelFeedback("h2", decision=False)
    assert bool(fb_true) is True
    assert bool(fb_false) is False
    assert fb_true.new_hypothesis == "", "default new_hypothesis should be empty string"
    return "intel_feedback_bool PASS (decision=True→True, decision=False→False)"


def test_trace_dag_leaves():
    """IntelTrace.get_leaves correctly identifies DAG leaf nodes after fork."""
    spec = importlib.util.spec_from_file_location("ihe", SCRIPT)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    t = m.IntelTrace("test question")
    h0 = m.Hypothesis("root hypothesis")
    idx0 = t.add_node(h0)
    h1 = m.Hypothesis("forked hypothesis", parent_id=h0.id)
    idx1 = t.add_node(h1, parent_idx=idx0)
    leaves = t.get_leaves()
    assert leaves == [1], f"expected [1], got {leaves}"
    # After adding a third node from root (new branch), leaves should be [1, 2]
    h2 = m.Hypothesis("second fork")
    idx2 = t.add_node(h2, parent_idx=idx0)
    leaves = t.get_leaves()
    assert leaves == [1, 2], f"expected [1, 2], got {leaves}"
    return "trace_dag_leaves PASS (fork→[1], multi-fork→[1,2])"


def test_mcts_scheduler_selection():
    """MCTSScheduler selects NEW_ROOT when below max_traces, else a leaf."""
    spec = importlib.util.spec_from_file_location("ihe", SCRIPT)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    t = m.IntelTrace("test")
    sched = m.MCTSScheduler(max_traces=3)
    # Empty trace → NEW_ROOT
    assert sched.select(t) == t.NEW_ROOT
    # Add 2 nodes (below max), still NEW_ROOT
    h0 = m.Hypothesis("h0")
    t.add_node(h0)
    assert sched.select(t) == t.NEW_ROOT
    return "mcts_scheduler PASS (empty→NEW_ROOT, below-max→NEW_ROOT)"


def test_bias_detection_confirmation():
    """detect_cognitive_biases flags confirmation_bias when only supporting evidence."""
    spec = importlib.util.spec_from_file_location("ihe", SCRIPT)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    t = m.IntelTrace("test")
    h = m.Hypothesis("hyp")
    h.confidence = 0.5
    idx = t.add_node(h)
    # Add 5 supporting evidences, no opposing → confirmation_bias
    for i in range(5):
        e = m.Evidence(f"source{i}", f"evidence {i}", supports=True, confidence=0.7)
        t.hist[idx]["evidences"].append(e)
    biases = m.detect_cognitive_biases(t)
    bias_names = [b["bias"] for b in biases]
    assert "confirmation_bias" in bias_names, \
        f"expected confirmation_bias in {bias_names}"
    return "bias_detection_confirmation PASS (5 supporting, 0 opposing → confirmation_bias)"


def test_ach_inconclusive():
    """ACH returns inconclusive when support≈oppose for a single hypothesis."""
    spec = importlib.util.spec_from_file_location("ihe", SCRIPT)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    t = m.IntelTrace("question")
    h = m.Hypothesis("test hyp")
    idx = t.add_node(h)
    t.hist[idx]["evidences"].append(
        m.Evidence("s1", "e1", supports=True, confidence=0.5))
    t.hist[idx]["evidences"].append(
        m.Evidence("s2", "e2", supports=False, confidence=0.5))
    result = m.competing_hypotheses_assessment(t)
    assert result["hypothesis_count"] == 1
    a = result["detailed_assessments"][0]
    assert a["verdict"] == "inconclusive", \
        f"expected inconclusive (net=0), got {a['verdict']}"
    assert abs(a["net_score"]) < 0.01, f"expected net≈0, got {a['net_score']}"
    return "ach_inconclusive PASS (support=0.5, oppose=0.5 → inconclusive, net≈0)"


# ============ CLI end-to-end tests ============

def test_cli_trace_new():
    with tempfile.TemporaryDirectory() as td:
        trace_path = os.path.join(td, "trace.json")
        r = run_cli("trace-new", "--question", "Q?", "--hypothesis", "H1",
                     "--reason", "R1", "--output", trace_path)
        assert r.returncode == 0, r.stderr
        d = load_json(r.stdout)
        assert d["status"] == "created"
        assert d["node_count"] == 1
        assert os.path.exists(trace_path)
        return "cli_trace_new PASS (created 1-node trace)"


def test_cli_trace_add_supports_opposes():
    """Verify --supports true/false is correctly parsed and stored."""
    with tempfile.TemporaryDirectory() as td:
        trace_path = os.path.join(td, "trace.json")
        run_cli("trace-new", "--question", "Q", "--hypothesis", "H",
                "--output", trace_path)
        # Add supporting
        r1 = run_cli("trace-add", "--trace", trace_path,
                     "--source", "S1", "--evidence", "E1",
                     "--supports", "true", "--confidence", "0.8")
        assert r1.returncode == 0, r1.stderr
        assert load_json(r1.stdout)["evidence_count"] == 1
        # Add opposing — this is the bug we fixed (type=bool parsed 'false' as True)
        r2 = run_cli("trace-add", "--trace", trace_path,
                     "--source", "S2", "--evidence", "E2",
                     "--supports", "false", "--confidence", "0.6")
        assert r2.returncode == 0, r2.stderr
        assert load_json(r2.stdout)["evidence_count"] == 2
        # Verify stored data
        with open(trace_path) as f:
            t = json.load(f)
        evs = t["hist"][0]["evidences"]
        assert evs[0]["supports"] is True, "supports=true not stored correctly"
        assert evs[1]["supports"] is False, "supports=false not stored correctly (regression!)"
        return "cli_trace_add PASS (supports=true→True, supports=false→False ✓)"


def test_cli_trace_fork():
    with tempfile.TemporaryDirectory() as td:
        trace_path = os.path.join(td, "trace.json")
        run_cli("trace-new", "--question", "Q", "--hypothesis", "H0",
                "--output", trace_path)
        r = run_cli("trace-fork", "--trace", trace_path,
                    "--hypothesis", "H1", "--parent", "0")
        assert r.returncode == 0, r.stderr
        d = load_json(r.stdout)
        assert d["status"] == "forked"
        assert d["parent_index"] == 0
        assert d["new_node_index"] == 1
        return "cli_trace_fork PASS (forked node 1 from node 0)"


def test_cli_trace_schedule():
    with tempfile.TemporaryDirectory() as td:
        trace_path = os.path.join(td, "trace.json")
        run_cli("trace-new", "--question", "Q", "--hypothesis", "H0",
                "--output", trace_path)
        r = run_cli("trace-schedule", "--trace", trace_path, "--strategy", "mcts")
        assert r.returncode == 0, r.stderr
        d = load_json(r.stdout)
        assert d["strategy"] == "mcts"
        assert "selection" in d
        return "cli_trace_schedule PASS (strategy=mcts, selection=%s)" % d["selection"]


def test_cli_trace_fuse():
    """Trace fusion requires ≥2 leaf branches. Fork twice from root to get 2 leaves."""
    with tempfile.TemporaryDirectory() as td:
        trace_path = os.path.join(td, "trace.json")
        run_cli("trace-new", "--question", "Q", "--hypothesis", "H0",
                "--output", trace_path)
        # Fork 1 from node 0 → creates node 1 (leaf)
        run_cli("trace-fork", "--trace", trace_path, "--hypothesis", "H1", "--parent", "0")
        run_cli("trace-add", "--trace", trace_path, "--source", "S1",
                "--evidence", "E1", "--supports", "true", "--confidence", "0.8",
                "--node-idx", "1")
        # Fork 2 from node 0 → creates node 2 (leaf), now leaves=[1,2]
        run_cli("trace-fork", "--trace", trace_path, "--hypothesis", "H2", "--parent", "0")
        run_cli("trace-add", "--trace", trace_path, "--source", "S2",
                "--evidence", "E2", "--supports", "true", "--confidence", "0.7",
                "--node-idx", "2")
        r = run_cli("trace-fuse", "--trace", trace_path)
        assert r.returncode == 0, r.stderr
        d = load_json(r.stdout)
        assert d["fused"] is True, f"expected fused=True, got {d}"
        assert "sota_branch" in d and "merge_branch" in d
        return "cli_trace_fuse PASS (2 leaves → fused, sota+merge identified)"


def test_cli_trace_assess():
    with tempfile.TemporaryDirectory() as td:
        trace_path = os.path.join(td, "trace.json")
        run_cli("trace-new", "--question", "Q", "--hypothesis", "H0",
                "--output", trace_path)
        run_cli("trace-add", "--trace", trace_path, "--source", "S",
                "--evidence", "E", "--supports", "true", "--confidence", "0.8")
        run_cli("trace-fork", "--trace", trace_path, "--hypothesis", "H1", "--parent", "0")
        run_cli("trace-add", "--trace", trace_path, "--source", "S2",
                "--evidence", "E2", "--supports", "true", "--confidence", "0.7",
                "--node-idx", "1")
        r = run_cli("trace-assess", "--trace", trace_path)
        assert r.returncode == 0, r.stderr
        d = load_json(r.stdout)
        assert d["assessment"] == "completed"
        assert d["hypothesis_count"] == 2
        assert "max_disagreement" in d
        return "cli_trace_assess PASS (2 hypotheses assessed, disagreement detected)"


def test_cli_trace_biases():
    with tempfile.TemporaryDirectory() as td:
        trace_path = os.path.join(td, "trace.json")
        run_cli("trace-new", "--question", "Q", "--hypothesis", "H0",
                "--output", trace_path)
        # Add 5 supporting evidences to trigger confirmation_bias
        for i in range(5):
            run_cli("trace-add", "--trace", trace_path,
                    "--source", f"S{i}", "--evidence", f"E{i}",
                    "--supports", "true", "--confidence", "0.7")
        r = run_cli("trace-biases", "--trace", trace_path)
        assert r.returncode == 0, r.stderr
        d = load_json(r.stdout)
        bias_names = [b["bias"] for b in d["biases_detected"]]
        assert "confirmation_bias" in bias_names, \
            f"expected confirmation_bias, got {bias_names}"
        return "cli_trace_biases PASS (confirmation_bias detected with 5 supporting evidences)"


def test_cli_trace_status():
    with tempfile.TemporaryDirectory() as td:
        trace_path = os.path.join(td, "trace.json")
        run_cli("trace-new", "--question", "Q", "--hypothesis", "H0",
                "--output", trace_path)
        r = run_cli("trace-status", "--trace", trace_path)
        assert r.returncode == 0, r.stderr
        d = load_json(r.stdout)
        assert d["total_nodes"] == 1
        assert d["hypotheses"][0]["hypothesis"] == "H0"
        return "cli_trace_status PASS (1 node, hypothesis=H0)"


def test_py_compile():
    r = subprocess.run([sys.executable, "-m", "py_compile", SCRIPT],
                       capture_output=True, text=True)
    assert r.returncode == 0, r.stderr
    return "py_compile PASS"


def main():
    tests = [
        # Unit tests (module-level)
        test_module_import,
        test_hypothesis_roundtrip,
        test_evidence_roundtrip,
        test_intel_feedback_bool,
        test_trace_dag_leaves,
        test_mcts_scheduler_selection,
        test_bias_detection_confirmation,
        test_ach_inconclusive,
        # CLI end-to-end tests
        test_cli_trace_new,
        test_cli_trace_add_supports_opposes,
        test_cli_trace_fork,
        test_cli_trace_schedule,
        test_cli_trace_fuse,
        test_cli_trace_assess,
        test_cli_trace_biases,
        test_cli_trace_status,
        # Syntax
        test_py_compile,
    ]
    failures = 0
    for t in tests:
        try:
            print(f"  ✅ {t()}")
        except (AssertionError, Exception) as e:
            failures += 1
            print(f"  ❌ {t.__name__} FAILED: {e}")
    print(f"\n{'ALL PASSED' if failures == 0 else f'{failures} FAILED'}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
