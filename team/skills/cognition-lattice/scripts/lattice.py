#!/usr/bin/env python3
"""认知格栅（cognition-lattice）知识库检索、审计、索引与无损清洗工具。

仅依赖 Python 3 标准库。所有路径相对于技能根目录解析。

    python3 scripts/lattice.py search 确认偏误
    python3 scripts/lattice.py search 锚定 --file cognitive_biases.md --show
    python3 scripts/lattice.py show MM-0001
    python3 scripts/lattice.py show references/mental_models.md:42
    python3 scripts/lattice.py audit [--json]
    python3 scripts/lattice.py index
    python3 scripts/lattice.py fix
"""

from __future__ import annotations

import argparse
import ast
import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REF = ROOT / "references"
SCRIPTS = Path(__file__).resolve().parent
INDEX_PATH = SCRIPTS / "index.json"

DIMENSIONS = [
    ("CB", "cognitive_biases.md", "认知偏差"),
    ("PE", "psychological_effects.md", "心理效应"),
    ("MM", "mental_models.md", "思维模型"),
    ("TF", "thinking_frameworks.md", "思维框架"),
    ("IT", "interdisciplinary_tools.md", "跨学科心智工具"),
    ("EW", "eastern_wisdom.md", "东方传统智慧"),
    ("AF", "argumentation_fallacies.md", "论证谬误"),
    ("MT", "management_thinking.md", "管理思维"),
    ("GT", "growth_thinking.md", "成长思维模型"),
]

H2 = re.compile(r"^##\s+(.+?)\s*$")
H3 = re.compile(r"^###\s+(\d+)\.\s+(.+?)\s*$")
FIELD = re.compile(r"^-\s+\*\*(.+?)\*\*\s*[:：]\s*(.*)$")
TOC_LINK = re.compile(r"^(\d+\.\s+)\[([^\]]+)\]\(#[^)]+\)\s*$")
ANCHOR = re.compile(r"\]\(#([^)]+)\)")

CORE_FIELDS = ("释义", "核心机制", "典型应用场景")
TEMPLATE_SCENE = "复杂决策分析；风险评估场景；战略规划讨论"


@dataclass
class Entry:
    id: str
    name: str
    aliases: list[str]
    category: str
    file: str
    line: int
    number: int
    dimension: str
    fields: dict[str, str] = field(default_factory=dict)
    text: str = ""

    def location(self) -> str:
        return f"references/{self.file}:{self.line}"

    def haystack(self) -> dict[str, str]:
        return {
            "name": self.name.lower(),
            "aliases": " | ".join(self.aliases).lower(),
            "category": self.category.lower(),
            "body": self.text.lower(),
        }


def split_title(raw: str) -> tuple[str, list[str]]:
    raw = raw.replace("**", "").strip()
    raw = re.sub(r"\s{2,}", " ", raw)
    aliases: list[str] = []
    for group in re.findall(r"[（(]([^）)]*)[）)]", raw):
        aliases.extend(p.strip() for p in re.split(r"[/／、,，]", group) if p.strip())
    name = re.sub(r"[（(][^）)]*[）)]", "", raw).strip(" -")
    for part in re.split(r"[/／]", name):
        if part.strip() and part.strip() != name:
            aliases.append(part.strip())
    return name, list(dict.fromkeys(aliases))


def parse_file(filename: str, prefix: str, dimension: str) -> list[Entry]:
    lines = (REF / filename).read_text(encoding="utf-8").splitlines()
    category = "未分类"
    entries: list[Entry] = []
    i = 0
    while i < len(lines):
        m2 = H2.match(lines[i])
        if m2:
            category = m2.group(1).strip()
            i += 1
            continue
        m3 = H3.match(lines[i])
        if not m3:
            i += 1
            continue
        start, number, raw_title = i, int(m3.group(1)), m3.group(2)
        block = [lines[start]]
        fields: dict[str, str] = {}
        current: str | None = None
        i += 1
        while i < len(lines):
            line = lines[i]
            if H2.match(line) or H3.match(line) or line.startswith("# "):
                break
            fm = FIELD.match(line)
            if fm:
                current = fm.group(1).strip()
                fields[current] = fm.group(2).strip()
                block.append(line)
                i += 1
                continue
            if current and (line.startswith("  ") or line.startswith("\t")) and line.strip():
                fields[current] = (fields[current] + " " + line.strip()).strip()
                block.append(line)
                i += 1
                continue
            if line.strip() == "" or line.startswith("---") or line.startswith("> "):
                block.append(line)
                i += 1
                continue
            current = None
            block.append(line)
            i += 1
        name, aliases = split_title(raw_title)
        entries.append(
            Entry(
                id=f"{prefix}-{len(entries) + 1:04d}",
                name=name,
                aliases=aliases,
                category=category,
                file=filename,
                line=start + 1,
                number=number,
                dimension=dimension,
                fields=fields,
                text="\n".join(block).strip(),
            )
        )
    return entries


def load_entries() -> list[Entry]:
    entries: list[Entry] = []
    for prefix, filename, label in DIMENSIONS:
        entries.extend(parse_file(filename, prefix, label))
    return entries


def norm_name(name: str) -> str:
    name = re.sub(r"[（(].*?[）)]", "", name).lower()
    return re.sub(r"[\s\-_·、,，/／:：.。]", "", name)


def slug(title: str) -> str:
    s = re.sub(r"[^\w\u4e00-\u9fff\s-]", "", title.lower())
    return re.sub(r"\s+", "-", s.strip())


def find_duplicates(entries: list[Entry]) -> list[dict]:
    groups: dict[str, list[Entry]] = {}
    for e in entries:
        key = norm_name(e.name)
        if key:
            groups.setdefault(key, []).append(e)
    return [
        {"name": g[0].name, "count": len(g), "ids": [e.id for e in g]}
        for g in groups.values()
        if len(g) > 1
    ]


def template_flags(e: Entry) -> list[str]:
    f = e.fields
    flags: list[str] = []
    if f.get("释义") and f["释义"] == f.get("核心机制"):
        flags.append("释义与核心机制重复")
    if f.get("精辟释义") and f["精辟释义"] == f.get("释义"):
        flags.append("精辟释义与释义重复")
    if f.get("来源/创始人") == "跨学科通用" or f.get("来源") == "跨学科通用":
        flags.append("来源为占位文本")
    if f.get("典型应用场景") == TEMPLATE_SCENE:
        flags.append("应用场景为模板句")
    body = e.text
    if "如何运用" in body and "形成可执行的解决方案" in body:
        flags.append("套壳应用步骤")
    if any(v.strip().startswith("[") for v in f.values()):
        flags.append("字段含列表字面量")
    return flags


def anchors_audit() -> tuple[list[str], int]:
    broken: list[str] = []
    total = 0
    for path in sorted(REF.glob("*.md")):
        text = path.read_text(encoding="utf-8")
        valid = {slug(m.group(1)) for m in (H2.match(l) for l in text.splitlines()) if m}
        for lineno, line in enumerate(text.splitlines(), 1):
            for anchor in ANCHOR.findall(line):
                total += 1
                if anchor not in valid:
                    broken.append(f"references/{path.name}:{lineno} → #{anchor}")
    return broken, total


def collect_audit(entries: list[Entry]) -> dict:
    per_file: dict[str, dict] = {}
    for prefix, filename, label in DIMENSIONS:
        subset = [e for e in entries if e.file == filename]
        categories: dict[str, list[int]] = {}
        for e in subset:
            categories.setdefault(e.category, []).append(e.number)
        flag_counts: dict[str, int] = {}
        core_coverage = 0
        for e in subset:
            for flag in template_flags(e):
                flag_counts[flag] = flag_counts.get(flag, 0) + 1
            if all(k in e.fields for k in CORE_FIELDS):
                core_coverage += 1
        irregular = []
        for cat, numbers in categories.items():
            if numbers != list(range(1, len(numbers) + 1)) and numbers != list(
                range(numbers[0], numbers[0] + len(numbers))
            ):
                irregular.append({"category": cat, "first": numbers[:5], "count": len(numbers)})
        per_file[filename] = {
            "prefix": prefix,
            "dimension": label,
            "entries": len(subset),
            "categories": len(categories),
            "category_counts": {k: len(v) for k, v in categories.items()},
            "core_fields_complete": core_coverage,
            "template_flags": flag_counts,
            "irregular_numbering": irregular,
        }
    broken, anchor_total = anchors_audit()
    duplicates = find_duplicates(entries)
    placeholders = []
    for path in sorted(REF.glob("*.md")):
        for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if re.search(r"TODO|TBA|待补充|待定|占位符", line, re.I):
                placeholders.append(f"references/{path.name}:{lineno}")
    skill = (ROOT / "SKILL.md").read_text(encoding="utf-8")
    frontmatter_ok = skill.startswith("---\n") and "name:" in skill[:400] and "description:" in skill[:800]
    return {
        "total_entries": len(entries),
        "total_categories": sum(v["categories"] for v in per_file.values()),
        "files": per_file,
        "duplicate_name_groups": len(duplicates),
        "duplicate_entries": sum(d["count"] - 1 for d in duplicates),
        "duplicate_top": sorted(duplicates, key=lambda d: -d["count"])[:12],
        "broken_anchors": broken,
        "anchor_total": anchor_total,
        "placeholders": placeholders,
        "frontmatter_ok": frontmatter_ok,
    }


def print_audit(report: dict) -> None:
    print(f"总条目 {report['total_entries']} / 分类 {report['total_categories']} / 知识维度 9")
    print(f"{'文件':<32}{'条目':>6}{'分类':>6}{'核心字段完整':>14}{'模板标记':>10}")
    for filename, v in report["files"].items():
        flags = sum(v["template_flags"].values())
        print(
            f"{filename:<32}{v['entries']:>6}{v['categories']:>6}"
            f"{v['core_fields_complete']:>14}{flags:>10}"
        )
    print("\n模板化/数据残留明细（按文件）：")
    for filename, v in report["files"].items():
        if v["template_flags"]:
            print(f"  {filename}: " + ", ".join(f"{k} {n}" for k, n in sorted(v["template_flags"].items())))
    print("\n编号非连续的分类（历史遗留，编号不可作为引用键）：")
    for filename, v in report["files"].items():
        if v["irregular_numbering"]:
            print(f"  {filename}: {len(v['irregular_numbering'])} 个分类")
    print(f"\n同名重复组 {report['duplicate_name_groups']} 组 / 冗余条目 {report['duplicate_entries']} 条")
    for d in report["duplicate_top"]:
        print(f"  {d['name']}: {d['count']} 处 ({', '.join(d['ids'])})")
    print(f"\n失效锚点 {len(report['broken_anchors'])}/{report['anchor_total']}")
    for b in report["broken_anchors"][:15]:
        print(f"  {b}")
    print(f"占位符 {len(report['placeholders'])} 处")
    print(f"SKILL.md frontmatter: {'通过' if report['frontmatter_ok'] else '缺失字段'}")


def score_entry(e: Entry, queries: list[str], full: bool) -> int | None:
    h = e.haystack()
    total = 0
    for q in queries:
        if q == h["name"]:
            s = 100
        elif h["name"].startswith(q):
            s = 85
        elif q in h["name"]:
            s = 70
        elif q in h["aliases"]:
            s = 60
        elif q in h["category"]:
            s = 35
        elif full and q in h["body"]:
            s = 10
        else:
            return None
        total += s
    return total


def cmd_search(args: argparse.Namespace, entries: list[Entry]) -> None:
    queries = [q.lower() for q in args.query]
    scored = []
    for e in entries:
        if args.file and args.file not in e.file:
            continue
        if args.category and args.category not in e.category:
            continue
        s = score_entry(e, queries, args.full)
        if s is not None:
            scored.append((s, e))
    scored.sort(key=lambda pair: (-pair[0], pair[1].id))
    hits = scored[: args.limit]
    if args.json:
        print(json.dumps([{"id": e.id, "name": e.name, "aliases": e.aliases,
                           "category": e.category, "location": e.location(), "score": s}
                          for s, e in hits], ensure_ascii=False, indent=2))
        return
    print(f"命中 {len(scored)} 条，显示前 {len(hits)} 条：")
    for s, e in hits:
        alias = f" ({', '.join(e.aliases[:2])})" if e.aliases else ""
        print(f"  [{e.id}] {e.name}{alias} | {e.category} | {e.location()}")
    if args.show:
        for _, e in hits[:3]:
            print("\n" + "=" * 60)
            print(e.text)
            print(f"来源：{e.location()} / ID {e.id}")


def cmd_show(args: argparse.Namespace, entries: list[Entry]) -> None:
    target = args.target
    found: Entry | None = None
    for e in entries:
        if target.lower() == e.id.lower() or target == e.location() or target == f"{e.file}:{e.line}":
            found = e
            break
    if found is None:
        scored = [(score_entry(e, [target.lower()], False), e) for e in entries]
        scored = [(s, e) for s, e in scored if s is not None]
        scored.sort(key=lambda pair: -(pair[0] or 0))
        exact = [e for s, e in scored if s == 100]
        if len(exact) == 1:
            found = exact[0]
        else:
            print(f"未找到唯一条目：{target}", file=sys.stderr)
            for s, e in scored[:10]:
                print(f"  [{e.id}] {e.name} | {e.location()}", file=sys.stderr)
            sys.exit(2)
    print(f"# {found.id} · {found.name} · {found.dimension} / {found.category}")
    print(f"# 来源 {found.location()}\n")
    print(found.text)


def cmd_index(entries: list[Entry]) -> None:
    duplicates = find_duplicates(entries)
    payload = {
        "generated_by": "scripts/lattice.py index",
        "note": "行号随内容编辑变化；检索请以 scripts/lattice.py search 的实时结果为准",
        "dimensions": [{"id": p, "file": f"references/{f}", "label": l} for p, f, l in DIMENSIONS],
        "total": len(entries),
        "entries": [
            {"id": e.id, "name": e.name, "aliases": e.aliases, "category": e.category,
             "dimension": e.dimension, "file": f"references/{e.file}", "line": e.line}
            for e in entries
        ],
        "duplicate_name_groups": duplicates,
    }
    INDEX_PATH.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"已生成 {INDEX_PATH.relative_to(ROOT)}：{len(entries)} 条，{len(duplicates)} 组同名重复")


def cmd_fix() -> None:
    summary = []
    for path in sorted(REF.glob("*.md")):
        raw = path.read_bytes().decode("utf-8")
        nl = "\r\n" if "\r\n" in raw else "\n"
        lines = raw.split(nl)
        list_fixed = toc_fixed = 0
        for i, line in enumerate(lines):
            fm = FIELD.match(line)
            if fm:
                value = fm.group(2).strip()
                if value.startswith("["):
                    try:
                        obj = ast.literal_eval(value)
                    except (ValueError, SyntaxError):
                        obj = None
                    if isinstance(obj, (list, tuple)) and obj and all(isinstance(x, str) for x in obj):
                        pos = line.rfind(value)
                        lines[i] = line[:pos] + "、".join(obj) + line[pos + len(value):]
                        list_fixed += 1
                        continue
            m = TOC_LINK.match(line)
            if m:
                lines[i] = f"{m.group(1)}{m.group(2)}"
                toc_fixed += 1
        if list_fixed or toc_fixed:
            path.write_bytes(nl.join(lines).encode("utf-8"))
            summary.append((path.name, list_fixed, toc_fixed))
    if not summary:
        print("无需修复（清洗幂等）")
        return
    for name, a, b in summary:
        print(f"  {name}: 列表字面量 {a} 处，失效目录链接 {b} 处")
    print(f"已清洗 {len(summary)} 个文件；仅做等价格式转换，未删除任何条目或字段")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("search", help="按术语/别名/分类检索条目")
    p.add_argument("query", nargs="+", help="关键词，多个词为 AND 关系")
    p.add_argument("--file", help="限定文件名，如 cognitive_biases.md")
    p.add_argument("--category", help="限定分类名")
    p.add_argument("--full", action="store_true", help="同时搜索条目正文")
    p.add_argument("--show", action="store_true", help="打印前 3 条完整正文")
    p.add_argument("--limit", type=int, default=20)
    p.add_argument("--json", action="store_true")

    p = sub.add_parser("show", help="按 ID 或 文件:行号 输出完整条目")
    p.add_argument("target")

    p = sub.add_parser("audit", help="结构与质量审计")
    p.add_argument("--json", action="store_true")

    sub.add_parser("index", help="生成 scripts/index.json 机读索引")
    sub.add_parser("fix", help="无损清洗：字段列表字面量、失效目录链接")

    args = parser.parse_args()
    if args.command == "fix":
        cmd_fix()
        return
    entries = load_entries()
    if args.command == "search":
        cmd_search(args, entries)
    elif args.command == "show":
        cmd_show(args, entries)
    elif args.command == "audit":
        report = collect_audit(entries)
        if args.json:
            print(json.dumps(report, ensure_ascii=False, indent=2))
        else:
            print_audit(report)
    elif args.command == "index":
        cmd_index(entries)


if __name__ == "__main__":
    main()
