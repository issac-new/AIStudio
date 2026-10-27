#!/usr/bin/env bash
# install.sh — swarm-yuan 安装脚本（自动检测运行环境，安装到对应 skill 默认目录）
# 用法:
#   bash install.sh                    # 自动检测环境 + 安装
#   bash install.sh --claude           # 强制安装到 ~/.claude/skills/
#   bash install.sh --cursor           # 强制安装到 ~/.cursor/skills/
#   bash install.sh --codex            # 强制安装到 ~/.codex/skills/
#   bash install.sh --opencode         # 强制安装到 ~/.config/opencode/skills/
#   bash install.sh --windsurf         # 强制安装到 ~/.codeium/windsurf/skills/
#   bash install.sh --gemini           # 强制安装到 ~/.gemini/skills/
#   bash install.sh --kimi             # 强制安装到 ~/.kimi-code/skills/（kimi-code；旧 kimi-cli 回退 ~/.kimi/skills/）
#   bash install.sh --zcode            # 强制安装到 ~/.zcode/skills/
#   bash install.sh --all              # 安装到所有已检测到的环境
#   bash install.sh --uninstall --claude  # 从 ~/.claude/skills/ 卸载（其余目标同理）
#   bash install.sh --uninstall --all     # 从所有已检测到的环境卸载
#   bash install.sh --list               # 仅列出检测到的环境，不安装
#   bash install.sh --version            # 显示版本号 + bash 版本
# --uninstall 语义（R128，检测—渲染—注册—注销四态闭环的最后一态）：
#   ① 适配器注销渲染期写入的宿主配置（hooks 条目/标记块/插件注册，用户自有配置保留）；
#   ② 技能目录 mv 存档为 <dest>.uninstalled.<UTC时间戳>（删除类先存档，不直接 rm -rf）；
#   ③ 移除 slash command 注册文件。幂等：重复卸载不报错，已不存在项打印「已不存在」。
# 安装后动作：对每个安装目标自动调用 scripts/generate-skill.sh --render-tools 补生成
#   该工具原生规则文件（.cursor/rules/*.mdc、AGENTS.md/GEMINI.md 段等；失败仅警告，不影响安装）

set -euo pipefail

# R118 ①：Windows core.autocrlf=true 克隆会把 *.sh 转成 CRLF，bash 解析 `do\r`/`then\r`
# 会报难以定位的语法错误。仓库 .gitattributes 已强制 *.sh eol=lf；此处兜底对自身做显式检测。
# 注意：整文件 CRLF 时 bash 在解析阶段就会失败，本检查只能覆盖“可解析但含 \r”的混合形态，
# 根治手段仍是 .gitattributes + 重新克隆（未加 --uninstall 类清理，见报告）。
if grep -q "$(printf '\r')" "$0" 2>/dev/null; then
  echo "ERROR: install.sh 自身含 CRLF 换行（Windows Git 常见 core.autocrlf=true），bash 无法可靠解析。" >&2
  printf '%s\n' "  修复：重新克隆仓库（.gitattributes 已声明 *.sh eol=lf），或执行：sed -i.bak 's/\\r\$//' install.sh && rm -f install.sh.bak" >&2
  exit 1
fi

# R118 ③：解析脚本真实路径（可移植 realpath：macOS bash 3.2 的 realpath 无 -f，
# 逐级解符号链接；通过符号链接调用时也能定位同目录的 SKILL.md）。
_self="${BASH_SOURCE[0]:-$0}"
while [[ -L "$_self" ]]; do
  _self_dir="$(cd -P "$(dirname "$_self")" && pwd)"
  _link="$(readlink "$_self")" || break
  case "$_link" in
    /*) _self="$_link" ;;
    *)  _self="$_self_dir/$_link" ;;
  esac
done
SCRIPT_PATH="$(cd -P "$(dirname "$_self")" && pwd)"
# 查找 SKILL.md 所在目录作为源目录
SRC_DIR=""
for cand in "$SCRIPT_PATH" "$SCRIPT_PATH/swarm-yuan" "$SCRIPT_PATH/.." "$SCRIPT_PATH/../.."; do
  if [[ -f "$cand/SKILL.md" ]]; then SRC_DIR="$(cd "$cand" && pwd)"; break; fi
done
if [[ -z "$SRC_DIR" ]]; then
  echo "ERROR: 未找到 SKILL.md，请确保在 swarm-yuan 目录下或经其 install.sh 运行此脚本"
  exit 1
fi
SRC_REAL="$(cd -P "$SRC_DIR" && pwd -P)"

# R128：宿主检测/注销与适配器公共库同源（ta_host_installed 判据因果化、ta_unrender_tools
# 注销调度）——install.sh 与 generate-skill.sh --render-tools 消费同一份宿主家目录表
# （common.sh ta_tool_home），不再各抄一份。源树不完整（裁剪分发/测试夹具）时降级：
# 家目录单判据（无 CLI 探测面）+ 注销调度披露不可用（fail-closed 不静默）。
TA_DIR="$SRC_DIR/assets/tool-adapters"
if [[ -f "$TA_DIR/common.sh" ]]; then
  # shellcheck disable=SC1090
  . "$TA_DIR/common.sh"
else
  ta_host_installed() {  # 降级版：仅家目录存在判据
    case "$1" in
      claude)   [[ -d "$HOME/.claude" ]] ;;
      cursor)   [[ -d "$HOME/.cursor" ]] ;;
      codex)    [[ -d "$HOME/.codex" ]] ;;
      windsurf) [[ -d "$HOME/.codeium/windsurf" ]] ;;
      opencode) [[ -d "$HOME/.config/opencode" ]] ;;
      gemini)   [[ -d "$HOME/.gemini" ]] ;;
      kimi)     [[ -d "$HOME/.kimi-code" ]] ;;
      zcode)    [[ -d "$HOME/.zcode" ]] ;;
      hermes)   [[ -d "$HOME/.hermes" ]] ;;
      dsh)      [[ -d "$HOME/.dsh" ]] ;;
      ccswitch) [[ -d "$HOME/.cc-switch" ]] ;;
      *) return 1 ;;
    esac
  }
  ta_unrender_tools() {
    echo "  ⚠ 缺 ${TA_DIR}/common.sh，原生规则注销不可用（如实披露，跳过）" >&2
    return 0
  }
fi

# ===== 辅助函数 =====

# R118 ⑤：源树外指符号链接扫描。cp -R 会把符号链接“原样”复制进安装产物，
# 随后的 chmod（跟随链接）会改到源树外的真实文件。安装前拒绝外指链接（fail-closed）。
# 只扫描实际会被复制到产物的顶层项（与 install_to 的排除清单一致）。
find_external_symlinks() {
  local bad="" item base p tgt tdir
  for item in "$SRC_DIR"/* "$SRC_DIR"/.[!.]* "$SRC_DIR"/..?*; do
    [[ -e "$item" || -L "$item" ]] || continue
    base="$(basename "$item")"
    case "$base" in
      research|.swarm-yuan|offline-cache|ci|vendor-knowledge|dist) continue ;;
    esac
    while IFS= read -r p; do
      [[ -n "$p" ]] || continue
      tgt="$(readlink "$p" 2>/dev/null)" || tgt=""
      if [[ -z "$tgt" ]]; then
        bad="${bad}${bad:+
}  $p -> （链接目标不可读取）"
        continue
      fi
      case "$tgt" in
        /*) ;;
        *)  tgt="$(dirname "$p")/$tgt" ;;
      esac
      # 解析目标的真实位置（目标可能是目录或文件；断链则视为不可信）
      if [[ -d "$tgt" ]]; then
        tgt="$(cd -P "$tgt" 2>/dev/null && pwd -P)" || tgt=""
      else
        tdir="$(cd -P "$(dirname "$tgt")" 2>/dev/null && pwd -P)" || tdir=""
        if [[ -n "$tdir" ]]; then tgt="$tdir/$(basename "$tgt")"; else tgt=""; fi
      fi
      if [[ -z "$tgt" ]]; then
        bad="${bad}${bad:+
}  $p -> （断链/无法解析）"
        continue
      fi
      case "$tgt" in
        "$SRC_REAL"|"$SRC_REAL"/*) ;;
        *) bad="${bad}${bad:+
}  $p -> ${tgt}（源树外）" ;;
      esac
    done < <(find "$item" -type l -print 2>/dev/null)
  done
  printf '%s' "$bad"
}

# R118 ⑤：原子安装单个文件（先临时文件再 mv）。目标为符号链接时 mv 替换链接本身，
# 不会顺着链接写穿到链接目标（cp 直接写入会穿透）。
install_file_atomic() {  # <src> <dest> <label>
  local src="$1" dst="$2" label="$3" tmp
  if [[ -d "$dst" && ! -L "$dst" ]]; then
    echo "  ✗ ${label} 目标路径是目录，拒绝写入: ${dst}" >&2
    return 1
  fi
  mkdir -p "$(dirname "$dst")"
  tmp="$(mktemp "$(dirname "$dst")/.swarm-yuan-cmd.XXXXXX")" || return 1
  if cp "$src" "$tmp" 2>/dev/null; then
    mv -f "$tmp" "$dst"
  else
    rm -f "$tmp"
    echo "  ✗ ${label} 写入失败: ${dst}" >&2
    return 1
  fi
  echo "  ✓ ${label}: ${dst}"
}

# R118 ⑪：安装备份只保留最近 N 份（默认 3），避免连续安装无限堆积。
# 命名形如 <dest>.bak.<epoch>（同秒冲突时追加 .N），按 mtime 取最新 N 份。
prune_old_backups() {  # <dest>
  local dest="$1" keep="${SWARM_YUAN_KEEP_BACKUPS:-3}" old
  [[ "$keep" =~ ^[0-9]+$ ]] || keep=3
  [[ "$keep" -ge 1 ]] || keep=3
  # shellcheck disable=SC2012  # 按 mtime 排序备份目录；路径由本脚本生成，不含换行
  old="$(ls -1dt "$dest".bak.[0-9]* 2>/dev/null | tail -n "+$((keep+1))" || true)"
  [[ -n "$old" ]] || return 0
  printf '%s\n' "$old" | while IFS= read -r old; do
    [[ -n "$old" ]] || continue
    rm -rf "$old"
    echo "  · 清理旧备份（保留最近 ${keep} 份）: $(basename "$old")"
  done
}

# ===== 运行时检测 =====
# 返回: 名称<TAB>skill目录<TAB>slash命令目录（每行一个）
# R128 判据因果化：旧判据「~/.<tool>/skills 子目录存在」因果倒置——Cursor/Gemini/OpenCode/
# ZCode/Codex/Windsurf 默认安装从不创建该目录（只有装过技能才有），新装宿主大面积漏检；
# Kimi 一家查父目录 ~/.kimi-code，口径不一。现统一为「宿主家目录存在 OR 宿主 CLI 在
# PATH」（ta_host_installed，与 common.sh ta_tool_home 家目录表同源）：如 ~/.cursor 或
# command -v cursor、~/.codex 或 codex、~/.config/opencode 或 opencode、~/.gemini 或
# gemini、~/.codeium/windsurf 或 windsurf、~/.kimi-code 或 kimi、~/.zcode 或 zcode、
# ~/.claude 或 claude。安装目标仍是各自 skills 子目录（install_to 内 mkdir -p 兜底创建）。
# --list 输出格式不变（名称<TAB>目录）。
detect_runtimes() {
  # Claude Code
  if ta_host_installed claude; then printf 'Claude Code\t%s\t%s\n' "$HOME/.claude/skills" "$HOME/.claude/commands"; fi
  # Codex
  if ta_host_installed codex; then printf 'Codex\t%s\t\n' "$HOME/.codex/skills"; fi
  # Cursor
  if ta_host_installed cursor; then printf 'Cursor\t%s\t\n' "$HOME/.cursor/skills"; fi
  # Windsurf（注：Windsurf 官方原生规则机制为 Memories/Rules/Workflows/MCP，
  #   未官方支持 SKILL.md 开放标准——本目录复制走"runnable 兼容"姿态：bash 脚本可被
  #   AI 调用，markdown 供 AI 读取。深度规则派生建议走 generate-skill.sh --render-tools）
  if ta_host_installed windsurf; then printf 'Windsurf\t%s\t\n' "$HOME/.codeium/windsurf/skills"; fi
  # OpenCode
  if ta_host_installed opencode; then printf 'OpenCode\t%s\t\n' "$HOME/.config/opencode/skills"; fi
  # Gemini CLI
  if ta_host_installed gemini; then printf 'Gemini CLI\t%s\t\n' "$HOME/.gemini/skills"; fi
  # Kimi（R103 产品更替：kimi-cli 已归档（2026-09-23），接任 kimi-code 优先；旧路径 legacy 回退）
  if ta_host_installed kimi; then
    printf 'Kimi\t%s\t\n' "$HOME/.kimi-code/skills"
  elif [[ -d "$HOME/.kimi/skills" ]]; then
    printf 'Kimi\t%s\t\n' "$HOME/.kimi/skills"
  fi
  # ZCode（AGENTS.md 指令载体；skills 目录为技能装载位）
  if ta_host_installed zcode; then printf 'ZCode\t%s\t\n' "$HOME/.zcode/skills"; fi
  if ta_host_installed hermes; then printf 'Hermes\t%s\t\n' "$HOME/.hermes/skills"; fi
  if ta_host_installed dsh; then printf 'DSH\t%s\t\n' "$HOME/.dsh/skills"; fi
  if ta_host_installed ccswitch; then printf 'CC-Switch\t%s\t\n' "$HOME/.cc-switch/skills"; fi
}

# ===== 多平台规则渲染（P3）：安装后补生成该工具原生规则文件 =====
# 失败仅 warn 不 fail——不破坏现有目录复制主流程。Claude Code 已深度集成，适配器内 no-op。
tool_key_of() {  # $1=显示名 → stdout 适配器 key（空=未知）
  # R139：补 Hermes/DSH/CC-Switch——uninstall_all_found 以非空 key 为「已知宿主」，
  # 缺映射时 --uninstall --all 对这三家打印「未知宿主」跳过卸载且整体 rc=1。
  case "$1" in
    "Claude Code"|"通用") printf 'claude' ;;
    "Cursor")      printf 'cursor' ;;
    "Codex")       printf 'codex' ;;
    "OpenCode")    printf 'opencode' ;;
    "Windsurf")    printf 'windsurf' ;;
    "Gemini CLI")  printf 'gemini' ;;
    "Kimi")        printf 'kimi' ;;
    "ZCode")       printf 'zcode' ;;
    "Hermes")      printf 'hermes' ;;
    "DSH")         printf 'dsh' ;;
    "CC-Switch")   printf 'ccswitch' ;;
    *)             printf '' ;;
  esac
}

# skills-dir 型宿主（hermes/dsh/ccswitch）只装技能目录、无原生规则面
# （assets/tool-adapters/skills-dir.sh 的设计选择）——渲染/注销双通道跳过，
# 不触「适配器缺失」告警。
_skills_dir_key() {  # $1=key → rc 0=skills-dir 型（跳过原生规则） 1=须渲染
  case "$1" in hermes|dsh|ccswitch) return 0 ;; esac
  return 1
}

render_native_rules() {
  local name="$1" dest="$2" key
  key="$(tool_key_of "$name")"
  [[ -n "$key" ]] || return 0
  _skills_dir_key "$key" && return 0
  local gen="$SRC_DIR/scripts/generate-skill.sh"
  [[ -f "$gen" ]] || { echo "  ⚠ 未找到 ${gen}，跳过原生规则渲染"; return 0; }
  if ! bash "$gen" --render-tools "$dest" "" "$key" </dev/null; then
    echo "  ⚠ ${name} 原生规则渲染返回非 0（仅警告，不影响安装主流程）"
  fi
  return 0
}

# R128：适配器注销（渲染的逆操作）——移除渲染期写入宿主的原生规则/hooks/插件注册。
# 与 render_native_rules 对偶：走 common.sh ta_unrender_tools（源树内直调，不经
# generate-skill.sh 子进程）；注销失败仅 warn 不阻断技能目录存档（删目录与清注册
# 解耦，单项失败不放大），但 rc 上抛由调用方计入汇总。
unrender_native_rules() {  # <name> <dest> → rc 0=干净 1=有注销失败
  local name="$1" dest="$2" key
  key="$(tool_key_of "$name")"
  [[ -n "$key" ]] || return 0
  _skills_dir_key "$key" && return 0
  if ! ta_unrender_tools "$dest" "" "$key"; then
    echo "  ⚠ ${name} 原生规则注销返回非 0（技能目录仍按流程存档）"
    return 1
  fi
  return 0
}

# 源目录与目标相同（已安装在此）时：跳过复制，仅确保 slash command 已注册
skip_self_install() {
  local name="$1" cmd_dir="$2"
  echo "  ⚠ 源目录与目标目录相同，跳过复制（已安装在此位置）"
  if [[ -n "$cmd_dir" && -f "$SRC_DIR/.claude/commands/swarm-yuan.md" ]]; then
    install_file_atomic "$SRC_DIR/.claude/commands/swarm-yuan.md" "$cmd_dir/swarm-yuan.md" "slash command 已注册" || return 1
  fi
  render_native_rules "$name" "$SRC_DIR"
}

# ===== 安装到指定目录 =====
# R126：批量安装故障隔离——旧版 `echo "$found" | while ... install_to ...` 在 set -e
# 继承的管道子壳里，任一 install_to 返回 1 即整批中止（8 宿主场景单点故障放大），
# 且无「哪些已装/哪些未装」汇总。改为逐家捕获 rc 落盘计数、循环后汇总，
# 有失败整体 exit 1。
install_all_found() {  # stdin=detect_runtimes 输出（TSV）→ rc 0=全绿 1=有失败
  local _tally; _tally="$(mktemp "${TMPDIR:-/tmp}/swinst.XXXXXX")"
trap 'rm -f "${_tally:-}"' EXIT
  local name dir cmd
  while IFS=$'\t' read -r name dir cmd; do
    _rc_inst=0
    install_to "$name" "$dir" "$cmd" || _rc_inst=$?
    case "$_rc_inst" in
      0) printf 'ok\t%s\n' "$name" >> "$_tally" ;;
      3) printf 'skip\t%s\t(unchanged external link)\n' "$name" >> "$_tally" ;;
      *) printf 'bad\t%s\n' "$name" >> "$_tally"
         echo "  ✗ ${name} 安装失败——继续其余宿主（隔离不中断）" >&2 ;;
    esac
    echo ""
  done
  local _ok_n _bad_n _skip_n
  _ok_n=$(grep -c '^ok' "$_tally" 2>/dev/null || true)
  _bad_n=$(grep -c '^bad' "$_tally" 2>/dev/null || true)
  _skip_n=$(grep -c '^skip' "$_tally" 2>/dev/null || true)
  [[ "${_skip_n:-0}" -gt 0 ]] && echo "  ⊘ ${_skip_n} 个宿主目标为外部符号链接，保持未变更（不计入成功）"
  if [[ "${_bad_n:-0}" -gt 0 ]]; then
    grep '^bad' "$_tally" | cut -f2 | while IFS= read -r name; do echo "  ✗ 失败宿主: $name" >&2; done
  fi
  rm -f "$_tally"
  echo "=== 批量安装汇总：${_ok_n:-0} 成功 / ${_bad_n:-0} 失败 / 未变更外部链接 ${_skip_n:-0} ==="
  [[ "${_bad_n:-0}" -eq 0 ]]
}

# 已知暴露面（审计 R6，设计权衡保留）：TEST_CMD/BUILD_CMD/MUTATION_CMD 等命令值在门禁中
# 按原样执行（含 eval 形态）——前提是 precheck.conf 为受信本地产物；目录名注入已由
# conf-render 的 printf '%q' 封堵。命令值本身不做过滤（过滤即破坏其功能语义）。
install_to() {
  local name="$1" skill_dir="$2" cmd_dir="$3"
  local dest="$skill_dir/swarm-yuan"

  echo "=== 安装到 ${name} ==="
  echo "  目标: ${dest}"

  # R118 ⑤：先拒绝源树外指符号链接（fail-closed，零写入）
  local _ext_links
  _ext_links="$(find_external_symlinks)"
  if [[ -n "$_ext_links" ]]; then
    echo "  ✗ 源树含指向外部的符号链接，拒绝安装（防止把源树外文件带进安装产物、chmod 跟随链接改到外部文件）：" >&2
    printf '%s\n' "$_ext_links" >&2
    echo "    修复：移除该链接或改成普通文件后重试。" >&2
    return 1
  fi

  # 不能自我复制（SRC_DIR == dest 时跳过复制，只注册 slash command）
  # R135 修复（审计 R3）：物理路径参与比对——HOME 含符号链接组件时逻辑写法失配，
  # 旧逻辑会把源=目标的目录整体 mv 进备份再从空源复制（装出空技能目录）。
  local _dest_real=""
  [[ -d "$dest" ]] && _dest_real="$(cd -P "$dest" 2>/dev/null && pwd -P)"
  if [[ "$SRC_DIR" == "$dest" || ( -n "$_dest_real" && "$SRC_REAL" == "$_dest_real" ) ]]; then
    skip_self_install "$name" "$cmd_dir"
    return 0
  fi

  # 目标已是符号链接（如由技能管理器统一维护的部署）：不穿透、不破坏链接——
  # 返回独立结果码 3（未变更外部链接），绝不报告「已安装」。
  # 实体安装请先移除该链接，或由管理方在链接源头更新。
  if [[ -L "$dest" ]]; then
    echo "  ⚠ ${dest} 是符号链接（疑似由技能管理器维护）——保持未变更（rc=3）；如需实体安装请先移除该链接"
    return 3
  fi

  # 备份旧版本 + 源已演进提示（八轮复盘：安装产物版本完全断联——旧版无版本记录，
  # 用户装旧版毫无感知。此处读旧版的 .swarm-yuan-version，与源版本对比提示）
  if [[ -d "$dest" ]]; then
    local _old_ver="（无版本记录）"
    [[ -f "$dest/.swarm-yuan-version" ]] && _old_ver="$(grep -E '^source_version=' "$dest/.swarm-yuan-version" 2>/dev/null | cut -d= -f2-)"
    echo "  ⚠ 已存在，备份旧版本（${_old_ver}）..."
    # R118 ⑪：同秒内连续安装会撞名（mv 到已存在目录会变成“移入其下”）；追加序号兜底，
    # 安装后只保留最近 N 份（默认 3，SWARM_YUAN_KEEP_BACKUPS 可覆盖）。
    local _bak _bn=1
    _bak="${dest}.bak.$(date +%s)"
    while [[ -e "$_bak" ]]; do
      _bak="${dest}.bak.$(date +%s).${_bn}"
      _bn=$((_bn + 1))
    done
    mv "$dest" "$_bak"
  fi

  # staging→验证→发布：先复制到同目录暂存区，验证非空后原子发布；任一步失败恢复备份。
  # 分发边界：以下四项是仓库本地过程产物，不进入安装产物——
  #   research/（上游调研原料，未跟踪入仓）、.swarm-yuan/（生成器自身运行留痕）、
  #   offline-cache/（历史遗留缓存，未跟踪入仓，溯源已迁 release 源码包体系）、
  #   ci/（生成器仓 CI 自举配置，仅 repo 布局消费——R102 补排除：self-check G4 的
  #   「安装态无 ci/ 静默跳过」假设因未排除而失效，部署副本被 CI 三档对账误伤）
  local _stage; _stage="${dest}.staging.$$"
  rm -rf "$_stage" 2>/dev/null || true
  mkdir -p "$_stage"
  local item _item_base
  for item in "$SRC_DIR"/* "$SRC_DIR"/.[!.]* "$SRC_DIR"/..?*; do
    [[ -e "$item" ]] || continue
    _item_base="$(basename "$item")"
    case "$_item_base" in
      research|.swarm-yuan|offline-cache|ci|vendor-knowledge|dist) continue ;;
    esac
    # -P = 不解引用符号链接（GNU/BSD 均支持；外指链接已在前面拒绝）。源树内链接原样复制。
    cp -R -P "$item" "$_stage/" || { echo "  ✗ 复制到暂存区失败: $_stage" >&2; rm -rf "$_stage"; return 1; }
  done
  rm -rf "$_stage/docs" "$_stage/.upgrade-backup-"* "$_stage/.git" "$_stage/.DS_Store" 2>/dev/null || true
  find "$_stage" -name '.DS_Store' -delete 2>/dev/null || true
  # 验证：暂存区须含 SKILL.md（空/半成品在此拦截，不发布）
  if [[ ! -f "$_stage/SKILL.md" ]]; then
    echo "  ✗ 暂存区缺少 SKILL.md（源树不完整？）——放弃发布，保留既有安装" >&2
    rm -rf "$_stage"; return 1
  fi
  if ! mv "$_stage" "$dest"; then
    echo "  ✗ 发布失败（mv 暂存区 → 目标）" >&2
    rm -rf "$_stage"
    [[ -d "$_bak" ]] && mv "$_bak" "$dest" && echo "  ↩ 已恢复备份" >&2
    return 1
  fi
  # R118 ⑤：只对普通文件 chmod——`chmod +x links/*.sh` 会跟随符号链接改到链接目标（可能源树外）。
  local _chmod_dir
  for _chmod_dir in "$dest/scripts" "$dest/assets" "$dest/assets/tool-adapters"; do
    [[ -d "$_chmod_dir" ]] || continue
    find "$_chmod_dir" -maxdepth 1 -type f -name '*.sh' -exec chmod +x {} + 2>/dev/null || true
  done
  # 备份清理放在复制成功之后：复制中途失败时保留旧备份，避免“旧版已移走且无备份”。
  prune_old_backups "$dest"

  # 八轮复盘：安装产物版本溯源（原零记录——用户无法知道装的是哪版/该重装升级没有。
  # 与 generate-skill.sh 对目标技能写 .swarm-yuan-version 同哲学，补齐生成器自己的安装侧）。
  local _src_ver
  # 跨平台注意：不带 --dirty——Windows Git Bash 默认 core.autocrlf=true 会让干净 checkout
  # 也报 -dirty（LF→CRLF 转换被 git status 判为 modified），污染版本溯源字符串。
  # 版本演进比对只看 tag（vYYYY.MM.DD），不依赖 dirty 标记。
  # R133：离线包无 .git——兜底读包内 .bundle-version（构建机 git describe 落盘），不落 unknown。
  # 注意 set -e/pipefail：缺文件时 sed rc=2 会让 `||` 末命令失败而早退（R126 G5 同族），须守卫+兜底。
  _src_ver=$(git -C "$SRC_DIR" describe --tags --always 2>/dev/null || true)
  _src_ver="${_src_ver#swarm-yuan-}"
  if [[ -z "$_src_ver" && -f "$SRC_DIR/.bundle-version" ]]; then
    _src_ver=$(sed -n 's/^version=//p' "$SRC_DIR/.bundle-version" 2>/dev/null | head -1 || true)
    _src_ver="${_src_ver#swarm-yuan-}"
  fi
  [[ -n "$_src_ver" ]] || _src_ver="unknown"
  cat > "$dest/.swarm-yuan-version" <<EOF
installed_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
source_repo=$SRC_DIR
source_version=$_src_ver
mode=generator-install
EOF

  echo "  ✓ 已安装: ${dest}（${_src_ver}）"

  # 注册 slash command（原子写：目标为符号链接时替换链接，不写穿）
  if [[ -n "$cmd_dir" && -f "$dest/.claude/commands/swarm-yuan.md" ]]; then
    install_file_atomic "$dest/.claude/commands/swarm-yuan.md" "$cmd_dir/swarm-yuan.md" "slash command 已注册" || return 1
  fi

  # G7：按档位输出 + 非 Claude 死重标注（cmd_dir 空 = 非 Claude 环境 = cli 档）
  if [[ -z "$cmd_dir" ]]; then
    # G7 C 档：骨架裁剪（opt-in）——SWARM_YUAN_SLIM=1 时删除 cli 档不消费的 deep 档死重
    # （hooks/commands/.mcp.json/settings.local.json）。默认保持现状不破坏既有用户升级路径。
    if [[ "${SWARM_YUAN_SLIM:-0}" == "1" ]]; then
      rm -rf "$dest/hooks" "$dest/commands" "$dest/.claude" "$dest/.mcp.json" "$dest/settings.local.json" 2>/dev/null || true
      echo "  ✓ 骨架裁剪（SWARM_YUAN_SLIM=1）：已删除 cli 档死重（hooks/commands/.claude/.mcp.json/settings.local.json）"
      echo "  ℹ ${name} 为 cli 档（目录复制 + --render-tools 规则派生）；deep 档专属文件已裁剪"
    else
      echo "  ℹ ${name} 为 cli 档（目录复制 + --render-tools 规则派生）；骨架中 hooks/commands 目录为 deep 档（Claude Code）专属，cli 档不消费（死重，不影响功能；设 SWARM_YUAN_SLIM=1 可裁剪）"
    fi
  fi

  # 多平台规则渲染（P3）：补生成该工具原生规则文件；渲染失败仅 warn，不影响安装
  render_native_rules "$name" "$dest"
}

# ===== 卸载通道（R128）：--uninstall [--claude|--cursor|...|--all] =====
# 四态闭环最后一态：检测（detect_runtimes）→ 渲染（render_native_rules）→ 注册（install_to
# 目录复制 + slash command）→ 注销（本函数）。顺序：先适配器注销（需读 dest/SKILL.md 解析
# 技能名与 hooks 脚本路径）→ 再技能目录存档 → 再 slash command 移除。
# 删除类纪律：技能目录 mv 存档为 <dest>.uninstalled.<UTC时间戳>，不直接 rm -rf。
uninstall_to() {  # <name> <skill_dir> <cmd_dir> <tool_key> → rc 0=干净 1=有注销失败
  local name="$1" skill_dir="$2" cmd_dir="$3" key="$4"
  local dest="$skill_dir/swarm-yuan"
  local rc=0

  echo "=== 从 ${name} 卸载 ==="
  echo "  目标: ${dest}"

  # ① 适配器注销（标记块/hooks 条目/插件注册；用户自有配置保留；幂等）
  unrender_native_rules "$name" "$dest" || rc=1

  # ② 技能目录存档后移除。目标是符号链接（技能管理器维护）时不破坏链接，披露跳过
  #   （与 install_to 的符号链接姿态对偶：装不穿透、卸不砍链接）。
  if [[ -L "$dest" ]]; then
    echo "  ⚠ ${dest} 是符号链接（疑似由技能管理器维护）——跳过移除以防破坏链接；如需彻底卸载请由管理方移除"
  elif [[ -d "$dest" ]]; then
    local _ts _arc _bn=1
    _ts="$(date -u +%Y%m%dT%H%M%SZ)"
    _arc="${dest}.uninstalled.${_ts}"
    while [[ -e "$_arc" ]]; do
      _arc="${dest}.uninstalled.${_ts}.${_bn}"
      _bn=$((_bn + 1))
    done
    mv "$dest" "$_arc"
    echo "  ✓ 已移除技能目录（存档备查，确认无需回滚后可删）: ${_arc}"
  else
    echo "  · 技能目录已不存在: ${dest}（幂等）"
  fi

  # ③ slash command 注册文件（install_to 写到 <cmd_dir>/swarm-yuan.md，删哪查哪）
  if [[ -n "$cmd_dir" ]]; then
    if [[ -e "$cmd_dir/swarm-yuan.md" || -L "$cmd_dir/swarm-yuan.md" ]]; then
      rm -f "$cmd_dir/swarm-yuan.md"
      echo "  ✓ 已移除 slash command: ${cmd_dir}/swarm-yuan.md"
    else
      echo "  · slash command 已不存在: ${cmd_dir}/swarm-yuan.md（幂等）"
    fi
  fi
  return $rc
}

# 批量卸载（--uninstall --all）：与 install_all_found 同款故障隔离——逐家捕获 rc 落盘计数，
# 有失败整体 exit 1，不因单家失败中止其余宿主。
uninstall_all_found() {  # stdin=detect_runtimes 输出（TSV）→ rc 0=全绿 1=有失败
  local _tally; _tally="$(mktemp "${TMPDIR:-/tmp}/swuninst.XXXXXX")"
trap 'rm -f "${_tally:-}"' EXIT
  local name dir cmd key
  while IFS=$'\t' read -r name dir cmd; do
    key="$(tool_key_of "$name")"
    if [[ -z "$key" ]]; then
      printf 'bad\t%s\n' "$name" >> "$_tally"
      echo "  ✗ 未知宿主 ${name}（无适配器 key），跳过" >&2
    elif uninstall_to "$name" "$dir" "$cmd" "$key"; then
      printf 'ok\t%s\n' "$name" >> "$_tally"
    else
      printf 'bad\t%s\n' "$name" >> "$_tally"
      echo "  ✗ ${name} 卸载失败——继续其余宿主（隔离不中断）" >&2
    fi
    echo ""
  done
  local _ok_n _bad_n _skip_n
  _ok_n=$(grep -c '^ok' "$_tally" 2>/dev/null || true)
  _bad_n=$(grep -c '^bad' "$_tally" 2>/dev/null || true)
  _skip_n=$(grep -c '^skip' "$_tally" 2>/dev/null || true)
  [[ "${_skip_n:-0}" -gt 0 ]] && echo "  ⊘ ${_skip_n} 个宿主目标为外部符号链接，保持未变更（不计入成功）"
  if [[ "${_bad_n:-0}" -gt 0 ]]; then
    grep '^bad' "$_tally" | cut -f2 | while IFS= read -r name; do echo "  ✗ 失败宿主: $name" >&2; done
  fi
  rm -f "$_tally"
  echo "=== 批量卸载汇总：${_ok_n:-0} 成功 / ${_bad_n:-0} 失败 ==="
  [[ "${_bad_n:-0}" -eq 0 ]]
}

# ===== 主逻辑 =====
MODE="${1:-auto}"

case "$MODE" in
  --version)
    # 范式版本（与 .swarm-yuan-version 的 upgraded_at 对齐，由 git describe 自动派生）
    # 不带 --dirty（跨平台：Windows autocrlf=true 致干净 checkout 误报 dirty）
    # R118 ②：版本必须取自源树（${SRC_DIR}），不能用调用者当前目录的 git 仓库——
    # 在任意项目目录下执行 `bash <path>/install.sh --version` 时旧实现会显示无关项目的版本。
    # 与 _src_ver 同源（git -C "$SRC_DIR" describe），保证 --version 与安装记录一致。
    ver=""
    if git -C "$SRC_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
      ver=$(git -C "$SRC_DIR" describe --tags --always 2>/dev/null || true)
      ver="${ver#swarm-yuan-}"   # AIStudio tag 命名空间前缀只用于仓库标识，展示/落盘统一剥除
    fi
    # R133：离线包/已安装副本无 .git——兜底读 .bundle-version（随包与随安装复制）；缺文件守卫防 set -e 早退
    if [[ -z "$ver" && -f "$SRC_DIR/.bundle-version" ]]; then
      ver=$(sed -n 's/^version=//p' "$SRC_DIR/.bundle-version" 2>/dev/null | head -1 || true)
      ver="${ver#swarm-yuan-}"
    fi
    [[ -n "$ver" ]] || ver="unknown"
    echo "swarm-yuan installer $ver"
    echo "bash ${BASH_VERSION:-unknown}"
    # 最低 bash 版本校验（bash 3.2 即可，macOS 默认满足）
    if [[ "${BASH_VERSINFO[0]:-0}" -lt 3 ]]; then
      echo "⚠ bash 版本过低（${BASH_VERSION}），需 bash 3.2+（macOS 默认 BSD bash 3.2 兼容）"
    fi
    exit 0
    ;;
  --list)
    echo "=== 检测到的运行环境 ==="
    found="$(detect_runtimes)"
    if [[ -z "$found" ]]; then
      echo "  未检测到任何已安装的 AI 工具"
    else
      echo "$found" | while IFS=$'\t' read -r name dir _; do
        echo "  ✅ ${name} (${dir})"
      done
    fi
    # 八轮复盘：补 exit 0——原缺，case 走完后会落到脚本末尾的「=== 安装完成 ===」误导性输出，
    # 实测 --list 没真装（文件 mtime 未变）但用户会误以为发生了安装（对比 --version 分支有 exit 0）。
    exit 0
    ;;
  --claude)
    install_to "Claude Code" "$HOME/.claude/skills" "$HOME/.claude/commands"
    ;;
  --cursor)
    install_to "Cursor" "$HOME/.cursor/skills" ""
    ;;
  --codex)
    install_to "Codex" "$HOME/.codex/skills" ""
    ;;
  --opencode)
    install_to "OpenCode" "$HOME/.config/opencode/skills" ""
    ;;
  --windsurf)
    install_to "Windsurf" "$HOME/.codeium/windsurf/skills" ""
    ;;
  --gemini)
    install_to "Gemini CLI" "$HOME/.gemini/skills" ""
    ;;
  --kimi)
    if [[ -d "$HOME/.kimi-code" ]]; then
      install_to "Kimi" "$HOME/.kimi-code/skills" ""
    else
      install_to "Kimi" "$HOME/.kimi/skills" ""
    fi
    ;;
  --zcode)
    install_to "ZCode" "$HOME/.zcode/skills" ""
    ;;
  --hermes)
    install_to "Hermes" "$HOME/.hermes/skills" ""
    ;;
  --dsh)
    install_to "DSH" "$HOME/.dsh/skills" ""
    ;;
  --ccswitch)
    install_to "CC-Switch" "$HOME/.cc-switch/skills" ""
    echo "  提示：cc-switch 为统一技能库——hermes/zcode/dsh 等工具目录可用符号链接指向本目录同享一份"
    ;;
  --all)
    found="$(detect_runtimes)"
    if [[ -z "$found" ]]; then
      echo "ERROR: 未检测到任何已安装的 AI 工具"
      exit 1
    fi
    printf '%s\n' "$found" | install_all_found
    ;;
  --uninstall)
    # R128 卸载通道：目标选择与安装侧同款（--kimi 的 kimi-code 优先/legacy 回退一致）；
    # rc 语义与安装侧对偶——单目标失败 rc 1，--all 聚合 rc（set -e 透传）。
    # 内层 case 用去 -- 前缀的裸名分派（与外层安装分支的 --<tool> 标签区分，
    # 保持安装分支计数口径单一）。
    target="${2:-}"
    case "${target#--}" in
      claude)
        uninstall_to "Claude Code" "$HOME/.claude/skills" "$HOME/.claude/commands" claude
        ;;
      cursor)
        uninstall_to "Cursor" "$HOME/.cursor/skills" "" cursor
        ;;
      codex)
        uninstall_to "Codex" "$HOME/.codex/skills" "" codex
        ;;
      opencode)
        uninstall_to "OpenCode" "$HOME/.config/opencode/skills" "" opencode
        ;;
      windsurf)
        uninstall_to "Windsurf" "$HOME/.codeium/windsurf/skills" "" windsurf
        ;;
      gemini)
        uninstall_to "Gemini CLI" "$HOME/.gemini/skills" "" gemini
        ;;
      kimi)
        # 与 --kimi 安装同款目标选择：kimi-code 优先，旧 kimi-cli 回退
        if [[ -d "$HOME/.kimi-code" ]]; then
          uninstall_to "Kimi" "$HOME/.kimi-code/skills" "" kimi
        else
          uninstall_to "Kimi" "$HOME/.kimi/skills" "" kimi
        fi
        ;;
      zcode)
        uninstall_to "ZCode" "$HOME/.zcode/skills" "" zcode
        ;;
      hermes)
        uninstall_to "Hermes" "$HOME/.hermes/skills" "" hermes
        ;;
      dsh)
        uninstall_to "DSH" "$HOME/.dsh/skills" "" dsh
        ;;
      ccswitch)
        uninstall_to "CC-Switch" "$HOME/.cc-switch/skills" "" ccswitch
        ;;
      all)
        found="$(detect_runtimes)"
        if [[ -z "$found" ]]; then
          echo "ERROR: 未检测到任何已安装的 AI 工具"
          exit 1
        fi
        printf '%s\n' "$found" | uninstall_all_found
        ;;
      *)
        echo "Usage: bash install.sh --uninstall [--claude|--cursor|--codex|--opencode|--windsurf|--gemini|--kimi|--zcode|--hermes|--dsh|--ccswitch|--all]"
        if [[ -z "$target" ]]; then
          echo "  未指定卸载目标——请从上面任选一个（--all = 所有已检测到的环境）"
        else
          echo "  无效目标: ${target}"
        fi
        exit 1
        ;;
    esac
    echo ""
    echo "=== 卸载完成 ==="
    echo "  存档目录（<技能目录>.uninstalled.<UTC时间戳>）确认无需回滚后可手动删除"
    exit 0
    ;;
  auto|"")
    echo "=== 自动检测运行环境 ==="
    found="$(detect_runtimes)"
    if [[ -z "$found" ]]; then
      echo "  未检测到已安装的 AI 工具，默认安装到 ~/.claude/skills/"
      install_to "通用" "$HOME/.claude/skills" "$HOME/.claude/commands"
    else
      count=$(echo "$found" | wc -l | xargs)
      if [[ "$count" -eq 1 ]]; then
        echo "$found" | while IFS=$'\t' read -r name dir cmd; do
          install_to "$name" "$dir" "$cmd"
        done
      else
        echo "  检测到多个运行环境："
        i=1
        echo "$found" | while IFS=$'\t' read -r name dir _; do
          echo "    ${i}) ${name} (${dir})"
          i=$((i+1))
        done
        echo "    a) 全部安装"
        echo ""
        # R118 ④：非交互 stdin（CI/管道/</dev/null）下 read 会 EOF，旧实现被 set -e 直接
        # 终止为 rc=1 且无任何解释。改为明确报错并给出可执行替代（--all / 单个目标）。
        if [[ ! -t 0 ]]; then
          echo "ERROR: 检测到多个运行环境，但 stdin 不是交互终端，无法选择安装目标。" >&2
          echo "  请显式指定：bash install.sh --all（全部安装），或 --claude/--cursor/--codex/--zcode/--hermes/--dsh/--ccswitch 等单个目标。" >&2
          echo "  仅查看环境：bash install.sh --list" >&2
          exit 2
        fi
        if ! read -rp "选择安装目标 [1-${count}/a]: " choice; then
          echo "ERROR: 读取选择失败（stdin 已关闭）——未安装任何目标；请用 --all 或单个目标参数。" >&2
          exit 2
        fi
        # R118 ⑫：非法选择（0/99/非数字/空）旧实现会跳过安装却仍打印“安装完成”，
        # 这里显式校验并报错退出（rc=1），绝不输出成功字样。
        case "$choice" in
          a|A)
            printf '%s\n' "$found" | install_all_found
            ;;
          *)
            case "$choice" in
              ''|*[!0-9]*)
                echo "ERROR: 无效选择 '${choice}'（有效值：1-${count} 或 a）——未安装任何目标。" >&2
                exit 1
                ;;
            esac
            choice_num=$((10#${choice}))
            if [[ "$choice_num" -lt 1 || "$choice_num" -gt "$count" ]]; then
              echo "ERROR: 无效选择 '${choice}'（有效范围 1-${count} 或 a）——未安装任何目标。" >&2
              exit 1
            fi
            i=1
            echo "$found" | while IFS=$'\t' read -r name dir cmd; do
              if [[ "$i" -eq "$choice_num" ]]; then
                install_to "$name" "$dir" "$cmd"
                break
              fi
              i=$((i+1))
            done
            ;;
        esac
      fi
    fi
    ;;
  *)
    echo "Usage: bash install.sh [--claude|--cursor|--codex|--opencode|--windsurf|--gemini|--kimi|--zcode|--hermes|--dsh|--ccswitch|--all|--list|--version]"
    echo "       bash install.sh --uninstall [--claude|--cursor|--codex|--opencode|--windsurf|--gemini|--kimi|--zcode|--all]"
    exit 1
    ;;
esac

echo ""
echo "=== 安装完成 ==="
echo "  使用方法：对 AI 说 '为 /path/to/project 生成 skill'"
echo "  或用 slash command：/swarm-yuan /path/to/project"
