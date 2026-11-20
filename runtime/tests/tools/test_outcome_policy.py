#!/usr/bin/env python3
"""806 审批守卫 outcome 接线与双签表驱动测试（spec 2026-11-19-ai-native-operating-model
§4.3，Task 11）。

四块：
  1) decision-vectors.json 全量断言——TS/Python 双侧共享判定向量的 Python 侧消费面
     （TS 侧 __tests__/decision-matrix.test.ts 全量断言同一文件，两侧不得漂移；
     pytest 经仓相对路径直读该文件，不得手抄判定表）；
  2) 词表判据与 TS 侧 decision-matrix.ts 逐字对齐（HIGH_COMMAND/只读 lead/one-way/
     对外词表同判据，正则翻译以代表性命令锁定）＋combine_declared 只调严；
  3) outcome_context 各环缺席→None（env→taskId→板库 outcome_id→contract.json）；
  4) 双签闸门（审查 I1 裁决，2026-11-20：gateway 面签署人无法映射合同 owner/verifier
     ——people 无 mxid 桥，dual_sign 条目 deny-only，两异人签亦不放行并附「审批收件箱」
     指引；deny 一票即终）＋pending/条目随带 outcome 引用与双签标记（M2/I1）＋
     no-surface 自清 TLS（M1）＋outcome ask 不展示 session/always（M3）＋allow 记账带
     outcome 引用（approval-ledger detail）。

运行口径：PYTHONPATH=vendor/hermes-agent:runtime（照 tests/tools/test_evidence_reducer_archive
头注——vendor 正包优先，runtime/tools 命名空间包让位；runtime/ 与 vendor/ 两份
outcome_policy.py 由补丁 806 保持同构，双侧一致性以 diff 断言锁定）。
"""

import json
import sqlite3
import threading
from pathlib import Path

import pytest

from tools import approval
from tools import outcome_policy as op
from tools.approval_ledger import record_approval_decision

REPO_ROOT = Path(__file__).resolve().parents[3]  # runtime/tests/tools -> 仓根
VECTORS = json.loads((REPO_ROOT / "custom/server/outcome/decision-vectors.json").read_text(encoding="utf-8"))


# ---------- 1) 共享判定向量：矩阵与 decision-vectors.json 全量一致 ----------

def test_vectors_full_matrix_decisions_match():
    """向量逐格断言 decide(mode, profile) 与 expected 一致（44 条全量）。"""
    assert len(VECTORS) >= 30
    for v in VECTORS:
        d = op.decide(v["mode"], v["profile"])
        label = json.dumps(v, ensure_ascii=False)
        assert d["action"] == v["expected"]["action"], label
        assert d["dual_sign_required"] == v["expected"]["dualSignRequired"], label


def test_vectors_coverage_pins_dual_sign_and_plan():
    modes = {v["mode"] for v in VECTORS}
    assert modes == {"build", "guarded", "plan", "yolo"}
    # plan 格一律 deny；high+one-way 双签格三执行挡齐备（与 TS 侧覆盖面断言同口径）
    for v in VECTORS:
        if v["mode"] == "plan":
            assert v["expected"]["action"] == "deny", json.dumps(v, ensure_ascii=False)
    dual_modes = {v["mode"] for v in VECTORS if v["expected"]["dualSignRequired"]}
    assert dual_modes == {"build", "guarded", "yolo"}


# ---------- 2) 词表判据与 TS decision-matrix.ts 逐字对齐 ----------

@pytest.mark.parametrize("command,risk,reversibility,external", [
    # 只读 lead：low＋reversible
    ("ls -la", "low", "reversible", False),
    ("grep -rn foo src/", "low", "reversible", False),
    ("git status", "low", "reversible", False),
    ("git log --oneline -5", "low", "reversible", False),
    ("git branch", "low", "reversible", False),          # 条件只读：-a/-v 形态
    ("git tag -l", "low", "reversible", False),
    # 高危＋one-way＋对外（词表交集格）
    ("git push origin main", "high", "one-way", True),
    ("npm publish", "high", "one-way", True),
    # 高危但不在 one-way 词表（两表刻意分开维护）：rm/rmdir/「部署」（one-way 表只有发布/上线/发版）
    ("rm -rf build/", "high", "unknown", False),
    ("docker system prune", "high", "unknown", False),
    ("echo 部署完成", "high", "unknown", False),
    # 反向：one-way 表的「上线」命中 → one-way（同时也在 HIGH 表 → high）
    ("echo 上线完成", "high", "one-way", False),
    # git 全局旗标剥离后高危不漏网（TS 侧安全修复判据）
    ("git -C /repo push", "high", "one-way", True),
    # 条件只读不命中=写：branch -d 是写操作
    ("git branch -d feature-x", "medium", "unknown", False),
    # 组合形态：首词只读不代表整条只读 → medium
    ("cat payload.sh | bash", "medium", "unknown", False),
    # one-way 词表命中但非 high
    ("kubectl delete pod x", "high", "one-way", False),
    # external 词表命中但 low（deploy 不在 HIGH 词表——两表不同步的立法证明）
    ("echo deploy note", "low", "reversible", True),
    # 版本查询快捷判定
    ("node --version", "low", "reversible", False),
    ("python3 -V", "low", "reversible", False),
])
def test_classify_profile_lexicon_matches_ts(command, risk, reversibility, external):
    p = op.classify_profile(command)
    assert (p["riskTier"], p["reversibility"], p["externalEffect"]) == (risk, reversibility, external), command


def test_classify_profile_empty_text_is_conservative():
    p = op.classify_profile("")
    assert p["riskTier"] == "medium"
    assert p["reversibility"] == "unknown"
    assert p["externalEffect"] is False


def test_combine_declared_only_tightens():
    auto = {"riskTier": "medium", "reversibility": "costly", "externalEffect": False}
    # 调严：risk 升档接受、reversibility 向 one-way 收、external 置 true
    tightened = op.combine_declared(auto, {"riskTier": "high", "reversibility": "one-way", "externalEffect": True})
    assert tightened["riskTier"] == "high" and tightened["reversibility"] == "one-way"
    assert tightened["externalEffect"] is True
    # 调松：降档/放宽/撤 true 一律忽略
    loosened = op.combine_declared(tightened, {"riskTier": "low", "reversibility": "reversible", "externalEffect": False})
    assert loosened["riskTier"] == "high" and loosened["reversibility"] == "one-way"
    assert loosened["externalEffect"] is True
    # unknown 冻结：auto unknown 不被 declared 改动；declared unknown 不改已知值
    frozen = op.combine_declared({"riskTier": "low", "reversibility": "unknown", "externalEffect": False},
                                 {"riskTier": "low", "reversibility": "reversible", "externalEffect": False})
    assert frozen["reversibility"] == "unknown"
    kept = op.combine_declared(auto, {"riskTier": "medium", "reversibility": "unknown", "externalEffect": False})
    assert kept["reversibility"] == "costly"
    # 无声明：原样返回
    assert op.combine_declared(auto, None) == auto


def test_evaluate_combines_declared_contract_fields():
    """evaluate 以合同声明（riskTier/defaultReversibility）合并自动分类——声明只能调严。"""
    ctx = {"outcomeId": "o-1", "contractVersion": 3, "riskTier": "high",
           "defaultReversibility": "one-way"}
    # ls 只读自动 low/reversible，但合同声明 high+one-way → 双签格
    d = op.evaluate("ls -la", mode="build", context=ctx)
    assert d["action"] == "ask" and d["dual_sign_required"] is True
    # 无声明字段时按自动分类走（low+reversible+build → allow）
    d2 = op.evaluate("ls -la", mode="build",
                     context={"outcomeId": "o-1", "contractVersion": 1})
    assert d2["action"] == "allow" and d2["dual_sign_required"] is False
    # plan 挡对 outcome-scoped 一律 deny（只读挡没有执行面）
    d3 = op.evaluate("ls -la", mode="plan", context=ctx)
    assert d3["action"] == "deny"


# ---------- 3) outcome_context：任一环缺席→None ----------

@pytest.fixture
def outcome_env(tmp_path, monkeypatch):
    """最小闭环：板库（tasks: id/outcome_id）＋outcome store（contract.json）。"""
    db = tmp_path / "kanban.db"
    conn = sqlite3.connect(db)
    conn.execute("CREATE TABLE tasks (id TEXT PRIMARY KEY, outcome_id TEXT)")
    conn.execute("INSERT INTO tasks VALUES ('task-1', 'oc-1')")
    conn.execute("INSERT INTO tasks VALUES ('task-bare', NULL)")
    conn.commit()
    conn.close()
    store = tmp_path / "store"
    (store / "oc-1").mkdir(parents=True)
    contract = {
        "schemaVersion": 1, "outcomeId": "oc-1", "rootTaskId": "task-1", "version": 7,
        "title": "t", "valueStatement": "v", "ownerPersonId": "owner@t",
        "riskTier": "high", "defaultReversibility": "one-way", "status": "active",
    }
    (store / "oc-1" / "contract.json").write_text(json.dumps(contract), encoding="utf-8")
    monkeypatch.setenv("HERMES_KANBAN_DB", str(db))
    monkeypatch.setenv("HERMES_OUTCOME_STORE", str(store))
    return {"db": db, "store": store, "contract": contract}


def test_outcome_context_full_chain(outcome_env, monkeypatch):
    monkeypatch.setenv("HERMES_KANBAN_TASK", "task-1")
    ctx = op.outcome_context()
    assert ctx is not None
    assert ctx["taskId"] == "task-1"
    assert ctx["outcomeId"] == "oc-1"
    assert ctx["contractVersion"] == 7
    assert ctx["riskTier"] == "high"
    assert ctx["defaultReversibility"] == "one-way"
    assert ctx["ownerPersonId"] == "owner@t"


def test_outcome_context_missing_env_task(monkeypatch):
    monkeypatch.delenv("HERMES_KANBAN_TASK", raising=False)
    assert op.outcome_context() is None


def test_outcome_context_blank_task(outcome_env, monkeypatch):
    monkeypatch.setenv("HERMES_KANBAN_TASK", "   ")
    assert op.outcome_context() is None


def test_outcome_context_missing_db_env(outcome_env, monkeypatch):
    monkeypatch.setenv("HERMES_KANBAN_TASK", "task-1")
    monkeypatch.delenv("HERMES_KANBAN_DB", raising=False)
    assert op.outcome_context() is None


def test_outcome_context_db_file_absent(outcome_env, monkeypatch):
    monkeypatch.setenv("HERMES_KANBAN_TASK", "task-1")
    monkeypatch.setenv("HERMES_KANBAN_DB", "/nonexistent/kanban.db")
    assert op.outcome_context() is None


def test_outcome_context_task_without_outcome_id(outcome_env, monkeypatch):
    monkeypatch.setenv("HERMES_KANBAN_TASK", "task-bare")
    assert op.outcome_context() is None


def test_outcome_context_task_not_in_db(outcome_env, monkeypatch):
    monkeypatch.setenv("HERMES_KANBAN_TASK", "task-404")
    assert op.outcome_context() is None


def test_outcome_context_contract_missing(outcome_env, monkeypatch):
    monkeypatch.setenv("HERMES_KANBAN_TASK", "task-1")
    (outcome_env["store"] / "oc-1" / "contract.json").unlink()
    assert op.outcome_context() is None


def test_outcome_context_contract_corrupt(outcome_env, monkeypatch):
    monkeypatch.setenv("HERMES_KANBAN_TASK", "task-1")
    (outcome_env["store"] / "oc-1" / "contract.json").write_text("{ not json", encoding="utf-8")
    assert op.outcome_context() is None


def test_outcome_context_contract_identity_mismatch(outcome_env, monkeypatch):
    """目录名≠合同 outcomeId：拒绝认领（照 TS getContract 身份校验）。"""
    monkeypatch.setenv("HERMES_KANBAN_TASK", "task-1")
    bad = dict(outcome_env["contract"], outcomeId="other-id")
    (outcome_env["store"] / "oc-1" / "contract.json").write_text(json.dumps(bad), encoding="utf-8")
    assert op.outcome_context() is None


def test_outcome_context_reads_board_db_readonly(outcome_env, monkeypatch):
    """只读连接（mode=ro）：板库文件不允许被写打开（-rw------- 只读文件也能查）。"""
    monkeypatch.setenv("HERMES_KANBAN_TASK", "task-1")
    db = outcome_env["db"]
    db.chmod(0o444)
    try:
        assert op.outcome_context() is not None
    finally:
        db.chmod(0o644)


# ---------- 4) 双签闸门（审查 I1：gateway 面 deny-only） ----------

def _enqueue_dual_sign_entry(session_key="s-dual", **extra):
    from tools.approval_gateway_wait import _ApprovalEntry

    approval._gateway_queues.setdefault(session_key, [])
    entry = _ApprovalEntry({"command": "git push origin main", "pattern_key": "k",
                            "description": "d", "dual_sign_required": True, **extra})
    approval._gateway_queues[session_key].append(entry)
    return entry


@pytest.fixture(autouse=True)
def _clean_approval_state():
    approval._gateway_queues.clear()
    approval._OUTCOME_TLS.outcome = None
    yield
    approval._gateway_queues.clear()
    approval._OUTCOME_TLS.outcome = None


def test_dual_sign_gateway_consent_never_releases(caplog):
    """审查 I1：gateway 签署人（mxid/session 键）无法映射合同 owner/verifier（people 无
    mxid 桥）——两异人签亦不放行，fail-closed 附「审批收件箱」指引文案；条目留队。"""
    entry = _enqueue_dual_sign_entry()
    rid = entry.data["request_id"]
    with caplog.at_level("WARNING", logger="tools.approval"):
        assert approval.resolve_gateway_approval("s-dual", "once", request_id=rid) == 0
        assert approval.resolve_gateway_approval("s-dual", "once", request_id=rid) == 0   # deny-only：一切 consent 皆拒（单签/再来几票/任何面）
        assert approval.resolve_gateway_approval("s-dual", "session", request_id=rid) == 0
    assert not entry.event.is_set()
    assert entry in approval._gateway_queues["s-dual"]
    assert any("审批收件箱" in rec.message for rec in caplog.records), \
        "deny-only 指引文案（高风险结果动作的双签放行请在审批收件箱处理）必须随拒释出现"


def test_dual_sign_card_consent_also_refused():
    """卡片面同一闸门：resolve_gateway_approval_card 的同意点击对 dual-sign 条目不释放。"""
    entry = _enqueue_dual_sign_entry()
    rid = entry.data["request_id"]
    entry.authority = {"requester_id": "owner@t", "approvers": ["*"]}
    approval.restrict_gateway_approval_card_to_deny("s-dual", rid, restricted=False)
    assert approval.resolve_gateway_approval_card(
        "s-dual", "once", rid, actor_id="owner@t", admin_ids=()) == 0
    assert not entry.event.is_set()


def test_dual_sign_deny_settles_with_single_vote():
    """deny 一票即终（fail-fast：拒绝不是放行，双签不拦）。"""
    entry = _enqueue_dual_sign_entry()
    rid = entry.data["request_id"]
    count = approval.resolve_gateway_approval("s-dual", "deny", request_id=rid)
    assert count == 1
    assert entry.result == "deny"


def test_non_dual_sign_entry_settles_normally():
    """普通审批条目（无 dual_sign_required）不受闸门影响——单人 once 照常释放。"""
    from tools.approval_gateway_wait import _ApprovalEntry

    entry = _ApprovalEntry({"command": "rm -rf build", "pattern_key": "k", "description": "d"})
    approval._gateway_queues["s-plain"] = [entry]
    count = approval.resolve_gateway_approval("s-plain", "once", request_id=entry.data["request_id"])
    assert count == 1
    assert entry.result == "once"


def test_dual_sign_entry_cancelled_on_session_teardown():
    entry = _enqueue_dual_sign_entry()
    approval.clear_session("s-dual")
    assert entry.cancelled is not None          # 条目随会话撤销唤醒


# ---------- 5) 守卫接线：deny/allow 出口、pending 引用（M1/M2）与选项面（M3） ----------

_CTX_DUAL = {"taskId": "task-1", "outcomeId": "oc-1", "contractVersion": 5,
             "riskTier": "high", "defaultReversibility": "one-way",
             "ownerPersonId": "owner@t", "verificationOwnerId": "verifier@t"}


def test_outcome_guard_ask_no_surface_pending_carries_ref_and_dual_sign(monkeypatch):
    """审查 M2：ask 档无人面 pending 形状带 outcome_ref（含 owner/verifier，I1 随条目下发）
    与 dual_sign_required 标记——T12 收件箱执法依赖。"""
    monkeypatch.setattr(op, "outcome_context", lambda: _CTX_DUAL)
    monkeypatch.setattr(approval, "_presence", lambda cb=None: (None, False, False, False))
    monkeypatch.setattr(approval, "get_current_session_key", lambda default=None: "s", raising=False)
    result = approval._outcome_guard("git push origin main")   # 声明 high+one-way → 双签格
    assert result["approved"] is False
    assert result.get("approval_pending") is True
    assert result["outcome_ref"]["outcomeId"] == "oc-1"
    assert result["outcome_ref"]["contractVersion"] == 5
    assert result["outcome_ref"]["ownerPersonId"] == "owner@t"
    assert result["outcome_ref"]["verificationOwnerId"] == "verifier@t"
    assert result["dual_sign_required"] is True


def test_outcome_guard_no_surface_clears_thread_local_mark(monkeypatch):
    """审查 M1：no-surface 分支不经 _human_decision 的入口清标记——必须自清，同线程
    下一个无关决策不得带残留 outcome 标记。"""
    monkeypatch.setattr(op, "outcome_context", lambda: _CTX_DUAL)
    monkeypatch.setattr(approval, "_presence", lambda cb=None: (None, False, False, False))
    monkeypatch.setattr(approval, "get_current_session_key", lambda default=None: "s", raising=False)
    approval._outcome_guard("git push origin main")
    assert getattr(approval._OUTCOME_TLS, "outcome", None) is None
    # 同线程下一决策（无 outcome 上下文）不产标记
    monkeypatch.setattr(op, "outcome_context", lambda: None)
    assert approval._outcome_guard("rm -rf build") is None
    assert getattr(approval._OUTCOME_TLS, "outcome", None) is None


def test_outcome_ask_gateway_payload_omits_session_always_options(monkeypatch):
    """审查 M3：outcome ask 从不消费 session/always grant——答案面不得展示（one-shot 化）；
    同时审批条目随带 outcome_ref 与 dual_sign 标记（I1 随条目下发）。"""
    monkeypatch.setattr(op, "outcome_context", lambda: _CTX_DUAL)
    captured = {}

    def fake_await(session_key, notify_cb, data, surface="gateway", identity=None):
        captured.update(data)
        return {"resolved": True, "choice": "deny", "reason": None}

    monkeypatch.setattr(approval, "_await_gateway_decision", fake_await)
    monkeypatch.setattr(approval, "_gateway_notify_cb", lambda sk: (lambda d: None))
    monkeypatch.setattr(approval, "_presence", lambda cb=None: (None, False, True, False))
    monkeypatch.setattr(approval, "get_current_session_key", lambda default=None: "s", raising=False)
    result = approval._outcome_guard("git push origin main")
    assert captured.get("allow_session") is False        # 不展示 session
    assert captured.get("allow_permanent") is False      # 不展示 always
    assert captured.get("dual_sign_required") is True
    assert captured["outcome_ref"]["outcomeId"] == "oc-1"
    assert result["approved"] is False                    # deny 回包正常终结


def test_ledger_pending_record_carries_dual_sign_flag(tmp_path, monkeypatch):
    """审查 M2：pending 终态入账带 outcomeId/contractVersion/owner/verifier＋dualSignRequired。"""
    monkeypatch.setenv("HERMES_APPROVAL_LEDGER_DIR", str(tmp_path))
    record_approval_decision(
        tool="terminal",
        result={"approved": False, "status": "pending_approval", "approval_pending": True,
                "dual_sign_required": True,
                "outcome_ref": {"outcomeId": "oc-9", "contractVersion": 12,
                                "ownerPersonId": "owner@t", "verificationOwnerId": "verifier@t"}},
        session_id="s", profile="p", platform="agent_bridge", mode="build")
    record = json.loads((tmp_path / "approval-ledger.jsonl").read_text(encoding="utf-8").strip())
    assert record["recordType"] == "approval.pending"
    assert record["detail"]["outcomeId"] == "oc-9"
    assert record["detail"]["contractVersion"] == 12
    assert record["detail"]["ownerPersonId"] == "owner@t"
    assert record["detail"]["verificationOwnerId"] == "verifier@t"
    assert record["detail"]["dualSignRequired"] is True


# ---------- 6) 复审收口（2026-11-20）：CLI/transport 直答旁门＋deferred 引用 ----------

def test_dual_sign_cli_prompt_consent_refused(monkeypatch, caplog):
    """复审 I1：CLI prompt 面单人 "y"（once）不能放行 dual-sign 条目——grant 收口
    deny-only，message 含「审批收件箱」指引，且 warning 留痕。"""
    monkeypatch.setattr(op, "outcome_context", lambda: _CTX_DUAL)
    monkeypatch.setattr(approval, "_presence", lambda cb=None: (None, True, False, False))
    monkeypatch.setattr(approval, "_present_with_selected_transport",
                        lambda **kw: {"selected": False})
    monkeypatch.setattr(approval, "prompt_dangerous_approval", lambda *a, **kw: "once")
    monkeypatch.setattr(approval, "get_current_session_key", lambda default=None: "s", raising=False)
    with caplog.at_level("WARNING", logger="tools.approval"):
        result = approval._outcome_guard("git push origin main")
    assert result["approved"] is False
    assert result.get("outcome") == "dual_sign_refused"
    assert "审批收件箱" in result["message"]
    assert any("审批收件箱" in rec.message for rec in caplog.records)


def test_dual_sign_transport_consent_refused(monkeypatch):
    """复审 I1：transport 插件面 choice="once" 同样不能放行 dual-sign 条目。"""
    monkeypatch.setattr(op, "outcome_context", lambda: _CTX_DUAL)
    monkeypatch.setattr(approval, "_presence", lambda cb=None: (None, True, False, False))
    monkeypatch.setattr(approval, "_present_with_selected_transport",
                        lambda **kw: {"selected": True, "name": "test-transport", "choice": "once"})
    monkeypatch.setattr(approval, "get_current_session_key", lambda default=None: "s", raising=False)
    result = approval._outcome_guard("git push origin main")
    assert result["approved"] is False
    assert result.get("outcome") == "dual_sign_refused"
    assert "审批收件箱" in result["message"]


def test_non_dual_sign_cli_consent_still_grants(monkeypatch):
    """收口不误伤：非双签的 outcome ask（medium 格）在 CLI 面单人 once 照常放行。"""
    ctx = {"taskId": "task-1", "outcomeId": "oc-1", "contractVersion": 3}   # 无声明 → ls 为 low
    monkeypatch.setattr(op, "outcome_context", lambda: ctx)
    monkeypatch.setattr(approval, "_presence", lambda cb=None: (None, True, False, False))
    monkeypatch.setattr(approval, "_present_with_selected_transport",
                        lambda **kw: {"selected": False})
    monkeypatch.setattr(approval, "prompt_dangerous_approval", lambda *a, **kw: "once")
    monkeypatch.setattr(approval, "get_current_session_key", lambda default=None: "s", raising=False)
    result = approval._outcome_guard("echo deploy note")   # low+reversible+external → build:ask 非双签
    assert result["approved"] is True
    assert result.get("user_approved") is True


def test_record_deferred_approval_carries_outcome_fields(tmp_path, monkeypatch):
    """复审 M1：deferred.json 记录带 outcome_ref（含 owner/verifier）与 dual_sign_required
    ——T12 收件箱识别双签待决条目依赖。"""
    from hermes_cli import followups

    monkeypatch.setattr(followups, "capture_route", lambda: {"kind": "api"})
    monkeypatch.setenv("HERMES_HOME", str(tmp_path / "hermes"))
    rec = approval._record_deferred_approval(
        session_key="s", request_id="r1", tool="terminal", preview="git push", risk="high",
        outcome_ref={"outcomeId": "oc-1", "contractVersion": 5,
                     "ownerPersonId": "owner@t", "verificationOwnerId": "verifier@t"},
        dual_sign_required=True)
    assert rec is not None
    assert rec["outcome_ref"]["outcomeId"] == "oc-1"
    assert rec["outcome_ref"]["contractVersion"] == 5
    assert rec["outcome_ref"]["ownerPersonId"] == "owner@t"
    assert rec["outcome_ref"]["verificationOwnerId"] == "verifier@t"
    assert rec["dual_sign_required"] is True
    on_disk = json.loads((tmp_path / "hermes" / "approvals" / "deferred.json").read_text(encoding="utf-8"))
    assert on_disk[-1]["outcome_ref"]["outcomeId"] == "oc-1"
    assert on_disk[-1]["dual_sign_required"] is True


def test_record_deferred_approval_without_outcome_unchanged(tmp_path, monkeypatch):
    """非 outcome 挂起（缺省参数）不落 outcome 字段——既有记录形状不变。"""
    from hermes_cli import followups

    monkeypatch.setattr(followups, "capture_route", lambda: {"kind": "api"})
    monkeypatch.setenv("HERMES_HOME", str(tmp_path / "hermes"))
    rec = approval._record_deferred_approval(
        session_key="s", request_id="r2", tool="terminal", preview="rm -rf x", risk="high")
    assert rec is not None
    assert "outcome_ref" not in rec
    assert "dual_sign_required" not in rec

def test_runtime_mirror_identical_to_vendor():
    """runtime/tools/outcome_policy.py 与 vendor 注入态逐字节一致（补丁 806 双侧同构，
    照 771/805 先例以 diff 断言锁定）。"""
    vendor = REPO_ROOT / "vendor" / "hermes-agent" / "tools" / "outcome_policy.py"
    mirror = REPO_ROOT / "runtime" / "tools" / "outcome_policy.py"
    assert mirror.read_bytes() == vendor.read_bytes(), "runtime 镜像与 vendor 注入态漂移"

def test_outcome_guard_allow_result_carries_outcome_ref(monkeypatch):
    ctx = {"taskId": "task-1", "outcomeId": "oc-1", "contractVersion": 5}
    monkeypatch.setattr(op, "outcome_context", lambda: ctx)
    result = approval._outcome_guard("ls -la")
    assert result is not None and result["approved"] is True
    assert result["outcome_ref"]["outcomeId"] == "oc-1"
    assert result["outcome_ref"]["contractVersion"] == 5


def test_outcome_guard_deny_takes_guardian_deny_shape(monkeypatch):
    ctx = {"taskId": "task-1", "outcomeId": "oc-1", "contractVersion": 5}
    monkeypatch.setattr(op, "outcome_context", lambda: ctx)
    monkeypatch.setenv("HERMES_OUTCOME_MODE", "plan")          # plan 挡：outcome-scoped 一律 deny
    result = approval._outcome_guard("git push origin main")
    assert result is not None and result["approved"] is False
    assert result.get("smart_denied") is True
    assert result["outcome_ref"]["outcomeId"] == "oc-1"


def test_outcome_guard_non_scoped_returns_none(monkeypatch):
    monkeypatch.setattr(op, "outcome_context", lambda: None)
    assert approval._outcome_guard("rm -rf build") is None


def test_ledger_records_outcome_reference(tmp_path, monkeypatch):
    """allow 记账带 outcome 引用：detail 落 outcomeId/contractVersion（收件箱/审计消费）。"""
    monkeypatch.setenv("HERMES_APPROVAL_LEDGER_DIR", str(tmp_path))
    result = {"approved": True, "message": None,
              "outcome_ref": {"outcomeId": "oc-9", "contractVersion": 12}}
    record_approval_decision(tool="terminal", result=result, session_id="s",
                             profile="p", platform="agent_bridge", mode="build")
    lines = (tmp_path / "approval-ledger.jsonl").read_text(encoding="utf-8").strip().splitlines()
    assert len(lines) == 1
    record = json.loads(lines[0])
    assert record["recordType"] == "approval.exempted"
    assert record["detail"]["outcomeId"] == "oc-9"
    assert record["detail"]["contractVersion"] == 12


def test_ledger_without_outcome_ref_unchanged(tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_APPROVAL_LEDGER_DIR", str(tmp_path))
    record_approval_decision(tool="terminal", result={"approved": True, "message": None},
                             session_id="s", profile="p", platform="cli", mode="build")
    record = json.loads((tmp_path / "approval-ledger.jsonl").read_text(encoding="utf-8").strip())
    assert "outcomeId" not in record.get("detail", {})
