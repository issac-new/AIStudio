#!/usr/bin/env bash
# common.sh — 多平台规则渲染公共库（generate-skill.sh --render-tools 与 install.sh 共用 source）
# 职责：从目标 skill 的 SKILL.md + scripts/precheck.conf 派生各 AI 工具原生规则文件。
# 适配器契约：assets/tool-adapters/<tool>.sh 定义 render_tool_<tool> <skill_dir> <proj> <level>，
#   level ∈ user（工具全局规则位）| project（项目根规则文件）；TA_* 全局变量由调度器预填。
# 幂等约定：生成内容不含时间戳等易变字段，ta_write_if_changed 内容一致即 no-op。
# 调用方须先设置 TA_DIR（本适配器目录绝对路径）再 source 本文件。
#
# 格式依据（均访问于 2026-07-20）：
#   Cursor .mdc frontmatter（description/globs/alwaysApply 三字段 → 四种激活方式）：
#     https://qaskills.sh/blog/cursor-skill-md-frontmatter-schema-guide
#   Windsurf .windsurf/rules/*.md（trigger 四值；2026-06 起新版偏好 .devin/rules/，
#     .windsurf/rules/ 保留回退；全局规则 6,000 字符硬上限）：
#     https://skillwright.app/blog/windsurf-rules-guide
#     https://thepromptshelf.dev/blog/windsurf-vs-cursor-vs-agents-md-2026/
#   各工具全局/项目指令文件对照（Codex ~/.codex/AGENTS.md、OpenCode
#     ~/.config/opencode/AGENTS.md、Gemini ~/.gemini/GEMINI.md、Kimi 仅项目 AGENTS.md）：
#     https://gist.github.com/hungson175/76131bb8434f9d58ee7b2f08c3242624

# ---- G7：AI 工具兼容三档机器可读元数据 ----
# runnable（可运行，目录复制即被该工具加载约定消费）
# cli（集成，runnable + --render-tools 派生该工具原生规则文件）
# deep（深度集成，cli + slash command 注册 + hooks/commands/MCP）
# 声明式元数据；未声明工具 ta_tier_of 默认按 runnable（最低档）处理，不阻塞。
# 口径权威源：assets/facts.conf（FACT_COMPAT_TIERS=3/DEEP=1/CLI=7），self-check 对账。
# 能力表按变量名经 eval 间接消费（ta_tier_of / ta_write_enforce_of），静态检查不可见。
# shellcheck disable=SC2034
TA_TIER_claude=deep
TA_TIER_cursor=cli
TA_TIER_windsurf=cli
TA_TIER_codex=cli
TA_TIER_opencode=cli
TA_TIER_gemini=cli
TA_TIER_kimi=cli
TA_TIER_zcode=cli

# 按工具查 tier（bash 3.2 兼容：间接展开 eval，不用 declare -A 关联数组）
ta_tier_of() {  # $1=tool → stdout tier（runnable/cli/deep）
  local tool="$1"
  eval "echo \"\${TA_TIER_${tool}:-runnable}\""
}

# ---- 写时拦截能力表（四层拦截模型 L1 面，R101 建/R103 三态化）----
# hook     = 已整合且活体实证（spec-first deny 真实阻断过）；
# rendered = 配置已渲染（官方 schema 文档锚 + exit 2 阻断协议，但宿主 CLI/凭据不可得未活体实证）
#            ——宣称面按「未实证不宣称」收窄，强制面以 L2/L3/L4 为准；
# 未声明   = 未整合——渲染诚实降级线（gstack 先例 "advisory, not blocked"）。
# 实证锚：claude=hooks.json deny JSON（R102 三步对照活体实证）；codex=.codex/hooks.json exit 2
# （codex.sh 头注）；zcode=zcode-plugin/ 嵌套 hooks.json + config.json 注册（zcode.sh 头注五条）。
# rendered 五家 schema 锚（访问 2026-10-09，详见 docs/research/R103-host-hooks.md §二）：
# cursor hooks.json version:1 扁平条目（preToolUse，exit 2=block）；gemini settings.json hooks
# 嵌套（BeforeTool，decision deny/exit 2，超时毫秒）；devin .devin/hooks.v1.json（hooks 对象即
# 整文件，Claude 嵌套形，decision block/exit 2）；kimi-code config.toml [[hooks]]（exit 2）；
# opencode .opencode/plugins/ 本地插件 tool.execute.before throw 即中止。
TA_WRITE_HOOK_claude=1
TA_WRITE_HOOK_codex=1
TA_WRITE_HOOK_zcode=1
TA_WRITE_HOOK_cursor=rendered
TA_WRITE_HOOK_gemini=rendered
TA_WRITE_HOOK_windsurf=rendered
TA_WRITE_HOOK_opencode=rendered
TA_WRITE_HOOK_kimi=rendered
ta_write_enforce_of() {  # $1=tool → stdout "hook"|"rendered"|空（表值 1 归一为 hook）
  local tool="$1" _v
  eval "_v=\"\${TA_WRITE_HOOK_${tool}:-}\""
  case "$_v" in
    1|hook) printf 'hook' ;;
    rendered) printf 'rendered' ;;
  esac
}

# ---- 用户级工具 home 判定（与 install.sh detect_runtimes 的 8 目录一一对应）----
ta_is_user_level() {  # $1=tool_home
  case "$1" in
    "$HOME/.claude"|"$HOME/.cursor"|"$HOME/.codex"|"$HOME/.gemini"|"$HOME/.kimi"|"$HOME/.kimi-code"|"$HOME/.zcode"|"$HOME/.config/opencode"|"$HOME/.codeium/windsurf") return 0 ;;
    *) return 1 ;;
  esac
}

# ---- 从 SKILL.md frontmatter 提取单行字段（name/description）；无命中输出空 ----
ta_parse_skill_field() {  # $1=skill_dir $2=字段名 → stdout 字段值
  local f="$1/SKILL.md" key="$2"
  [[ -f "$f" ]] || return 0
  # 无 frontmatter（首行非 ---）直接返回空
  [[ "$(head -n 1 "$f" 2>/dev/null)" == "---" ]] || return 0
  awk -v key="$key" '
    NR == 1 { next }                       # 跳过首个 ---
    /^---[[:space:]]*$/ { exit }           # frontmatter 结束
    index($0, key ":") == 1 {              # 行首命中 key:
      val = substr($0, length(key) + 1)
      sub(/^:[[:space:]]*/, "", val)       # 去掉冒号与前导空格
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", val)
      sub(/^"/, "", val); sub(/"$/, "", val)
      print val
      exit
    }
  ' "$f"
}

# ---- 读取 precheck.conf 的 ACTIVE_FRAMEWORKS（conf 缺失/未配置静默输出空）----
# conf 可能含字面 ${}（如 SQL_INJECTION_WHITELIST），照搬 inject_frameworks 的 set +u 子 shell 模式
ta_active_frameworks() {  # $1=skill_dir → 空格分隔框架清单（可空）
  local conf="$1/scripts/precheck.conf"
  [[ -f "$conf" ]] || return 0
  (
    set +u
    # shellcheck disable=SC1090
    . "$conf" 2>/dev/null
    printf '%s ' ${ACTIVE_FRAMEWORKS[@]+"${ACTIVE_FRAMEWORKS[@]}"}
  )
}

# ---- YAML 双引号字符串转义（换行折叠为空格，转义反斜杠与双引号）----
ta_yaml_dq() {
  printf '%s' "$1" | tr '\n' ' ' | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

# ---- 幂等写：内容一致即 no-op，否则原子替换（mktemp + mv）----
ta_write_if_changed() {  # <tmpfile> <dest> <label>
  local tmp="$1" dest="$2" label="$3"
  if [[ -f "$dest" ]] && cmp -s "$tmp" "$dest"; then
    rm -f "$tmp"
    echo "  · ${label}: 内容一致，跳过（no-op）"
    return 0
  fi
  local existed=0
  if [[ -f "$dest" ]]; then existed=1; fi
  mkdir -p "$(dirname "$dest")"
  mv "$tmp" "$dest"
  if [[ "$existed" -eq 1 ]]; then
    echo "  ✓ ${label}: 已更新 $dest"
  else    echo "  ✓ ${label}: 已生成 $dest"
  fi
  return 0
}

# ---- hooks 脚本路径布局探测（R126）----
# 目标技能的 hooks 物化在 scripts/，生成器自身的 hooks 在 assets/hooks/（双布局语义同
# R120 为 precheck/state-machine 做过的探测）。旧实现注册宿主 hooks 时统一硬编码
# scripts/ 路径——对生成器自身安装面渲染出指向不存在文件的死命令（装完即 404，
# 宿主静默 fail-open 或报错），与「未实证不宣称」的诚实降级线冲突。
# 用法：_hp=$(ta_hook_path "$skill_dir" spec-first-bridge.sh)；空=本布局无此脚本，
# 调用方须跳过注册并如实披露，不得渲染指向不存在路径的命令。
ta_hook_path() {  # $1=skill_dir $2=脚本名 → stdout 存在的绝对路径；无=空
  local _s="$1" _n="$2"
  if [[ -f "$_s/scripts/$_n" ]]; then
    printf '%s' "$_s/scripts/$_n"
  elif [[ -f "$_s/assets/hooks/$_n" ]]; then
    printf '%s' "$_s/assets/hooks/$_n"
  fi
  return 0
}

# R126：user 级渲染的宿主存在性探测——「写配置」与「宿主事实」挂钩。
# 旧版 --render-tools 不带过滤时向 8 家宿主全量写配置：只装了一家宿主的机器上
# 凭空生出 ~/.cursor/hooks.json、~/.gemini/settings.json 等（污染 HOME）。
# 宿主注册表读取：tool key → hosts.tsv 列（WP2）。目标技能无 registry 时回退内建表。
ta_registry_host() {  # $1=tool $2=col(2=detect,3=install_path) → stdout（空=无 registry/无行）
  local tool="$1" col="$2" id reg
  id="$tool"
  [[ "$tool" == "claude" ]] && id="claude-code"
  reg="$(cd "$(dirname "${BASH_SOURCE[0]}")/../registry" 2>/dev/null && pwd || true)"
  [[ -n "$reg" && -f "$reg/hosts.tsv" ]] || return 1
  awk -F '\t' -v id="$id" -v c="$col" '!/^#/ && $1==id {print $c; exit}' "$reg/hosts.tsv"
}

ta_tool_home() {  # $1=tool → stdout 宿主安装探测目录（空=无判据，不拦）
  local tool="$1" home det
  # 优先注册表第2列 dir: 判据（探测目录=宿主家目录）；无 dir: 再退第3列 install_path
  # （旧 8 家第3列恰好是家目录）。hermes/dsh/ccswitch 第3列是 skills 安装子目录——
  # 曾被直接当探测目录，宿主已装但未装过技能（子目录不存在）时必漏检
  # （R139 实抓，与 R128 修掉的「skills 子目录倒置」同族复发）。
  det="$(ta_registry_host "$tool" 2 2>/dev/null || true)"
  case "$det" in dir:*) home="${det#dir:}" ;; esac
  if [[ -z "$home" ]]; then
    home="$(ta_registry_host "$tool" 3 2>/dev/null || true)"
  fi
  if [[ -n "$home" ]]; then
    home="${home/#\~/$HOME}"
    printf '%s' "$home"
    return 0
  fi
  case "$tool" in
    agent)    printf '%s' "$HOME/.agent" ;;
    cursor)   printf '%s' "$HOME/.cursor" ;;
    windsurf) printf '%s' "$HOME/.codeium/windsurf" ;;
    gemini)   printf '%s' "$HOME/.gemini" ;;
    codex)    printf '%s' "$HOME/.codex" ;;
    opencode) printf '%s' "$HOME/.config/opencode" ;;
    kimi)     printf '%s' "$HOME/.kimi-code" ;;
    zcode)    printf '%s' "$HOME/.zcode" ;;
    hermes)   printf '%s' "$HOME/.hermes" ;;
    dsh)      printf '%s' "$HOME/.dsh" ;;
    ccswitch) printf '%s' "$HOME/.cc-switch" ;;
    claude)   printf '%s' "$HOME/.claude" ;;
    *) printf '' ;;
  esac
  return 0
}

# ---- 宿主安装判定（R128：检测判据因果化，检测—渲染—注册—注销四态共用）----
# 旧判据「~/.<tool>/skills 子目录存在」因果倒置：Cursor/Gemini/OpenCode/ZCode/Codex/
#   Windsurf 默认安装从不创建该目录，新装宿主大面积漏检（install.sh detect_runtimes
#   8 家中 7 家踩此坑；Kimi 一家查父目录 ~/.kimi-code，口径不一）。
# 判据改为「宿主家目录存在 OR 宿主 CLI 可执行文件在 PATH」（~/.cursor 或 command -v cursor），
# 家目录表与 ta_tool_home 同源；windsurf 特例用 ~/.codeium/windsurf 子目录（~/.codeium 为
# Codeium 共享父目录，存在不等于装了 Windsurf）。Kimi 的 legacy ~/.kimi 回退由调用方处理。
ta_host_installed() {  # $1=tool → rc 0=已安装 1=未安装
  local _t="$1" _th _cli _det _dir
  _th="$(ta_tool_home "$_t")"
  _det="$(ta_registry_host "$_t" 2 2>/dev/null || true)"
  case "$_det" in
    command:*) _cli="${_det#command:}" ;;
    dir:*)     _dir="${_det#dir:}"; _dir="${_dir/#\~/$HOME}" ;;
  esac
  if [[ -z "${_cli:-}" ]]; then
    case "$_t" in
      claude)   _cli="claude" ;;
      cursor)   _cli="cursor" ;;
      codex)    _cli="codex" ;;
      opencode) _cli="opencode" ;;
      windsurf) _cli="windsurf" ;;
      gemini)   _cli="gemini" ;;
      kimi)     _cli="kimi" ;;
      zcode)    _cli="zcode" ;;
      *)        _cli="" ;;
    esac
  fi
  # dir: 判据（注册表第2列的目录存在即装）优先于 _th——两者同源时等价，
  # 但 dir: 保证「注册表登记的探测目录」直接生效，不依赖 ta_tool_home 的回落链。
  [[ -n "${_dir:-}" && -d "$_dir" ]] && return 0
  [[ -n "$_th" && -d "$_th" ]] && return 0
  [[ -n "$_cli" ]] && command -v "$_cli" >/dev/null 2>&1 && return 0
  return 1
}

# ---- 标记区块幂等 upsert（AGENTS.md / GEMINI.md / Windsurf global_rules.md 用）----
# 区块已存在则原位替换；不存在则文件末尾追加。缺闭标记 fail-closed 中止（同 --inject-frameworks 教训）
# R118 ⑩：Windows 下 AGENTS.md/GEMINI.md/config.toml 常为 CRLF。旧实现按整行（含行尾 \r）
# 比较标记，永远匹配不上 → 每次渲染都追加新区块（重复堆积、旧块永不更新）。现先剥 \r 归一
# 再比较/合并；原文件是 CRLF 时输出仍写回 CRLF，保持用户文件风格。
ta_upsert_marker_block() {  # <dest> <tool> <skill_name> <body_file> [style=html|toml]
  local dest="$1" tool="$2" name="$3" body="$4" style="${5:-html}"
  local open close
  case "$style" in
    toml) open="# >>> swarm-yuan:${tool}:${name} >>> （由 generate-skill.sh --render-tools 维护，勿手改）"
          close="# <<< swarm-yuan:${tool}:${name} <<<" ;;
    *)    open="<!-- >>> swarm-yuan:${tool}:${name} >>> （由 generate-skill.sh --render-tools 维护，勿手改） -->"
          close="<!-- <<< swarm-yuan:${tool}:${name} <<< -->" ;;
  esac
  local new merged src crlf=0
  new="$(mktemp "${TMPDIR:-/tmp}/rtblock.XXXXXX")"
  merged="$(mktemp "${TMPDIR:-/tmp}/rtmerge.XXXXXX")"
  { printf '%s\n' "$open"; cat "$body"; printf '%s\n' "$close"; } > "$new"
  src="$dest"
  if [[ -f "$dest" ]] && grep -q "$(printf '\r')" "$dest" 2>/dev/null; then
    crlf=1
    src="$(mktemp "${TMPDIR:-/tmp}/rtnorm.XXXXXX")"
    tr -d '\r' < "$dest" > "$src"
  fi
  if [[ -f "$dest" ]] && grep -qF "$open" "$src"; then
    if ! grep -qF "$close" "$src"; then
      echo "  ✗ $dest 含开标记但缺闭标记，中止（未改动）" >&2
      rm -f "$new" "$merged"
      [[ "$crlf" -eq 1 ]] && rm -f "$src"
      return 1
    fi
    # awk 变量名避开内建函数（close 是 awk 内建，BSD awk 下作变量名直接语法错误）；
    # awk 失败必须中止且不覆盖 dest（先写 merged 临时文件，成功才进入幂等替换）
    if ! awk -v omark="$open" -v cmark="$close" -v blockfile="$new" '
      $0 == omark { while ((getline l < blockfile) > 0) print l; skip = 1; next }
      $0 == cmark { skip = 0; next }
      !skip { print }
    ' "$src" > "$merged"; then
      echo "  ✗ 标记区块替换失败（awk 错误），中止（未改动 ${dest}）" >&2
      rm -f "$new" "$merged"
      [[ "$crlf" -eq 1 ]] && rm -f "$src"
      return 1
    fi
  else
    if [[ -f "$src" ]]; then cat "$src" > "$merged"; else : > "$merged"; fi
    if [[ -s "$merged" ]]; then printf '\n' >> "$merged"; fi
    cat "$new" >> "$merged"
  fi
  rm -f "$new"
  [[ "$crlf" -eq 1 ]] && rm -f "$src"
  if [[ "$crlf" -eq 1 ]]; then
    local crlfmerged
    crlfmerged="$(mktemp "${TMPDIR:-/tmp}/rtcrlf.XXXXXX")"
    awk '{ printf "%s\r\n", $0 }' "$merged" > "$crlfmerged"
    rm -f "$merged"
    merged="$crlfmerged"
  fi
  ta_write_if_changed "$merged" "$dest" "${tool} $(basename "$dest")"
}

# ---- 标记区块移除（R128，与 ta_upsert_marker_block 对偶，--uninstall 通道用）----
# 删 <open>..<close> 整块（含标记行），块外内容原样保留；文件/开标记不存在=幂等 no-op；
# 含开标记但缺闭标记 fail-closed 不改动（同 upsert 契约）；CRLF 兼容（剥 \r 匹配、
# 按原风格写回）；一并收敛块前紧邻的一个空行（upsert 追加时补的分隔行），
# 防「反复装/卸」在文件尾残留空行堆积。
ta_remove_marker_block() {  # <dest> <tool> <skill_name> [style=html|toml]
  local dest="$1" tool="$2" name="$3" style="${4:-html}"
  local open close
  case "$style" in
    toml) open="# >>> swarm-yuan:${tool}:${name} >>> （由 generate-skill.sh --render-tools 维护，勿手改）"
          close="# <<< swarm-yuan:${tool}:${name} <<<" ;;
    *)    open="<!-- >>> swarm-yuan:${tool}:${name} >>> （由 generate-skill.sh --render-tools 维护，勿手改） -->"
          close="<!-- <<< swarm-yuan:${tool}:${name} <<< -->" ;;
  esac
  if [[ ! -f "$dest" ]]; then
    echo "  · ${dest} 不存在——${tool}:${name} 标记块已不在（幂等）"
    return 0
  fi
  local src crlf=0 out
  src="$dest"
  if grep -q "$(printf '\r')" "$dest" 2>/dev/null; then
    crlf=1
    src="$(mktemp "${TMPDIR:-/tmp}/rtunrm.XXXXXX")"
    tr -d '\r' < "$dest" > "$src"
  fi
  if ! grep -qF "$open" "$src"; then
    echo "  · ${dest} 无 ${tool}:${name} 标记块（幂等，未改动）"
    [[ "$crlf" -eq 1 ]] && rm -f "$src"
    return 0
  fi
  if ! grep -qF "$close" "$src"; then
    echo "  ✗ ${dest} 含开标记但缺闭标记，中止（未改动）" >&2
    [[ "$crlf" -eq 1 ]] && rm -f "$src"
    return 1
  fi
  out="$(mktemp "${TMPDIR:-/tmp}/rtunrmout.XXXXXX")"
  # awk 变量名避开内建函数 close（BSD awk 同 upsert 教训）；缓冲整文件以回删块前空行
  if ! awk -v omark="$open" -v cmark="$close" '
    $0 == omark { skip = 1; if (n > 0 && buf[n-1] == "") n--; next }
    $0 == cmark { skip = 0; next }
    !skip { buf[n++] = $0 }
    END { for (i = 0; i < n; i++) print buf[i] }
  ' "$src" > "$out"; then
    echo "  ✗ 标记区块移除失败（awk 错误），中止（未改动 ${dest}）" >&2
    rm -f "$out"
    [[ "$crlf" -eq 1 ]] && rm -f "$src"
    return 1
  fi
  [[ "$crlf" -eq 1 ]] && rm -f "$src"
  if [[ "$crlf" -eq 1 ]]; then
    local crlfout
    crlfout="$(mktemp "${TMPDIR:-/tmp}/rtunrmcrlf.XXXXXX")"
    awk '{ printf "%s\r\n", $0 }' "$out" > "$crlfout"
    rm -f "$out"
    out="$crlfout"
  fi
  mv "$out" "$dest"
  echo "  ✓ 已移除 ${tool} 标记块: ${dest}"
  return 0
}

# ---- JSON hooks 配置幂等合并（R103：cursor/gemini/devin 三家 hooks 文件可能已有用户配置，禁覆盖）----
# $1=dest JSON $2=wrap（hooks=事件挂 .hooks 下 / bare=事件挂顶层，devin 的 hooks 对象即整文件）
# $3=事件名 $4=条目 JSON 文件 $5=本技能判别键（调用方传绝对路径，如 <skill>/scripts/spec-first-bridge.sh）
# $6=可选 schema 默认键 JSON（如 cursor 的 '{"version": 1}'；只补缺失键，保留用户已有值）
# 语义：结构键缺则建、事件数组缺则建；按“本技能判别键”合并条目（同键旧条目原位更新，
# 不因别的技能已写入而跳过）；其他事件/条目/未知键原样保留；原子写。
# R118 ⑥⑨：用户 JSON 解析失败或结构异常时 fail-closed——打印原因并跳过，绝不写回（旧实现
# 解析失败会把 d 置空后覆盖，用户 hooks 被静默清空）。判别键由“任一 spec-first-bridge 命中即
# 跳过”改为“按技能绝对路径合并”，同项目多技能共享 hooks 文件时各自都能生效且幂等。
ta_merge_json_hook() {
  local dest="$1" wrap="$2" event="$3" ef="$4" id="$5" defaults="${6:-}"
  if ! command -v python3 >/dev/null 2>&1; then
    echo "  ⚠ 缺 python3，${dest} hooks 合并跳过（手工接入：把 bridge 命令加入该文件 ${event} 数组）"
    return 0
  fi
  if ! python3 - "$dest" "$wrap" "$event" "$ef" "$id" "$defaults" <<'PYEOF'
import json, os, sys
dest, wrap, event, ef, idsub = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5]
defaults = json.loads(sys.argv[6]) if sys.argv[6].strip() else {}
def fail(msg):
    sys.stderr.write('  ✗ %s: %s——已跳过，未写回\n' % (dest, msg))
    sys.exit(3)

try:
    entry = json.load(open(ef, encoding='utf-8'))
except Exception as e:
    fail('待写入条目 JSON 解析失败（%s）' % e)

d = {}
if os.path.exists(dest):
    try:
        with open(dest, encoding='utf-8') as f:
            raw = f.read()
        d = json.loads(raw) if raw.strip() else {}
    except Exception as e:
        fail('用户 hooks JSON 解析失败（%s）' % e)
if not isinstance(d, dict):
    fail('用户 hooks JSON 顶层不是对象')

schema_changed = False
for k, v in defaults.items():
    if k not in d:
        d[k] = v
        schema_changed = True

if wrap == 'hooks':
    if 'hooks' not in d:
        d['hooks'] = {}
        schema_changed = True
    root = d['hooks']
else:
    root = d
if not isinstance(root, dict):
    fail('hooks 字段不是对象（用户配置结构异常）')
arr = root.get(event, [])
if not isinstance(arr, list):
    fail('%s 事件不是数组（用户配置结构异常）' % event)

def dump(x):
    return json.dumps(x, ensure_ascii=False, sort_keys=True)

matches = [i for i, x in enumerate(arr) if idsub in dump(x)]
if matches:
    # 按技能合并：同键条目只保留一条，且更新为本次渲染的最新内容（旧版命令/超时字段可升级）
    if len(matches) == 1 and dump(arr[matches[0]]) == dump(entry) and not schema_changed:
        print('  · %s: hooks %s 已含本技能条目（幂等，未改动）' % (dest, event))
        sys.exit(0)
    first = matches[0]
    drop = set(matches)
    arr = [x for i, x in enumerate(arr) if i not in drop]
    arr.insert(first, entry)
else:
    arr.append(entry)
root[event] = arr

tmp = dest + '.swarm-tmp'
os.makedirs(os.path.dirname(dest) or '.', exist_ok=True)
with open(tmp, 'w', encoding='utf-8') as f:
    json.dump(d, f, ensure_ascii=False, indent=2)
    f.write('\n')
os.replace(tmp, dest)
print('  ✓ %s: hooks %s 条目已写入' % (dest, event))
PYEOF
  then
    echo "  ✗ ${dest} hooks 合并失败（fail-closed，未写回）" >&2
    return 1
  fi
  return 0
}

# ---- JSON hooks 条目移除（R128，与 ta_merge_json_hook 对偶，--uninstall 通道用）----
# 按判别键（技能绝对路径）删本技能条目；其他条目/事件/未知键原样保留；事件数组删空则
# 移除该事件键，wrap 层（hooks）删空则移除 hooks 键（其余顶层键如 cursor 的 version 保留）。
# 文件不存在/无本技能条目=幂等 no-op；JSON 解析失败或结构异常 fail-closed 不写回；
# 无 python3 披露手工步骤（rc 0 降级，与 merge 缺 python3 同姿态）。
ta_remove_json_hook() {  # <dest> <wrap> <event> <id>
  local dest="$1" wrap="$2" event="$3" id="$4"
  if [[ ! -f "$dest" ]]; then
    echo "  · ${dest} 不存在——hooks 条目已不在（幂等）"
    return 0
  fi
  if ! command -v python3 >/dev/null 2>&1; then
    echo "  ⚠ 缺 python3，${dest} hooks 条目未移除（手工：从该文件 ${event} 数组删除含 ${id} 的条目）"
    return 0
  fi
  if ! python3 - "$dest" "$wrap" "$event" "$id" <<'PYEOF'
import json, os, sys
dest, wrap, event, idsub = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
def fail(msg):
    sys.stderr.write('  ✗ %s: %s——已跳过，未写回\n' % (dest, msg))
    sys.exit(3)
try:
    with open(dest, encoding='utf-8') as f:
        raw = f.read()
    d = json.loads(raw) if raw.strip() else {}
except Exception as e:
    fail('用户 hooks JSON 解析失败（%s）' % e)
if not isinstance(d, dict):
    fail('用户 hooks JSON 顶层不是对象')

def dump(x):
    return json.dumps(x, ensure_ascii=False, sort_keys=True)

root = d
if wrap == 'hooks':
    root = d.get('hooks')
    if root is None:
        print('  · %s: 无 hooks 段（幂等，未改动）' % dest)
        sys.exit(0)
    if not isinstance(root, dict):
        fail('hooks 字段不是对象（用户配置结构异常）')
if root is None or event not in root:
    print('  · %s: 无 %s 事件（幂等，未改动）' % (dest, event))
    sys.exit(0)
arr = root[event]
if not isinstance(arr, list):
    fail('%s 事件不是数组（用户配置结构异常）' % event)
kept = [x for x in arr if not (idsub in dump(x))]
if len(kept) == len(arr):
    print('  · %s: %s 无本技能条目（幂等，未改动）' % (dest, event))
    sys.exit(0)
if kept:
    root[event] = kept
else:
    del root[event]
    if wrap == 'hooks' and not d.get('hooks'):
        del d['hooks']
tmp = dest + '.swarm-tmp'
with open(tmp, 'w', encoding='utf-8') as f:
    json.dump(d, f, ensure_ascii=False, indent=2)
    f.write('\n')
os.replace(tmp, dest)
print('  ✓ %s: hooks %s 本技能条目已移除' % (dest, event))
PYEOF
  then
    echo "  ✗ ${dest} hooks 条目移除失败（fail-closed，未写回）" >&2
    return 1
  fi
  return 0
}

# ---- 规则正文（各工具共享骨架 + 按宿主写时拦截能力差异化的诚实降级线；不含时间戳）----
ta_build_body() {  # $1=skill_dir（绝对路径）$2=tool（可空=不加能力行，向后兼容）→ stdout 规则正文
  local _spf_line=""
  local _spf_disp=""
  if [[ -n "${2:-}" ]]; then
    case "$2" in
      claude) _spf_disp="Claude Code" ;; codex) _spf_disp="Codex" ;; zcode) _spf_disp="ZCode" ;;
      cursor) _spf_disp="Cursor" ;; windsurf) _spf_disp="Windsurf" ;;
      opencode) _spf_disp="OpenCode" ;; gemini) _spf_disp="Gemini" ;; kimi) _spf_disp="Kimi" ;;
      *) _spf_disp="$2" ;;
    esac
    _spf_state="$(ta_write_enforce_of "$2")"
    case "$_spf_state" in
      hook)
        _spf_line="- 写时拦截：${_spf_disp} 已接 spec-first deny（宿主 hooks，L1，活体实证）；git pre-commit（L2）与门禁 spec-first（L3）纵深兜底" ;;
      rendered)
        _spf_line="- 写时拦截：${_spf_disp} 已渲染写时拦截配置（L1，官方 schema 文档锚、未活体实证）——强制面以 git pre-commit（L2，core.hooksPath）+ 门禁 spec-first（L3）+ 状态机 build 准入（L4）为准：改源码前先写含「## 决策记录」的 spec"
        [[ "$2" == "windsurf" ]] && _spf_line="${_spf_line}；配置为 Devin CLI 面（.devin/hooks.v1.json），Windsurf 桌面端 Cascade 仅 advisory" ;;
      *)
        _spf_line="- 写时拦截：${_spf_disp} 本生成链未整合写时拦截（advisory, not blocked）——spec-first 由 git pre-commit（L2，core.hooksPath）+ 门禁 spec-first（L3）+ 状态机 build 准入（L4）强制：改源码前先写含「## 决策记录」的 spec" ;;
    esac
  fi
  # R120：入口路径按实际布局探测——目标技能物化于 scripts/，生成器自身位于 assets/
  # （SKILL.md「路径约定」）；双缺失时如实披露，不渲染指向不存在文件的命令。
  local _pc_dir=""
  if [[ -f "$1/scripts/precheck.sh" ]]; then
    _pc_dir="scripts"
  elif [[ -f "$1/assets/precheck.sh" ]]; then
    _pc_dir="assets"
  fi
  local _gate_line=""
  if [[ -n "$_pc_dir" ]]; then
    _gate_line="- 质量门禁：bash \"$1/${_pc_dir}/precheck.sh\" --all"
    [[ -f "$1/${_pc_dir}/precheck.conf" ]] && _gate_line="${_gate_line}（门禁配置：$1/${_pc_dir}/precheck.conf）"
  else
    _gate_line="- 质量门禁：未找到 precheck.sh（scripts/ 与 assets/ 均无）——门禁入口缺失，如实披露"
  fi
  local _sm_line=""
  if [[ -f "$1/scripts/state-machine.sh" ]]; then
    _sm_line="- 流程状态机：bash \"$1/scripts/state-machine.sh\" status"
  elif [[ -f "$1/assets/state-machine.sh" ]]; then
    _sm_line="- 流程状态机：bash \"$1/assets/state-machine.sh\" status"
  else
    _sm_line="- 流程状态机：未找到 state-machine.sh（scripts/ 与 assets/ 均无）——状态机入口缺失，如实披露"
  fi
  cat <<EOF
## ${TA_SKILL_NAME}（swarm-yuan 生成技能）

- 用途：${TA_SKILL_DESC}
- 技能本体：$1/SKILL.md（九节点工作流 + references/ 项目知识库）
${_gate_line}
- 激活框架门禁：${TA_FRAMEWORKS:-未配置}
${_sm_line}
${_spf_line:+$_spf_line}

> 本规则由 swarm-yuan generate-skill.sh --render-tools 从 SKILL.md + precheck.conf 派生；改动请重跑渲染，勿手改。
EOF
}

# ---- 调度器：渲染全部（或指定）工具的原生规则文件 ----
ta_render_tools() {  # <skill_dir> [project_root] [tool]
  local skill_dir="$1" proj_arg="${2:-}" filter="${3:-}"
  [[ -d "${TA_DIR:-}" ]] || { echo "✗ TA_DIR 未设置或目录不存在: ${TA_DIR:-<空>}" >&2; return 1; }
  [[ -d "$skill_dir" ]] || { echo "✗ skill 目录不存在: $skill_dir" >&2; return 1; }
  [[ -f "$skill_dir/SKILL.md" ]] || { echo "✗ 未找到 SKILL.md: $skill_dir/SKILL.md" >&2; return 1; }
  # 绝对化 skill_dir（规则正文写绝对路径，保证稳定可点）
  local base; base="$(basename "$skill_dir")"
  skill_dir="$(cd "$(dirname "$skill_dir")" && pwd)/$base"
  # 推导目标根与级别：显式 project_root 优先；否则按 7 个已知工具 home 判 user/project
  local tool_home; tool_home="$(dirname "$(dirname "$skill_dir")")"
  local level proj
  if [[ -n "$proj_arg" ]]; then
    level="project"; proj="$proj_arg"
  elif ta_is_user_level "$tool_home"; then
    level="user"; proj="$HOME"
  else
    level="project"; proj="$(dirname "$tool_home")"
  fi
  TA_SKILL_NAME="$(ta_parse_skill_field "$skill_dir" name)"
  [[ -z "$TA_SKILL_NAME" ]] && TA_SKILL_NAME="$base"
  TA_SKILL_DESC="$(ta_parse_skill_field "$skill_dir" description)"
  [[ -z "$TA_SKILL_DESC" ]] && TA_SKILL_DESC="swarm-yuan 生成技能 ${TA_SKILL_NAME}（特征卡 + 门禁 + 状态机的项目研发范式）"
  TA_FRAMEWORKS="$(ta_active_frameworks "$skill_dir" | sed -e 's/ $//' -e 's/ /, /g')"
  TA_BODY="$(mktemp "${TMPDIR:-/tmp}/rtbody.XXXXXX")"
  echo "=== 渲染多平台原生规则: ${TA_SKILL_NAME}（${level} 级，目标根 ${proj}）==="
  local tools="cursor windsurf gemini codex opencode kimi zcode claude"
  [[ -n "$filter" ]] && tools="$filter"
  local t rc=0
  for t in $tools; do
    if [[ ! -f "$TA_DIR/$t.sh" ]]; then
      echo "  ⚠ 适配器缺失: $TA_DIR/$t.sh（跳过 ${t}）"
      continue
    fi
    # R126：user 级渲染只写宿主已安装的配置——宿主 home 目录不存在=未安装，
    # 跳过并披露（旧版 8 家全写，污染未装宿主的 HOME）。project 级不拦
    #（项目目录内写配置不产生跨项目污染）。
    if [[ "$level" == "user" ]]; then
      local _th; _th="$(ta_tool_home "$t")"
      if [[ -n "$_th" && ! -e "$_th" ]]; then
        echo "  · $t: 宿主未安装（$_th 不存在）——user 级渲染跳过"
        continue
      fi
    fi
    # shellcheck disable=SC1090
    . "$TA_DIR/$t.sh"
    # R101：正文按宿主生成（写时拦截能力差异化诚实降级线；无差异的骨架部分逐字节一致）
    ta_build_body "$skill_dir" "$t" > "$TA_BODY"
    if command -v "render_tool_$t" >/dev/null 2>&1; then
      if ! "render_tool_$t" "$skill_dir" "$proj" "$level"; then
        echo "  ⚠ $t 渲染失败（继续其余工具）"
        rc=1
      fi
    else
      echo "  ⚠ 适配器 $t 未定义 render_tool_${t}（跳过）"
    fi
  done
  rm -f "$TA_BODY"
  echo "=== 渲染完成 ==="
  return $rc
}

# ---- 调度器：注销全部（或指定）工具的原生规则（R128，镜像 ta_render_tools）----
# 与渲染对偶的第四态（检测—渲染—注册—注销闭环的最后一态）：删标记区块、剔 hooks 条目、
# 移插件文件与注册。幂等（已不存在=no-op 披露）。须先于技能目录存档调用（需读
# <skill_dir>/SKILL.md 解析技能名；目录已消失时技能名回退目录名、判别键回退目录前缀）。
ta_unrender_tools() {  # <skill_dir> [project_root] [tool]
  local skill_dir="$1" proj_arg="${2:-}" filter="${3:-}"
  [[ -d "${TA_DIR:-}" ]] || { echo "✗ TA_DIR 未设置或目录不存在: ${TA_DIR:-<空>}" >&2; return 1; }
  # 绝对化（与渲染同规则；目录可能已不存在——二次卸载/手工删除，dirname/basename 纯字符串操作仍成立）
  local base; base="$(basename "$skill_dir")"
  if [[ -d "$skill_dir" ]]; then
    skill_dir="$(cd "$(dirname "$skill_dir")" && pwd)/$base"
  else
    case "$skill_dir" in
      /*) ;;
      *)  skill_dir="$(pwd)/$skill_dir" ;;
    esac
  fi
  # 推导目标根与级别（与 ta_render_tools 完全同款，保证注销面与渲染面一一对应）
  local tool_home; tool_home="$(dirname "$(dirname "$skill_dir")")"
  local level proj
  if [[ -n "$proj_arg" ]]; then
    level="project"; proj="$proj_arg"
  elif ta_is_user_level "$tool_home"; then
    level="user"; proj="$HOME"
  else
    level="project"; proj="$(dirname "$tool_home")"
  fi
  TA_SKILL_NAME="$(ta_parse_skill_field "$skill_dir" name)"
  [[ -z "$TA_SKILL_NAME" ]] && TA_SKILL_NAME="$base"
  echo "=== 注销多平台原生规则: ${TA_SKILL_NAME}（${level} 级，目标根 ${proj}）==="
  local tools="cursor windsurf gemini codex opencode kimi zcode claude"
  [[ -n "$filter" ]] && tools="$filter"
  local t rc=0
  for t in $tools; do
    if [[ ! -f "$TA_DIR/$t.sh" ]]; then
      echo "  ⚠ 适配器缺失: $TA_DIR/$t.sh（跳过 ${t}）"
      continue
    fi
    # 与渲染同款宿主存在性守卫（R126）：未安装宿主从未写入配置——跳过并披露，
    # 不去碰不存在的路径
    if [[ "$level" == "user" ]]; then
      local _th; _th="$(ta_tool_home "$t")"
      if [[ -n "$_th" && ! -e "$_th" ]]; then
        echo "  · $t: 宿主未安装（${_th} 不存在）——注销跳过"
        continue
      fi
    fi
    # shellcheck disable=SC1090
    . "$TA_DIR/$t.sh"
    if command -v "unrender_tool_$t" >/dev/null 2>&1; then
      if ! "unrender_tool_$t" "$skill_dir" "$proj" "$level"; then
        echo "  ⚠ $t 注销失败（继续其余工具）"
        rc=1
      fi
    else
      echo "  ⚠ 适配器 $t 未定义 unrender_tool_${t}（跳过）"
    fi
  done
  echo "=== 注销完成 ==="
  return $rc
}
