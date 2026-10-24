#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Asset Summary — 侦察资产 13 维大盘汇总（省 Token 摘要范式）

来源: ARL-Next (https://github.com/owl234/ARL-Next) mcp-server/server.py:122-217
      export_task_assets 工具 — GPL-3.0
移植: 2026-09-08, Hermes hack-recon（ARL-Next P1 借鉴项 1）
剥离: MongoDB / ARL API / MCP 依赖 → 纯本地 recon/<APEX>/ 产物文件扫描（零网络请求）
保留: 13 资产维度并发导出框架(ThreadPoolExecutor max_workers=5, 对齐 server.py:180) /
      「维度 | 检出数 | 关键突破点」省 Token Markdown 大盘范式 / 高危漏洞与敏感凭据优先提示

用法:
  python3 asset_summary.py --recon-dir recon/<APEX>/ [--output summary.json]

行为:
  扫描目录内已知产物文件（wih.json / httpx jsonl / nuclei jsonl / 子域清单 txt /
  nmap / url / fileleak / cert / ip / cip ...），缺文件容错；全量结构化数据写
  --output 指定的 summary.json（缺省写 <recon-dir>/summary.json），stdout 仅输出
  ≤40 行 Markdown 摘要表。只做「已有产物汇总」，不做任何主动探测。

退出码: 0=有资产数据 1=全空 2=运行错误（对齐 wih_engine 约定）
纪律: 仅用于授权范围内目标的自有侦察产物（配合 _shared/constraint-policy.md scope 门）。
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

logger_name = "asset-summary"

# ─────────────────────────────────────────────────────────────────────────────
# §1 13 维定义 — 对齐源 server.py:116-120 ALL_TABS，映射到本地产物文件名模式
#    顺序即分类优先级：特异关键词在前，泛化关键词在后（先 wih 后 domain 等）
# ─────────────────────────────────────────────────────────────────────────────
DIMENSIONS: List[Tuple[str, str, str]] = [
    # (dim_key, 中文标签, 相对路径小写匹配正则)
    ("wih",           "敏感信息 (wih)",           r"(?:^|[/_.\-])wih"),
    ("nuclei_result", "Nuclei 探测点",            r"nuclei"),
    ("vuln",          "已确认风险 (vuln)",        r"vuln"),
    ("fileleak",      "文件泄露 (fileleak)",      r"fileleak|file_leak|leak"),
    ("cert",          "SSL 证书 (cert)",          r"cert|crtsh"),
    ("npoc_service",  "Python服务识别 (npoc)",    r"npoc"),
    ("stat_finger",   "指纹统计 (stat_finger)",   r"finger|stat_finger|tech"),
    ("cip",           "C 段网段 (cip)",           r"(?:^|[/_.\-])cip|c_?segment"),
    ("service",       "端口服务 (service)",       r"nmap|service|portscan|(?:^|[/_.\-])ports?(?:$|[/_.\-])"),
    ("url",           "URL 爬虫记录 (url)",       r"(?:^|[/_.\-])urls?(?:$|[/_.\-])|katana|crawl|gau\b|wayback"),
    ("site",          "站点 (site)",              r"httpx|(?:^|[/_.\-])sites?(?:$|[/_.\-])|(?:^|[/_.\-])live(?:$|[/_.\-])"),
    ("domain",        "子域名 (domain)",          r"(?:^|[/_.\-])(?:sub)?domains?|(?:^|[/_.\-])subs?(?:$|[/_.\-])"),
    ("ip",            "IP 资产 (ip)",             r"(?:^|[/_.\-])ips?(?:$|[/_.\-])|ip_?ranges?"),
]

# 去重类维度（txt/csv 逐行唯一计数）
DEDUP_DIMS = {"domain", "ip", "url", "cip"}

# 单文件读取上限（防异常大文件 OOM）
MAX_FILE_BYTES = 64 * 1024 * 1024

# stdout 摘要硬上限（对齐「≤40 行」需求）
STDOUT_LINE_CAP = 40
HINT_CAP = 5


# ─────────────────────────────────────────────────────────────────────────────
# §2 维度分类器
# ─────────────────────────────────────────────────────────────────────────────
def classify_file(rel_path_lower: str) -> Optional[str]:
    """按 §1 优先级把产物文件映射到 13 维之一；未命中返回 None。"""
    for dim_key, _label, pattern in DIMENSIONS:
        try:
            if re.search(pattern, rel_path_lower):
                return dim_key
        except re.error:  # 防御：模式异常不致命
            continue
    return None


def _read_text_limited(path: Path) -> str:
    raw = path.read_bytes()[:MAX_FILE_BYTES]
    return raw.decode("utf-8", errors="replace")


def _extract_record_list(data: Any) -> Tuple[List[Any], int]:
    """从任意 JSON 结构里尽力抽记录列表；返回 (records, parse_errors)。

    兼容: wih_engine 落盘 {"records": [...]} / ARL 导出 {"items": [...]} /
    裸列表 [...] / {"data": {...}} 等常见壳。
    """
    if isinstance(data, list):
        return data, 0
    if isinstance(data, dict):
        for key in ("records", "items", "results", "result", "data", "list"):
            val = data.get(key)
            if isinstance(val, list):
                return val, 0
            if isinstance(val, dict):  # 一层嵌套壳（如 {"data": {"list": [...]}}）
                inner, err = _extract_record_list(val)
                if inner:
                    return inner, err
        return [], 0
    return [], 1


# ─────────────────────────────────────────────────────────────────────────────
# §3 单文件解析器（容错：坏行跳过并计数，绝不抛出）
# ─────────────────────────────────────────────────────────────────────────────
def parse_file(path: Path, dim_key: str) -> Dict[str, Any]:
    """解析单个产物文件，返回该文件在该维度下的计数与统计细节。"""
    out: Dict[str, Any] = {
        "file": str(path),
        "dim": dim_key,
        "count": 0,
        "parse_errors": 0,
        "detail": {},
    }
    try:
        if path.stat().st_size == 0:
            return out  # 空文件容错（对齐 ARL 空导出也落盘的约定）
        suffix = path.suffix.lower()
        if suffix == ".json":
            try:
                data = json.loads(_read_text_limited(path))
            except (json.JSONDecodeError, ValueError):
                out["parse_errors"] = 1
                return out
            records, err = _extract_record_list(data)
            out["parse_errors"] += err
            out["count"] = len(records)
            out["detail"] = _detail_from_records(dim_key, records)
        elif suffix == ".jsonl":
            records: List[Any] = []
            for line in _read_text_limited(path).splitlines():
                line = line.strip()
                if not line:
                    continue
                try:
                    records.append(json.loads(line))
                except (json.JSONDecodeError, ValueError):
                    out["parse_errors"] += 1
            out["count"] = len(records)
            out["detail"] = _detail_from_records(dim_key, records)
        else:
            # txt / csv / md / nmap 等行式产物：非空非注释行计数，去重类维度 unique
            lines = [
                ln.strip()
                for ln in _read_text_limited(path).splitlines()
                if ln.strip() and not ln.strip().startswith("#")
            ]
            if dim_key in DEDUP_DIMS:
                uniq = {ln.lower().rstrip(".") for ln in lines}
                out["count"] = len(uniq)
                out["detail"]["unique"] = True
                out["detail"]["raw_lines"] = len(lines)
            else:
                out["count"] = len(lines)
    except OSError as exc:  # 读取失败容错
        out["parse_errors"] += 1
        out["detail"]["error"] = str(exc)[:120]
    return out


def _detail_from_records(dim_key: str, records: List[Any]) -> Dict[str, Any]:
    """按维度抽取少量聚合细节（只留计数，不留敏感内容本身 — 脱敏纪律）。"""
    detail: Dict[str, Any] = {}
    dicts = [r for r in records if isinstance(r, dict)]
    if dim_key == "wih":
        by_risk: Dict[str, int] = {}
        by_type: Dict[str, int] = {}
        for r in dicts:
            risk = str(r.get("risk_level") or r.get("risk") or "UNKNOWN").upper()
            rtype = str(r.get("recordType") or r.get("type") or "UNKNOWN")
            by_risk[risk] = by_risk.get(risk, 0) + 1
            by_type[rtype] = by_type.get(rtype, 0) + 1
        detail = {"by_risk": by_risk, "by_type": by_type}
    elif dim_key == "nuclei_result":
        by_sev: Dict[str, int] = {}
        for r in dicts:
            sev = str(r.get("severity") or "unknown").lower()
            by_sev[sev] = by_sev.get(sev, 0) + 1
        detail = {"by_severity": by_sev}
    elif dim_key == "site":
        by_status: Dict[str, int] = {}
        for r in dicts:
            status = r.get("status_code") or r.get("status") or "unknown"
            bucket = f"{int(status) // 100}xx" if str(status).isdigit() else str(status)
            by_status[bucket] = by_status.get(bucket, 0) + 1
        detail = {"by_status": by_status}
    elif dim_key == "vuln":
        by_sev: Dict[str, int] = {}
        for r in dicts:
            sev = str(r.get("severity") or "unknown").lower()
            by_sev[sev] = by_sev.get(sev, 0) + 1
        detail = {"by_severity": by_sev}
    return detail


# ─────────────────────────────────────────────────────────────────────────────
# §4 突破点提示生成（高危漏洞 / 敏感凭据优先 — 对齐源 server.py:206-215）
# ─────────────────────────────────────────────────────────────────────────────
def build_hints(stats: Dict[str, Dict[str, Any]]) -> List[str]:
    hints: List[str] = []
    vuln_n = stats.get("vuln", {}).get("count", 0)
    nuc = stats.get("nuclei_result", {})
    nuc_total = nuc.get("count", 0)
    nuc_high = sum(
        n for k, n in nuc.get("detail", {}).get("by_severity", {}).items()
        if k in ("critical", "high")
    )
    if vuln_n > 0 or nuc_high > 0:
        hints.append(
            f"⚠️ **发现高危风险**：{vuln_n} 个已确认漏洞 + {nuc_high}/{nuc_total} "
            f"Nuclei critical/high 命中，请优先审查 vuln / nuclei_result 明细。"
        )
    wih = stats.get("wih", {})
    wih_total = wih.get("count", 0)
    wih_crit = sum(
        n for k, n in wih.get("detail", {}).get("by_risk", {}).items()
        if k in ("CRITICAL", "HIGH")
    )
    fileleak_n = stats.get("fileleak", {}).get("count", 0)
    if wih_total > 0 or fileleak_n > 0:
        types = wih.get("detail", {}).get("by_type", {})
        top_types = "、".join(
            f"{k}×{v}" for k, v in sorted(types.items(), key=lambda kv: -kv[1])[:3]
        )
        type_note = f"（主要类型: {top_types}）" if top_types else ""
        hints.append(
            f"🔑 **发现敏感信息/泄露**：{wih_total} 条 WIH 敏感字段（CRITICAL/HIGH "
            f"{wih_crit} 条）{type_note} + {fileleak_n} 处文件泄露，请核查 wih / fileleak 明细。"
        )
    site_n = stats.get("site", {}).get("count", 0)
    ip_n = stats.get("ip", {}).get("count", 0)
    dom_n = stats.get("domain", {}).get("count", 0)
    if site_n > 0 or ip_n > 0 or dom_n > 0:
        hints.append(
            f"🌐 **Web 资产总览**：已收敛 {site_n} 个 Web 站点 / {dom_n} 个子域 / "
            f"{ip_n} 个主机节点，可作为入口面排序基础。"
        )
    svc_n = stats.get("service", {}).get("count", 0)
    if svc_n > 0 and len(hints) < HINT_CAP:
        hints.append(f"🛰️ **暴露服务**：{svc_n} 条端口/服务记录，关注非常规端口与管理面板。")
    return hints[:HINT_CAP]


# ─────────────────────────────────────────────────────────────────────────────
# §5 stdout 摘要（≤40 行硬上限）
# ─────────────────────────────────────────────────────────────────────────────
def render_markdown(recon_dir: str, stats: Dict[str, Dict[str, Any]],
                    unclassified: List[str], totals: Dict[str, int],
                    hints: List[str], out_path: Path) -> str:
    lines: List[str] = []
    total_assets = sum(s.get("count", 0) for s in stats.values())
    lines.append(f"# 🎯 侦察资产大盘：{recon_dir}")
    lines.append(
        f"> 生成: {time.strftime('%Y-%m-%d %H:%M:%S')} | 13 维合计 "
        f"{total_assets} 条 | 全量落盘: `{out_path}`"
    )
    lines.append("")
    lines.append("## 📊 维度统计")
    lines.append("| 资产维度 | 检出数 | 来源文件 |")
    lines.append("| :--- | ---: | :--- |")
    label_of = {k: l for k, l, _p in DIMENSIONS}
    for dim_key, label, _p in DIMENSIONS:
        entry = stats.get(dim_key, {"count": 0, "files": []})
        files = entry.get("files", [])
        if files:
            shown = files[0]
            more = f" (+{len(files) - 1})" if len(files) > 1 else ""
            file_cell = f"`{shown}`{more}"
        else:
            file_cell = "—"
        lines.append(f"| **{label}** | {entry.get('count', 0)} | {file_cell} |")
    lines.append("")
    lines.append("## 🚀 关键突破点提示")
    if hints:
        lines.extend(f"- {h}" for h in hints)
    else:
        lines.append("- （无高危突破点；盘点既有资产即可）")
    if unclassified:
        lines.append(
            f"- 📎 {len(unclassified)} 个未归类文件已记录于 summary.json.unclassified_files"
        )
    lines.append("")
    lines.append(
        "💡 13 维全量数据（含 by_risk / by_severity 聚合）已写入 summary.json，"
        "无需重复扫描。"
    )
    if len(lines) > STDOUT_LINE_CAP:  # 防御性裁剪：从尾部截断到硬上限
        lines = lines[:STDOUT_LINE_CAP]
    return "\n".join(lines) + "\n"


# ─────────────────────────────────────────────────────────────────────────────
# §6 主流程
# ─────────────────────────────────────────────────────────────────────────────
def collect_files(recon_dir: Path) -> List[Path]:
    """收集目录内产物文件（深度 ≤3，跳过隐藏/汇总产物自身）。"""
    found: List[Path] = []
    if not recon_dir.is_dir():
        return found
    for p in sorted(recon_dir.rglob("*")):
        if not p.is_file():
            continue
        rel = p.relative_to(recon_dir)
        if any(part.startswith(".") for part in rel.parts):
            continue
        if p.name in ("summary.json",) or rel.parts[0] == "arl":
            continue  # 跳过自身输出与 ARL 导出缓存目录
        found.append(p)
    return found


def run(recon_dir: Path) -> Tuple[Dict[str, Any], int]:
    files = collect_files(recon_dir)
    buckets: Dict[str, List[Path]] = {k: [] for k, _l, _p in DIMENSIONS}
    unclassified: List[str] = []
    for p in files:
        rel_lower = str(p.relative_to(recon_dir)).lower()
        dim = classify_file(rel_lower)
        if dim is None:
            unclassified.append(rel_lower)
        else:
            buckets[dim].append(p)

    stats: Dict[str, Dict[str, Any]] = {
        k: {"count": 0, "files": [], "detail": {}} for k, _l, _p in DIMENSIONS
    }
    parse_errors = 0
    # 并发解析 — 对齐源 server.py:179-183（ThreadPoolExecutor max_workers=5）
    jobs = [(dim, p) for dim, paths in buckets.items() for p in paths]
    results_by_dim: Dict[str, List[Tuple[str, Dict[str, Any]]]] = {
        k: [] for k, _l, _p in DIMENSIONS
    }
    if jobs:
        with ThreadPoolExecutor(max_workers=5) as executor:
            futures = {executor.submit(parse_file, p, dim): (dim, p) for dim, p in jobs}
            for fut in as_completed(futures):
                dim, p = futures[fut]
                try:
                    res = fut.result()
                except Exception as exc:  # 兜底：单文件异常不拖垮整体
                    res = {"file": str(p), "dim": dim, "count": 0,
                           "parse_errors": 1, "detail": {"error": str(exc)[:120]}}
                results_by_dim[dim].append((str(p.relative_to(recon_dir)), res))
                parse_errors += res["parse_errors"]

    # 单线程聚合（快）：计数累加 + detail 计数字典合并到维度级
    _COUNT_KEYS = ("by_risk", "by_type", "by_severity", "by_status")
    for dim, file_results in results_by_dim.items():
        if not file_results:
            continue
        # 主展示文件 = 贡献计数最高的（空/坏文件不遮蔽有效产物）
        file_results.sort(key=lambda fr: -fr[1].get("count", 0))
        for rel, res in file_results:
            stats[dim]["count"] += res["count"]
            stats[dim]["files"].append(rel)
            fdetail = res.get("detail") or {}
            for key, val in fdetail.items():
                if key in _COUNT_KEYS and isinstance(val, dict):
                    agg = stats[dim]["detail"].setdefault(key, {})
                    for sub, n in val.items():
                        agg[sub] = agg.get(sub, 0) + n
                else:  # unique/error 等非计数细节保留到 _files 追溯层
                    stats[dim]["detail"].setdefault("_files", []).append(
                        {"file": rel, key: val}
                    )

    totals = {
        "records": sum(s["count"] for s in stats.values()),
        "files_scanned": len(files),
        "files_unclassified": len(unclassified),
        "parse_errors": parse_errors,
    }
    hints = build_hints(stats)
    payload = {
        "schema": "asset_summary/1.0",
        "recon_dir": str(recon_dir),
        "generated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "dimensions": stats,
        "unclassified_files": unclassified,
        "hints": hints,
        "totals": totals,
    }
    exit_code = 0 if totals["records"] > 0 else 1
    return payload, exit_code


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        prog="asset_summary.py",
        description="侦察资产 13 维大盘汇总（ARL-Next export_task_assets 范式移植，纯本地零网络）",
    )
    parser.add_argument("--recon-dir", required=True,
                        help="侦察产物目录，如 recon/<APEX>/")
    parser.add_argument("--output", default=None,
                        help="全量结构化 JSON 落盘路径（缺省 <recon-dir>/summary.json）")
    try:
        args = parser.parse_args(argv)
    except SystemExit:
        return 2  # 参数错误按运行错误约定

    recon_dir = Path(args.recon_dir)
    if not recon_dir.is_dir():
        print(f"[!] recon 目录不存在或不可读: {recon_dir}", file=sys.stderr)
        return 2

    try:
        payload, exit_code = run(recon_dir)
    except Exception as exc:  # 顶层兜底 → 运行错误
        print(f"[!] 汇总失败: {exc}", file=sys.stderr)
        return 2

    out_path = Path(args.output) if args.output else recon_dir / "summary.json"
    try:
        out_path.parent.mkdir(parents=True, exist_ok=True)
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
    except OSError as exc:
        print(f"[!] summary.json 写入失败: {exc}", file=sys.stderr)
        return 2

    md = render_markdown(
        str(recon_dir), payload["dimensions"], payload["unclassified_files"],
        payload["totals"], payload["hints"], out_path,
    )
    sys.stdout.write(md)
    return exit_code


if __name__ == "__main__":
    sys.exit(main())
