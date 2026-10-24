#!/usr/bin/env python3
"""
evidence_gate.py — 机械证据闸门（fail-closed）

设计参照：VulnClaw `agent/solver.py:_completion_gate` (vulnclaw/agent/solver.py:475-515)
核心信条：结论（FINAL / finding 汇总 / 报告）必须逐字符命中真实证据文件，
          不可信模型自述，不可信"看起来合理"。与 hack-exploit SOUL 的
          "证据级反幻觉闸门（提示性纪律）"互补——本脚本把它从"文字约束"
          升级为"代码级 hard gate"。

退出码约定（便于接入 kanban_complete 前的机械校验）：
  0  = 全部 PASS（所有 finding 的 evidence id 在 evidence 目录有对应文件，
                 且结论关键 token 逐字符命中原始工具输出）
  1  = 存在未通过项（UNVERIFIED）——脚本会打印明细，调用方应 block 或退回重做
  2  = 输入/参数错误（usage 或 evidence 目录不可读）

用法：
  # 1) 校验单个 finding JSONL（每行一个 finding 对象）
  python3 evidence_gate.py --evidence-dir <dir> --findings <findings.jsonl>

  # 2) 校验一份报告 markdown 里所有 [eNNN] 引用是否都存在
  python3 evidence_gate.py --evidence-dir <dir> --report <report.md>

  # 3) 校验结论文本是否逐字符命中给定证据文件内容
  python3 evidence_gate.py --evidence-dir <dir> \
      --claim "SQL注入漏洞: id=1 触发 mysql error" --evidence-ids e001 e003

finding JSONL schema（与 hack-exploit SOUL evidence 约定对齐）:
  {"id":"F1","title":"...","severity":"HIGH","evidence_ids":["e001","e003"],
   "claim":"结论文本，关键 token 必须能在 e001/e003 原文逐字符命中",
   "status":"confirmed|unverified"}

证据文件约定：<evidence-dir>/e001.txt, e002.txt ...（raw 工具输出）。
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from dataclasses import dataclass

_EVIDENCE_ID_RE = re.compile(r"\be\d{3,}\b", re.IGNORECASE)
# 从证据/结论中抽取"像 flag/关键证据"的 token：长度≥5 的字母数字组合
_TOKEN_RE = re.compile(r"[A-Za-z0-9_./:@-]{5,}")


@dataclass
class GateResult:
    ok: bool
    reason: str
    missing_ids: list[str] = None
    ungrounded_tokens: list[str] = None

    def __init__(self):
        self.ok = True
        self.reason = "pass"
        self.missing_ids = []
        self.ungrounded_tokens = []


def _load_evidence(evidence_dir: str) -> dict[str, str]:
    """读取 evidence 目录，返回 {eNNN: 全文小写}。"""
    ev: dict[str, str] = {}
    if not os.path.isdir(evidence_dir):
        return ev
    for fn in os.listdir(evidence_dir):
        m = re.match(r"^(e\d{3,})\.", fn, re.IGNORECASE)
        if not m:
            # 也允许纯 eNNN 文件名
            m = re.match(r"^(e\d{3,})$", fn, re.IGNORECASE)
        if m:
            eid = m.group(1).lower()
            try:
                with open(os.path.join(evidence_dir, fn), "r", encoding="utf-8", errors="replace") as fh:
                    ev[eid] = fh.read().lower()
            except OSError:
                pass
    return ev


def gate_finding(finding: dict, evidence: dict[str, str]) -> GateResult:
    """对齐 _completion_gate：id 必须存在 + 关键 token 必须命中证据原文。"""
    r = GateResult()
    claimed_ids = [x.lower() for x in finding.get("evidence_ids", [])]
    known = set(evidence.keys())

    missing = [i for i in claimed_ids if i not in known]
    if missing:
        r.ok = False
        r.missing_ids = missing
        r.reason = f"finding {finding.get('id','?')} 引用了不存在的证据 id: {missing}"
        return r

    claim = finding.get("claim", "") or finding.get("summary", "")
    if not claim:
        return r  # 无结论文本，放行（id 存在即可）

    # 关键 token 逐字符命中检查（对齐 solver.py:504-513 的 meaningful_terms 逻辑）
    ev_concat = "\n".join(evidence[i] for i in claimed_ids)
    tokens = set(t.lower() for t in _TOKEN_RE.findall(claim))
    # 过滤掉无意义通用词（与 verifier.py 风格一致，仅做最小停用词）
    stop = {"https", "http", "target", "payload", "the", "and", "from", "with", "this", "that"}
    ungrounded = [t for t in tokens if t not in stop and t not in ev_concat]
    if ungrounded:
        r.ok = False
        r.ungrounded_tokens = ungrounded
        r.reason = (
            f"finding {finding.get('id','?')} 结论含未命中证据原文的 token: {ungrounded[:5]}"
        )
    return r


def gate_report(report_path: str, evidence: dict[str, str]) -> GateResult:
    """校验报告里所有 [eNNN] 引用是否存在。"""
    try:
        with open(report_path, "r", encoding="utf-8", errors="replace") as fh:
            text = fh.read()
    except OSError as exc:
        print(f"[ERROR] 无法读取报告: {exc}", file=sys.stderr)
        sys.exit(2)
    ids = [x.lower() for x in _EVIDENCE_ID_RE.findall(text)]
    # 报告中 [e001] 形式
    bracket_ids = re.findall(r"\[(e\d{3,})\]", text, re.IGNORECASE)
    all_ids = sorted(set(ids) | {b.lower() for b in bracket_ids})
    r = GateResult()
    missing = [i for i in all_ids if i not in evidence]
    if missing:
        r.ok = False
        r.missing_ids = missing
        r.reason = f"报告引用了不存在的证据 id: {missing}"
    return r


def gate_claim(claim: str, evidence_ids: list[str], evidence: dict[str, str]) -> GateResult:
    r = GateResult()
    ids = [x.lower() for x in evidence_ids]
    known = set(evidence.keys())
    missing = [i for i in ids if i not in known]
    if missing:
        r.ok = False
        r.missing_ids = missing
        r.reason = f"claim 引用了不存在的证据 id: {missing}"
        return r
    ev_concat = "\n".join(evidence[i] for i in ids if i in evidence)
    tokens = set(t.lower() for t in _TOKEN_RE.findall(claim))
    stop = {"https", "http", "target", "payload", "the", "and", "from", "with", "this", "that"}
    ungrounded = [t for t in tokens if t not in stop and t not in ev_concat]
    if ungrounded:
        r.ok = False
        r.ungrounded_tokens = ungrounded
        r.reason = f"claim 含未命中证据原文的 token: {ungrounded[:5]}"
    return r


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="机械证据闸门 (fail-closed)")
    ap.add_argument("--evidence-dir", required=True, help="证据目录（含 e001.txt 等 raw 输出）")
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--findings", help="findings JSONL 路径（每行一个 finding 对象）")
    g.add_argument("--report", help="报告 markdown 路径，校验其中 [eNNN] 引用")
    g.add_argument("--claim", help="结论文本，配合 --evidence-ids 校验逐字符命中")
    ap.add_argument("--evidence-ids", nargs="*", default=[], help="与 --claim 配合的证据 id 列表")
    args = ap.parse_args(argv)

    evidence = _load_evidence(args.evidence_dir)
    if not evidence:
        print(f"[WARN] evidence 目录为空或不存在: {args.evidence_dir}，无法背书任何结论", file=sys.stderr)
        # fail-closed：空证据库时，任何 claim 都无据可依
        if args.claim or args.report:
            print("[FAIL] 无证据可背书", file=sys.stderr)
            return 1

    results: list[GateResult] = []
    if args.findings:
        try:
            with open(args.findings, "r", encoding="utf-8") as fh:
                for ln, line in enumerate(fh, 1):
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        f = json.loads(line)
                    except json.JSONDecodeError as exc:
                        print(f"[FAIL] findings 第 {ln} 行 JSON 解析失败: {exc}", file=sys.stderr)
                        results.append(GateResult())
                        results[-1].ok = False
                        results[-1].reason = f"line {ln} 不是合法 JSON"
                        continue
                    results.append(gate_finding(f, evidence))
        except OSError as exc:
            print(f"[ERROR] 无法读取 findings: {exc}", file=sys.stderr)
            return 2
    elif args.report:
        results.append(gate_report(args.report, evidence))
    elif args.claim:
        results.append(gate_claim(args.claim, args.evidence_ids, evidence))

    passed = sum(1 for r in results if r.ok)
    failed = [r for r in results if not r.ok]
    print(f"[SUMMARY] {passed}/{len(results)} passed")
    for r in failed:
        print(f"[FAIL] {r.reason}")

    return 0 if not failed else 1


if __name__ == "__main__":
    sys.exit(main())
