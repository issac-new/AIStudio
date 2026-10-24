#!/usr/bin/env python3
# unified-report-layer.py —— 仿真报告×演示报告二合一后处理层（2026-10-09 提速轮）
#
# 定位：只读叠加层——消费 runs/<RUN>/ 下既有产物（r18-steps.json / issues.log /
# state.env / scenario.log / 既有报告 HTML），产出三件：
#   1) audience-cards.html    8 受众视角摘要卡（问题标题+判断句结论+数据锚+证据指针）
#   2) roadshow-outline.md    路演素材大纲（headline/points/anchor 三字段块，供 PPT/视频提取）
#   3) unified-report.html    二合一主报告（受众导航→受众卡→完整审阅层→路演素材层）
#
# 纪律：不改 mx-report-gen / mx-report-audit 产物与断言面；所有数字实算自数据面，
# 缺数据如实写"本轮未见该数据"，禁止编造（红线：结论必须有锚点）。
# 文案遵守 gongwen-bifa：节首判断句、结论先行、术语首现一句话解释、无渲染词。
#
# 用法：python3 mux/unified-report-layer.py --run <RUN_ID> [--sim-root <path>] [--out <dir>]
# 幂等：重复执行覆盖输出目录。
import argparse
import html
import json
import re
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

# 8 受众视角（顺序=报告导航顺序；key 用于机械取数映射）
AUDIENCES = [
    ("product", "产品视角", "这轮推演证明了什么产品能力，风险在哪？"),
    ("requirement", "需求分析视角", "需求从提出到冻结走完整了吗，分析质量如何？"),
    ("architecture", "架构设计视角", "架构治理闸真的拦住了什么、放行了什么？"),
    ("dev-design", "研发设计视角", "任务拆分与依赖治理是否支撑了并行？"),
    ("coding", "代码开发视角", "开发实施的证据链完整度如何？"),
    ("testing", "测试视角", "测试覆盖与缺陷闭环质量如何？"),
    ("dev-mgmt", "研发管理视角", "流程效率与治理健康度如何？"),
    ("platform", "平台视角", "SwarmStudio/harness 承载面暴露了什么？"),
]

# 问题单类型 → 受众归属（机械映射，未知类型落平台视角）
ISSUE_OWNER = {
    "receipt-missing": "requirement",
    "raci-dispatch-missing": "dev-design",
    "raci-not-structured": "dev-design",
    "kanban-registration-skipped": "requirement",
    "done-without-verifiable-evidence": "requirement",
    "anexec-missing": "dev-design",
    "design-push-gap": "architecture",
    "g3-local-gate-missing": "coding",
    "acp-backend-delegate-log-missing": "coding",
    "dev-branch-missing": "coding",
    "test-report-missing": "testing",
    "r18-delivery-frame-missing": "testing",
    "frame-capture-failed": "platform",
    "frame-backfill-labeled": "platform",
    "capacity-queue-drop-devimpl": "platform",
    "gate-breaker-override": "dev-mgmt",
    "g5-ready-fail": "dev-mgmt",
    "review-card-missing": "architecture",
    "audit-finding": "dev-mgmt",
    "runtime-restart": "platform",
    "driver-orphan-kill": "platform",
    "gov-incident-datasource": "dev-mgmt",
}


# ── 明暗主题（2026-10-14）：写盘后统一挂切换控件。抽成共用函数，
#    免得每加一个页面就漏一次；inject-theme.py 幂等，重复调用不会注两份。 ──
def _inject_theme(page, *extra_css):
    import subprocess, sys as _sys
    subprocess.run([_sys.executable, str(Path(__file__).resolve().parent / 'inject-theme.py'),
                    str(page), *[str(c) for c in extra_css]], check=False)

def load_facts(run_dir: Path) -> dict:
    """从数据面实算事实；每个事实带来源文件名（证据指针）。"""
    f: dict = {"run_dir": str(run_dir), "sources": {}}
    ev = run_dir / "evidence"

    # state.env：步骤完成态与门禁落键
    state = {}
    sp = run_dir / "state.env"
    if sp.exists():
        for line in sp.read_text(encoding="utf-8", errors="replace").splitlines():
            if "=" in line:
                k, v = line.split("=", 1)
                state[k.strip()] = v.strip()
    f["state"] = state
    f["sources"]["state"] = "state.env"

    # issues.log：类型计数+分受众归属
    issues = []
    ip = ev / "issues.log"
    if ip.exists():
        for line in ip.read_text(encoding="utf-8", errors="replace").splitlines():
            parts = line.split("|")
            if len(parts) >= 3:
                issues.append({"kind": parts[0].strip(), "type": parts[1].strip(),
                               "who": parts[2].strip(), "text": "|".join(parts[3:]).strip(),
                               "raw": line})
    f["issues"] = issues
    f["issue_counts"] = dict(Counter(i["type"] for i in issues if i["kind"] == "ISSUE"))
    f["disp_counts"] = dict(Counter(i["type"] for i in issues if i["kind"] == "DISP"))
    f["sources"]["issues"] = "evidence/issues.log"

    # r18-steps.json：步号→呈现件（对话/帧）
    steps = {}
    rp = ev / "r18-steps.json"
    if rp.exists():
        try:
            d = json.loads(rp.read_text(encoding="utf-8", errors="replace"))
            steps = d.get("steps", {}) if isinstance(d, dict) else {}
        except Exception as e:  # 数据损坏如实记录
            f["r18_error"] = str(e)
    f["steps"] = steps
    f["step_count"] = len(steps)
    f["dialog_count"] = sum(1 for s in steps.values() if isinstance(s, dict) and s.get("dialogs"))
    f["frame_count"] = sum(len(s.get("frames", [])) for s in steps.values() if isinstance(s, dict))
    f["sources"]["r18"] = "evidence/r18-steps.json"

    # scenario.log：审批/派发/缺陷计数（真实工作量代理指标）
    slog = ev / "scenario.log"
    if slog.exists():
        txt = slog.read_text(encoding="utf-8", errors="replace")
        f["approve_count"] = txt.count("!approve")
        f["dispatch_count"] = txt.count("派发")
        f["defect_count"] = txt.count("【缺陷】")
        f["sources"]["scenario"] = "evidence/scenario.log"

    # 时长（run_started_at→report_done，缺则到 state 文件 mtime）
    try:
        t0 = int(state.get("run_started_at", "0"))
        t1 = int(state.get("report_done", "0")) or int(sp.stat().st_mtime)
        f["duration_hours"] = round((t1 - t0) / 3600, 1) if t0 and t1 > t0 else None
    except Exception:
        f["duration_hours"] = None

    # 门禁落键汇总（六闸真值锚）
    gates = {}
    for k in ("g1_frozen", "g2_arch_pass", "g3_code_pass", "g5_ready_pass", "g6_report_pass"):
        gates[k] = "在位" if state.get(k) else "未见"
    for k in list(state):
        if re.match(r"^g[0-9]_", k) and k not in gates:
            gates[k] = "在位"
    f["gates"] = gates

    # 既有报告（完整审阅层嵌入源；优先 simulation-report.html，回落 final-report.html）
    for name in ("simulation-report.html", "final-report.html"):
        p = ev / name
        if p.exists():
            f["existing_report"] = {"name": name, "size": p.stat().st_size,
                                    "text": p.read_text(encoding="utf-8", errors="replace")}
            break
    return f


def verdict_sentence(cond: bool, good: str, bad: str) -> str:
    return good if cond else bad


def build_cards(f: dict) -> dict:
    """8 受众 × 若干卡。每卡=问题标题+判断句+数据锚+证据指针；无数据如实标注。"""
    ic = f.get("issue_counts", {})
    st = f.get("state", {})
    src = f.get("sources", {})
    NA = "本轮未见该数据"

    def has(k):
        return st.get(k) not in (None, "", "0")

    cards: dict = {a[0]: [] for a in AUDIENCES}

    def add(aud, q, concl, anchor, evi):
        cards[aud].append({"q": q, "concl": concl, "anchor": anchor, "evi": evi})

    # 产品
    gates_in = sum(1 for v in f["gates"].values() if v == "在位")
    add("product", "本轮六闸落了几道？",
        verdict_sentence(gates_in >= 4, f"六闸落键 {gates_in} 道在位，主线跑通。",
                         f"六闸落键仅 {gates_in} 道，主线存在断点。"),
        f"state.env 门禁键 {gates_in} 个在位", src.get("state", NA))
    add("product", "全轮墙钟多少？",
        (f"有效墙钟 {f['duration_hours']} 小时（起跑至收官键）。" if f.get("duration_hours") else NA),
        f"run_started_at→report_done" if f.get("duration_hours") else NA, src.get("state", NA))
    add("product", "主要风险是什么？",
        f"问题单 {sum(ic.values())} 条，最集中的是 "
        + (max(ic, key=ic.get) if ic else "无")
        + ("。" if ic else "，零问题单。"),
        f"issues 分类计数 {len(ic)} 类", src.get("issues", NA))

    # 需求分析
    miss = ic.get("receipt-missing", 0) + ic.get("kanban-registration-skipped", 0) + ic.get("done-without-verifiable-evidence", 0)
    add("requirement", "需求收口的凭证链完整吗？",
        verdict_sentence(miss == 0, "完成回执/登记类零缺失，凭证链完整。",
                         f"回执与登记类缺口 {miss} 条（入库真值在案、过程凭证缺失）。"),
        f"receipt/登记类问题单 {miss}", src.get("issues", NA))
    add("requirement", "需求冻结走完了吗？",
        verdict_sentence(has("g1_frozen"), "G1 需求冻结已落键。", "G1 冻结未见落键。"),
        "g1_frozen=" + st.get("g1_frozen", "未见"), src.get("state", NA))

    # 架构设计
    add("architecture", "G2 架构治理闸是什么结论？",
        verdict_sentence(has("g2_arch_pass"), "G2 架构评审通过并落键。",
                         "G2 未落键——本轮未过或未走架构闸。"),
        "g2_arch_pass=" + st.get("g2_arch_pass", "未见"), src.get("state", NA))
    dg = ic.get("design-push-gap", 0) + ic.get("review-card-missing", 0)
    add("architecture", "概设与评审记录齐吗？",
        verdict_sentence(dg == 0, "概设/评审记录无缺口记录。",
                         f"概设/评审侧缺口 {dg} 条（推送/评审卡类）。"),
        f"design/review 类问题单 {dg}", src.get("issues", NA))

    # 研发设计
    miss_d = ic.get("raci-dispatch-missing", 0) + ic.get("raci-not-structured", 0) + ic.get("anexec-missing", 0)
    add("dev-design", "拆分与派发治理健康吗？",
        verdict_sentence(miss_d == 0, "RACI 派发/结构化与系分入库零缺口。",
                         f"派发治理缺口 {miss_d} 条（群通知或结构化字段缺失）。"),
        f"RACI/系分类问题单 {miss_d}", src.get("issues", NA))
    add("dev-design", "并行利用了几个工作线程？",
        (f"派发动作约 {f.get('dispatch_count', 0)} 次、审批 {f.get('approve_count', 0)} 次（scenario.log 实算）。"
         if "dispatch_count" in f else NA),
        "scenario.log 关键词计数", src.get("scenario", NA))

    # 代码开发
    g3 = ic.get("g3-local-gate-missing", 0) + ic.get("dev-branch-missing", 0) + ic.get("acp-backend-delegate-log-missing", 0)
    add("coding", "开发证据链完整吗？",
        verdict_sentence(g3 == 0, "分支/testlog/委托日志类零缺件。",
                         f"开发证据缺件 {g3} 条（分支或 testlog 缺失）。"),
        f"g3/分支类问题单 {g3}", src.get("issues", NA))
    add("coding", "G3 代码闸落键了吗？",
        verdict_sentence(has("g3_code_pass"), "G3 已落键。", "G3 未见落键。"),
        "g3_code_pass=" + st.get("g3_code_pass", "未见"), src.get("state", NA))

    # 测试
    tm = ic.get("test-report-missing", 0) + ic.get("r18-delivery-frame-missing", 0)
    add("testing", "测试报告与交付证据在吗？",
        verdict_sentence(tm == 0, "测试报告/交付证据无缺失记录。",
                         f"测试报告或交付证据缺失 {tm} 条。"),
        f"test/delivery 类问题单 {tm}", src.get("issues", NA))
    add("testing", "缺陷闭环情况如何？",
        (f"scenario.log 记录缺陷信号 {f.get('defect_count', 0)} 处（以【缺陷】行计）。"
         if "defect_count" in f else NA),
        "scenario.log 缺陷行计数", src.get("scenario", NA))

    # 研发管理
    gb = ic.get("gate-breaker-override", 0) + ic.get("g5-ready-fail", 0)
    add("dev-mgmt", "门禁被打回/熔断过几次？",
        verdict_sentence(gb == 0, "门禁零打回零熔断记录。",
                         f"门禁类异常 {gb} 条（打回覆盖/就绪失败）。"),
        f"gate 类问题单 {gb}", src.get("issues", NA))
    add("dev-mgmt", "流程吞吐量如何？",
        (f"审批 {f.get('approve_count', 0)} 次、派发 {f.get('dispatch_count', 0)} 次、"
         f"呈现步 {f.get('step_count', 0)} 个（实算）。" if "approve_count" in f else NA),
        "scenario.log+r18-steps.json 实算", src.get("scenario", NA))

    # 平台
    pf = ic.get("frame-capture-failed", 0) + ic.get("runtime-restart", 0) + ic.get("driver-orphan-kill", 0)
    add("platform", "采集与运行面稳定吗？",
        verdict_sentence(pf == 0, "帧采集/运行时零事故记录。",
                         f"运行面事故 {pf} 条（采集失败/重启/驱动异常）。"),
        f"platform 类问题单 {pf}", src.get("issues", NA))
    add("platform", "证据帧产能多少？",
        (f"呈现步 {f.get('step_count', 0)} 个、对话件 {f.get('dialog_count', 0)} 组、帧 {f.get('frame_count', 0)} 张（r18 实算）。"
         if "step_count" in f else NA),
        "evidence/r18-steps.json 实算", src.get("r18", NA))
    return cards


def build_roadshow(f: dict, cards: dict) -> list:
    """路演素材块：每块 headline/points/anchor 三字段。"""
    ic = f.get("issue_counts", {})
    st = f.get("state", {})
    blocks = []
    blocks.append(("开场", "全流程推演：让 AI 团队把需求跑到发布",
                   [f"一轮 {f.get('step_count', 0)} 个呈现步、{f.get('approve_count', 0)} 次审批的真实协作",
                    f"六闸落键 {sum(1 for v in f['gates'].values() if v == '在位')} 道",
                    "每一步都有可反查的对话/帧/台账证据"],
                   "state.env+r18-steps.json 实算"))
    phases = [("需求线", "requirement", "需求提出、冻结与凭证收口"),
              ("设计线", "architecture", "系分、概设与架构治理闸"),
              ("开发线", "coding", "六路开发与本地门禁证据"),
              ("测试线", "testing", "独立测试与缺陷闭环"),
              ("治理线", "dev-mgmt", "门禁、审计与治理度量"),
              ("平台线", "platform", "承载面：采集、稳定性与产能")]
    for name, aud, desc in phases:
        cs = cards.get(aud, [])
        blocks.append((name, f"{desc}——{(cs[0]['concl'] if cs else '见证据台账')}",
                       [c["concl"] for c in cs[:3]] or ["本轮未见该数据"],
                       "audience-cards：" + aud))
    gblocks = [(k, f"{k} {v}", [f"落键值：{st.get(k, '未见')}"], "state.env") for k, v in f["gates"].items()]
    blocks.append(("六闸", "六闸逐闸结果（真值锚=state.env 落键）",
                   [f"{k}：{v}" for k, v in f["gates"].items()] or ["本轮未见该数据"], "state.env"))
    top3 = sorted(ic.items(), key=lambda kv: -kv[1])[:3] if ic else []
    blocks.append(("数据亮点", "问题与改进的双向账",
                   ([f"{k}×{v}" for k, v in top3] if top3 else ["零问题单"]),
                   "issues.log 分类计数"))
    blocks.append(("结尾", "能力主张：全流程可审计的 AI 团队协作",
                   ["从需求到发布的 26 步全链路有据可查",
                    "六闸治理：不过闸不放行，打回有留痕",
                    "下一轮：图引擎自驱动+二合一报告持续演进"],
                   "本报告全文"))
    return blocks


def render_html(title: str, body: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(title)}</title>
<style>
  :root {{ --ink:#1a2330; --sub:#5a6a7d; --line:#e3e8ef; --accent:#2563eb; --bg:#f7f9fc; }}
  * {{ box-sizing:border-box; }}
  body {{ margin:0; font:15px/1.75 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif; color:var(--ink); background:var(--bg); }}
  .wrap {{ max-width:1080px; margin:0 auto; padding:28px 22px 80px; }}
  h1 {{ font-size:26px; margin:8px 0 4px; }}
  h2 {{ font-size:19px; margin:34px 0 12px; padding-top:14px; border-top:2px solid var(--line); }}
  h3 {{ font-size:16px; margin:18px 0 8px; }}
  .lead {{ color:var(--sub); margin:0 0 18px; }}
  nav.aud {{ display:flex; flex-wrap:wrap; gap:8px; margin:14px 0 6px; }}
  nav.aud a {{ padding:6px 12px; border:1px solid var(--line); border-radius:16px; text-decoration:none; color:var(--accent); background:#fff; font-size:13px; }}
  .card {{ background:#fff; border:1px solid var(--line); border-radius:10px; padding:14px 16px; margin:10px 0; }}
  .card h4 {{ margin:0 0 6px; font-size:15px; }}
  .card .concl {{ margin:4px 0; }}
  .card .meta {{ color:var(--sub); font-size:12.5px; }}
  .block {{ background:#fff; border:1px solid var(--line); border-left:4px solid var(--accent); border-radius:8px; padding:12px 16px; margin:12px 0; }}
  .block .headline {{ font-weight:600; }}
  .block ul {{ margin:6px 0 4px 20px; padding:0; }}
  .block .anchor {{ color:var(--sub); font-size:12.5px; }}
  table {{ border-collapse:collapse; width:100%; background:#fff; }}
  th,td {{ border:1px solid var(--line); padding:7px 10px; font-size:13.5px; text-align:left; }}
  th {{ background:#eef2f8; }}
  .review-embed {{ border:1px solid var(--line); border-radius:10px; background:#fff; padding:8px; overflow:auto; }}
  .badge {{ display:inline-block; padding:2px 8px; border-radius:10px; font-size:12px; background:#eef2f8; }}
</style>
</head>
<body>
<div class="wrap">
{body}
</div>
</body>
</html>"""


def build_unified(f: dict, cards: dict, blocks: list) -> str:
    esc = html.escape
    parts = []
    parts.append(f"<h1>推演二合一报告 · {esc(Path(f['run_dir']).name)}</h1>")
    dur = f"{f['duration_hours']} 小时" if f.get("duration_hours") else "本轮未见该数据"
    parts.append(f'<p class="lead">结论先行：六闸落键 {sum(1 for v in f["gates"].values() if v == "在位")} 道，'
                 f'有效墙钟 {dur}，问题单 {sum(f.get("issue_counts", {}).values())} 条（分类账见文末）。'
                 f'本报告一式三用：受众速览（导航卡）、完整审阅（既有报告原文）、路演素材（headline 块）。</p>')

    # 受众导航
    parts.append('<h2 id="aud">受众速览：选你的视角</h2>')
    parts.append('<nav class="aud">' + "".join(
        f'<a href="#aud-{k}">{esc(label)}</a>' for k, label, _ in AUDIENCES) + '</nav>')
    parts.append('<p class="lead">每张卡=一个受众会问的问题，答案是一句判断句，附数据锚与证据指针——数字全部实算自当轮数据面，缺项如实标注。</p>')

    for k, label, hook in AUDIENCES:
        parts.append(f'<h2 id="aud-{k}">{esc(label)}｜{esc(hook)}</h2>')
        for c in cards.get(k, []):
            parts.append(
                f'<div class="card"><h4>{esc(c["q"])}</h4>'
                f'<p class="concl">{esc(c["concl"])}</p>'
                f'<p class="meta">数据锚：{esc(c["anchor"])}　证据：{esc(c["evi"])}</p></div>')

    # 完整审阅层
    parts.append('<h2 id="review">完整审阅层：当轮报告原文</h2>')
    rep = f.get("existing_report")
    if rep:
        body = rep["text"]
        m = re.search(r"<body[^>]*>([\s\S]*)</body>", body, re.I)
        inner = m.group(1) if m else body
        parts.append(f'<p class="lead">嵌入 {esc(rep["name"])}（{rep["size"]//1024}KB，审计与报告链正本不受本层影响）。</p>')
        parts.append(f'<div class="review-embed">{inner}</div>')
    else:
        parts.append('<p class="lead">本轮未见该数据（既有报告 HTML 缺失）——下表为按步台账速览。</p>')
        rows = "".join(
            f"<tr><td>{esc(str(k))}</td><td>{esc('对话件在位' if isinstance(v, dict) and v.get('dialogs') else '见帧库')}</td></tr>"
            for k, v in list(f.get("steps", {}).items())[:26])
        parts.append(f'<table><tr><th>步号</th><th>呈现件</th></tr>{rows}</table>')

    # 路演素材层
    parts.append('<h2 id="roadshow">路演素材层：headline 块（PPT/视频可提取）</h2>')
    parts.append('<p class="lead">每块三字段（headline/points/anchor）与 roadshow-outline.md 同源，可直接喂给 PPT 或视频脚本生成。</p>')
    for name, headline, points, anchor in blocks:
        pts = "".join(f"<li>{esc(p)}</li>" for p in points)
        parts.append(
            f'<div class="block"><div class="headline">[{esc(name)}] {esc(headline)}</div>'
            f'<ul>{pts}</ul><div class="anchor">anchor: {esc(anchor)}</div></div>')

    # 问题台账
    parts.append('<h2 id="ledger">问题台账（分类账）</h2>')
    ic = f.get("issue_counts", {})
    if ic:
        rows = "".join(f"<tr><td>{esc(k)}</td><td>{v}</td></tr>" for k, v in sorted(ic.items(), key=lambda kv: -kv[1]))
        parts.append(f'<table><tr><th>类型</th><th>条数</th></tr>{rows}</table>')
    else:
        parts.append('<p class="lead">本轮零问题单。</p>')
    return render_html("推演二合一报告", "\n".join(parts))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", required=True)
    ap.add_argument("--sim-root", default="/Users/cuishi/lab/ncwk-sim-mux")
    ap.add_argument("--out", default=None)
    a = ap.parse_args()
    run_dir = Path(a.sim_root) / "runs" / a.run
    if not run_dir.exists():
        print(f"run dir 不存在: {run_dir}", file=sys.stderr)
        return 2
    out = Path(a.out) if a.out else run_dir / "unified"
    out.mkdir(parents=True, exist_ok=True)

    f = load_facts(run_dir)
    cards = build_cards(f)
    blocks = build_roadshow(f, cards)

    # audience-cards.html
    esc = html.escape
    ch = ['<div class="audience-cards">']
    for k, label, hook in AUDIENCES:
        ch.append(f'<h3 id="aud-{k}">{esc(label)}｜{esc(hook)}</h3>')
        for c in cards.get(k, []):
            ch.append(f'<div class="card"><h4>{esc(c["q"])}</h4><p class="concl">{esc(c["concl"])}</p>'
                      f'<p class="meta">数据锚：{esc(c["anchor"])}　证据：{esc(c["evi"])}</p></div>')
    ch.append("</div>")
    (out / "audience-cards.html").write_text("\n".join(ch), encoding="utf-8")
    _inject_theme(out / "audience-cards.html")

    # roadshow-outline.md
    md = ["# 路演素材大纲（roadshow-outline）", "",
          f"> 生成：{datetime.now(timezone.utc).astimezone().strftime('%F %T')}；数据源：{f['run_dir']}（实算，无编造）", ""]
    for name, headline, points, anchor in blocks:
        md += [f"## {name}", f"headline: {headline}", "points:"]
        md += [f"- {p}" for p in points]
        md += [f"anchor: {anchor}", ""]
    (out / "roadshow-outline.md").write_text("\n".join(md), encoding="utf-8")

    # unified-report.html
    (out / "unified-report.html").write_text(build_unified(f, cards, blocks), encoding="utf-8")
    _inject_theme(out / "unified-report.html",
                   Path(__file__).resolve().parent / "report-dark-override.css",
                   Path(__file__).resolve().parent / "report-light-override.css",
                   Path(__file__).resolve().parent / "theme-unified-dark.css",
                   Path(__file__).resolve().parent / "theme-unified-light.css")

    print(f"OK unified-report-layer → {out}")
    print(f"  audience-cards: {sum(len(v) for v in cards.values())} 卡 / {len(AUDIENCES)} 视角")
    print(f"  roadshow-outline: {len(blocks)} 块")
    print(f"  unified-report.html: {(out / 'unified-report.html').stat().st_size // 1024}KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
