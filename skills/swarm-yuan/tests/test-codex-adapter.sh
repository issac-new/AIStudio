#!/usr/bin/env bash
# test-codex-adapter.sh — Codex 适配器 deny 协议锚（audit-2026-08-25 P0：
# 生成的 PreToolUse 命令若带 `|| true`/`2>/dev/null`，exit 2+stderr 透传被抵消，拦截恒失效）
set -uo pipefail
cd "$(dirname "${0}")/.." || exit 1
TMP="$(mktemp -d /tmp/codexad.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT
FAIL=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1" >&2; FAIL=1; }

# 渲染 hooks.json（render_tool_codex_hooks 依赖 <skill_dir> <proj>，#24 绝对路径）
# R126：适配器 hooks 路径探测（ta_hook_path）定义在 common.sh——生产面由
# ta_render_tools 先 source common 再 source 适配器，本测试镜像同一顺序。
# shellcheck disable=SC1091
. "assets/tool-adapters/common.sh"
# shellcheck disable=SC1091
. "assets/tool-adapters/codex.sh"
mkdir -p "$TMP/proj" "$TMP/skilldir/scripts"
cp assets/hooks/codex-gate-wrapper.sh assets/hooks/failure-detector.sh "$TMP/skilldir/scripts/" 2>/dev/null || true
render_tool_codex_hooks "$TMP/skilldir" "$TMP/proj" >/dev/null 2>&1
HJ="$TMP/proj/.codex/hooks.json"

# 态1 hooks.json 生成
[[ -f "$HJ" ]] && ok "态1 hooks.json 生成" || { bad "态1 hooks.json 未生成"; exit 1; }

# 态2 PreToolUse 指向 codex-gate-wrapper
grep -q 'codex-gate-wrapper.sh' "$HJ" && ok "态2 PreToolUse 接 wrapper" || bad "态2 wrapper 未接线"

# 态3 PreToolUse 行无 || true（exit 2 必须可达 Codex）
pre_line=$(grep 'codex-gate-wrapper' "$HJ")
if printf '%s' "$pre_line" | grep -q '|| true'; then
  bad "态3 PreToolUse 含 || true（deny 被吞）"
else
  ok "态3 PreToolUse 无 || true"
fi

# 态4 PreToolUse 行无 2>/dev/null（stderr 原因须透传给模型）
if printf '%s' "$pre_line" | grep -q '2>/dev/null'; then
  bad "态4 PreToolUse 含 2>/dev/null（透传被丢）"
else
  ok "态4 PreToolUse 无 2>/dev/null"
fi

# 态8 schema 一致性（回归发现#23，2026-08-27 R11）：Codex MatcherGroup 真实 schema =
# {"matcher": ..., "hooks": [{"type":"command","command":...,"timeout":...}]}（config/src/hook_config.rs）。
# 扁平 {"matcher","command"} 会被 serde 静默丢字段、hooks 空数组 → matcher 注册却零 handler（惰性）。
# 断言：①每个 matcher 组含非空 hooks 数组 ②hooks 元素均带 "type":"command" 与 "command" ③顶层仅 description/hooks 键。
if command -v python3 >/dev/null 2>&1; then
  schema_ok=$(python3 - "$HJ" <<'PYEOF'
import json, sys
d = json.load(open(sys.argv[1]))
top_bad = set(d.keys()) - {"description", "hooks"}
ev = d.get("hooks", {})
bad = []
for name, groups in ev.items():
    if not isinstance(groups, list): bad.append(f"{name}:非列表")
    for g in groups:
        if not isinstance(g, dict) or not g.get("hooks"):
            bad.append(f"{name}:matcher 组缺 hooks 数组（扁平 command 形态=零 handler 惰性）"); continue
        for h in g["hooks"]:
            if h.get("type") != "command" or not h.get("command"):
                bad.append(f"{name}:handler 非 command 型")
print("OK" if not top_bad and not bad else "BAD:" + ";".join(bad) + (f";顶层多余键{top_bad}" if top_bad else ""))
PYEOF
  )
  [[ "$schema_ok" == "OK" ]] && ok "态8 Codex schema 嵌套结构一致（hooks[].type=command）" || bad "态8 schema 不符 Codex 真源码：$schema_ok"
else
  echo "  (态8 跳过：无 python3)"
fi

# 态9 命令绝对路径 + 引用文件实存（回归发现#24：相对路径注册未部署，运行必 No such file）
if command -v python3 >/dev/null 2>&1; then
  deploy_ok=$(python3 - "$HJ" <<'PYEOF'
import json, os, re, sys
d = json.load(open(sys.argv[1]))
bad = []
for name, groups in d.get("hooks", {}).items():
    for g in groups:
        for h in g.get("hooks", []):
            c = h.get("command", "")
            c = re.sub(r"\s*\|\|\s*true\s*$", "", c).strip()  # 先剥 advisory 尾缀再取路径
            inner = c.split()[-1] if c.startswith("bash ") else c
            inner = inner.strip().strip('"')
            if not os.path.isabs(inner):
                bad.append(f"{name}:相对路径 {c}")
            elif not os.path.isfile(inner):
                bad.append(f"{name}:{inner} 不存在")
print("OK" if not bad else "BAD:" + ";".join(bad))
PYEOF
  )
  [[ "$deploy_ok" == "OK" ]] && ok "态9 命令绝对路径且文件实存（部署完整）" || bad "态9 部署断裂：$deploy_ok"
fi

# 态10 旧扁平 hooks.json 升级重写（#23 既有部署升级路径）
printf '{"hooks":{"PreToolUse":[{"matcher":"Bash","command":"bash scripts/codex-gate-wrapper.sh","timeout":5}]}}' > "$HJ"
render_tool_codex_hooks "$TMP/skilldir" "$TMP/proj" >/dev/null 2>&1
grep -q '"type": *"command"' "$HJ" && ok "态10 旧扁平 hooks.json 升级重写" || bad "态10 旧形态未升级（幂等守卫过严）"

# 态5 wrapper 自身 deny 路径：构造 deny JSON 输入，断言 exit 2 + stderr 非空
mkdir -p "$TMP/skill/scripts"
cp assets/hooks/codex-gate-wrapper.sh assets/hooks/fail-gate-hook.sh "$TMP/skill/scripts/" 2>/dev/null || true
deny_in='{"tool_name":"Bash","tool_input":{"command":"rm -rf *"}}'
# wrapper 依赖 fail-gate-hook 输出 deny JSON；fail-gate-hook 需要 conf——此处仅断言 wrapper 对 deny JSON 的协议转换：
# 用假 fail-gate-hook 直接输出 deny JSON，验证 wrapper 的 exit 2 + stderr 透传
cat > "$TMP/skill/scripts/fail-gate-hook.sh" <<'FEOF'
#!/usr/bin/env bash
printf '{"hookSpecificOutput":{"permissionDecision":"deny","permissionDecisionReason":"测试拒绝","additionalContext":"替代方案X"}}\n'
FEOF
chmod +x "$TMP/skill/scripts/fail-gate-hook.sh"
err=$(cd "$TMP/skill" && printf '%s' "$deny_in" | bash scripts/codex-gate-wrapper.sh 2>&1 >/dev/null); rc=$?
[[ $rc -eq 2 ]] && ok "态5 deny → exit 2" || bad "态5 exit=${rc}（应为 2）"
printf '%s' "$err" | grep -q "测试拒绝" && ok "态6 stderr 透传原因" || bad "态6 stderr=$err"

# 态7 放行路径 exit 0
cat > "$TMP/skill/scripts/fail-gate-hook.sh" <<'FEOF'
#!/usr/bin/env bash
printf '{"hookSpecificOutput":{"permissionDecision":"allow"}}\n'
FEOF
(cd "$TMP/skill" && printf '%s' "$deny_in" | bash scripts/codex-gate-wrapper.sh >/dev/null 2>&1); rc=$?
[[ $rc -eq 0 ]] && ok "态7 allow → exit 0" || bad "态7 exit=${rc}（应为 0）"

if [[ $FAIL -eq 0 ]]; then echo "test-codex-adapter: PASS"; else echo "test-codex-adapter: FAIL" >&2; fi
exit $FAIL
