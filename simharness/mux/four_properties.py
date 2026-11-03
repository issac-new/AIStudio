#!/usr/bin/env python3
"""四性自评节（四性四格补齐批 F3，2026-11-03）。

读 run 目录下的可选制品，产出报告用 HTML 片段：
  准确性   ← evidence/ac-trace.json（AC 绑定/结果/失败）
  可靠性   ← governance/stage-keys/*.json（四把阶段键齐备度）
  安全性   ← evidence/posture-admission.json（姿态档位与阻断项）
  可治理性 ← evidence/independence-summary.json（审阅独立性三态计数）

纪律：
- 缺席写「未采集」，绝不写 0——未采集与零是两件事。
- 只读：不创建、不修复任何制品；坏档按未采集处理并给出原因。
- CLI 模式输出 JSON 摘要，供守门测试与人工核对。
"""
from __future__ import annotations

import json
import os
import sys
from html import escape

STAGES = ("req-frozen", "design-approved", "dev-done", "verify-done")


def _load(path: str):
    """读 JSON；缺席/坏档返回 (None, 原因)。"""
    if not os.path.exists(path):
        return None, "未采集"
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f), ""
    except Exception as e:  # noqa: BLE001 - 坏档按未采集处理，不让报告链崩
        return None, f"解析失败：{e}"


def _cell(value: str, status: str) -> dict:
    return {"value": value, "status": status}


def _missing(why: str) -> dict:
    """缺席行：原因必须出现在读数里，不能只藏在状态字段。"""
    detail = "" if why in ("", "未采集") else f"（{why}）"
    return _cell(f"未采集{detail}", "未采集")


def collect(run_dir: str) -> list[dict]:
    """四行读数（纯读）。返回 [{name, value, status, detail}]。"""
    rows: list[dict] = []

    # 准确性：AC 追溯
    trace, why = _load(os.path.join(run_dir, "evidence", "ac-trace.json"))
    if trace is None:
        rows.append({**_missing(why), "name": "准确性"})
    else:
        j = trace.get("judgement") or {}
        total = trace.get("acTotal", 0)
        gaps = len(j.get("unbound") or []) + len(j.get("noResult") or []) + len(j.get("failed") or [])
        verdict = "完整" if j.get("ok") else "存在缺口"
        rows.append({
            **_cell(f"AC {total} 条 · {verdict} · 缺口 {gaps}", "collected"),
            "name": "准确性",
        })

    # 可靠性：阶段交接键齐备度
    keys_dir = os.path.join(run_dir, "governance", "stage-keys")
    present = []
    if os.path.isdir(keys_dir):
        present = sorted(
            f[: -len(".json")] for f in os.listdir(keys_dir) if f.endswith(".json")
        )
    if not present:
        rows.append({**_missing("未采集"), "name": "可靠性"})
    else:
        missing = [s for s in STAGES if s not in present]
        detail = f"齐备 {len(present)}/{len(STAGES)}"
        if missing:
            detail += " · 缺 " + "、".join(missing)
        rows.append({**_cell(detail, "collected"), "name": "可靠性"})

    # 安全性：姿态准入
    posture, why = _load(os.path.join(run_dir, "evidence", "posture-admission.json"))
    if posture is None:
        rows.append({**_missing(why), "name": "安全性"})
    else:
        adm = posture.get("admission") or posture
        mode = adm.get("mode", "?")
        admits = adm.get("admits")
        blockers = len(adm.get("blockers") or [])
        verdict = "准入" if admits else f"阻断 {blockers} 项"
        rows.append({**_cell(f"档位 {mode} · {verdict}", "collected"), "name": "安全性"})

    # 可治理性：审阅独立性三态
    indep, why = _load(os.path.join(run_dir, "evidence", "independence-summary.json"))
    if indep is None:
        rows.append({**_missing(why), "name": "可治理性"})
    else:
        same = indep.get("sameModel", 0)
        ind = indep.get("independent", 0)
        unknown = indep.get("unknown", 0)
        rows.append({
            **_cell(f"独立 {ind} · 共模 {same} · 未知 {unknown}", "collected"),
            "name": "可治理性",
        })
    return rows


def build_section(run_dir: str) -> str:
    """生成 HTML 片段（无外部依赖、可内联）。"""
    rows = collect(run_dir)
    trs = []
    for r in rows:
        cls = "fp-ok" if r["status"] == "collected" else "fp-miss"
        trs.append(
            "<tr>"
            f"<th style=\"text-align:left;padding:6px 8px;border-bottom:1px solid #eee\">{escape(r['name'])}</th>"
            f"<td class=\"{cls}\" style=\"padding:6px 8px;border-bottom:1px solid #eee\">{escape(r['value'])}</td>"
            "</tr>"
        )
    return (
        "<div class=\"four-properties\" data-testid=\"four-properties\">"
        "<h3 style=\"font-size:13px;margin:14px 0 6px\">四性自评（读数与采集状态）</h3>"
        "<table style=\"width:100%;border-collapse:collapse;font-size:12px\">"
        "<thead><tr>"
        "<th style=\"text-align:left;padding:6px 8px;border-bottom:1px solid #ddd\">性质</th>"
        "<th style=\"text-align:left;padding:6px 8px;border-bottom:1px solid #ddd\">读数</th>"
        "</tr></thead><tbody>"
        + "".join(trs)
        + "</tbody></table>"
        "<p style=\"font-size:11px;color:#888;margin:6px 0 0\">"
        "「未采集」表示该制品未落盘，不等于 0 或通过。</p>"
        "</div>"
    )


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("usage: four_properties.py <run_dir> [--html]", file=sys.stderr)
        raise SystemExit(2)
    run_dir = sys.argv[1]
    if "--html" in sys.argv[2:]:
        print(build_section(run_dir))
    else:
        print(json.dumps(collect(run_dir), ensure_ascii=False, indent=1))
