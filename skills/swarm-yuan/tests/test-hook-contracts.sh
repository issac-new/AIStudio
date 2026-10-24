#!/usr/bin/env bash
# Hook 输入/输出与提交证据契约：只向临时夹具传载荷，不执行其中的 shell 命令。
set -euo pipefail
cd "$(dirname "$0")/.."
python3 - <<'PY'
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

root = Path.cwd()
failures = []
checks = 0


def check(condition, message):
    global checks
    checks += 1
    print(("  ✓ " if condition else "  ✗ ") + message)
    if not condition:
        failures.append(message)


with tempfile.TemporaryDirectory(prefix="swarm-hook-contracts-") as tmp:
    tmp = Path(tmp)
    skill, project = tmp / "skill", tmp / "project"
    (skill / "scripts").mkdir(parents=True)
    (skill / "rules.d").mkdir()
    (project / "src").mkdir(parents=True)
    for src in ("assets/hooks/fail-gate-hook.sh", "assets/hooks/spec-first-bridge.sh",
                "assets/hooks/spec-first-pre-commit.sh", "assets/spec-first-lib.sh",
                "scripts/gate-rules.sh"):
        shutil.copy(root / src, skill / "scripts")
    for src in (root / "assets/rules.d").glob("*.rules"):
        shutil.copy(src, skill / "rules.d")
    (skill / "SKILL.md").write_text("---\nstatus: active\n---\n")
    conf = skill / "scripts/precheck.conf"
    conf.write_text(f'PROJECT_DIR="{project}"\nWRITABLE_DIRS=("src")\n'
                    'SPEC_REQUIRED=1\nSPEC_GLOB="docs/specs/*.md"\n'
                    'GATE_ENFORCE_DENY="security"\nGATE_ENFORCE_DENY_BASH="push"\n')
    env = dict(os.environ, CLAUDE_PLUGIN_ROOT=str(skill))

    def invoke(script, payload=None, *args, env_override=None):
        return subprocess.run(["bash", str(skill / "scripts" / script), *args],
                              input=None if payload is None else json.dumps(payload),
                              text=True, capture_output=True, cwd=project, env=env_override or env)

    def payload(tool, **kwargs):
        return {"hook_event_name": "PreToolUse", "tool_name": tool,
                "tool_input": kwargs, "cwd": str(project)}

    def deny_json(result):
        try:
            return json.loads(result.stdout)["hookSpecificOutput"].get("permissionDecision") == "deny"
        except (ValueError, KeyError, TypeError):
            return False

    for command in ("npm publish", "git status\nnpm publish", "git status\n\nnpm publish"):
        p = payload("Bash", command=command)
        check(deny_json(invoke("fail-gate-hook.sh", p)), f"hook 完整命令 deny JSON: {command!r}")
        check(invoke("spec-first-bridge.sh", p).returncode == 2, f"bridge 完整命令阻断: {command!r}")
    check(invoke("spec-first-bridge.sh", None, "--tool", "bash", "--cmd",
                 "git status\nnpm publish", "--cwd", str(project)).returncode == 2,
          "bridge 显式参数保留换行边界")
    for name in ('quote"file.py', "line\nfile.py", "tab\tfile.py"):
        p = payload("Write", file_path=str(project / "src" / name))
        result = invoke("fail-gate-hook.sh", p)
        check(deny_json(result) and name in json.loads(result.stdout)["hookSpecificOutput"]["permissionDecisionReason"],
              f"spec deny JSON 保留完整路径: {name!r}")
    p = payload("Write", file_path="src/relative.py")
    check(deny_json(invoke("fail-gate-hook.sh", p)), "spec 写时门识别项目相对路径")

    # 真实屏蔽 Python 后运行降级链，避免只测默认环境的 self-test 假覆盖。
    utilities = ("bash", "awk", "grep", "sed", "cat", "tr", "cut", "head", "tail",
                 "dirname", "basename", "mkdir", "date", "rm")
    for parser in ("jq", "perl", "awk"):
        if not shutil.which(parser):
            continue
        bindir = tmp / ("bin-" + parser)
        bindir.mkdir()
        for utility in (*utilities, parser):
            executable = shutil.which(utility)
            if executable and not (bindir / utility).exists():
                (bindir / utility).symlink_to(executable)
        fallback_env = dict(env, PATH=str(bindir))
        p = payload("Bash", command="git status\nnpm publish")
        check(deny_json(invoke("fail-gate-hook.sh", p, env_override=fallback_env)),
              f"无 Python 的 {parser} 降级链保留多行命令")
        check(invoke("spec-first-bridge.sh", None, "--tool", "bash", "--cmd",
                     "git status\nnpm publish", "--cwd", str(project),
                     env_override=fallback_env).returncode == 2,
              f"无 Python 的 {parser} 显式 bridge 保留多行命令")

    specs = project / "docs/specs"
    specs.mkdir(parents=True)
    (specs / "approved.md").write_text("# Approved\n## 决策记录\n- 允许变更\n")
    state = project / ".swarm-yuan"
    state.mkdir(exist_ok=True)
    flag = state / ".gate-fail-flag"
    flag.write_text("gate_security_one\ngate_security_two\n")
    for p in (payload("Write", file_path=str(project / "src/app.py")),
              payload("Bash", command="git push origin main")):
        check(deny_json(invoke("fail-gate-hook.sh", p)), f"多 FAIL_IDS 合法 deny JSON: {p['tool_name']}")
    audit = state / "gate-audit.jsonl"
    try:
        audit_valid = all(isinstance(json.loads(line), dict) for line in audit.read_text().splitlines())
    except ValueError:
        audit_valid = False
    check(audit_valid, "审计每行均为完整 JSON")

    for command, expected in (
        ("bash -c 'git status; npm publish'", "forbid"),
        ("env A=1 bash -c 'git status; npm publish'", "forbid"),
        ("git status && unclassified-command", "prompt"),
        ("unclassified-command; git status", "prompt"),
        ("bash -c 'git status && git diff'", "allow"),
        ("git status && git diff", "allow"),
        ("echo 'a; npm publish'", "prompt"),
        ('echo "a\\\"; npm publish"', "prompt"),
    ):
        result = invoke("gate-rules.sh", None, str(skill / "rules.d"), command, "--quiet")
        check(result.stdout.strip() == expected, f"规则 {command!r} → {expected}（实得 {result.stdout.strip()!r}）")

    # 所有 Git 操作只作用于一次性项目；不创建真实提交/不执行 payload 中的命令。
    def git(*args):
        return subprocess.run(["git", *args], cwd=project, check=True, capture_output=True, text=True)

    git("init", "-b", "main")
    git("config", "user.email", "fixture@example.invalid")
    git("config", "user.name", "Fixture")
    git("config", "core.hooksPath", str(tmp / "no-hooks"))
    (project / "src/app.txt").write_text("base\n")
    git("add", "src/app.txt", "docs/specs/approved.md")
    git("commit", "-m", "fixture: base")
    git("checkout", "-b", "fix/snapshot")
    spec = specs / "change.md"
    spec.write_text("# Change\n<占位符>\n")
    (project / "src/app.txt").write_text("changed\n")
    git("add", "src/app.txt", "docs/specs/change.md")
    check(invoke("spec-first-pre-commit.sh").returncode == 1, "L2 staged 占位 spec 拦截")
    spec.write_text("# Change\n## 决策记录\n- 已批准\n")
    check(invoke("spec-first-pre-commit.sh").returncode == 1,
          "L2 工作区批准不掩盖 staged 占位 spec")
    git("add", "docs/specs/change.md")
    spec.write_text("# Change\n<占位符>\n")
    check(invoke("spec-first-pre-commit.sh").returncode == 0,
          "L2 staged 已批准不受未暂存正文影响")
    git("commit", "-m", "fixture: approved spec")
    (project / "src/app.txt").write_text("next\n")
    git("add", "src/app.txt")
    check(invoke("spec-first-pre-commit.sh").returncode == 0,
          "L2 本分支 HEAD 已批准不受工作区正文影响")
    git("add", "docs/specs/change.md")
    check(invoke("spec-first-pre-commit.sh").returncode == 1,
          "L2 staged 撤回批准覆盖 HEAD 旧批准")
    git("reset", "--hard", "HEAD")
    git("checkout", "main")
    (project / "src/app.txt").write_text("main changed\n")
    (specs / "approved.md").write_text("# Pending\n<占位符>\n")
    git("add", "src/app.txt", "docs/specs/approved.md")
    (specs / "approved.md").write_text("# Approved\n## 决策记录\n- 只在工作区\n")
    check(invoke("spec-first-pre-commit.sh").returncode == 1,
          "L2 主干存在性同样检查 index 正文")

print(f"test-hook-contracts: {checks - len(failures)}/{checks} passed")
raise SystemExit(bool(failures))
PY
