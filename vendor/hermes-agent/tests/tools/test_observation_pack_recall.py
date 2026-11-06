"""Tests for SoL-Pi ObservationPack parity: tail excerpt, obs_recall paging, ledger.

Covers ``tools/tool_result_storage.py`` (head+tail persisted message with the recall
id) and ``tools/obs_recall_tool.py`` (id/path resolution confinement + pagination)
plus the ``tools/efficiency_ledger.py`` JSONL trail.
"""

import json
import os

import pytest

from hermes_constants import reset_hermes_home_override, set_hermes_home_override
from tools.efficiency_ledger import ledger_path, record_efficiency_event
from tools.tool_result_storage import (
    PERSISTED_OUTPUT_TAG,
    generate_tail_excerpt,
    maybe_persist_tool_result,
)
from tools import obs_recall_tool as ort


@pytest.fixture(autouse=True)
def isolated_home(tmp_path):
    token = set_hermes_home_override(str(tmp_path / "hermes"))
    yield tmp_path
    reset_hermes_home_override(token)


def _big_log(lines: int = 900) -> str:
    body = "\n".join(f"line-{i} diagnostic payload" for i in range(1, lines))
    return body + "\nFINAL-VERDICT: 3 tests failed at assert x == y"


class TestTailExcerpt:
    def test_short_content_has_no_tail(self):
        assert generate_tail_excerpt("short", max_chars=10) == ""

    def test_tail_carries_the_end(self):
        content = "\n".join(f"l{i}" for i in range(200))
        tail = generate_tail_excerpt(content, max_chars=40)
        assert tail
        assert tail in content
        assert "l199" in tail  # the end survives

    def test_persisted_message_has_head_and_tail_and_ref(self):
        msg = maybe_persist_tool_result(
            content=_big_log(), tool_name="terminal",
            tool_use_id="toolu_tail_1", env=None, threshold=1000)
        assert PERSISTED_OUTPUT_TAG in msg
        assert "Result id for obs_recall: toolu_tail_1" in msg
        assert "Preview (first" in msg
        assert "Tail (last" in msg
        assert "FINAL-VERDICT: 3 tests failed" in msg  # verdict lives at the end
        assert "line-1 diagnostic" in msg            # head survives too

    def test_extract_persisted_path_still_parses(self):
        from tools.tool_result_storage import extract_persisted_path
        msg = maybe_persist_tool_result(
            content=_big_log(), tool_name="terminal",
            tool_use_id="toolu_tail_2", env=None, threshold=1000)
        path = extract_persisted_path(msg)
        assert path and os.path.isfile(path)


class TestObsRecall:
    def test_recall_by_id_paged(self):
        maybe_persist_tool_result(
            content=_big_log(), tool_name="terminal",
            tool_use_id="toolu_rec_1", env=None, threshold=1000)
        res = json.loads(ort._recall_observation("toolu_rec_1", offset=895, limit=5))
        assert res["content"].startswith("895|line-895")
        assert res["truncated"] is True
        assert res["next_offset"] == 900
        assert res["total_lines"] == 900

    def test_recall_last_page_not_truncated(self):
        maybe_persist_tool_result(
            content=_big_log(), tool_name="terminal",
            tool_use_id="toolu_rec_2", env=None, threshold=1000)
        res = json.loads(ort._recall_observation("toolu_rec_2", offset=899, limit=5))
        assert "900|FINAL-VERDICT" in res["content"]
        assert res["truncated"] is False

    def test_recall_by_archive_path(self):
        msg = maybe_persist_tool_result(
            content=_big_log(), tool_name="terminal",
            tool_use_id="toolu_rec_3", env=None, threshold=1000)
        path = msg.split("Full output saved to: ")[1].splitlines()[0]
        res = json.loads(ort._recall_observation(path, offset=1, limit=3))
        assert res["content"].startswith("1|line-1")

    def test_missing_ref_errors(self):
        res = json.loads(ort._recall_observation("nope_missing"))
        assert "error" in res

    def test_arbitrary_paths_refused_outside_spillover(self):
        # obs_recall must not become a second read_file: paths outside the
        # spillover/hermes-results dirs are refused (read_file's deny lists
        # would otherwise be bypassable through it).
        for ref in ("/etc/hosts", str(__file__)):
            res = json.loads(ort._recall_observation(ref))
            assert "error" in res, ref

    def test_handler_requires_ref(self):
        res = json.loads(ort._handle_obs_recall({}))
        assert "error" in res

    def test_handler_end_to_end(self):
        maybe_persist_tool_result(
            content=_big_log(), tool_name="terminal",
            tool_use_id="toolu_rec_4", env=None, threshold=1000)
        res = json.loads(ort._handle_obs_recall({"ref": "toolu_rec_4", "offset": 2, "limit": 2}))
        assert "2|line-2" in res["content"] and "3|line-3" in res["content"]


class TestLedger:
    def test_events_land_in_isolated_home(self):
        maybe_persist_tool_result(
            content=_big_log(), tool_name="terminal",
            tool_use_id="toolu_led_1", env=None, threshold=1000)
        ort._recall_observation("toolu_led_1", offset=1, limit=10)
        events = [json.loads(line) for line in ledger_path().read_text().splitlines()]
        kinds = {e["kind"] for e in events}
        assert {"observation_archive", "obs_recall"} <= kinds
        arch = next(e for e in events if e["kind"] == "observation_archive")
        assert arch["chars_original"] > arch["chars_inline"] > 0
        assert arch["ref"] == "toolu_led_1"

    def test_record_never_raises_on_bad_payload(self):
        assert record_efficiency_event("weird", blob=object()) in (True, False)
        assert record_efficiency_event("deep", nested={"a": {"b": {"c": {"d": {"e": "x"}}}}}) is True
