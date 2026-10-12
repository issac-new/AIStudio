#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""gitspawn_scan.py — AI-agent 工具链供应链批量检测脚本（组织标准，self-contained）

固化 hack-team/supply-chain-security SKILL.md §3.5 三类检查点为可执行扫描：

  检查点 1  clone-exec（GitSpawn 类）：仓库 .git/config value-sink 语义扫描
            + .gitattributes 自命名 filter driver 枚举（枚举式清单必滞后的补偿）
  检查点 2  CI pwn-request：pull_request_target / workflow_run 三步判定
            （fork 可达 → gate 可穿透 → 消费 fork 输入）
  检查点 3  unpinned-uses 交叉核对（第三方 > 官方 pin 风险不对称；供 zizmor 结果交叉）

来源：gap-20260926-005（内化为组织标准）；方法论 gap-20260925-001/004。
用法：
  python3 gitspawn_scan.py <repo_path> [more_repo_path ...] [--json OUT.json]
  python3 gitspawn_scan.py --version

退出码：0=无 finding；1=有 finding；2=用法/路径错误。--strict 时 Critical/High 才置 1。
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys

VERSION = "1.0.0"

# ---------------------------------------------------------------- 通用

def _severity_rank(s: str) -> int:
    return {"critical": 4, "high": 3, "medium": 2, "low": 1, "info": 0}[s.lower()]


def _emit(findings: list, fid: str, severity: str, cwe: str, title: str,
          location: str, evidence: str, fix: str, refs: list):
    findings.append({
        "id": fid, "severity": severity.upper(), "cwe": cwe, "title": title,
        "location": location, "evidence": evidence, "fix": fix,
        "references": refs,
        "tool": "gitspawn_scan.py " + VERSION,
    })


# ---------------------------------------------------------------- 检查点 1: clone-exec（GitSpawn）

# 静态 sink 清单（value 为路径/命令即武器）。枚举式清单必然滞后 —— 因此这里
# 只做「已知高频 sink」的精确定位，真正判定走 _value_looks_executable 语义规则。
_KNOWN_SINK_KEYS = [
    "core.fsmonitor", "core.hooksPath", "core.pager",
    "core.editor", "core.askpass", "core.sshcommand", "credential.helper",
    "diff.external", "log.showsignature", "gpg.program",
    "gpg.format", "sequencer.editor", "core.attributesfile", "core.excludesfile",
    "filter.<name>.clean", "filter.<name>.smudge", "filter.<name>.process",
]
_KNOWN_SINK_SET = set(k.lower() for k in _KNOWN_SINK_KEYS)

# 伪造 gpgsig 的 commit + log.showSignature 时 gpg.program 才会触发（Sonar 变体）。
_GPGSIG_HINT = "log.showsignature"

# value 语义判定：出现以下形态视为「指向可执行物」
_EXEC_HINT_PATTERNS = [
    re.compile(r"^/"),                 # 绝对路径
    re.compile(r"[~/]"),               # ~ 起始或路径段
    re.compile(r"\.(sh|py|pl|rb|exe|bat|cmd|ps1|command|zsh|bash|fish)\b", re.I),
    re.compile(r"\$\(|`"),             # 命令替换
    re.compile(r"[;&|]\s*\S"),         # 命令串接
    re.compile(r"\b(curl|wget|nc|bash|sh|zsh|python\d?|perl|ruby|osascript|osacompile|open)\b", re.I),
]
# 例外：布尔/枚举类合法值
_BENIGN_VALUES = {"true", "false", "yes", "no", "1", "0", "on", "off",
                  "auto", "shell", "prompt", "true\n", ""}


def _value_looks_executable(value: str) -> bool:
    v = value.strip()
    if not v:
        return False
    if v.lower() in _BENIGN_VALUES:
        return False
    return any(p.search(v) for p in _EXEC_HINT_PATTERNS)


def _parse_git_config(text: str):
    """git-config 文件的轻量解析器 → [(section.key, value, lineno)]。

    处理 [section "sub"]、[section.sub]、布尔裸 key、续行（前导空格）。
    """
    entries = []
    section = ""
    last_key = None
    for lineno, raw in enumerate(text.splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("#") or line.startswith(";"):
            continue
        m = re.match(r"^\[([A-Za-z0-9.\-]+)(?:\s+\"([^\"]*)\")?\]", line)
        if m:
            sec = m.group(1).lower()
            sub = (m.group(2) or "").lower()
            section = sec + ("." + sub if sub else "")
            last_key = None
            continue
        # 续行：git config 标准缩进为 TAB/空格且本行不含 `=`（key 行本身含 `=`）
        if raw[:1] in (" ", "\t") and last_key and "=" not in line:
            entries[-1] = (entries[-1][0], entries[-1][1] + " " + line, entries[-1][2])
            continue
        eq = line.find("=")
        if eq == -1:
            key, val = line, "true"  # 裸 key = 布尔 true
        else:
            key, val = line[:eq].strip().lower(), line[eq + 1:].strip().strip('"')
        key = key.split("#")[0].strip()
        last_key = key
        entries.append((section + "." + key if section else key, val, lineno))
    return entries


def scan_clone_exec(repo: str, findings: list) -> None:
    """检查点 1：.git/config value-sink 语义扫描 + .gitattributes filter 枚举。"""
    cfg = os.path.join(repo, ".git", "config")
    attrs = os.path.join(repo, ".gitattributes")
    repo_disp = os.path.basename(repo.rstrip("/")) or repo

    if not os.path.exists(cfg):
        _emit(findings, "GE-INFO-NOGIT", "INFO", "N-A",
              f"[{repo_disp}] 无 .git/config（非 git 仓库或已剥离）——clone-exec 面不适用",
              os.path.join(repo, ".git", "config"), "missing", "N-A", [])
        return

    with open(cfg, encoding="utf-8", errors="replace") as f:
        text = f.read()
    entries = _parse_git_config(text)

    has_showsig = False
    gpg_program_val, gpg_program_line = "", None
    hits = 0
    for key, val, lineno in entries:
        k = key.lower()
        executable_value = _value_looks_executable(value=val)
        is_known_sink = k in _KNOWN_SINK_SET
        # filter.<name>.{clean,smudge,process} 通配
        is_filter = re.match(r"^filter\.[^.]+\.(clean|smudge|process)$", k)
        if k == _GPGSIG_HINT and val.lower() == "true":
            has_showsig = True
        if k == "gpg.program":
            gpg_program_val, gpg_program_line = val, lineno
        if executable_value and (is_known_sink or is_filter):
            hits += 1
            sev = "HIGH"
            cwe = "CWE-77"
            if k == "core.fsmonitor":
                sev = "HIGH"
            _emit(
                findings,
                f"GE-{hits:03d}",
                sev,
                cwe,
                f"[{repo_disp}] GitSpawn sink：{key} 指向可执行物（{val}）",
                f"{cfg}:{lineno}",
                f"{key} = {val}",
                ("git config --unset " + key)
                + "；或全局兜底 git config --global core.fsmonitor false；"
                  "接收外来仓库（zip/共享盘/USB）后、开 agent 前先清 value-type key",
                ["https://www.manifold.security/blog/ai-coding-agents-git-hijack",
                 "https://sonarsource.com/blog/claude-arbitrary-code-execution/"],
            )
        elif is_known_sink or is_filter:
            # 已知 sink key 存在但 value 不是可执行物形态 → 记 INFO 便于人工复核
            _emit(findings, f"GE-INFO-{lineno}", "INFO", "N-A",
                  f"[{repo_disp}] 已知 sink key `{key}` 存在，value 非可执行形态（人工复核）",
                  f"{cfg}:{lineno}", f"{key} = {val}", "N-A", [])

    # Sonar 变体组合判定：log.showSignature=true 且 gpg.program 非空（即使 value
    # 不满足可执行形态正则——例如无扩展名路径——组合本身即可触发）
    if has_showsig and gpg_program_val.strip():
        _emit(findings, "GE-GPG-001", "HIGH", "CWE-77",
              f"[{repo_disp}] Sonar 变体组合：log.showSignature=true + gpg.program={gpg_program_val!r}"
              "（伪造 gpgsig commit 的 git log 路径）",
              f"{cfg}:{gpg_program_line}", f"log.showSignature=true; gpg.program={gpg_program_val}",
              "git config --unset log.showSignature; git config --unset gpg.program",
              ["https://sonarsource.com/blog/claude-arbitrary-code-execution/"])

    # .gitattributes 自命名 filter driver 枚举（补枚举式清单滞后）
    if os.path.exists(attrs):
        with open(attrs, encoding="utf-8", errors="replace") as f:
            for lineno, line in enumerate(f, 1):
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                m = re.match(r"\S+\s+(?:-)?filter=(\S+)", line)
                if m:
                    _emit(findings, f"GE-ATTR-{lineno}", "INFO", "N-A",
                          f"[{repo_disp}] .gitattributes 声明 filter driver `{m.group(1)}`"
                          "（若 .git/config 相应 filter.*.clean/smudge/process 指向可执行物则升 HIGH）",
                          f"{attrs}:{lineno}", line, "N-A",
                          ["https://git-scm.com/docs/gitattributes"])


# ---------------------------------------------------------------- 检查点 2: CI pwn-request

_PWN_TRIGGERS = ("pull_request_target", "workflow_run")
_PR_TRIGGERS = ("pull_request", "pull_request_target", "workflow_run")


def _load_workflow(path: str):
    text = open(path, encoding="utf-8", errors="replace").read()
    tree = None
    try:
        import yaml  # optional
        tree = yaml.safe_load(text)
    except Exception:
        tree = None
    return text, tree


def _walk(obj, path=()):
    if isinstance(obj, dict):
        for k, v in obj.items():
            yield from _walk(v, path + (str(k),))
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            yield from _walk(v, path + (str(i),))
    else:
        yield path, obj


def _find_trigger_nodes(tree):
    """返回 [(job_name, trigger_name, node)]：挂在 job 级或 workflow 级的触发器。"""
    out = []
    if not isinstance(tree, dict):
        return out
    on = tree.get("on") or tree.get(True)  # YAML 1.1 会把裸 `on:` 解析成 True
    triggers = []
    if isinstance(on, str):
        triggers = [on]
    elif isinstance(on, list):
        triggers = [str(t) for t in on]
    elif isinstance(on, dict):
        triggers = list(on.keys())
    for t in triggers:
        if t in _PR_TRIGGERS:
            out.append(("<workflow-level>", t, on))
    jobs = tree.get("jobs") or {}
    if isinstance(jobs, dict):
        for jname, job in jobs.items():
            if not isinstance(job, dict):
                continue
            jnode = job.get("on") if isinstance(job.get("on"), dict) else None
            # reusable workflow_call 的 job 级 on 不常见；跳过
    # reusable workflows: jobs.<j>.uses + workflow_call
    return out


def _collect_triggers(tree):
    """workflow 级触发器名集合（on: / True:）。"""
    if not isinstance(tree, dict):
        return set()
    on = tree.get("on", tree.get(True))
    if isinstance(on, str):
        return {on}
    if isinstance(on, list):
        return {str(t) for t in on}
    if isinstance(on, dict):
        return set(on.keys())
    return set()


def _gather_steps(job):
    """产出 job 内所有 run/uses 步骤与 job-level steps 键。"""
    steps = []
    if not isinstance(job, dict):
        return steps
    for s in job.get("steps") or []:
        if isinstance(s, dict):
            steps.append(s)
    return steps


# 金标准 gate：github.event.workflow_run.head_repository.full_name == github.repository
_GOLD_GATE = re.compile(r"head_repository\s*\.\s*full_name\s*==\s*github\.repository")
# 弱 gate：head_branch / conclusion / actor 判断
_WEAK_GATE_RE = re.compile(
    r"(head_branch|conclusion|actor\s*==|github\.event\.sender\.login)", re.I)


def _jobs_of(tree):
    jobs = (tree or {}).get("jobs")
    return jobs.items() if isinstance(jobs, dict) else []


def scan_ci_pwn_request(repo: str, findings: list) -> None:
    """检查点 2：pull_request_target / workflow_run 三步判定（fork 可达→gate 可穿透→消费 fork 输入）。"""
    wf_dir = os.path.join(repo, ".github", "workflows")
    if not os.path.isdir(wf_dir):
        return
    repo_disp = os.path.basename(repo.rstrip("/")) or repo
    idx = 0
    for fn in sorted(os.listdir(wf_dir)):
        if not fn.endswith((".yml", ".yaml")):
            continue
        path = os.path.join(wf_dir, fn)
        text, tree = _load_workflow(path)
        triggers = _collect_triggers(tree)
        hit_triggers = triggers & set(_PWN_TRIGGERS)
        if not hit_triggers:
            continue
        # 三步判定
        gate_block = _GOLD_GATE.search(text)
        has_weak_gate = bool(_WEAK_GATE_RE.search(text)) and not gate_block
        consumes_fork = _consumes_fork_input(tree=tree, text=text)

        # 步骤 3 未消费 fork 输入 → prt 存在但无攻击链（信息级备案，供安全模式对照）
        if not consumes_fork:
            _emit(findings, f"CI-INFO-{fn}", "INFO", "CWE-1357",
                  f"[{repo_disp}] {fn}: 触发器 {sorted(hit_triggers)} 存在"
                  "（未检出 fork 输入消费 → 无 pwn 链，安全模式对照备案）",
                  path, f"triggers={sorted(hit_triggers)}", "N-A", [])
            continue

        if gate_block:
            sev, title = "INFO", ("金标准 gate（head_repository.full_name == github.repository）已设"
                                  "，且检出 fork 输入消费——链路已防护，备案")
            _emit(findings, f"CI-GATED-{fn}", "INFO", "CWE-1357",
                  f"[{repo_disp}] {fn}: {title}", path, gate_block.group(0), "N-A", [])
            continue
        if has_weak_gate:
            sev, title = "HIGH", ("弱 gate 可穿透（head_branch/conclusion/actor 判断不校验 repo 归属）"
                                  " + 消费 fork 输入 → pwn-request 攻击链")
        else:
            sev, title = "HIGH", ("无 gate + 消费 fork 输入 → pwn-request 攻击链")
        idx += 1
        _emit(findings, f"CI-{idx:03d}", sev, "CWE-829/CWE-78",
              f"[{repo_disp}] {fn}: {title}",
              path, f"triggers={sorted(hit_triggers)}; gate={'weak' if has_weak_gate else 'none'}; consumes_fork_input=true",
              "gate 追加金标准判断：if: github.event.workflow_run.head_repository.full_name == github.repository"
              "（pull_request_target 同理用 PR 归属校验）",
              ["https://securitylab.github.com/research/github-actions-preventing-pwn-requests/",
               "https://sonarsource.com/blog/classname-template-injection-vulnerability-github-actions/"])


_FORK_INPUT_RE = re.compile(
    r"(actions/checkout[^\n]*(head_sha|head_ref|ref:\s*\$\{\{)"                    # checkout fork ref
    r"|\$\{\{\s*github\.event\.(workflow_run\.(head_sha|head_ref|pull_request)|pull_request)"  # fork 事件字段插值
    r"|\$\{\{\s*github\.event\.(workflow_run|pull_request)\b)",                    # 任意 fork 事件字段插值
    re.I)
# github-script 内通过 context.payload.pull_request / workflow_run 消费 fork 输入
_GHSCRIPT_FORK_RE = re.compile(
    r"context\.payload\.(pull_request|workflow_run)", re.I)
# 执行流消费：fork 输入送进 run:/shell/exec。数据消费（API 拼接/只读检查/PR body
# 字符串读取）不触发。github-script 内用 backtick 模板字面量插值 → shell 拼接，才算执行流。
_EXEC_FLOW_RE = re.compile(
    r"run:.*github\.event\.(workflow_run|pull_request)"
    r"|`[^`]*\$\{\s*context\.payload\.(pull_request|workflow_run)",
    re.I | re.S)


def _consumes_fork_input(tree, text: str) -> bool:
    # 1) checkout fork ref / fork 事件字段插值（插值进执行流的统一信号）
    if _FORK_INPUT_RE.search(text):
        return True
    # 2) 执行流消费：run: 中的 fork 字段，或 github-script 用模板字面量插值到 shell
    if _EXEC_FLOW_RE.search(text):
        return True
    # 3) YAML 结构化：if:/with:/env: 等节点的 fork 事件字段插值
    for jname, job in _jobs_of(tree):
        for path, val in _walk(job):
            if isinstance(val, str) and (
                    "github.event.workflow_run.head_sha" in val
                    or "github.event.workflow_run.head_ref" in val
                    or "github.event.workflow_run.pull_request" in val
                    or "github.event.pull_request" in val):
                return True
    # 4) step 输出间接消费：$GITHUB_OUTPUT + fork 事件字段（后续 step 可能消费）
    if re.search(r"\$GITHUB_OUTPUT", text) and re.search(
            r"github\.event\.(workflow_run|pull_request)", text):
        return True
    return False


# ---------------------------------------------------------------- 检查点 3: unpinned-uses

_OFFICIAL_PREFIXES = (
    "actions/", "github/",  # 官方 owner 前缀（严格讲应比对 owner 白名单，此处保守）
)


def scan_unpinned_uses(repo: str, findings: list) -> None:
    """检查点 3：unpinned-uses 交叉（第三方 > 官方；供 zizmor 结果交叉核对）。"""
    wf_dir = os.path.join(repo, ".github", "workflows")
    if not os.path.isdir(wf_dir):
        return
    repo_disp = os.path.basename(repo.rstrip("/")) or repo
    count_by_kind = {"official": 0, "third-party": 0}
    for fn in sorted(os.listdir(wf_dir)):
        if not fn.endswith((".yml", ".yaml")):
            continue
        path = os.path.join(wf_dir, fn)
        text = open(path, encoding="utf-8", errors="replace").read()
        for lineno, line in enumerate(text.splitlines(), 1):
            m = re.search(r"uses:\s*([^\s#]+)", line)
            if not m:
                continue
            uses = m.group(1)
            if uses.startswith("./") or uses.startswith("docker://"):
                continue
            if "@" not in uses:
                ref = "UNPINNED"
                ref_kind = "none"
            else:
                ref = uses.split("@", 1)[1]
                ref_kind = "sha" if re.fullmatch(r"[0-9a-f]{40}", ref) else ("sha-short" if re.fullmatch(r"[0-9a-f]{7,39}", ref) else "tag")
            owner = uses.split("/")[0].split("@")[0]
            official = owner.lower() in ("actions", "github", "docker")
            if ref_kind in ("none", "tag"):
                kind = "official" if official else "third-party"
                count_by_kind[kind] += 1
                sev = "LOW" if official else "HIGH"  # pin 风险不对称
                _emit(findings, f"PU-{fn}:{lineno}", sev, "CWE-1357",
                      f"[{repo_disp}] {fn}:{lineno} unpinned-uses（{kind}）: {uses}"
                      + ("" if ref_kind != "tag" else f"（tag pin: {ref}）"),
                      f"{path}:{lineno}", uses,
                      "锚定完整 commit SHA（第三方优先）",
                      ["https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions"])
    if count_by_kind["official"] or count_by_kind["third-party"]:
        _emit(findings, "PU-SUMMARY", "INFO", "N-A",
              f"[{repo_disp}] unpinned-uses 汇总：官方 {count_by_kind['official']} / 第三方 {count_by_kind['third-party']}"
              "（供 zizmor 结果交叉）",
              wf_dir, json.dumps(count_by_kind), "N-A", [])


# ---------------------------------------------------------------- main

def main(argv=None):
    ap = argparse.ArgumentParser(description="GitSpawn / AI-agent 工具链供应链批量检测（§3.5）")
    ap.add_argument("repos", nargs="+", help="仓库根路径（可多个）")
    ap.add_argument("--json", dest="json_out", help="findings JSON 输出路径")
    ap.add_argument("--strict", action="store_true",
                    help="仅 Critical/High 置退出码 1")
    ap.add_argument("--version", action="version", version=f"gitspawn_scan.py {VERSION}")
    args = ap.parse_args(argv)

    all_findings: list = []
    for repo in args.repos:
        if not os.path.isdir(repo):
            print(f"[error] not a directory: {repo}", file=sys.stderr)
            return 2
        scan_clone_exec(repo, all_findings)
        scan_ci_pwn_request(repo, all_findings)
        scan_unpinned_uses(repo, all_findings)

    if args.json_out:
        with open(args.json_out, "w", encoding="utf-8") as f:
            json.dump({"tool": "gitspawn_scan.py", "version": VERSION,
                       "repos": args.repos, "findings": all_findings}, f,
                      ensure_ascii=False, indent=2)

    # 终端摘要
    by_sev = {}
    for f_ in all_findings:
        by_sev[f_["severity"]] = by_sev.get(f_["severity"], 0) + 1
    print(f"gitspawn_scan {VERSION}: {len(all_findings)} findings  "
          + " ".join(f"{k}={v}" for k, v in sorted(by_sev.items(), key=lambda kv: -_severity_rank(kv[0]))))
    for f_ in all_findings:
        if _severity_rank(f_["severity"]) >= _severity_rank("HIGH"):
            print(f"  [{f_['severity']}] {f_['id']} {f_['title']} -> {f_['location']}")

    blocking = [f_ for f_ in all_findings
                if _severity_rank(f_["severity"]) >= (3 if args.strict else 1)]
    return 1 if blocking else 0


if __name__ == "__main__":
    sys.exit(main())
