#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
gh_threat_radar.py — GitHub 威胁雷达脚本：CVE / 攻击工具 / 敏感信息泄露 三路监控
落地：~/.hermes/skills/hack-team/wih-secret-hunter/scripts/gh_threat_radar.py
（kanban t_07ef40ca，借鉴 ARL-Next backend/app/tasks/github_threat_monitor.py
  GithubCveMonitorTask / GithubToolsMonitorTask / GithubHackersMonitorTask 三路监控
  + 原子锁去重的设计，剥离 Mongo/Celery 依赖为纯 stdlib CLI。）

用法：
  python3 gh_threat_radar.py --keywords "CVE-2026" "litellm" --state state.json [--output alerts.json]

输入：
  --keywords  关键词列表（产品名 / CVE 编号模式 / 组织名等）
  --state     状态文件路径（已告警条目指纹集合，原子去重）
  --output    可选，结构化告警 JSON 输出路径
  --per-route-limit  每路每个关键词最大新告警条数（默认 10，防刷屏）

数据源（只读公开搜索 API，不 clone、不执行任何检索到的代码）：
  路线 A（对齐 GithubCveMonitorTask）：CVE 关键词 → search/repositories
  路线 B（对齐 GithubToolsMonitorTask）：攻击工具关键词 → search/repositories 按创建/更新时间筛新仓库
  路线 C（对齐 GithubHackersMonitorTask）：敏感关键词（org/repo 名 + password|secret|token|credential 等）→ search/repositories
  token 可选 GITHUB_TOKEN 环境变量；无 token 匿名限速 10 req/min。

速率控制：
  所有请求最小间隔 REQUEST_INTERVAL 秒（默认 6.5s < 60/10），403/429 时按
  Retry-After 或指数退避 sleep 重试，最多 MAX_RETRIES（2）次。

输出：
  stdout：精炼 Markdown 新增条目列表（≤30 行）；
  --output：alerts.json 结构化输出；
  state.json：指纹集合更新（按 (route, repo_full_name, matched_keyword) 去重，
    写入采用 tmp+os.replace 原子替换，进程中断不会损坏状态文件）。

退出码：0 = 有新告警；1 = 无新告警；2 = 运行错误。
"""

import argparse
import json
import os
import re
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

API_BASE = "https://api.github.com"
REQUEST_INTERVAL = 6.5          # 匿名 10 req/min → 每请求至少间隔 6s
MAX_RETRIES = 2                 # 403/429 重试上限（验收要求 ≤2）
TIMEOUT = 30

# 三路监控定义（对齐 ARL-Next 三个 Task）
ROUTES = ("cve", "tools", "leak")

# 路线 C 敏感词后缀（对齐 GithubHackersMonitorTask: org 名 + password|secret 模式）
LEAK_SECRET_WORDS = ("password", "secret", "credential", "token", "private-key")
LEAK_QUALIFIERS = ("in:name,description,readme",)

UA = {"User-Agent": "gh-threat-radar/1.0 (security monitoring; kanban t_07ef40ca)",
      "Accept": "application/vnd.github+json"}


def _token() -> str:
    return (os.environ.get("GITHUB_TOKEN") or "").strip()


def _headers() -> dict:
    h = dict(UA)
    tok = _token()
    if tok:
        h["Authorization"] = f"Bearer {tok}"
    return h


class ApiError(Exception):
    """致命 API 错误（重试耗尽后抛出）。"""


_last_request_ts = 0.0


def _throttle():
    """全局最小请求间隔（匿名 10 req/min 退避）。"""
    global _last_request_ts
    wait = REQUEST_INTERVAL - (time.monotonic() - _last_request_ts)
    if wait > 0:
        time.sleep(wait)
    _throttle._last = time.monotonic()
    _last_request_ts = _throttle._last


# 兼容 patch 场景的引用一致性
_throttle._last = 0.0


def _request(path_or_url: str, params: dict | None = None) -> dict | list:
    """GET GitHub API，带限速 + 403/429 退避重试（≤2 次）。失败抛 ApiError。"""
    url = path_or_url if path_or_url.startswith("http") else API_BASE + path_or_url
    if params:
        url = url + ("&" if "?" in url else "?") + urllib.parse.urlencode(params)

    last_err = None
    for attempt in range(MAX_RETRIES + 1):          # 1 次首发 + ≤2 次重试
        _throttle()
        req = urllib.request.Request(url, headers=_headers(), method="GET")
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
                _last_request_ts = time.monotonic()
                if resp.status == 304:
                    return {}
                return json.loads(resp.read().decode("utf-8", "replace"))
        except urllib.error.HTTPError as e:
            last_err = e
            if e.code in (403, 429):
                # rate limit 退避：优先 Retry-After，否则指数退避
                retry_after = e.headers.get("Retry-After") if e.headers else None
                try:
                    delay = float(retry_after) if retry_after else (2 ** attempt) * 8.0
                except ValueError:
                    delay = (2 ** attempt) * 8.0
                if attempt < MAX_RETRIES:
                    print(f"[warn] HTTP {e.code} rate-limited, retry {attempt + 1}/{MAX_RETRIES} "
                          f"in {delay:.0f}s: {url}", file=sys.stderr)
                    time.sleep(min(delay, 120))
                    continue
                raise ApiError(f"HTTP {e.code} after {MAX_RETRIES} retries: {url}") from e
            if e.code == 422:
                # GitHub 对无效查询返回 422，属输入错误不重试
                raise ApiError(f"HTTP 422 validation failed (bad keyword/query?): {url}") from e
            if e.code == 404:
                raise ApiError(f"HTTP 404 not found: {url}") from e
            # 其余 4xx/5xx：轻退避重试一次
            if attempt < MAX_RETRIES:
                time.sleep(2 ** attempt * 4)
                continue
            raise ApiError(f"HTTP {e.code}: {url}") from e
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            last_err = e
            if attempt < MAX_RETRIES:
                time.sleep(2 ** attempt * 4)
                continue
            raise ApiError(f"network error after retries: {url}: {e}") from e
    raise ApiError(f"unreachable: {url}: {last_err}")


def _norm_keyword(kw: str) -> str:
    return " ".join(kw.split()).strip()


def _cve_like(kw: str) -> bool:
    return bool(re.fullmatch(r"(?i)cve-\d{4}-\d{4,7}", _norm_keyword(kw)))


# ---------------------------------------------------------------- routes

def route_cve(keywords, limit):
    """路线 A：CVE 关键词监控（对齐 GithubCveMonitorTask）。

    每个关键词一次 search/repositories 查询（CVE 编号或含 CVE 字样的描述）。
    """
    items = []
    for kw in keywords:
        q = f'"{kw}" in:name,description,readme'
        data = _request("/search/repositories",
                        {"q": q, "sort": "updated", "order": "desc",
                         "per_page": min(limit * 2, 30)})
        for it in (data.get("items") or []):
            items.append({
                "route": "cve",
                "repo_full_name": it.get("full_name", ""),
                "matched_keyword": kw,
                "html_url": it.get("html_url", ""),
                "description": (it.get("description") or "")[:160],
                "stars": it.get("stargazers_count", 0),
                "created_at": it.get("created_at", ""),
                "pushed_at": it.get("pushed_at", ""),
                "author": ((it.get("owner") or {}).get("login") or ""),
            })
    return items


def route_tools(keywords, limit):
    """路线 B：攻击工具新仓库监控（对齐 GithubToolsMonitorTask）。

    关键词限定 in:name，按创建时间倒序，重点抓新建仓库（近 N 天）。
    """
    items = []
    since = datetime.now(timezone.utc).strftime("%Y-%m-%d")  # 今天
    for kw in keywords:
        q = f'{kw} in:name created:>={since}'
        data = _request("/search/repositories",
                        {"q": q, "sort": "created", "order": "desc",
                         "page": 1, "per_page": min(limit * 2, 30)})
        for it in (data.get("items") or []):
            items.append({
                "route": "tools",
                "repo_full_name": it.get("full_name", ""),
                "matched_keyword": kw,
                "html_url": "https://github.com/" + it.get("full_name", ""),
                "description": (it.get("description") or "")[:160],
                "stars": it.get("stargazers_count", 0),
                "created_at": it.get("created_at", ""),
                "pushed_at": it.get("pushed_at", ""),
                "author": ((it.get("owner") or {}).get("login") or ""),
            })
    return items


def route_leak(keywords, limit):
    """路线 C：敏感关键词监控（对齐 GithubHackersMonitorTask）。

    对每个关键词（通常为目标组织名），拼敏感词组合查询：
      '<kw> <secret_word> in:name,description'
    """
    items = []
    for kw in keywords:
        for sw in LEAK_SECRET_WORDS:
            q = f'{kw} {sw} in:name,description'
            try:
                data = _request("/search/repositories",
                                {"q": q, "sort": "updated", "order": "desc",
                                 "per_page": min(limit * 2, 30)})
            except ApiError as e:
                print(f"[warn] leak route query skipped: {e}", file=sys.stderr)
                continue
            for it in (data.get("items") or []):
                items.append({
                    "route": "leak",
                    "repo_full_name": it.get("full_name", ""),
                    "matched_keyword": f"{kw}+{sw}",
                    "html_url": it.get("html_url", ""),
                    "description": (it.get("description") or "").strip()[:160],
                    "stars": it.get("stargazers_count", 0),
                    "created_at": it.get("created_at", ""),
                    "pushed_at": it.get("pushed_at", ""),
                    "author": ((it.get("owner") or {}).get("login") or ""),
                })
    return items


# ---------------------------------------------------------------- dedup / state

def fingerprint(route, repo, kw) -> str:
    """告警指纹：(route, repo_full_name, matched_keyword)。"""
    raw = f"{route}|{repo}|{kw}"
    # fnv1a 风格太短，这里用 sha1 截断足够防冲突且可读性无要求
    import hashlib
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]


def load_state(path):
    if not path or not os.path.exists(path):
        return {"seen": {}, "updated_at": None}
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict) and isinstance(data.get("seen"), dict):
            return data
    except (json.JSONDecodeError, OSError) as e:
        print(f"[warn] state file unreadable, starting fresh: {e}", file=sys.stderr)
    return {"seen": {}, "updated_at": None}


def save_state(path, state):
    """tmp + os.replace 原子写，防中断损坏。"""
    if not path:
        return
    d = os.path.dirname(os.path.abspath(path)) or "."
    os.makedirs(d, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=".gh_threat_radar_state.", dir=d)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(state, f, ensure_ascii=False, indent=1, sort_keys=True)
            f.write("\n")
        os.replace(tmp, path)                     # 原子替换
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def dedup(items, state):
    """返回 (new_items, alert_fps)。新条目指纹立即并入 seen（原子去重）。"""
    seen = state.setdefault("seen", {})
    new_items, fps = [], []
    for it in items:
        fp = fingerprint(it["route"], it["repo_full_name"], it["matched_keyword"])
        if fp in seen:
            continue
        seen[fp] = {
            "first_seen": datetime.now(timezone.utc).isoformat(),
            "repo": it["repo_full_name"],
            "route": it["route"],
            "keyword": it["matched_keyword"],
        }
        it["fingerprint"] = fp
        new_items.append(it)
        fps.append(fp)
    return new_items, fps


# ---------------------------------------------------------------- output

def render_markdown(alerts, keywords):
    """stdout 精炼 Markdown，≤30 行。"""
    lines = [f"# GitHub 威胁雷达 · {len(alerts)} 新告警 "
             f"(keywords: {', '.join(keywords)})"]
    if not alerts:
        lines.append("- 无新增条目（全部为已见指纹或无命中）")
        return lines
    # 每条 1 行，超 28 条截断
    for a in alerts[:28]:
        desc = (a.get("description") or "").replace("|", "/").strip()
        kw = a["matched_keyword"]
        lines.append(f"- [{a['route']}] {kw} → [{a['repo_full_name']}]({a['html_url']})"
                     f" ★{a['stars']} — {desc}")
    if len(alerts) > 28:
        lines.append(f"- …另有 {len(alerts) - 28} 条，见 alerts.json")
    return lines


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(
        description="GitHub 威胁雷达：CVE / 工具 / 泄露三路监控 + 原子去重")
    ap.add_argument("--keywords", nargs="+", required=True,
                    help="关键词列表（产品名/CVE编号/组织名）")
    kws = None
    ap.add_argument("--state", required=True,
                    help="state.json 路径（指纹集合，原子去重）")
    ap.add_argument("--output", default=None, help="alerts.json 输出路径")
    ap.add_argument("--per-route-limit", type=int, default=10,
                    help="每路每关键词最大新告警条数")
    args = ap.parse_args()
    kws = [_norm_keyword(k) for k in (args.keywords or []) if _norm_keyword(k)]
    if not kws:
        print("[error] no valid keywords", file=sys.stderr)
        return 2

    state = load_state(args.state)
    limit = max(1, min(args.per_route_limit, 30))

    runners = {"cve": route_cve, "tools": route_tools, "leak": route_leak}
    all_items = []
    route_errors = []
    for route in ROUTES:
        try:
            got = runners[route](kws, limit)
            all_items.extend(got)
            print(f"[info] route {route}: {len(got)} raw hits", file=sys.stderr)
        except ApiError as e:
            route_errors.append(f"{route}: {e}")
            print(f"[error] route {route} failed: {e}", file=sys.stderr)

    # 全路由失败才算运行错误
    if len(route_errors) == len(ROUTES):
        print("[error] all routes failed", file=sys.stderr)
        return 2

    new_items, _ = dedup(all_items, state)

    # 按路由限额截断（防刷屏，保持每路均衡）
    capped = []
    per_count = {}
    for it in new_items:
        c = per_count.get(it["route"] + "|" + it["matched_keyword"], 0)
        if c < limit:
            capped.append(it)
            per_count[it["route"] + "|" + it["matched_keyword"]] = c + 1

    # 写 state（无论是否有新告警，都刷新 updated_at）
    state["updated_at"] = datetime.now(timezone.utc).isoformat()
    try:
        save_state(args.state, state)
    except OSError as e:
        print(f"[error] cannot save state: {e}", file=sys.stderr)
        return 2

    if args.output:
        try:
            payload = {
                "run_at": state["updated_at"],
                "keywords": kws,
                "total_new_alerts": len(capped),
                "alerts": capped,
            }
            with open(args.output, "w", encoding="utf-8") as f:
                json.dump(payload, f, ensure_ascii=False, indent=1)
                f.write("\n")
        except OSError as e:
            print(f"[error] cannot write alerts.json: {e}", file=sys.stderr)
            return 2

    md = render_markdown(capped, kws)
    print("\n".join(md))

    if route_errors:
        print(f"[warn] partial route failures: {'; '.join(route_errors)}", file=sys.stderr)
    return 0 if capped else 1


if __name__ == "__main__":
    sys.exit(main())
