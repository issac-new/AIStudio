#!/usr/bin/env bash
# spec-first-bridge.sh — 五宿主 L1 写时拦截桥（R103，spec-first 四层模型的 L1 多宿主面）
#
# 职责：把各宿主的 PreToolUse hook 调用归一为 Claude 形态 payload，喂给判定单一事实源
# fail-gate-hook.sh（spec-first-lib 判据），再把 deny 翻译成各宿主通用的阻断协议。
#
# 阻断协议（五宿主统一，官方文档锚定）：exit 2 + stderr 原因——
#   Cursor「Exit code 2 - Block the action」/Gemini「exit code 2 Critical Block（stderr 为原因）」/
#   Devin「exit code 2 阻断」/kimi-code「exit 2 Intentional block（stderr 为原因）」；
#   OpenCode 由 .opencode/plugins/ 插件捕获本脚本退出码后 throw（tool.execute.before 抛错即中止）。
# 放行：exit 0，stdout 静默（fail-open——解析失败/缺库/缺 conf 一律放行，与 fail-gate-hook 同失败哲学；
# R128 起载荷归一化解析链 python3 → jq → perl → awk 逐级降级，全缺时 stderr 披露一行后放行）。
#
# 用法：
#   echo '<host payload JSON>' | bash spec-first-bridge.sh --host <cursor|gemini|devin|kimi|opencode>
#   bash spec-first-bridge.sh --tool <name> --path <file> --cmd <command>   # 显式参数（OpenCode 插件用）
#   bash spec-first-bridge.sh --self-test                                   # 离线归一化自检
# 归一化（宽松键提取，防各宿主字段漂移）：tool 取 tool_name/toolName/tool/name；
#   入参取 tool_input/toolInput/input/args/params 下的 command 与 file_path/filePath/path/fileName。
#   工具名映射（→ 判定库 canonical）：cursor Shell→Bash；gemini run_shell_command→Bash、
#   write_file→Write、replace→Edit；devin exec→Bash、write→Write、edit→Edit；kimi 原生；
#   opencode bash→Bash、write→Write、edit→Edit。未识别工具名原样透传（fail-gate-hook 自行判定）。
set -uo pipefail

# --self-test：离线归一化自检（不经宿主；镜像 fail-gate-hook --self-test 形态）。
# 喂固定载荷过当前环境解析链（python3/jq/perl/awk 链选第一个可用），断言四字段可达——
# 任一解析器缺失时仍用其余解析器跑通；全缺 rc=1（L1 面失效，须补装任一解析器）。
# 逐级屏蔽演练（分别屏蔽 python3/jq/perl/awk）由 test-r128 的 PATH 夹具负责。
if [[ "${1:-}" == "--self-test" ]]; then
  _st_payload='{"tool_name":"Write","toolInput":{"file_path":"/tmp/a.py","command":"echo ok"},"cwd":"/tmp/st"}'
  _st_rc=0
  printf '%s' "$_st_payload" | bash "$0" --__st-dump || _st_rc=$?
  exit "${_st_rc}"
fi
# 内部：--__st-dump 打印归一化结果（供 --self-test 与调试复用）
_ST_DUMP=0
if [[ "${1:-}" == "--__st-dump" ]]; then
  _ST_DUMP=1
  shift
fi

HOST=""
T_TOOL=""
T_PATH=""
T_CMD=""
T_CWD=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --host) HOST="${2:?}"; shift 2 ;;
    --tool) T_TOOL="${2:?}"; shift 2 ;;
    --path) T_PATH="${2:-}"; shift 2 ;;
    --cmd)  T_CMD="${2:-}"; shift 2 ;;
    --cwd)  T_CWD="${2:-}"; shift 2 ;;
    *) echo "未知参数: $1" >&2; exit 1 ;;
  esac
done

_self="$(cd "$(dirname "$0")" && pwd)"
HOOK=""
for _cand in "${_self}/fail-gate-hook.sh" "${_self}/../hooks/fail-gate-hook.sh"; do
  [[ -f "$_cand" ]] && { HOOK="$_cand"; break; }
done
[[ -z "$HOOK" ]] && exit 0   # 判定面不可用=放行（成套分发由 test-r103 锁配对）

# ===== 归一化 =====
NORM_TOOL=""
NORM_PATH=""
NORM_CMD=""
NORM_CWD=""
# python3 可用性探针（R128，一次计算两处消费：归一化链选级 + CANON 序列化选路）——
# command -v 只证存在不证可用，PATH 前置 exit 127 假壳会让 python3 分支静默产出空结果。
_PY_OK=0
if command -v python3 >/dev/null 2>&1 && python3 -c 'import json' >/dev/null 2>&1; then
  _PY_OK=1
fi
if [[ -n "$T_TOOL" ]]; then
  NORM_TOOL="$T_TOOL"; NORM_PATH="$T_PATH"; NORM_CMD="$T_CMD"; NORM_CWD="$T_CWD"
else
  PAYLOAD="$(cat 2>/dev/null || true)"
  [[ -z "$PAYLOAD" ]] && exit 0
  # R128：解析链 python3 → jq → perl → awk 逐级降级（镜像 fail-gate-hook _jget 的 jq→perl→awk
  # 链）。旧实现只有 python3 一条通道，缺 python3 即静默放行——五宿主桥接面恰是最可能缺
  # python3 的环境，L1 整体失效。每级可用性=command -v 加功能探针（探针失败如 exit 127
  # 假壳=该级不可用，取下一级；探针代价每事件最多一次子进程，换 stub 环境不静默失效）。
  # 选中级解析失败=字段空 → fail-open（与 python3 分支的空 NUL 语义一致），不再逐级重试。
  # 各级提取同一组字段、同一键序（tool/path/cmd/cwd）；已知降级差异：awk 对 \uXXXX 转义
  # 按字符丢弃（与 fail-gate-hook 同取舍）、perl/awk 不判字段值类型（python3 只认字符串）。
  # 除 python3 走 NUL（fd 直读，命令替换会剥 NUL）外，降级级以 \x1f（unit separator）单行
  # 拼接：值内出现率远低于换行，read -d '' 整读保多行命令不截断（test-hook-contracts 的
  # "git status\nnpm publish" 契约）。
  _norm_split() {  # $1=\x1f 四段拼接行（tool path cmd cwd）→ 写 NORM_* 四全局
    local _t="" _p="" _c="" _w=""
    IFS=$'\x1f' read -r -d '' _t _p _c _w <<< "${1:-}" || true
    NORM_TOOL="${_t}"; NORM_PATH="${_p}"; NORM_CMD="${_c}"
    NORM_CWD="${_w%$'\n'}"
  }
  if [[ "${_PY_OK}" -eq 1 ]]; then
    _lines=()
    while IFS= read -r -d '' _ln; do _lines+=("$_ln"); done < <(
      printf '%s' "$PAYLOAD" | python3 -c '
import sys, json
try:
    d = json.load(sys.stdin)
except Exception:
    sys.stdout.write("\0" * 4)
    raise SystemExit(0)
def pick(o, keys):
    if not isinstance(o, dict): return ""
    for k in keys:
        v = o.get(k)
        if isinstance(v, str) and v: return v
    return ""
tool = pick(d, ("tool_name", "toolName", "tool", "name"))
ti = {}
for k in ("tool_input", "toolInput", "tool_args", "toolArgs", "input", "args", "params", "parameters"):
    if isinstance(d.get(k), dict):
        ti = d[k]; break
if not ti:
    ti = d  # 顶层平铺变体兜底
cmd = pick(ti, ("command", "cmd"))
path = pick(ti, ("file_path", "filePath", "path", "fileName"))
cwd = pick(d, ("cwd",))
for value in (tool, path, cmd, cwd):
    sys.stdout.write(value + "\0")
' 2>/dev/null
    )
    NORM_TOOL="${_lines[0]:-}"
    NORM_PATH="${_lines[1]:-}"
    NORM_CMD="${_lines[2]:-}"
    NORM_CWD="${_lines[3]:-}"
  elif command -v jq >/dev/null 2>&1 && jq -n true >/dev/null 2>&1; then
    _norm_split "$(printf '%s' "$PAYLOAD" | jq -r '
      def obj: if type == "object" then . else {} end;
      def strv: if type == "string" and length > 0 then . else empty end;
      def pick($ks): first($ks[] as $k | .[$k] | strv) // "";
      def tio: first(("tool_input","toolInput","tool_args","toolArgs","input","args","params","parameters")
                     as $k | .[$k] | select(type == "object")) // {};
      (obj | pick(["tool_name","toolName","tool","name"])) + "\u001f" +
      (obj | tio | pick(["file_path","filePath","path","fileName"])) + "\u001f" +
      (obj | tio | pick(["command","cmd"])) + "\u001f" +
      (obj | pick(["cwd"]))
    ' 2>/dev/null || true)"
  elif command -v perl >/dev/null 2>&1 && perl -MJSON::PP -e 1 >/dev/null 2>&1; then
    _norm_split "$(printf '%s' "$PAYLOAD" | perl -MJSON::PP -0777 -e '
      binmode(STDOUT, ":utf8");
      my $raw = do { local $/; <STDIN> };
      my $d = eval { decode_json($raw) };
      exit 0 unless ref($d) eq "HASH";
      my $pick = sub {
        my ($o, @keys) = @_;
        return "" unless ref($o) eq "HASH";
        for my $k (@keys) {
          my $v = $o->{$k};
          return $v if defined($v) && !ref($v) && length("$v");
        }
        return "";
      };
      my $ti = {};
      for my $k (qw(tool_input toolInput tool_args toolArgs input args params parameters)) {
        if (ref($d->{$k}) eq "HASH") { $ti = $d->{$k}; last; }
      }
      $ti = $d unless %{$ti};
      print join("\x1f",
        $pick->($d, qw(tool_name toolName tool name)),
        $pick->($ti, qw(file_path filePath path fileName)),
        $pick->($ti, qw(command cmd)),
        $pick->($d, qw(cwd)));
    ' 2>/dev/null || true)"
  elif command -v awk >/dev/null 2>&1 && awk 'BEGIN { exit 0 }' </dev/null >/dev/null 2>&1; then
    # 宽松键提取（与 fail-gate-hook _JSON_AWK_STR 同风格）：单引号字面 \047 规避 awk 程序内
    # 嵌单引号；多行载荷先拼接（JSON 换行只出现在 token 间）；\uXXXX 原样透传（R131 前为丢弃）、其余转义还原。
    _norm_split "$(printf '%s' "$PAYLOAD" | LC_ALL=C awk '
      { _acc = _acc $0 }
      END {
        line = _acc
        sep = sprintf("%c", 31)
        tool = pickk(line, 1, "tool_name", "toolName", "tool", "name")
        from = 0
        nti = split("tool_input toolInput tool_args toolArgs input args params parameters", tik, " ")
        for (i = 1; i <= nti; i++) {
          p = keystore(line, tik[i])
          if (p > 0) { from = p; break }
        }
        if (from == 0) from = 1
        path = pickk(line, from, "file_path", "filePath", "path", "fileName")
        cmd = pickk(line, from, "command", "cmd", "", "")
        cwd = pickk(line, 1, "cwd", "", "", "")
        printf "%s%s%s%s%s%s%s\n", tool, sep, path, sep, cmd, sep, cwd
      }
      function extract(line, key, from,  pat, idx, i, n, c, d2, out) {
        pat = "\"" key "\""
        idx = index(substr(line, from), pat)
        if (idx == 0) return ""
        i = from + idx - 1 + length(pat)
        n = length(line)
        while (i <= n) { c = substr(line, i, 1); if (c == " " || c == "\t" || c == "\r" || c == ":") i++; else break }
        if (substr(line, i, 1) != "\"") return ""
        i++; out = ""
        while (i <= n) {
          c = substr(line, i, 1)
          if (c == "\\") {
            d2 = substr(line, i+1, 1)
            if (d2 == "n") out = out "\n"
            else if (d2 == "t") out = out "\t"
            else if (d2 == "r") out = out "\r"
            else if (d2 == "u") { out = out substr(line, i, 6); i += 6; continue }  # R131：\uXXXX 原样透传（旧版整个丢弃，deny 原因文本被吞）
            else out = out d2
            i += 2; continue
          }
          if (c == "\"") break
          out = out c; i++
        }
        return out
      }
      function pickk(line, from, k1, k2, k3, k4,  v) {
        v = extract(line, k1, from); if (v != "") return v
        if (k2 != "") { v = extract(line, k2, from); if (v != "") return v }
        if (k3 != "") { v = extract(line, k3, from); if (v != "") return v }
        if (k4 != "") { v = extract(line, k4, from); if (v != "") return v }
        return ""
      }
      function keystore(line, key,  pat, p, i, n, c) {
        pat = "\"" key "\""
        p = index(line, pat)
        if (p == 0) return 0
        i = p + length(pat); n = length(line)
        while (i <= n) { c = substr(line, i, 1); if (c == " " || c == "\t" || c == "\r" || c == ":") i++; else break }
        return (substr(line, i, 1) == "{") ? p : 0
      }
    ' 2>/dev/null || true)"
  else
    # 全缺披露放行：fail-open 但不无声——一行 stderr 让宿主日志可查（L1 面失效须可发现）
    echo "spec-first-bridge: 解析链全缺（python3/jq/perl/awk 均不可用），L1 归一化失效，放行" >&2
    [[ "${_ST_DUMP:-0}" -eq 1 ]] && exit 1
    exit 0
  fi
fi

# --__st-dump：打印归一化结果并按字段可达性给退出码（0=四字段可达；1=归一化链不可达/全缺）
if [[ "${_ST_DUMP:-0}" -eq 1 ]]; then
  _d_rc=0
  printf '  tool=%s\n  path=%s\n  command=%s\n  cwd=%s\n' \
    "${NORM_TOOL:-}" "${NORM_PATH:-}" "${NORM_CMD:-}" "${NORM_CWD:-}"
  for _d_f in NORM_TOOL NORM_PATH NORM_CMD NORM_CWD; do
    eval "_d_v=\${${_d_f}:-}"
    if [[ -z "${_d_v}" ]]; then
      echo "  ✗ ${_d_f} 解析为空——归一化链对该字段不可达（当前环境解析器不足或载荷漂移）" >&2
      _d_rc=1
    fi
  done
  [[ "${_d_rc}" -eq 0 ]] && echo "  ✓ 归一化链健康（tool/path/command/cwd 均可达）"
  exit "${_d_rc}"
fi

# 工具名映射（全局统一表——五宿主工具名无冲突；bash 3.2 case 链；未命中原样透传）
# cursor Shell｜gemini run_shell_command｜devin exec｜opencode bash｜kimi Bash → Bash
# gemini write_file｜devin/opencode write → Write；gemini replace｜devin/opencode edit → Edit
case "$NORM_TOOL" in
  bash|Bash|exec|shell|Shell|run_shell_command) NORM_TOOL="Bash" ;;
  write|Write|write_file)                        NORM_TOOL="Write" ;;
  edit|Edit|replace|MultiEdit|multi_edit)        NORM_TOOL="Edit" ;;
esac

# ===== 构造 Claude 形态 payload 调判定链 =====
# 普通 JSON 字段允许换行/制表符，不能删字符来伪造可解析 JSON。
# 有 Python 时直接序列化；显式参数模式仍支持无 Python 的既有降级环境（_PY_OK 同上探针，
# 防 exit 127 假壳下 CANON 静默为空）。
if [[ "${_PY_OK}" -eq 1 ]]; then
  CANON=$(python3 -c '
import json, sys
print(json.dumps({"hook_event_name": "PreToolUse", "tool_name": sys.argv[1],
                  "tool_input": {"file_path": sys.argv[2], "command": sys.argv[3]},
                  "cwd": sys.argv[4]}, ensure_ascii=False))
' "$NORM_TOOL" "$NORM_PATH" "$NORM_CMD" "${NORM_CWD:-$(pwd)}")
else
  _escape() {
    local _j="$1" _code _char _escaped
    _j="${_j//\\/\\\\}"; _j="${_j//\"/\\\"}"
    for ((_code=1; _code<32; _code++)); do
      printf -v _escaped '%03o' "$_code"
      printf -v _char '%b' "\\$_escaped"
      case "$_code" in
        9) _escaped='\t' ;; 10) _escaped='\n' ;; 13) _escaped='\r' ;;
        *) printf -v _escaped '\\u%04x' "$_code" ;;
      esac
      _j="${_j//$_char/$_escaped}"
    done
    printf '%s' "$_j"
  }
  CANON="{\"hook_event_name\":\"PreToolUse\",\"tool_name\":\"$(_escape "$NORM_TOOL")\",\"tool_input\":{\"command\":\"$(_escape "$NORM_CMD")\",\"file_path\":\"$(_escape "$NORM_PATH")\"},\"cwd\":\"$(_escape "${NORM_CWD:-$(pwd)}")\"}"
fi

OUT="$(printf '%s' "$CANON" | bash "$HOOK" 2>/dev/null || true)"

# ===== 协议翻译：deny → exit 2 + stderr 原因（五宿主统一）=====
if printf '%s' "$OUT" | grep -q '"permissionDecision":"deny"'; then
  REASON=$(printf '%s' "$OUT" | sed -n 's/.*"permissionDecisionReason":"\([^"]*\)".*/\1/p' | head -1)
  [[ -z "$REASON" ]] && REASON="swarm-yuan spec-first: DENY（无 spec 写源码）"
  printf '%s\n' "$REASON" >&2
  exit 2
fi
exit 0
