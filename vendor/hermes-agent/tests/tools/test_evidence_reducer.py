"""Tests for the Evidence-Preserving Reducer (SoL-Pi mechanism #4) — fail-through bias.

Every failure mode must return the original observation unchanged: that IS the
capability floor. The only success path is a receipt whose quoted lines all verify
verbatim against the archived source.
"""

import json
from unittest.mock import patch

import pytest

from hermes_constants import reset_hermes_home_override, set_hermes_home_override
from tools import evidence_reducer as er


@pytest.fixture(autouse=True)
def isolated_home(tmp_path):
    token = set_hermes_home_override(str(tmp_path / "hermes"))
    yield tmp_path
    reset_hermes_home_override(token)


BIG = "\n".join(f"2026-10-12T10:00:{i % 60:02d} INFO step {i} completed" for i in range(300))


def enabled_config(**over):
    raw = {"enabled": True, "provider": "testp", "model": "testm"}
    raw.update(over)
    return er.ReducerConfig(raw)


GOOD_RECEIPT = (
    "## Summary\nRan 300 steps; the tail shows repeated completion with no failures.\n\n"
    "## Evidence\n"
    "> 2026-10-12T10:00:10 INFO step 10 completed\n"
    "> 2026-10-12T10:00:59 INFO step 299 completed\n\n"
    "## Verdict\npass — no failures observed"
)


class TestFailThroughs:
    def test_disabled_by_default(self):
        out = er.maybe_reduce_observation(BIG, "terminal", "tid_1")
        assert out is BIG

    def test_below_threshold(self):
        out = er.maybe_reduce_observation("short log", "terminal", "tid_2",
                                          config=enabled_config(threshold_chars=4096))
        assert out == "short log"

    def test_non_target_tool(self):
        out = er.maybe_reduce_observation(BIG, "write_file", "tid_3",
                                          config=enabled_config())
        assert out is BIG

    def test_model_error_passes_through(self):
        with patch.object(er, "_call_reducer_model", side_effect=RuntimeError("boom")):
            out = er.maybe_reduce_observation(BIG, "terminal", "tid_4",
                                              config=enabled_config())
        assert out is BIG

    def test_oversized_receipt_passes_through(self):
        with patch.object(er, "_call_reducer_model", return_value="x" * 5000):
            out = er.maybe_reduce_observation(BIG, "terminal", "tid_5",
                                              config=enabled_config(max_receipt_chars=2500))
        assert out is BIG

    def test_quote_mismatch_passes_through(self):
        receipt = GOOD_RECEIPT.replace("step 10 completed", "step 10 FAILED (invented)")
        with patch.object(er, "_call_reducer_model", return_value=receipt):
            out = er.maybe_reduce_observation(BIG, "terminal", "tid_6",
                                              config=enabled_config())
        assert out is BIG

    def test_secretish_receipt_passes_through(self):
        receipt = GOOD_RECEIPT + "\n> token sk-abcdefghijklmnopqrst"
        with patch.object(er, "_call_reducer_model", return_value=receipt):
            out = er.maybe_reduce_observation(BIG, "terminal", "tid_7",
                                              config=enabled_config())
        assert out is BIG

    def test_no_quotes_passes_through(self):
        with patch.object(er, "_call_reducer_model",
                          return_value="## Summary\nall fine, trust me"):
            out = er.maybe_reduce_observation(BIG, "terminal", "tid_8",
                                              config=enabled_config())
        assert out is BIG


class TestSuccessPath:
    def test_verified_receipt_replaces_observation(self):
        with patch.object(er, "_call_reducer_model", return_value=GOOD_RECEIPT):
            out = er.maybe_reduce_observation(BIG, "terminal", "tid_9",
                                              config=enabled_config())
        assert out.startswith(er._RECEIPT_OPEN)
        assert "verified verbatim" in out
        assert "Result id for obs_recall: tid_9" in out
        assert "2 quote(s)" in out
        assert GOOD_RECEIPT in out
        assert len(out) < len(BIG)

    def test_original_archived_before_reduction(self):
        with patch.object(er, "_call_reducer_model", return_value=GOOD_RECEIPT):
            er.maybe_reduce_observation(BIG, "terminal", "tid_10",
                                        config=enabled_config())
        from tools.tool_result_storage import get_spillover_dir
        archive = get_spillover_dir() / "tid_10.txt"
        assert archive.is_file()
        assert archive.read_text() == BIG  # full fidelity lives outside the model context

    def test_ledger_success_and_failure(self):
        from tools.efficiency_ledger import ledger_path
        with patch.object(er, "_call_reducer_model", return_value=GOOD_RECEIPT):
            er.maybe_reduce_observation(BIG, "terminal", "tid_ok", config=enabled_config())
        with patch.object(er, "_call_reducer_model", side_effect=RuntimeError("x")):
            er.maybe_reduce_observation(BIG, "terminal", "tid_bad", config=enabled_config())
        events = [json.loads(l) for l in ledger_path().read_text().splitlines()]
        outcomes = {e["ref"]: e["outcome"] for e in events if e["kind"] == "evidence_reduce"}
        assert outcomes["tid_ok"] == "reduced"
        assert outcomes["tid_bad"] == "passthrough_model_error"


class TestQuoteVerification:
    def test_exact_lines_verify(self):
        src_lines = set(BIG.splitlines())
        ok, total, verified = er.verify_quotes(GOOD_RECEIPT, src_lines)
        assert (ok, total, verified) == (True, 2, 2)

    def test_first_miss_aborts(self):
        receipt = "> 2026-10-12T10:00:10 INFO step 10 completed\n> not a real line"
        ok, total, verified = er.verify_quotes(receipt, set(BIG.splitlines()))
        assert ok is False and total == 2 and verified == 1

    def test_empty_quotes_fail(self):
        assert er.verify_quotes("no quotes", set(BIG.splitlines()))[0] is False


class TestConfig:
    def test_defaults_are_fail_closed(self):
        cfg = er.ReducerConfig(None)
        assert cfg.enabled is False
        assert cfg.threshold_chars == er.DEFAULT_THRESHOLD_CHARS

    def test_non_dict_config_is_disabled(self):
        assert er.ReducerConfig("junk").enabled is False

    def test_target_tools_override(self):
        cfg = er.ReducerConfig({"enabled": True, "target_tools": ["my_runner"]})
        assert "my_runner" in cfg.target_tools and "terminal" not in cfg.target_tools
