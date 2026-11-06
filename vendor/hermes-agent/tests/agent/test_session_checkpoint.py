"""会话进展 checkpoint 写手守门（mimo P7，spec 2026-09-24-session-checkpoint-writer.md §4.1）。

覆盖：模板/解析、校验器（五节/锚点/next 黑名单/预算）、写手重写一次+兜底、
覆盖语义（同 task 后写覆盖先写，不静默丢弃）、原子落盘 + sentinel 半文拒收、
对账四分支降级且幂等不叠加、env 开关。
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

_WORKTREE = Path(__file__).resolve().parents[2]
if str(_WORKTREE) not in sys.path:
    sys.path.insert(0, str(_WORKTREE))

from agent.session_checkpoint import (  # noqa: E402
    _CHECKPOINT_END, _verify_done_line,
    SECTIONS, build_writer_prompt, load_checkpoint, parse_checkpoint,
    reconcile_checkpoint, validate_checkpoint, write_checkpoint, checkpoint_enabled,
)

GOOD = """## goal
修复登录页在 Safari 的会话丢失

## done
- 读 `packages/client/src/views/LoginView.vue:61` 确认 token 未持久化
- `pytest tests/login -q` 3/12 失败（test_expire/test_refresh/test_safari）

## next
在 auth.ts:61 后补 storeMatrixCredentials 调用并跑 `pytest tests/login -q`

## blockers
none

## artifacts
diff.patch
"""


class TestParseAndValidate:
    def test_parse_five_sections(self):
        s = parse_checkpoint(GOOD)
        assert set(SECTIONS) <= set(s)
        assert "Safari" in s["goal"]
        assert len(s["done"].splitlines()) == 2

    def test_validator_passes_good_checkpoint(self):
        assert validate_checkpoint(parse_checkpoint(GOOD)) == []

    def test_validator_flags_missing_sections_and_anchorless_done_and_vague_next(self):
        bad = "## goal\nx\n\n## done\n- 做了一些修改\n\n## next\n继续推进\n\n## blockers\nnone\n\n## artifacts\nnone\n"
        errors = validate_checkpoint(parse_checkpoint(bad))
        assert any("缺节" in e for e in errors) is False  # 节都有
        assert any("缺锚点" in e for e in errors)
        assert any("next 是空话" in e for e in errors)

    def test_validator_names_missing_section(self):
        errors = validate_checkpoint(parse_checkpoint("## goal\nx"))
        assert any("缺节" in e for e in errors)

    def test_prompt_contains_budgets_and_sections(self):
        p = build_writer_prompt("stop", "goal hint", "digest text", "t_1")
        for s in SECTIONS:
            assert f"`{s}`" in p


class TestWriterLoop:
    def test_good_writer_passes_first_try(self, tmp_path):
        path = write_checkpoint("t_ok", 1, reason="stop", trajectory_digest="d",
                                call_fn=lambda s, p: GOOD, memory_root=tmp_path)
        assert path is not None and path.exists()
        assert "generation=1" in path.read_text(encoding="utf-8")

    def test_bad_then_good_rewrites_once(self, tmp_path):
        calls = []

        def flaky(system, prompt):
            calls.append(1)
            return "## goal\nx\n\n## done\n- 无锚点\n\n## next\n继续\n\n## blockers\nn\n\n## artifacts\nn" if len(calls) == 1 else GOOD

        write_checkpoint("t_retry", 1, reason="stop", trajectory_digest="d", call_fn=flaky, memory_root=tmp_path)
        assert len(calls) == 2  # 重写一次后通过

    def test_two_bad_attempts_fall_back_to_raw_digest(self, tmp_path):
        def always_bad(system, prompt):
            return "## goal\nx"  # 缺节

        path = write_checkpoint("t_fb", 1, reason="interrupt", goal_hint="任务目标X",
                                trajectory_digest="RAW TRAJECTORY LINE 1\nLINE 2", call_fn=always_bad, memory_root=tmp_path)
        text = path.read_text(encoding="utf-8")
        assert "fallback" in text and "任务目标X" in text and "RAW TRAJECTORY" in text

    def test_writer_exception_falls_back(self, tmp_path):
        def boom(system, prompt):
            raise RuntimeError("aux down")

        path = write_checkpoint("t_exc", 1, reason="stop", trajectory_digest="digest", call_fn=boom, memory_root=tmp_path)
        assert path is not None

    def test_same_task_overwrites_without_dropping(self, tmp_path):
        ok = lambda s, p: GOOD
        assert write_checkpoint("t_ow", 5, reason="stop", trajectory_digest="d",
                                call_fn=ok, memory_root=tmp_path) is not None
        # 同 task 再写不被静默丢弃（含跨 run 常量 generation，如预算触顶的 api_call_count）。
        p2 = write_checkpoint("t_ow", 5, reason="budget_exhausted", trajectory_digest="d2",
                              call_fn=lambda s, p: GOOD.replace("Safari", "Chrome"),
                              memory_root=tmp_path)
        assert p2 is not None and p2.exists()
        text = (tmp_path / "checkpoints" / "t_ow.md").read_text(encoding="utf-8")
        assert "Chrome" in text and "generation=5" in text

    def test_env_switch_disables(self, tmp_path, monkeypatch):
        monkeypatch.setenv("HERMES_SESSION_CHECKPOINT", "0")
        assert checkpoint_enabled() is False
        assert write_checkpoint("t_off", 1, reason="stop", trajectory_digest="d",
                                call_fn=lambda s, p: GOOD, memory_root=tmp_path) is None


class TestReconcile:
    def test_reconcile_degrades_missing_and_nocheck(self, tmp_path):
        (tmp_path / "ws").mkdir()
        existing = tmp_path / "ws" / "auth.ts"
        existing.write_text("x" * 10, encoding="utf-8")
        cp = GOOD.replace("diff.patch", f"{existing.name}")  # artifacts 用存在的文件
        target = tmp_path / "checkpoints"
        target.mkdir()
        body = "<!-- checkpoint task=t_rec generation=1 reason=stop -->\n" + cp + "\n" + _CHECKPOINT_END + "\n"
        (target / "t_rec.md").write_text(body, encoding="utf-8")
        # done 两行：一行有 LoginView.vue:61 路径锚（ws 下不存在 → missing-file）、
        # 一行只有反引号命令（无可核验路径 → no-check，不冒充 verified）。
        out = reconcile_checkpoint("t_rec", workspace_root=tmp_path / "ws", memory_root=tmp_path)
        verdicts = {r["verdict"] for r in out["results"]}
        assert "missing-file" in verdicts and "no-check" in verdicts
        # 降级写回：unverified 标注落盘。
        text = (target / "t_rec.md").read_text(encoding="utf-8")
        assert "unverified: missing-file" in text
        # load 面仍在。
        assert load_checkpoint("t_rec", memory_root=tmp_path)["goal"]

    def test_reconcile_absent_task_returns_none(self, tmp_path):
        assert reconcile_checkpoint("t_nope", memory_root=tmp_path) is None

    def test_reconcile_annotations_do_not_stack(self, tmp_path):
        # 幂等：连跑两次 reconcile，标注只留一层，第二次不再改一字。
        (tmp_path / "ws").mkdir()
        target = tmp_path / "checkpoints"
        target.mkdir()
        body = (
            "<!-- checkpoint task=t_idem_rec generation=1 reason=stop -->\n"
            + GOOD + "\n" + _CHECKPOINT_END + "\n"
        )
        (target / "t_idem_rec.md").write_text(body, encoding="utf-8")
        reconcile_checkpoint("t_idem_rec", workspace_root=tmp_path / "ws", memory_root=tmp_path)
        first = (target / "t_idem_rec.md").read_text(encoding="utf-8")
        reconcile_checkpoint("t_idem_rec", workspace_root=tmp_path / "ws", memory_root=tmp_path)
        second = (target / "t_idem_rec.md").read_text(encoding="utf-8")
        assert second == first
        assert second.count("[unverified:") == 2  # 两行各一层，不叠加

    def test_truncated_checkpoint_absent_then_repaired(self, tmp_path):
        # 崩溃截断（无 sentinel）的半文视为无 checkpoint；下次写覆盖修复。
        target = tmp_path / "checkpoints"
        target.mkdir()
        (target / "t_half.md").write_text(
            "<!-- checkpoint task=t_half generation=1 reason=stop -->\n## goal\n半截",
            encoding="utf-8")
        assert load_checkpoint("t_half", memory_root=tmp_path) is None
        path = write_checkpoint("t_half", 2, reason="stop", trajectory_digest="d",
                                call_fn=lambda s, p: GOOD, memory_root=tmp_path)
        assert path is not None
        text = path.read_text(encoding="utf-8")
        assert text.splitlines()[-1].strip() == _CHECKPOINT_END
        assert load_checkpoint("t_half", memory_root=tmp_path) is not None


class TestVerifyDoneLine:
    def test_path_anchor_verified_and_missing(self, tmp_path):
        ws = tmp_path / "ws"
        (ws / "src").mkdir(parents=True)
        (ws / "src" / "auth.ts").write_text("x", encoding="utf-8")
        assert _verify_done_line("- 改 `src/auth.ts:61` 补调用", ws) == "verified"
        assert _verify_done_line("- 改 `src/missing.ts:61` 补调用", ws) == "missing-file"

    def test_non_path_tokens_never_missing_file(self, tmp_path):
        ws = tmp_path / "ws"
        ws.mkdir()
        # github.com、v1.2、3/12 不是文件路径：不得误判 missing-file。
        assert _verify_done_line("- 参考 github.com 文档", ws) == "no-check"
        assert _verify_done_line("- 升级到 v1.2，比例 3/12", ws) == "no-check"
        # 反引号命令无路径锚点：降级 no-check 而非 verified。
        assert _verify_done_line("- `pytest tests/login -q` 通过", ws) == "no-check"
        assert _verify_done_line("- 做了一些修改", ws) == "no-anchor"
