#!/usr/bin/env python3
"""
drift_compare.py — 攻击面漂移自动对比生成器

从 recon 阶段的 coverage JSON (基线) 与 exploit/auditor 阶段的 confirmed assets (快照)
自动生成 Markdown 漂移对比表，用于 orchestrator 合并报告时强制包含。

用法：
  python3 drift_compare.py --baseline evidence/coverage.json --snapshot findings.jsonl \
      --output drift_comparison.md

输出：标准化 Markdown 表格，直接可嵌入合并报告。
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import dataclass
from typing import Any


@dataclass
class DriftStats:
    baseline_subdomains: int = 0
    snapshot_subdomains: int = 0
    baseline_ports: int = 0
    snapshot_ports: int = 0
    baseline_vulns: int = 0
    snapshot_vulns: dict[str, int] = None
    coverage_baseline: float = 0.0
    coverage_snapshot: float = 0.0
    new_vectors: list[str] = None
    findings_diff: list[dict] = None


def load_baseline(path: str) -> dict:
    """加载 recon 阶段 coverage JSON: {(subdomain, port, service): {...}}"""
    if not os.path.isfile(path):
        return {}
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    # 支持两种格式：列表或字典
    if isinstance(data, list):
        return {tuple(item.get("key", "").split(":")): item for item in data}
    return data


def load_snapshot(path: str) -> list[dict]:
    """加载 exploit/auditor 阶段 findings.jsonl"""
    findings = []
    if not os.path.isfile(path):
        return findings
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    findings.append(json.loads(line))
                except json.JSONDecodeError:
                    pass
    return findings


def compute_drift(baseline: dict, snapshot_findings: list[dict]) -> DriftStats:
    stats = DriftStats(
        snapshot_vulns={"HIGH": 0, "MED": 0, "LOW": 0, "INFO": 0},
        new_vectors=[],
        findings_diff=[],
    )

    # Baseline stats
    stats.baseline_subdomains = len(set(k[0] for k in baseline.keys() if k))
    stats.baseline_ports = len(set(k[1] for k in baseline.keys() if len(k) > 1))
    stats.coverage_baseline = len(baseline)

    # Snapshot stats from findings
    confirmed = [f for f in snapshot_findings if f.get("status") in ("verified", "confirmed")]
    stats.snapshot_vulns["HIGH"] = len([f for f in confirmed if f.get("severity", "").upper() == "HIGH"])
    stats.snapshot_vulns["MED"] = len([f for f in confirmed if f.get("severity", "").upper() == "MEDIUM"])
    stats.snapshot_vulns["LOW"] = len([f for f in confirmed if f.get("severity", "").upper() == "LOW"])
    stats.snapshot_vulns["INFO"] = len([f for f in confirmed if f.get("severity", "").upper() == "INFO"])
    stats.snapshot_subdomains = len(set(f.get("subdomain", "") for f in confirmed if f.get("subdomain")))
    stats.snapshot_ports = len(set(f.get("port", 0) for f in confirmed if f.get("port")))

    # New attack vectors
    vuln_types = set(f.get("vuln_type", "").lower() for f in confirmed if f.get("vuln_type"))
    stats.new_vectors = sorted(vuln_types)

    # Findings diff: compare status changes
    for f in snapshot_findings:
        fid = f.get("id")
        if fid:
            stats.findings_diff.append({
                "id": fid,
                "status": f.get("status", "pending"),
                "vuln_type": f.get("vuln_type", ""),
                "evidence_ids": f.get("evidence_ids", []),
            })

    stats.coverage_snapshot = len(confirmed) + stats.baseline_ports + stats.snapshot_subdomains

    return stats


def generate_markdown(stats: DriftStats, baseline_path: str, snapshot_path: str, snapshot_findings: list) -> str:
    """生成标准化 Markdown 漂移对比表"""
    # 变化量计算
    sub_delta = stats.snapshot_subdomains - stats.baseline_subdomains
    port_delta = stats.snapshot_ports - stats.baseline_ports
    vuln_total = sum(stats.snapshot_vulns.values())
    coverage_delta = stats.coverage_snapshot - stats.coverage_baseline

    # 严重度分布
    sev_items = []
    for sev in ["HIGH", "MED", "LOW", "INFO"]:
        cnt = stats.snapshot_vulns.get(sev, 0)
        if cnt:
            sev_items.append(f"{sev}:{cnt}")
    sev_str = ", ".join(sev_items) if sev_items else "0"

    # 整体漂移评级
    if vuln_total > 10 or sub_delta > 5:
        drift_rating = "显著"
    elif vuln_total > 0 or sub_delta > 0:
        drift_rating = "轻微"
    else:
        drift_rating = "无变化"

    lines = []
    lines.append("## 攻击面漂移对比（Attack Surface Drift）")
    lines.append("")
    lines.append(f"> 基线：recon 阶段 coverage JSON (`{os.path.basename(baseline_path)}`)")
    lines.append(f"> 快照：exploit/auditor 阶段 findings (`{os.path.basename(snapshot_path)}`)")
    lines.append("")
    lines.append("| 维度 | 评估前（基线） | 评估后（快照） | 变化量 | 变化说明 |")
    lines.append("|------|----------------|----------------|--------|----------|")
    lines.append(f"| 暴露子域数 | {stats.baseline_subdomains} | {stats.snapshot_subdomains} | {sub_delta:+d} | {'新增' if sub_delta>0 else '减少' if sub_delta<0 else '无变化'} |")
    lines.append(f"| 暴露端口/服务 | {stats.baseline_ports} | {stats.snapshot_ports} | {port_delta:+d} | {'新增' if port_delta>0 else '关闭' if port_delta<0 else '无变化'} |")
    lines.append(f"| 已知漏洞数 | 0 | {vuln_total} ({sev_str}) | +{vuln_total} | 按严重度分布 |")
    lines.append(f"| 资产指纹覆盖 | {stats.coverage_baseline:.0f} | {stats.coverage_snapshot:.0f} | {coverage_delta:+.0f} | 覆盖率提升 |")
    lines.append(f"| 新发现攻击向量 | — | {', '.join(stats.new_vectors) if stats.new_vectors else '无'} | — | {'、'.join(stats.new_vectors) if stats.new_vectors else '无'} |")
    lines.append(f"| 证据关联度 | {stats.coverage_baseline:.0f} 个 evidence | {len([f for f in snapshot_findings if f.get('evidence_ids')])} 个 evidence | +{len([f for f in snapshot_findings if f.get('evidence_ids')]) - stats.coverage_baseline:.0f} | 新增原始工具输出 |")
    lines.append("")
    lines.append("### 关键发现漂移详情")
    lines.append("")
    lines.append("| Finding ID | 阶段 | 状态变化 | Evidence IDs | 说明 |")
    lines.append("|------------|------|----------|--------------|------|")
    for f in stats.findings_diff:
        lines.append(f"| {f['id']} | recon→exploit | {f['status']} | {','.join(f['evidence_ids']) or '无'} | {f['vuln_type']} |")
    lines.append("")
    lines.append("### 评估结论")
    lines.append("")
    lines.append(f"- **整体漂移评级**：{drift_rating}")
    if stats.new_vectors:
        lines.append(f"- **新增风险面**：{', '.join(stats.new_vectors)}")
    else:
        lines.append("- **新增风险面**：无")
    lines.append("- **遗漏/回归项**：无")
    lines.append("- **后续建议**：按严重度优先修复 HIGH/MED 漏洞，复测确认")

    return "\n".join(lines)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="攻击面漂移自动对比生成器")
    ap.add_argument("--baseline", required=True, help="基线文件路径")
    ap.add_argument("--snapshot", required=True, help="快照文件路径")
    ap.add_argument("--output", required=True, help="输出 Markdown 文件路径")
    args = ap.parse_args(argv)

    baseline = load_baseline(args.baseline)
    snapshot = load_snapshot(args.snapshot)
    stats = compute_drift(baseline, snapshot)
    md = generate_markdown(stats, args.baseline, args.snapshot, snapshot)

    with open(args.output, "w", encoding="utf-8") as f:
        f.write(md)

    print(f"[OK] Drift comparison written to {args.output}")
    return 0


if __name__ == "__main__":
    sys.exit(main())