#!/usr/bin/env bash
# self-check.sh — swarm-yuan 运行前自检：11 个项目运行时是否已安装，未装则自动安装最新版
#
# 安装策略（三类）：
#   1. npm 全局包（@latest）：npm i -g <pkg>@latest  或  npx -y <pkg>@latest <args>
#      · openspec / comet / gitnexus / gsd-core / claude-mem / ocr / ruflo
#   2. python 工具：uv tool install → pipx install → pip install 降级
#      · graphify
#   3. GitHub Release 源码包：下载 <name>-src.zip → 解压到目标目录 → ./setup
#      · gstack / superpowers / ECC（无法走包管理器的运行时）
#
# 用法:
#   bash self-check.sh                  # 检测 + 自动安装/升级到最新版
#   bash self-check.sh --check-only     # 仅检测不安装
#   bash self-check.sh --install <name> # 仅装指定项目（最新版）
#   bash self-check.sh --latest         # 已装的也升级到最新版
#
# 环境变量:
#   SRC_RELEASE_TAG   源码包 Release tag（默认 v<当天YYYYMMDD>-src，可覆盖）

# 错误处理说明（企业级规范偏离的显式化）：set -uo pipefail 无 -e——本脚本是聚合检查器，
# 单个检查失败（运行时缺失/文档不一致等）不应中断后续检查，须全部跑完汇总报告。
# 有意偏离 set -euo pipefail 标准（注释即规范），检查函数内部已用 fail/warn 分级处理。
set -uo pipefail
FAIL=0
pass(){ echo "  ✓ $1"; }
miss(){ echo "  ✗ $1 未安装"; FAIL=1; return 1; }
warn(){ echo "  ⚠ $1"; }

# ---------- 源码包 Release 配置 ----------
SRC_RELEASE_REPO="issac-new/Swarm-yuan"
SRC_RELEASE_TAG="${SRC_RELEASE_TAG:-v$(date -u +%Y%m%d)-src}"

# ---------- 工具检测 ----------
has_cmd(){ command -v "$1" &>/dev/null; }

# ---------- 检测函数（miss 时 return 1，pass 时 return 0；if/else 形式避免 A&&B||C 误判）----------
# 记忆后端适配层（生成器侧 assets/memory-backends.sh，安装态同目录 scripts/；缺失时 CLI 直探兜底）
_MB_SH=""
for _c in "$(cd "$(dirname "$0")/.." 2>/dev/null && pwd)/assets/memory-backends.sh" "$(cd "$(dirname "$0")" 2>/dev/null && pwd)/memory-backends.sh"; do
  if [[ -f "$_c" ]]; then _MB_SH="$_c"; break; fi
done
if [[ -n "$_MB_SH" ]]; then
  # shellcheck disable=SC1090
  source "$_MB_SH"
fi

# 方法论插件候选目录（跨宿主生态探测：Claude Code plugins/skills + 通用 ~/.agents/skills + ZCode ~/.zcode/skills）
# 目录存在 ≠ 已安装到当前宿主——只作"本机哪里有"的存在性检测，消费仍以 references 蒸馏档为准
_methodology_dirs(){  # $1=插件名 → stdout 候选目录（每行一个）
  printf '%s\n' "$HOME/.claude/plugins/$1" "$HOME/.claude/skills/$1" "$HOME/.agents/skills/$1" "$HOME/.zcode/skills/$1"
}

check_openspec(){
  if command -v openspec &>/dev/null; then pass "OpenSpec: $(openspec --version 2>&1|head -1)"; else miss "OpenSpec"; fi
}
check_comet(){
  if command -v comet &>/dev/null; then pass "comet: $(comet --version 2>&1|head -1)"; else miss "comet"; fi
}
check_gitnexus(){
  if command -v gitnexus &>/dev/null; then pass "GitNexus: $(gitnexus --version 2>&1|head -1)"; else miss "GitNexus"; fi
}
check_gsd_core(){
  if command -v gsd-tools &>/dev/null; then pass "gsd-core: gsd-tools 可用"; else miss "gsd-core"; fi
}
check_claude_mem(){
  # 经记忆后端适配层派发（detect=当前可用，present=本机有痕迹含数据目录）；适配层缺失时 CLI 直探兜底
  if command -v mem_detect >/dev/null 2>&1; then
    if mem_detect claude_mem; then
      pass "claude-mem: $(claude-mem --version 2>&1|head -1)"
    elif mem_present claude_mem; then
      warn "claude-mem: 本机有数据痕迹但 CLI 不可用（mem_present 命中）--深度整合需 CLI，建议 npm i -g claude-mem"
    else
      miss "claude-mem"
    fi
  elif command -v claude-mem &>/dev/null; then
    pass "claude-mem: $(claude-mem --version 2>&1|head -1)"
  else
    miss "claude-mem"
  fi
}
check_ocr(){
  if command -v ocr &>/dev/null; then pass "open-code-review: $(ocr --version 2>&1|head -1)"; else miss "open-code-review (ocr)"; fi
}
check_graphify(){
  if command -v graphify &>/dev/null; then pass "graphify: $(graphify --help 2>&1|head -1)"; else miss "graphify"; fi
}
check_superpowers(){
  # 实质检测：目录存在 ≠ 已安装。离线包曾只 vendor superpowers-marketplace
  # 目录仓（LICENSE/README/.claude-plugin/marketplace.json 等市场元数据），核心插件
  # v6.1.1 本体不在包内。须含核心插件证据——skills/ 子目录或 .claude-plugin/plugin.json
  # ——才视为已安装；仅 marketplace 元数据判空壳 miss（fail-closed）。
  local d
  for d in $(_methodology_dirs superpowers); do
    [[ -d "$d" ]] || continue
    if [[ -d "$d/skills" || -f "$d/.claude-plugin/plugin.json" ]]; then
      pass "superpowers: 已安装（核心插件证据齐备，位于 ${d}）"; return 0
    fi
    miss "superpowers（空壳：marketplace 元数据非核心插件，需在线 /plugin install）"; return 1
  done
  miss "superpowers（需 /plugin install）"
}
check_gstack(){
  local d
  for d in $(_methodology_dirs gstack); do
    if [[ -d "$d" ]]; then pass "gstack: 已安装（${d}）"; return 0; fi
  done
  miss "gstack（需 git clone + setup）"
}
check_ruflo(){
  if command -v ruflo &>/dev/null; then pass "ruflo: $(ruflo --version 2>&1|head -1)"; else miss "ruflo"; fi
}
check_ecc(){
  local d
  for d in $(_methodology_dirs ecc); do
    if [[ -d "$d" ]]; then pass "ECC: 已安装（${d}）"; return 0; fi
  done
  miss "ECC（需 /plugin marketplace add https://github.com/affaan-m/ECC && /plugin install ecc）"
}

# ---------- 通用：从 GitHub Release 源码包安装 ----------
# 源码包 tag 降级：当天 tag 不存在时，git ls-remote 查最近 -src tag 降级。
# 设计疏漏修复：SRC_RELEASE_TAG 默认按当天日期生成，但 -src 包只在发版时手动打
# （release-src-packages.sh），当天没打时新用户首装必 FAIL=1。降级到最近可用 tag，
# warn 提示"源码包非当天"，把"当天必须有 -src 包"从硬约束降为软提醒。
_latest_src_tag(){
  # 返回最近的 v<YYYYMMDD>-src tag（字典序可排序）；无则返回空
  git ls-remote --tags "https://github.com/${SRC_RELEASE_REPO}.git" 'v*-src' 2>/dev/null \
    | awk -F/ '{print $NF}' | grep -E '^v[0-9]{8}-src$' | sort | tail -1
}

# 参数: <项目名> <zip名> <目标目录> [可选 setup 命令]
# 流程: curl 下载 Release <tag>/<zip> → 解压 → cp 到 <目标目录> → 跑 setup
# 失败: 下载/解压失败 return 1（调用方计入 FAIL）；setup 失败 warn 不 return 1（文件已就位）
install_from_src_release(){
  local name="$1" zip="$2" dest="$3" setup="${4:-}"
  local tag="${SRC_RELEASE_TAG}"
  local url="https://github.com/${SRC_RELEASE_REPO}/releases/download/${tag}/${zip}"
  local tmp; tmp="$(mktemp -d "${TMPDIR:-/tmp}/swarm-yuan.XXXXXX")"
  echo "  → [$name] 下载源码包: $url"
  if ! (cd "$tmp" && curl -fsSL -o "$zip" "$url"); then
    # 当天 tag 不存在（404）→ 降级到最近可用 -src tag 重试
    local fallback; fallback="$(_latest_src_tag)"
    if [[ -n "$fallback" && "$fallback" != "$tag" ]]; then
      url="https://github.com/${SRC_RELEASE_REPO}/releases/download/${fallback}/${zip}"
      echo "  → [$name] 当天 tag ${tag} 不存在，降级到最近可用 tag ${fallback}: $url"
      if (cd "$tmp" && curl -fsSL -o "$zip" "$url"); then
        warn "$name 源码包非当天（降级到 ${fallback}）；发版者跑 bash scripts/release-src-packages.sh 可更新到当天"
        tag="$fallback"
      else
        echo "  ✗ $name 源码包下载失败（当天 ${tag} + 降级 ${fallback} 均失败）: $url"
        echo "    手工下载: 浏览器打开 ${url}，或确认 Release tag 存在"
        rm -rf "$tmp"; return 1
      fi
    else
      echo "  ✗ $name 源码包下载失败: $url"
      echo "    手工下载: 浏览器打开 ${url}，或确认 Release tag $tag 存在"
      rm -rf "$tmp"; return 1
    fi
  fi
  if ! (cd "$tmp" && unzip -q "$zip" -d extracted); then
    echo "  ✗ $name 源码包解压失败"; rm -rf "$tmp"; return 1
  fi
  # zip 内为单层目录，取其内容；无单层目录则直接取 extracted/
  local inner; inner="$(find "$tmp/extracted" -mindepth 1 -maxdepth 1 -type d | head -1)"
  local src="${inner:-$tmp/extracted}"
  mkdir -p "$dest"
  # C8 修复：cp 链失败时 fail-loud，不再静默继续到 "✓ 安装完成"
  # 三轮复盘：cp 失败最常见原因不是"src 空/损坏"，而是 dest 有与 src 冲突的项
  # （典型：dest 里是符号链接、src 里是同名目录 → cp 报 "Not a directory"）。
  # 错误提示改为可操作：列出 dest 的符号链接 + 给排查/修复命令，不自动删用户目录。
  if ! { cp -R "$src"/. "$dest/" 2>/dev/null || cp -R "$src"/* "$dest/" 2>/dev/null; }; then
    echo "  ✗ $name 文件复制失败" >&2
    # 复现一次 cp 拿到真实错误（不吞 stderr），只取前 3 行
    local _cp_err; _cp_err="$(cp -R "$src"/. "$dest/" 2>&1 >/dev/null | head -3)"
    [[ -n "$_cp_err" ]] && echo "    原因: $_cp_err" >&2
    local _links; _links="$(find "$dest" -maxdepth 1 -type l 2>/dev/null | head -5)"
    if [[ -n "$_links" ]]; then
      echo "    dest 内符号链接（常见冲突源，src 同名为目录时 cp 失败）:" >&2
      printf '      %s\n' $_links >&2
    fi
    echo "    排查: ls -la \"$dest\" | grep -E '^l'" >&2
    echo "    修复: 移除冲突项后重跑；或 rm -rf \"$dest\" 全新安装（会删 dest 内自定义内容，请先确认）" >&2
    rm -rf "$tmp" 2>/dev/null
    return 1
  fi
  rm -rf "$dest/.git" 2>/dev/null || true
  rm -rf "$tmp"
  if [[ -n "$setup" ]]; then
    echo "  → [$name] 运行 setup: $setup"
    (cd "$dest" && eval "$setup") 2>&1 | tail -4 || warn "$name setup 失败（文件已就位，请手动检查）"
  fi
  echo "  ✓ $name 源码包安装完成: $dest"
}

# ---------- 安装函数（三类：npm / python / 源码包）----------
# C9 修复：所有 install 命令加 || return 1，失败不再静默（pipe 到 tail 会丢退出码）
install_openspec(){
  echo "  → npm i -g @fission-ai/openspec@latest"; npm i -g @fission-ai/openspec@latest 2>&1|tail -2 || return 1
}
install_comet(){
  echo "  → npm i -g @rpamis/comet@latest"; npm i -g @rpamis/comet@latest 2>&1|tail -2 || return 1
}
install_gitnexus(){
  echo "  → npm i -g gitnexus@latest"; npm i -g gitnexus@latest 2>&1|tail -2 || return 1
}
install_gsd_core(){
  # gsd-core 是运行时 artifact 安装器：npx 调用写入 ~/.claude 运行时 artifacts
  echo "  → npx -y @opengsd/gsd-core@latest --claude --global（写入运行时 artifacts）"
  npx -y @opengsd/gsd-core@latest --claude --global 2>&1 | tail -4 || return 1
}
install_claude_mem(){
  echo "  → npx -y claude-mem@latest install"; npx -y claude-mem@latest install 2>&1|tail -4 || return 1
}
install_ocr(){
  # ocr 的 postinstall 下载平台二进制，npm i -g @latest 最稳
  echo "  → npm i -g @alibaba-group/open-code-review@latest"; npm i -g @alibaba-group/open-code-review@latest 2>&1|tail -2 || return 1
}
install_graphify(){
  # graphify 是 python 项目：uv → pipx → pip 降级
  echo "  → 安装 graphify (uv → pipx → pip)"
  if command -v uv &>/dev/null; then
    uv tool install graphifyy 2>&1|tail -3 || return 1
    uv tool update-shell 2>/dev/null || true
  elif command -v pipx &>/dev/null; then
    pipx install graphifyy 2>&1|tail -3 || return 1
  elif command -v pip3 &>/dev/null || command -v pip &>/dev/null; then
    local pipcmd; command -v pip3 &>/dev/null && pipcmd=pip3 || pipcmd=pip
    $pipcmd install --user graphifyy 2>&1|tail -3 || return 1
    echo "  ℹ pip 安装的用户级 bin 须在 PATH（通常 ~/.local/bin 或 ~/Library/Python/*/bin）"
  else
    echo "  ✗ 需先安装 uv (curl -LsSf https://astral.sh/uv/install.sh | sh) 或 pipx 或 pip"
    return 1
  fi
}
install_ruflo(){
  echo "  → npm i -g ruflo@latest"; npm i -g ruflo@latest 2>&1|tail -2 || return 1
}
install_gstack(){
  install_from_src_release "gstack" "gstack-src.zip" "$HOME/.claude/skills/gstack" "./setup" || return 1
}
install_superpowers(){
  # 安装目标优先 plugins/（与 check_superpowers L81 检测路径一致）
  install_from_src_release "superpowers" "superpowers-src.zip" "$HOME/.claude/plugins/superpowers" "" || return 1
}
install_ecc(){
  install_from_src_release "ECC" "ecc-src.zip" "$HOME/.claude/plugins/ecc" "" || return 1
}

# 升级已安装的 npm 包到最新版（静默，仅在有新版本时输出）
upgrade_npm_pkg(){
  local pkg="$1" bin="$2"
  command -v "$bin" &>/dev/null || return 0
  local cur latest
  cur=$("$bin" --version 2>/dev/null | head -1 | tr -d '[:space:]')
  cur="${cur#v}"
  [[ -z "$cur" ]] && return 0
  latest=$(npm view "$pkg" version 2>/dev/null | head -1 | tr -d '[:space:]')
  latest="${latest#v}"
  [[ -z "$latest" ]] && return 0
  if [[ "$cur" != "$latest" ]]; then
    echo "  ↻ 升级 $pkg: $cur → $latest"
    npm i -g "${pkg}@latest" 2>&1 | tail -1
  fi
}

# 升级源码包类（重下 Release 覆盖安装）
upgrade_src_pkg(){
  local name="$1" zip="$2" dest="$3" setup="${4:-}"
  [[ -d "$dest" ]] || return 0
  echo "  ↻ [$name] 重装源码包到最新"
  install_from_src_release "$name" "$zip" "$dest" "$setup"
}

# 11 个项目定义（唯一数据源，检测/安装/升级/复查全部从此表驱动）：
#   name|check_func|install_func|auto_installable|npm_pkg
#   npm_pkg：npm 全局包名（--latest npm 模式比对 version 用）；空=非 npm 包（python/源码包）
# 注：self-check 生成的 hooks.json PreToolUse 命令须发射 Claude Code 和 Cursor 都接受的
#   {"permission":"allow"} verdict（参考 ruflo v3.25.6 #2613 修复）
# 注：若目标技能注册 MCP，须检测重复注册（同一 binary 注册 claude-flow + ruflo 两个 key）
#   并通过 ruflo doctor 自愈——canonical MCP key 保留一个（参考 ruflo v3.25.6 #2612 修复）
# 注：hooks.json 须无 BOM（UTF-8 无 BOM），否则 Codex 严格 JSON 解析失败（参考 ruflo v3.32.1 修复）
PROJECTS=(
  "openspec|check_openspec|install_openspec|1|@fission-ai/openspec"
  "comet|check_comet|install_comet|1|@rpamis/comet"
  "gitnexus|check_gitnexus|install_gitnexus|1|gitnexus"
  "gsd-core|check_gsd_core|install_gsd_core|1|"
  "claude-mem|check_claude_mem|install_claude_mem|1|"
  "ocr|check_ocr|install_ocr|1|@alibaba-group/open-code-review"
  "graphify|check_graphify|install_graphify|1|"
  "superpowers|check_superpowers|install_superpowers|1|"
  "gstack|check_gstack|install_gstack|1|"
  "ruflo|check_ruflo|install_ruflo|1|ruflo"
  "ECC|check_ecc|install_ecc|1|"
)

# 自动安装失败时的人工安装提示（按 name 查，集中于一处）
install_hint() {
  case "$1" in
    superpowers)
      echo "    自动安装失败。手工：从 Release $SRC_RELEASE_TAG 下载 superpowers-src.zip"
      echo "    解压到 ~/.claude/plugins/superpowers（须含 skills/ 或 .claude-plugin/plugin.json）"
      ;;
    gstack)
      echo "    自动安装失败。手工：从 Release $SRC_RELEASE_TAG 下载 gstack-src.zip"
      echo "    解压到 ~/.claude/skills/gstack && cd ~/.claude/skills/gstack && ./setup"
      ;;
    ECC)
      echo "    自动安装失败。手工：从 Release $SRC_RELEASE_TAG 下载 ecc-src.zip"
      echo "    解压到 ~/.claude/plugins/ecc"
      ;;
    graphify)
      echo "    需先安装 uv (curl -LsSf https://astral.sh/uv/install.sh | sh) 或 pipx 或 pip"
      ;;
    *) echo "    （无人工安装指引，请查阅项目文档）" ;;
  esac
}

CHECK_ONLY=0
SINGLE=""
FORCE_LATEST=1   # 默认拉最新版

# 循环解析全部参数
while [[ $# -gt 0 ]]; do
  case "$1" in
    --check-only) CHECK_ONLY=1; FORCE_LATEST=0; shift ;;
    --install) SINGLE="${2:-}"; shift; [[ $# -gt 0 ]] && shift ;;
    --latest) FORCE_LATEST=1; shift ;;
    *) echo "✗ 未知参数: $1"; echo "用法: bash self-check.sh [--check-only] [--install <name>] [--latest]"; exit 1 ;;
  esac
done

echo "=========================================="
echo "  swarm-yuan 自检：11 个项目运行时"
if [[ $FORCE_LATEST -eq 1 ]]; then
  echo "  （自动安装/升级到最新版 已启用）"
else
  echo "  （仅检测，不安装/升级）"
fi
echo "  源码包 Release: $SRC_RELEASE_TAG"
echo "=========================================="
echo ""

if [[ -n "$SINGLE" ]]; then
  # 仅安装单个
  for p in "${PROJECTS[@]}"; do
    IFS='|' read -r name chk inst auto npmpkg <<< "$p"
    [[ "$name" == "$SINGLE" ]] || continue
    if [[ -z "$inst" ]]; then
      echo "✗ $name 无法 bash 自动安装（需 Claude Code /plugin 或手动 clone）"
      exit 1
    fi
    echo "=== 安装 ${name}（最新版）==="
    # 传播安装退出码——此前无条件 exit 0，安装失败也报成功
    "$inst"
    exit $?
  done
  echo "✗ 未知项目: $SINGLE"
  avail=""
  for p in "${PROJECTS[@]}"; do IFS='|' read -r name _ <<< "$p"; avail="$avail $name"; done
  echo "  可用:$avail"
  exit 1
fi

# 检测全部（MISSING 条目携带 check 函数，供安装后复查直接调用）
echo "=== 检测 ==="
MISSING=()
for p in "${PROJECTS[@]}"; do
  IFS='|' read -r name chk inst auto npmpkg <<< "$p"
  if "$chk" 2>/dev/null; then
    :
  else
    MISSING+=("$name|$chk|$inst|$auto|$npmpkg")  # 补第 5 字段 npmpkg，供 --latest 升级路径用
  fi
done

echo ""
if [[ ${#MISSING[@]} -eq 0 ]]; then
  echo "✓ 全部 11 个项目运行时已安装"
fi
# 运行时整合分层标注：让用户清楚每个运行时的真实整合程度，不假装全深接
# 计数从 facts.conf 动态读取（原硬编码 4/3/4，林迪效应失效--不随实现演变）
_runtime_base="$(cd "$(dirname "$0")/.." && pwd)"
if [[ -z "${FACT_RUNTIMES_DEEP:-}" && -f "$_runtime_base/assets/facts.conf" ]]; then
  set +u; # shellcheck disable=SC1090
  source "$_runtime_base/assets/facts.conf"; set -u
fi
echo "  整合分层："
echo "    深度整合(${FACT_RUNTIMES_DEEP:-4},precheck.sh 真实命令调用)：gitnexus / graphify / claude-mem / ocr"
echo "    CLI 整合(${FACT_RUNTIMES_CLI:-4},门禁/状态机按需调用 CLI)：openspec / comet / gsd-core / codex-security"
echo "    方法论引用(${FACT_RUNTIMES_METHOD:-5},AI 按节点引用模式)：superpowers / gstack / ruflo / ECC / impeccable"
echo "  （每层有自带降级载体，未装不阻塞--详见 SKILL.md「外部运行时整合」分层说明）"
unset _runtime_base

# 即便全部已装，若启用 --latest 则升级到最新版
if [[ $FORCE_LATEST -eq 1 && $CHECK_ONLY -eq 0 ]]; then
  echo ""
  echo "=== 升级到最新版 ==="
  for p in "${PROJECTS[@]}"; do
    IFS='|' read -r name chk inst auto npmpkg <<< "$p"
    case "$name" in
      openspec|comet|gitnexus|ocr|ruflo)
        [[ -n "$npmpkg" ]] && upgrade_npm_pkg "$npmpkg" "$name" ;;
      gsd-core)
        echo "  ↻ [gsd-core] npx 拉最新运行时 artifacts"
        npx -y @opengsd/gsd-core@latest --claude --global 2>&1 | tail -3 || true ;;
      claude-mem)
        echo "  ↻ [claude-mem] npx 拉最新"
        npx -y claude-mem@latest install 2>&1 | tail -3 || true ;;
      graphify)
        if [[ -d "$HOME/.local/share/uv/tools/graphifyy" ]] || command -v graphify &>/dev/null; then
          echo "  ↻ [graphify] uv tool reinstall"
          command -v uv &>/dev/null && uv tool install --force graphifyy 2>&1 | tail -2 || true
        fi ;;
      gstack)
        upgrade_src_pkg "gstack" "gstack-src.zip" "$HOME/.claude/skills/gstack" "./setup" ;;
      superpowers)
        upgrade_src_pkg "superpowers" "superpowers-src.zip" "$HOME/.claude/plugins/superpowers" "" ;;
      ECC)
        upgrade_src_pkg "ECC" "ecc-src.zip" "$HOME/.claude/plugins/ecc" "" ;;
    esac
  done
fi

# 修复（合并自两边）：原此处 MISSING==0 时直接 exit，导致运行时齐全环境下
# 文档一致性 / 框架规则集核验 / enforce 分层等本地检查段永不执行——与 2026-07-21 修复的
# --check-only 死代码属同类缺陷的另一分支。改为缺失段仅在 MISSING>0 时执行，
# 本地检查段无条件执行，末尾统一 exit $FAIL。
if [[ ${#MISSING[@]} -eq 0 ]]; then
  echo ""
  echo "（全部运行时已装，继续执行本地检查段：文档一致性 / 框架规则集核验 / enforce 分层 / 上游基线）"
fi

if [[ ${#MISSING[@]} -gt 0 ]]; then
echo ""
echo "=== 缺失: ${#MISSING[@]} 个 ==="
for m in ${MISSING[@]+"${MISSING[@]}"}; do
  IFS='|' read -r name chk inst auto <<< "$m"
  echo "  - $name"
done

if [[ $CHECK_ONLY -eq 1 ]]; then
  echo ""
  echo "（--check-only 模式，不自动安装；继续执行本地检查段：文档一致性 / 框架规则集核验 / 上游基线）"
  # 历史缺陷修复（2026-07-21）：原此处直接 `exit 1`，导致后续纯本地的
  # 文档一致性 / 框架规则集核验 / 上游基线检查段在 --check-only（CLAUDE.md/README
  # 推荐的人工检测命令）下永不执行——号称的"自举文档一致性门禁"在自己推荐的
  # 检测模式下是死的。改为跳过自动安装段，继续跑本地检查段，末尾统一 exit $FAIL。
  # 运行时缺失的 FAIL=1 已在 miss() 置位，不会丢失。
else
echo ""
echo "=== 自动安装最新版（可自动装的）==="
for m in ${MISSING[@]+"${MISSING[@]}"}; do
  IFS='|' read -r name chk inst auto <<< "$m"
  if [[ "$auto" == "1" && -n "$inst" ]]; then
    echo "--- $name ---"
    "$inst"
    echo ""
  else
    warn "$name 无法 bash 自动安装："
    install_hint "$name"
    echo ""
  fi
done

echo "=== 安装后复查 ==="
# 复查重算 FAIL：初检 miss 置位不代表终态——自动安装成功且复查 pass 的项目不算失败，
# 只有复查仍 miss（含需手动安装的）才保持 FAIL=1。
FAIL=0
for m in ${MISSING[@]+"${MISSING[@]}"}; do
  IFS='|' read -r name chk inst auto <<< "$m"
  "$chk"
done
fi  # end of `if CHECK_ONLY -eq 1`
fi  # end of `if MISSING -gt 0`

echo ""
# ===== 框架规则库时效检查 =====
fw_freshness_check() {
  local fw_dir; fw_dir="$(cd "$(dirname "$0")/.." && pwd)/references/frameworks"
  # 存在性守卫：生成的目标 skill 不含 references/frameworks/（generate-skill.sh 不复制），
  # 无目录时 glob 不展开会打印垃圾告警（"⚠ *.md 缺'最后调研'日期"），直接跳过。
  [[ -d "$fw_dir" ]] || return 0
  echo "▶ 框架规则库时效检查"
  local now d ts age f id
  now=$(date -u +%s)
  for f in "$fw_dir"/*.md; do
    [[ -f "$f" ]] || continue
    id=$(basename "$f" .md)
    [[ "$id" == "_template" ]] && continue
    d=$(sed -n 's/^最后调研: *\([0-9-]*\).*/\1/p' "$f" | head -1)
    d=${d:-}
    if [[ -z "$d" ]]; then
      warn "$(basename "$f") 缺'最后调研'日期"
      continue
    fi
    # 兼容 macOS date -j 与 GNU date -d
    ts=$(date -u -j -f "%Y-%m-%d" "$d" +%s 2>/dev/null || date -u -d "$d" +%s 2>/dev/null || echo 0)
    if [[ "$ts" -eq 0 ]]; then
      warn "$(basename "$f") 日期格式异常: $d"
      continue
    fi
    age=$(( (now - ts) / 86400 ))
    if [[ "$age" -gt 365 ]]; then
      warn "$(basename "$f") 调研于 ${d}（${age} 天前 >365 天），建议重新核实版本区间"
    elif [[ "$age" -gt 180 ]]; then
      warn "$(basename "$f") 调研于 ${d}（${age} 天前 >180 天），建议关注版本变化"
    fi
  done
}
fw_freshness_check

# ===== 框架规则集核验（74 规则集四要素自动核验）=====
fw_ruleset_verify() {
  local base; base="$(cd "$(dirname "$0")/.." && pwd)"
  local vfy="$base/scripts/verify-framework-ruleset.sh"
  # 存在性守卫：生成的目标 skill 不带规则库与核验脚本（generate-skill.sh 不复制），静默跳过
  [[ -f "$vfy" && -d "$base/references/frameworks" ]] || return 0
  echo "▶ 框架规则集核验"
  local f id ok_cnt=0 fail_cnt=0 fail_ids=""
  for f in "$base/references/frameworks/"*.md; do
    [[ -f "$f" ]] || continue
    id=$(basename "$f" .md)
    [[ "$id" == "_template" ]] && continue
    # 逐 id 调四要素核验（与本脚本同目录），聚合计数不逐条刷屏
    if bash "$vfy" "$id" >/dev/null 2>&1; then
      ok_cnt=$((ok_cnt + 1))
    else
      fail_cnt=$((fail_cnt + 1))
      fail_ids="$fail_ids $id"
    fi
  done
  if [[ $fail_cnt -eq 0 ]]; then
    echo "  ✓ 框架规则集核验全部通过（$ok_cnt/$((ok_cnt + fail_cnt))）"
  else
    warn "框架规则集核验未通过 $fail_cnt/$((ok_cnt + fail_cnt)) 个:${fail_ids}（bash scripts/verify-framework-ruleset.sh <id> 查看详情）"
    FAIL=1
  fi
}
fw_ruleset_verify

# ===== 文档一致性检查（防文档-实现漂移）=====
# 从 shell 文件自动解析数组赋值的元素个数（支持跨行数组；数组未定义时输出 0）
_count_gate_array() {
  awk -v name="$1" '
    $0 ~ "^" name "=\\(" { inarr=1 }
    inarr {
      line=$0
      sub(/^[^(]*\(/, "", line)
      if (index(line, ")") > 0) { sub(/\).*/, "", line); done=1 }
      n=split(line, a, /[ \t]+/)
      for (i=1; i<=n; i++) if (a[i] != "") cnt++
      if (done) exit
    }
    END { print cnt+0 }
  ' "$2" 2>/dev/null || echo 0
}

# 单文件 conf 变量计数（scripts/ + assets/ 双路径兜底，与 true_vars 同口径）。
# 用法：_count_conf_vars <base> <conf_basename>  例：_count_conf_vars "$base" "precheck.arch.conf"
_count_conf_vars() {
  local base="$1" bn="$2" n=0
  for p in "$base/scripts/$bn" "$base/assets/$bn"; do
    [[ -f "$p" ]] || continue
    n=$(( n + $(grep -cE '^[A-Z_][A-Z0-9_]*=' "$p" 2>/dev/null | xargs) ))
  done
  echo "$n"
}

# advisory-only 门禁数 = 总门禁数 - 出现在任一执行数组（CORE/STANDARD/FULL/COMPLIANCE）的去重门禁数。
# 这些门禁不在三档执行序列（--all/--all-full/--compliance-suite）里，只能单独触发（如 --canary/--learnings）。
# 用法：_count_advisory_only <precheck_sh> <true_gates_total>
_count_advisory_only() {
  local psh="$1" total="$2"
  local in_arr
  # 提取四数组里的 check_* 名（去重）
  in_arr=$(awk '
    /^(ALL_GATES_CORE|ALL_GATES_STANDARD|ALL_GATES_FULL|ALL_GATES_COMPLIANCE)=\(/ { inarr=1 }
    inarr {
      line=$0; sub(/^[^(]*\(/, "", line)
      if (index(line, ")") > 0) { sub(/\).*/, "", line); inarr=0 }
      n=split(line, a, /[ \t]+/)
      for (i=1; i<=n; i++) if (a[i] ~ /^check_/) print a[i]
    }
  ' "$psh" 2>/dev/null | sort -u)
  local arr_cnt
  arr_cnt=$(printf '%s\n' "$in_arr" | grep -c '^check_' 2>/dev/null | xargs)
  [[ -z "$arr_cnt" ]] && arr_cnt=0
  echo $(( total - arr_cnt ))
}

# 拆分后 check_* 函数在 gates-strict/warn/advisory.sh 三文件，不在 precheck.sh 主文件。
# 所有"数 check_* 函数"的 grep 须扫四文件（precheck.sh + gates-*.sh）。
# 打包态（install.sh bundle）下三文件已内联回 precheck.sh，gates-*.sh 不存在，此时只扫 precheck.sh。
_all_gate_files() {
  local base="$1" f
  printf '%s\n' "$base/assets/precheck.sh"
  for f in gates-strict.sh gates-warn.sh gates-advisory.sh; do
    [[ -f "$base/assets/$f" ]] && printf '%s\n' "$base/assets/$f"
  done
}
_count_check_fns() {
  local base="$1"
  _all_gate_files "$base" | xargs grep -hcE '^check_[a-z_]+\(\)' 2>/dev/null | awk '{s+=$1} END{print s+0}'
}

check_doc_consistency() {
  echo "▶ 文档一致性检查（真值对账 + 预算断言；文档不手抄数字，无手抄即无漂移）"
  local base; base="$(cd "$(dirname "$0")/.." && pwd)"
  local facts_conf="$base/assets/facts.conf"
  local _have_facts=1
  if [[ -f "$facts_conf" ]]; then
    set +u; # shellcheck disable=SC1090
    source "$facts_conf"; set -u
  else
    _have_facts=0   # 目标技能上下文（facts.conf 不随技能分发）——FACT_ 断言走 :-0 假默认必误报，整段跳过
  fi

  # 1. 框架规则文件数 == 门禁片段数（真值对账）
  local rule_cnt=0 gate_cnt=0 _f
  for _f in "$base/references/frameworks/"*.md; do [[ -f "$_f" ]] || continue; [[ "$(basename "$_f")" == _template.md ]] && continue; rule_cnt=$((rule_cnt+1)); done
  for _f in "$base/assets/framework-gates/"*.sh; do [[ -f "$_f" ]] || continue; gate_cnt=$((gate_cnt+1)); done
  if [[ "$rule_cnt" == "$gate_cnt" ]]; then
    echo "  ✓ 框架规则($rule_cnt) == 门禁片段($gate_cnt)"
  else
    warn "框架规则($rule_cnt) != 门禁片段($gate_cnt)——孤立/缺片段"
    FAIL=1
  fi

  if [[ "$_have_facts" -eq 1 ]]; then
  # 2. FACT_GATES_TOTAL vs check_* 函数真值
  local actual_gates
  actual_gates=$(grep -hE "^check_[a-z_0-9]+\(\)" "$base/assets/gates-strict.sh" "$base/assets/gates-warn.sh" "$base/assets/gates-advisory.sh" "$base/assets/precheck.sh" 2>/dev/null | wc -l | tr -d ' ')
  if [[ "${FACT_GATES_TOTAL:-0}" == "$actual_gates" ]]; then
    echo "  ✓ FACT_GATES_TOTAL(${FACT_GATES_TOTAL:-?}) == check_* 真值($actual_gates)"
  else
    warn "FACT_GATES_TOTAL(${FACT_GATES_TOTAL:-?}) != check_* 真值($actual_gates)——更新 facts.conf"
    FAIL=1
  fi

  # 2b. 门禁子族计数六键等值断言（复活 _count_gate_array/
  # _count_advisory_only——这组函数本为守子族计数而生，定义后从未整合（死代码），
  # 致 COMPLIANCE 17→19 / ADVISORY_ONLY 10→6 漂移漏网。fail 级，与 FACT_GATES_TOTAL 同级）
  local _psh="$base/assets/precheck.sh"
  local _c_core _c_std _c_comp _c_full _c_adv _c_arch
  _c_core=$(_count_gate_array ALL_GATES_CORE "$_psh")
  _c_std=$(_count_gate_array ALL_GATES_STANDARD "$_psh")
  _c_comp=$(_count_gate_array ALL_GATES_COMPLIANCE "$_psh")
  _c_full=$(_count_gate_array ALL_GATES_FULL "$_psh")
  _c_adv=$(_count_advisory_only "$_psh" "$actual_gates")
  _c_arch=$(( _c_std - _c_core ))   # ARCH 是派生族（STANDARD−CORE），不直接对应单一数组
  local _subfail=0
  [[ "${FACT_GATES_CORE:-0}" == "$_c_core" ]] || { warn "FACT_GATES_CORE(${FACT_GATES_CORE:-?}) != 真值($_c_core)——更新 facts.conf"; _subfail=1; }
  [[ "${FACT_GATES_ARCH:-0}" == "$_c_arch" ]] || { warn "FACT_GATES_ARCH(${FACT_GATES_ARCH:-?}) != STANDARD−CORE 真值($_c_arch)——更新 facts.conf"; _subfail=1; }
  [[ "${FACT_GATES_STANDARD:-0}" == "$_c_std" ]] || { warn "FACT_GATES_STANDARD(${FACT_GATES_STANDARD:-?}) != 真值($_c_std)——更新 facts.conf"; _subfail=1; }
  [[ "${FACT_GATES_COMPLIANCE:-0}" == "$_c_comp" ]] || { warn "FACT_GATES_COMPLIANCE(${FACT_GATES_COMPLIANCE:-?}) != 真值($_c_comp)——更新 facts.conf"; _subfail=1; }
  [[ "${FACT_GATES_FULL:-0}" == "$_c_full" ]] || { warn "FACT_GATES_FULL(${FACT_GATES_FULL:-?}) != 真值($_c_full)——更新 facts.conf"; _subfail=1; }
  [[ "${FACT_GATES_ADVISORY_ONLY:-0}" == "$_c_adv" ]] || { warn "FACT_GATES_ADVISORY_ONLY(${FACT_GATES_ADVISORY_ONLY:-?}) != 真值($_c_adv)——更新 facts.conf"; _subfail=1; }
  if [[ "$_subfail" -eq 0 ]]; then
    echo "  ✓ 门禁子族六键一致（CORE ${_c_core} / ARCH ${_c_arch} / STANDARD ${_c_std} / COMPLIANCE ${_c_comp} / FULL ${_c_full} / advisory-only ${_c_adv}）"
  else
    FAIL=1
  fi

  # 2c. conf 变量四键等值断言（此前仅 ≤200 预算断言，等值漂移
  # 漏网——PROMO 174/14 即实证。USERFACE 是"约 20"估算值非自动可数，不设等值断言）
  local _v_core _v_arch _v_comp _v_total
  _v_core=$(_count_conf_vars "$base" "precheck.conf")
  _v_arch=$(_count_conf_vars "$base" "precheck.arch.conf")
  _v_comp=$(_count_conf_vars "$base" "precheck.compliance.conf")
  _v_total=$(( _v_core + _v_arch + _v_comp ))
  local _varfail=0
  [[ "${FACT_CONF_VARS_CORE:-0}" == "$_v_core" ]] || { warn "FACT_CONF_VARS_CORE(${FACT_CONF_VARS_CORE:-?}) != 真值($_v_core)——更新 facts.conf"; _varfail=1; }
  [[ "${FACT_CONF_VARS_ARCH:-0}" == "$_v_arch" ]] || { warn "FACT_CONF_VARS_ARCH(${FACT_CONF_VARS_ARCH:-?}) != 真值($_v_arch)——更新 facts.conf"; _varfail=1; }
  [[ "${FACT_CONF_VARS_COMPLIANCE:-0}" == "$_v_comp" ]] || { warn "FACT_CONF_VARS_COMPLIANCE(${FACT_CONF_VARS_COMPLIANCE:-?}) != 真值($_v_comp)——更新 facts.conf"; _varfail=1; }
  [[ "${FACT_CONF_VARS:-0}" == "$_v_total" ]] || { warn "FACT_CONF_VARS(${FACT_CONF_VARS:-?}) != 生成期必读文件合计真值($_v_total)——更新 facts.conf"; _varfail=1; }
  if [[ "$_varfail" -eq 0 ]]; then
    echo "  ✓ conf 变量四键一致（CORE ${_v_core} + ARCH ${_v_arch} + COMPLIANCE ${_v_comp} = ${_v_total}）"
  else
    FAIL=1
  fi

  # 2d. FACT_FLOW_STEPS 等值断言（该 key 此前零消费者——生成流程步骤数漂移只会静默失真；
  # 真值源：references/generation-flow.md "^## Step" 主步骤标题机械计数，与 facts.conf 注释口径一致）
  local _flow_steps
  _flow_steps=$(grep -cE '^## Step [0-9]+\.' "$base/references/generation-flow.md" 2>/dev/null | xargs)
  _flow_steps="${_flow_steps:-0}"
  if [[ "${FACT_FLOW_STEPS:-0}" == "$_flow_steps" ]]; then
    echo "  ✓ FACT_FLOW_STEPS(${FACT_FLOW_STEPS:-?}) == generation-flow Step 标题真值($_flow_steps)"
  else
    warn "FACT_FLOW_STEPS(${FACT_FLOW_STEPS:-?}) != generation-flow Step 标题真值($_flow_steps)——更新 facts.conf"
    FAIL=1
  fi

  # 2e. FACT_COGNITION_LAYERS 对齐（facts.conf 声称的 G-cognition
  # 扫描此前不存在——空头执法。窄域实现：①定义源表（cognition-framework.md 五层总览表）
  # 层数行自动计数对账；②计数型表述扫描（"N层认知框架/基底"），非 5/五 即漂移——
  # 限定"框架/基底"搭配，避开"第三层认知辩证"等单层引用与"3 层整合"等异轴表述）
  local _cog_file="$base/references/cognition-framework.md"
  local _cog_def=0 _cog_bad=""
  if [[ -f "$_cog_file" ]]; then
    _cog_def=$(grep -cE '^\|[[:space:]]*第[一二三四五六七八九十]+层' "$_cog_file" 2>/dev/null | xargs)
    _cog_def="${_cog_def:-0}"
  fi
  local _cog_hit
  while IFS= read -r _cog_hit; do
    [[ -n "$_cog_hit" ]] && _cog_bad="${_cog_bad} ${_cog_hit}"
  done < <(grep -rhoE '[0-9一二三四五六七八九十]+[[:space:]]*层[[:space:]]*认知(框架|基底)' \
           "$base"/references/*.md "$base"/SKILL.md 2>/dev/null \
           | grep -vE '^[5五５][[:space:]]*层' || true)
  if [[ "${FACT_COGNITION_LAYERS:-0}" == "$_cog_def" && -z "$_cog_bad" ]]; then
    echo "  ✓ 认知层数对齐（定义表 ${_cog_def} 层 = FACT_COGNITION_LAYERS ${FACT_COGNITION_LAYERS:-?}；计数型表述无非 5 漂移）"
  else
    [[ "${FACT_COGNITION_LAYERS:-0}" == "$_cog_def" ]] || warn "认知定义表 ${_cog_def} 层 != FACT_COGNITION_LAYERS(${FACT_COGNITION_LAYERS:-?})"
    [[ -z "$_cog_bad" ]] || warn "认知层数计数型表述漂移（应均为 5/五层）：${_cog_bad}"
    FAIL=1
  fi

  # 3. FACT_REFERENCES vs references/*.md 计数
  local ref_cnt
  ref_cnt=$(ls -1 "$base"/references/*.md 2>/dev/null | wc -l | tr -d ' ')
  if [[ "${FACT_REFERENCES:-0}" == "$ref_cnt" ]]; then
    echo "  ✓ FACT_REFERENCES($ref_cnt) 一致"
  else
    warn "FACT_REFERENCES(${FACT_REFERENCES:-?}) != 实际($ref_cnt)——更新 facts.conf"
    FAIL=1
  fi

  # 3b. FACT_FRAMEWORKS 等值断言（此前仅 golden-vector 行数间接断言，facts 漂移无直接执法）
  if [[ "${FACT_FRAMEWORKS:-0}" == "$rule_cnt" ]]; then
    echo "  ✓ FACT_FRAMEWORKS($rule_cnt) == 规则库真值"
  else
    warn "FACT_FRAMEWORKS(${FACT_FRAMEWORKS:-?}) != 规则库真值($rule_cnt)——更新 facts.conf"
    FAIL=1
  fi

  # 3c. FACT_SPEC_SECTIONS 等值断言（该 key 此前零消费者——装饰性死配置判例同型，补真实消费路径）
  local _spec_secs
  _spec_secs=$(grep -cE '^## [0-9]+\. ' "$base/assets/spec-template.md" 2>/dev/null)
  _spec_secs="${_spec_secs:-0}"
  if [[ "${FACT_SPEC_SECTIONS:-0}" == "$_spec_secs" ]]; then
    echo "  ✓ FACT_SPEC_SECTIONS($_spec_secs) == spec-template.md 整数节"
  else
    warn "FACT_SPEC_SECTIONS(${FACT_SPEC_SECTIONS:-?}) != spec-template.md 整数节($_spec_secs)——更新 facts.conf"
    FAIL=1
  fi
  else
    echo "  ℹ 非生成器仓（无 assets/facts.conf）——#2/#2b/#2c/#2d/#3 FACT_ 真值断言跳过（防 :-0 假默认误报）；#1 结构对账与 #4 预算断言仍执行"
  fi

  # 4. 预算断言——口径修正：生成物"每会话固定税"（SKILL.md+hooks.json+settings+conf ≤8KB）+
  # "上下文预算 references 拷贝"（≤256KB）——脚本是按需调用工具不算税（Codex"正文选中才注入"同构：工具不占预读认知）。
  local uf_budget="${FACT_ARTIFACT_BYTES_BUDGET:-262144}"
  local uf_bytes=0 _entry
  while IFS='|' read -r _dest _cat _tier; do
    [[ -z "$_tier" ]] && _tier="standard"
    case "$_tier" in
      lite|standard) _src_case="$_cat" ;;
      *) continue ;;
    esac
    case "$_dest" in
      references/*) [[ -f "$base/$_dest" ]] && uf_bytes=$((uf_bytes + $(wc -c < "$base/$_dest" 2>/dev/null | tr -d ' '))) ;;
    esac
  done < <(awk '/^UNIVERSAL_FILES=\(/{f=1;next} f&&/^\)/{f=0} f' "$base/scripts/generate-skill.sh" | grep -oE '"[^"]+\|[^"]+"' | tr -d '"')
  echo "  ℹ UNIVERSAL_FILES 上下文预算体积 ≈ ${uf_bytes}B（预算 ${uf_budget}B，超标 fail）"
  if [[ "$uf_bytes" -gt "$uf_budget" ]]; then
    warn "生成物上下文预算（references 拷贝）${uf_bytes}B > 预算 ${uf_budget}B（预算断言）——references 按需拷贝收窄或瘦身"
    FAIL=1
  fi

  # 5. 文档数字手抄退役声明：SKILL.md/README 不再内联具体计数（渲染由发布脚本注入）
  if grep -qE '(^|[^0-9.])[0-9]+ ?个(质量)?门禁' "$base/SKILL.md" 2>/dev/null && ! grep -q 'FACT_GATES_TOTAL' "$base/SKILL.md" 2>/dev/null; then
    warn "SKILL.md 仍手抄门禁数字（应引用 facts.conf 或不写数字）"
  fi

  # 6. 版本口径三面机器锚（决策 38：根 README badge = 技能 README badge = CHANGELOG 首行版本）
  # 成因：v2.8.0 起四次发版漏改根 README badge（停在 v2.7.0）——发版 checklist 靠人记必然漏。
  # 仓库根 = $base 上一级；安装态（~/.claude/skills/swarm-yuan）无 CHANGELOG.md 时显式跳过（同 _have_facts 守卫模式）。
  local repo_root; repo_root="$(cd "$base/.." && pwd)"
  local _cl_ver _root_badge _skill_badge
  _cl_ver=$(grep -m1 -oE '^## \[v[0-9]+\.[0-9]+\.[0-9]+\]' "$repo_root/CHANGELOG.md" 2>/dev/null | grep -oE 'v[0-9]+\.[0-9]+\.[0-9]+')
  _root_badge=$(grep -m1 -oE 'release-v[0-9]+\.[0-9]+\.[0-9]+' "$repo_root/README.md" 2>/dev/null | grep -oE 'v[0-9]+\.[0-9]+\.[0-9]+')
  _skill_badge=$(grep -m1 -oE 'release-v[0-9]+\.[0-9]+\.[0-9]+' "$base/README.md" 2>/dev/null | grep -oE 'v[0-9]+\.[0-9]+\.[0-9]+')
  if [[ -z "$_cl_ver" ]]; then
    echo "  ℹ 版本口径锚跳过（${repo_root} 无 CHANGELOG.md——安装态/目标技能上下文）"
  else
    if [[ "$_root_badge" == "$_cl_ver" && "$_skill_badge" == "$_cl_ver" ]]; then
      echo "  ✓ 版本口径三面一致（CHANGELOG 首行 = 根 README badge = 技能 README badge = ${_cl_ver}）"
    else
      warn "版本口径漂移：CHANGELOG=${_cl_ver:-?} 根README badge=${_root_badge:-无} 技能README badge=${_skill_badge:-无}——发版须三面同步（决策 38 机器锚）"
      FAIL=1
    fi
  fi
}
check_doc_consistency

# ===== 已删除文档族死链扫描（warn-only）=====
# b67af27 单一文档整合删除 docs/ 17 份后，README/正文仍残留 80+ 活指针（本文件散文扫描半径
# 不含外层仓库，长期漏网）。本扫描守"已删除文档族"复活：允许两类合法残留——
# ①"原 docs/…"历史归档标注；② docs/research/（真实存在）；③ file:line 式历史证据引文（docs/XX.md:215）。
# 其余命中即 warn；连续绿后可翻 FAIL（对齐 MEASURE 渐进式模式）。
check_dead_doc_links() {
  local base; base="$(cd "$(dirname "$0")/.." && pwd)"
  local _hits=0 _hit
  while IFS= read -r _hit; do
    [[ -z "$_hit" ]] && continue
    warn "已删除文档引用（改指 swarm-yuan/README.md 或标注'原 docs/…'）：${_hit}"
    _hits=1
  done < <(grep -rnE '(docs/(DESIGN|paradigm-|USAGE|PROMO|FIVE_DIMENSIONS|runtime-update|2026-07|q2-heavy)|swarm-yuan/docs/)' \
            "$base/SKILL.md" "$base/README.md" "$base"/references/*.md "$base"/scripts/*.sh 2>/dev/null \
            | grep -v 'docs/research/' \
            | grep -vE 'docs/(upstream-baseline|usage-manual|design-evolution)\.md' \
            | grep -vE '原 ?\`?(swarm-yuan/)?docs/' \
            | grep -vE 'docs/[A-Za-z0-9_.-]+\.md:[0-9]+' \
            | grep -vE '（现 §|整合删除' \
            | grep -v 'grep -rnE' || true)
  if [[ "$_hits" -eq 0 ]]; then
    echo "  ✓ 已删除 docs/ 文档族零活引用（历史归档标注/file:line 证据引文除外）"
  fi
}
check_dead_doc_links

# ===== 自举门禁三档断言（G4）=====
# 对账 ci/self-precheck.conf 存在 + SPEC_FILE 显式配置（impact 门 --all-full fail 面）
# + CI generator-self-gate Job 含 --all/--all-full/--compliance-suite 三档 step。
# 口径漂移机器执法：任一项不符 warn + FAIL=1。
check_bootstrap_gate() {
  local base; base="$(cd "$(dirname "$0")/.." && pwd)"
  local conf="$base/ci/self-precheck.conf" ci="$base/../.github/workflows/ci.yml"
  # 安装态（~/.claude/skills/swarm-yuan/）无 ci/ 目录与 .github/，静默跳过
  [[ -f "$conf" ]] || return 0
  echo "▶ 自举门禁三档断言（G4）"
  # conf 显式配置 SPEC_FILE（impact 门在候选+兜底全空时 fail，必须 conf 指向自家模板）
  if grep -q '^SPEC_FILE=' "$conf"; then
    echo "  ✓ self-precheck.conf 显式配置 SPEC_FILE（impact 门 fail 面已闭合）"
  else
    warn "self-precheck.conf 缺 SPEC_FILE（impact 门 --all-full fail 面）"
    FAIL=1
  fi
  # CI 含三档 step（--all/--all-full/--compliance-suite）
  if [[ -f "$ci" ]]; then
    local n
    n=$(grep -cE 'precheck\.sh"? --(all|all-full|compliance-suite)' "$ci" 2>/dev/null || echo 0)
    if [[ "$n" -ge 3 ]]; then
      echo "  ✓ CI 自举三档 step 齐全（$n 处，含 --all/--all-full/--compliance-suite）"
    else
      warn "CI 自举 step 数=$n < 3（应含 --all/--all-full/--compliance-suite）"
      FAIL=1
    fi
  elif [[ -d "$base/../verifier" ]]; then
    # 生成器仓布局（repo 根有 verifier/）但缺 ci.yml = 真缺口：三档 step 无从对账
    warn "CI workflow 不存在: ${ci}（生成器仓布局缺失，无法对账三档 step）"
    FAIL=1
  else
    # 部署副本布局（无 .github 与 verifier/）：CI 三档对账不适用——⊘ 跳过披露，不计 FAIL
    # （R102：原缺文件即 warn+FAIL，软链部署副本 self-check 恒红；对齐 WP-F「跳过≠警告」口径）
    echo "  ⊘ SKIPPED（部署副本无 .github，CI 三档 step 对账不适用）"
  fi
}
check_bootstrap_gate

# ===== AI 工具兼容三档对账（G7）=====
# 对账 tool-adapters/common.sh 的 TA_TIER_<tool> 声明数 vs facts.conf 口径
# （FACT_COMPAT_DEEP=1 / FACT_COMPAT_CLI=7）。口径漂移机器执法：不符 warn + FAIL=1。
check_compat_tier() {
  local base; base="$(cd "$(dirname "$0")/.." && pwd)"
  local adapters="$base/assets/tool-adapters"
  [[ -f "$adapters/common.sh" ]] || return 0
  # facts.conf 若已被 check_doc_consistency source 则直接用；否则此处兜底 source
  if [[ -z "${FACT_COMPAT_TIERS:-}" && -f "$base/assets/facts.conf" ]]; then
    set +u; # shellcheck disable=SC1090
    source "$base/assets/facts.conf"; set -u
  fi
  echo "▶ AI 工具兼容三档对账（G7）"
  local deep_cnt cli_cnt
  deep_cnt=$(grep -c '^TA_TIER_[a-z]*=deep' "$adapters/common.sh" 2>/dev/null || echo 0)
  cli_cnt=$(grep -c '^TA_TIER_[a-z]*=cli' "$adapters/common.sh" 2>/dev/null || echo 0)
  local exp_deep="${FACT_COMPAT_DEEP:-1}" exp_cli="${FACT_COMPAT_CLI:-6}"
  if [[ "$deep_cnt" == "$exp_deep" && "$cli_cnt" == "$exp_cli" ]]; then
    echo "  ✓ 三档声明（deep=${deep_cnt} cli=${cli_cnt}）与 facts.conf 一致（DEEP=${exp_deep} CLI=${exp_cli}）"
  else
    [[ "$deep_cnt" == "$exp_deep" ]] || { warn "deep 档声明数=${deep_cnt} ≠ facts.conf FACT_COMPAT_DEEP=${exp_deep}"; FAIL=1; }
    [[ "$cli_cnt" == "$exp_cli" ]] || { warn "cli 档声明数=${cli_cnt} ≠ facts.conf FACT_COMPAT_CLI=${exp_cli}"; FAIL=1; }
  fi
}
check_compat_tier

# ===== NEVER_GATE 单源一致性断言 =====
# precheck.sh _never_gate 与 adaptive-gating.sh NEVER_GATE 须为同一清单（防三源漂移）
check_never_gate_consistency() {
  local base; base="$(cd "$(dirname "$0")/.." && pwd)"
  local precheck="$base/assets/precheck.sh"
  local adaptive="$base/scripts/adaptive-gating.sh"
  [[ -f "$precheck" && -f "$adaptive" ]] || return 0
  echo "▶ NEVER_GATE 单源一致性"
  # 提取 _never_gate=" a b c " 的引号内清单（precheck.sh）
  local ng_precheck
  ng_precheck=$(grep -E '^[[:space:]]*_never_gate="' "$precheck" 2>/dev/null | head -1 | sed 's/.*_never_gate="//; s/"[[:space:]]*$//' | tr -s ' ' | sed 's/^ //; s/ $//')
  # 提取 NEVER_GATE="a b c" 的引号内清单（adaptive-gating.sh）
  local ng_adaptive
  ng_adaptive=$(grep -E '^NEVER_GATE="' "$adaptive" 2>/dev/null | head -1 | sed 's/^NEVER_GATE="//; s/"[[:space:]]*$//' | tr -s ' ' | sed 's/^ //; s/ $//')
  # 排序后比较（忽略顺序差异，只校验成员集合一致）
  local sorted_p sorted_a
  sorted_p=$(echo "$ng_precheck" | tr ' ' '\n' | sort | tr '\n' ' ' | sed 's/ $//')
  sorted_a=$(echo "$ng_adaptive" | tr ' ' '\n' | sort | tr '\n' ' ' | sed 's/ $//')
  if [[ -z "$ng_precheck" || -z "$ng_adaptive" ]]; then
    warn "NEVER_GATE 提取失败（precheck='${ng_precheck:-空}' adaptive='${ng_adaptive:-空}'）--检查两文件定义存在"
    FAIL=1
  elif [[ "$sorted_p" == "$sorted_a" ]]; then
    local cnt; cnt=$(echo "$ng_precheck" | wc -w | tr -d ' ')
    echo "  ✓ NEVER_GATE 两源一致（${cnt} 项：${ng_precheck}）"
  else
    warn "NEVER_GATE 两源漂移：precheck.sh [${ng_precheck}] ≠ adaptive-gating.sh [${ng_adaptive}]"
    FAIL=1
  fi
}
check_never_gate_consistency

# ===== 运行时整合分层对账断言（林迪效应防治--标注须随实现演变）=====
# 从 precheck.sh 的 has_* 守卫函数存在性派生 tier，对账 facts.conf 的 FACT_RUNTIMES_* 权威计数
check_runtime_tier() {
  local base; base="$(cd "$(dirname "$0")/.." && pwd)"
  local precheck="$base/assets/precheck.sh"
  [[ -f "$precheck" ]] || return 0
  # facts.conf 若已被前序函数 source 则直接用；否则兜底 source
  if [[ -z "${FACT_RUNTIMES_DEEP:-}" && -f "$base/assets/facts.conf" ]]; then
    set +u; # shellcheck disable=SC1090
    source "$base/assets/facts.conf"; set -u
  fi
  echo "▶ 运行时整合分层对账"
  # 派生 deep 集合：precheck.sh 中 has_gitnexus/has_graphify/has_ocr/has_claude_mem 函数定义存在
  local deep_cnt=0 cli_cnt=0
  for fn in has_gitnexus has_graphify has_ocr has_claude_mem; do
    grep -qE "^${fn}\(\)" "$precheck" 2>/dev/null && deep_cnt=$((deep_cnt+1))
  done
  # 派生 cli 集合：has_openspec/has_comet/has_gsd_tools/has_codex_security
  # codex-security 是 CLI 整合层第 4 对象（2026-07-30 吸收），但其 has_ 守卫在 gates-warn.sh 的
  # check_sast_deep 内联判定（command -v npx + OPENAI_API_KEY），不是 precheck.sh 的顶层 has_ 函数。
  # 此处对账 precheck.sh 顶层 has_ 函数（3 个：openspec/comet/gsd_tools），codex-security 的 has_
  # 守卫在 check_sast_deep 内联——所以 cli_cnt 期望值要扣除 codex-security（它不进顶层 has_ 计数）。
  for fn in has_openspec has_comet has_gsd_tools; do
    grep -qE "^${fn}\(\)" "$precheck" 2>/dev/null && cli_cnt=$((cli_cnt+1))
  done
  # method 集合 = FACT_RUNTIMES - deep - cli（PROJECTS 表 N 项，方法论层无 has_ 守卫）
  # codex-security 虽属 CLI 层但无顶层 has_ 函数，cli_cnt=3（顶层 has_）≠ FACT_RUNTIMES_CLI=4，
  # 故 method_cnt 派生用 FACT_RUNTIMES - deep - (FACT_RUNTIMES_CLI)，而非 cli_cnt。
  local method_cnt=$(( ${FACT_RUNTIMES:-13} - deep_cnt - ${FACT_RUNTIMES_CLI:-4} ))
  local exp_deep="${FACT_RUNTIMES_DEEP:-4}" exp_cli="${FACT_RUNTIMES_CLI:-4}" exp_method="${FACT_RUNTIMES_METHOD:-5}"
  if [[ "$deep_cnt" == "$exp_deep" && "$cli_cnt" == "$((exp_cli - 1))" && "$method_cnt" == "$exp_method" ]]; then
    echo "  ✓ 整合分层与 facts.conf 一致（deep=${deep_cnt} cli顶层has_=${cli_cnt}（+codex-security内联守卫1=CLI ${exp_cli}） method=${method_cnt}）"
  else
    [[ "$deep_cnt" == "$exp_deep" ]] || { warn "deep 整合 has_* 函数数=${deep_cnt} ≠ facts.conf FACT_RUNTIMES_DEEP=${exp_deep}"; FAIL=1; }
    # cli 顶层 has_ 期望 = FACT_RUNTIMES_CLI - 1（codex-security 守卫在 check_sast_deep 内联，不在顶层 has_）
    [[ "$cli_cnt" == "$((exp_cli - 1))" ]] || { warn "cli 整合 顶层 has_* 函数数=${cli_cnt} ≠ 期望 $((exp_cli - 1))（FACT_RUNTIMES_CLI=${exp_cli} 含 codex-security 内联守卫1，不进顶层 has_ 计数）"; FAIL=1; }
    [[ "$method_cnt" == "$exp_method" ]] || { warn "method 整合派生数=${method_cnt} ≠ facts.conf FACT_RUNTIMES_METHOD=${exp_method}"; FAIL=1; }
  fi
}
check_runtime_tier

# ===== 记忆后端注册表对账 =====
# memory-backends.sh 的后端注册数（mem_*_detect 函数定义）vs facts.conf FACT_MEM_BACKENDS。
# 口径漂移机器执法：后端增删未同步 facts.conf 时 warn + FAIL=1。
check_mem_backends() {
  local base; base="$(cd "$(dirname "$0")/.." && pwd)"
  local mb="$base/assets/memory-backends.sh"
  [[ -f "$mb" ]] || { warn "memory-backends.sh 不存在（记忆后端适配层缺失）"; FAIL=1; return 0; }
  if [[ -z "${FACT_MEM_BACKENDS:-}" && -f "$base/assets/facts.conf" ]]; then
    set +u; # shellcheck disable=SC1090
    source "$base/assets/facts.conf"; set -u
  fi
  echo "▶ 记忆后端注册表对账"
  local cnt
  cnt=$(grep -cE '^mem_[a-z_]+_detect\(\)' "$mb" 2>/dev/null || true)
  cnt="${cnt:-0}"
  local exp="${FACT_MEM_BACKENDS:-3}"
  if [[ "$cnt" == "$exp" ]]; then
    echo "  ✓ 记忆后端 ${cnt} 个与 facts.conf FACT_MEM_BACKENDS=${exp} 一致"
  else
    warn "记忆后端注册数=${cnt} ≠ facts.conf FACT_MEM_BACKENDS=${exp}"; FAIL=1
  fi
}
check_mem_backends

# ===== golden-vector.txt 行数断言（金向量漂移防治）=====
# golden-vector.txt 行数须 == FACT_FRAMEWORKS（+1 行 FIXTURES_TOTAL 尾行）
# 防止新增框架后 golden 未重建导致 C1 golden diff 对新 fixture 失效
check_golden_vector() {
  local base; base="$(cd "$(dirname "$0")/.." && pwd)"
  local golden="$base/../verifier/v1/golden-vector.txt"
  [[ -f "$golden" ]] || return 0
  # facts.conf 若已被前序函数 source 则直接用
  if [[ -z "${FACT_FRAMEWORKS:-}" && -f "$base/assets/facts.conf" ]]; then
    set +u; # shellcheck disable=SC1090
    source "$base/assets/facts.conf"; set -u
  fi
  echo "▶ golden-vector 行数对账"
  # golden-vector.txt 行数 = FACT_FRAMEWORKS 行 FIXTURE + 1 行 FIXTURES_TOTAL
  local golden_lines exp_lines
  golden_lines=$(wc -l < "$golden" | tr -d ' ')
  exp_lines=$(( ${FACT_FRAMEWORKS:-79} + 1 ))
  if [[ "$golden_lines" == "$exp_lines" ]]; then
    echo "  ✓ golden-vector.txt ${golden_lines} 行（${FACT_FRAMEWORKS:-79} fixture + 1 尾行）与 facts.conf 一致"
  elif [[ "${SWARM_YUAN_GOLDEN_REBUILD:-0}" == "1" ]]; then
    # 显式一键重建（opt-in，不自动跟随漂移——保基线独立性）。
    # 用法：SWARM_YUAN_GOLDEN_REBUILD=1 bash scripts/self-check.sh（重建后本轮即对账）
    echo "  ℹ SWARM_YUAN_GOLDEN_REBUILD=1：执行 verifier 官方重建……"
    bash "$base/../verifier/v1/run-verifier.sh" rebuild-golden >/dev/null 2>&1 || true
    golden_lines=$(wc -l < "$golden" | tr -d ' ')
    if [[ "$golden_lines" == "$exp_lines" ]]; then
      echo "  ✓ golden-vector 已重建 ${golden_lines} 行并与 facts.conf 一致（请审 git diff 后提交）"
    else
      warn "golden-vector 重建后 ${golden_lines} 行仍 ≠ ${exp_lines} 行（fixture 数与 FACT_FRAMEWORKS 漂移，另查）"
      FAIL=1
    fi
  else
    warn "golden-vector.txt ${golden_lines} 行 ≠ 期望 ${exp_lines} 行（FACT_FRAMEWORKS=${FACT_FRAMEWORKS:-79} + 1）--故意新增框架后：SWARM_YUAN_GOLDEN_REBUILD=1 bash scripts/self-check.sh 一键重建基线（重建后审 git diff）"
    FAIL=1
  fi
}
check_golden_vector

# ===== 框架规则集 vs fixture 配对断言（G12）=====
# 守"4-element coupling"的第 3 元素（fixture 正反例）：references/frameworks/*.md 数须 == tests/fixtures/ 目录数。
# 此前 self-check 只断言 rules.md vs gate.sh 配对（要素 2），fixture 配对（要素 3）无守。
# 已把 verify-framework-ruleset.sh 的 fixture 缺失从 warn 升 fail；本断言在 self-check 层补全覆盖。
check_framework_fixture_pairing() {
  local base; base="$(cd "$(dirname "$0")/.." && pwd)"
  local rules_dir="$base/references/frameworks"
  local fx_dir="$base/tests/fixtures"
  [[ -d "$rules_dir" && -d "$fx_dir" ]] || return 0
  echo "▶ 框架规则集 vs fixture 配对断言（G12）"
  local _rules _fx _missing=""
  _rules=$(find "$rules_dir" -maxdepth 1 -name "*.md" ! -name "_template*" 2>/dev/null | wc -l | xargs)
  _fx=$(find "$fx_dir" -maxdepth 1 -mindepth 1 -type d 2>/dev/null | wc -l | xargs)
  # 逐个核对：每个 rules.md 须有对应 fixture 目录
  local r
  for r in "$rules_dir"/*.md; do
    [[ -f "$r" ]] || continue
    local bn; bn="$(basename "$r" .md)"
    [[ "$bn" == _template* ]] && continue
    if [[ ! -d "$fx_dir/$bn" ]]; then
      _missing="${_missing} ${bn}"
    fi
  done
  if [[ -n "$_missing" ]]; then
    warn "框架缺 fixture 配对：${_missing}（全 79 框架强制正反例覆盖）"
    FAIL=1
  elif [[ "$_rules" -ne "$_fx" ]]; then
    warn "框架规则集数 ${_rules} ≠ fixture 目录数 ${_fx}（配对断言）"
    FAIL=1
  else
    echo "  ✓ 框架规则集 ${_rules} = fixture ${_fx}（全配对，4-element coupling 要素 3 守住）"
  fi
}
check_framework_fixture_pairing

# ===== 测度元素元数据覆盖率断言（Q-06，GB/T 25000.21-2019）=====
# conf 变量须含 # MEASURE: 注释（characteristic/function/threshold 三元组）
# 渐进式：FACT_MEASURE_METADATA_REQUIRED=0 时 warn-only 报告覆盖率；1 时 fail
check_measure_metadata() {
  local base; base="$(cd "$(dirname "$0")/.." && pwd)"
  local precheck_conf="$base/scripts/precheck.conf"
  [[ -f "$precheck_conf" ]] || precheck_conf="$base/assets/precheck.conf"
  [[ -f "$precheck_conf" ]] || return 0
  if [[ -z "${FACT_MEASURE_METADATA_REQUIRED:-}" && -f "$base/assets/facts.conf" ]]; then
    set +u; # shellcheck disable=SC1090
    source "$base/assets/facts.conf"; set -u
  fi
  echo "▶ 测度元素元数据覆盖率（Q-06，GB/T 25000.21-2019）"
  local total covered pct
  total=$(grep -cE '^[A-Z_][A-Z0-9_]*=' "$precheck_conf" 2>/dev/null || echo 0)
  covered=$(grep -cE '^[A-Z_][A-Z0-9_]*=.*# MEASURE:' "$precheck_conf" 2>/dev/null || echo 0)
  pct=$((total > 0 ? covered * 100 / total : 0))
  echo "  ℹ precheck.conf MEASURE 注释覆盖：${covered}/${total}（${pct}%）"
  if [[ "${FACT_MEASURE_METADATA_REQUIRED:-0}" == "1" && "$covered" -lt "$total" ]]; then
    warn "MEASURE 元数据覆盖率 ${pct}% < 100%（FACT_MEASURE_METADATA_REQUIRED=1，须全量覆盖）"
    FAIL=1
  elif [[ "$pct" -lt 50 ]]; then
    warn "MEASURE 元数据覆盖率 ${pct}% < 50%——建议为核心门禁变量补 # MEASURE: 注释（GB/T 25000.21 测度元素）"
  else
    echo "  ✓ MEASURE 元数据覆盖率 ${pct}%（≥50%，GB/T 25000.21 测度元素格式）"
  fi
}
check_measure_metadata

# ===== 上游基线漂移忠告（不联网，仅读登记表机器标记行）=====
upstream_baseline_check() {
  local base; base="$(cd "$(dirname "$0")/.." && pwd)"
  # 登记表在 docs/upstream-baseline.md（2026-09-01 终态重构自 README §9 物化移出）；安装到 ~/.claude/skills 后无此文件，静默跳过
  local bl="$base/docs/upstream-baseline.md"
  [[ -f "$bl" ]] || { [[ -f "$base/README.md" ]] && bl="$base/README.md"; }
  [[ -f "$bl" ]] || return 0
  local drifted
  # 锚定表格行（以 `|` 起始、`baseline_status=drifted |` 结尾）。
  # 旧版裸 grep 'baseline_status=drifted' 会误匹配 README.md（已整合 upstream-baseline.md）里的散文行
  # （如"上述 `baseline_status=drifted` 的 3 项..."、"将 `baseline_status=drifted` 改为..."），
  # 散文行经 IFS='|' 切分后第 2 列为空 -> 输出"（未命名行）"，且计数从 3 虚高到 5。
  drifted=$(grep -cE '^\| .*baseline_status=drifted \|$' "$bl" 2>/dev/null)
  [[ "${drifted:-0}" -eq 0 ]] && return 0
  echo "▶ 上游基线漂移忠告"
  # 契约：drifted 条目所在行必为表格行（| <name> | ... | baseline_status=drifted |），第二列为名称；
  # 仅 warn 不置 FAIL--版本漂移是提醒而非门禁失败
  grep -E '^\| .*baseline_status=drifted \|$' "$bl" | while IFS='|' read -r _ name _rest; do
    name=$(echo "$name" | sed 's/^ *//;s/ *$//')
    warn "上游基线 drifted：${name:-（未命名行）}--引用基线落后上游最新版，详见 docs/upstream-baseline.md 上游运行时基线"
  done
}
upstream_baseline_check

# ===== 复杂度负向预算断言（G9，决策 26）=====
# 门禁/变量数超 facts.conf 的 BUDGET 上限则 fail（非 warn）--防范式自身复杂度无约束膨胀。
# 与 check_doc_consistency 互补：前者守"声明 vs 真值"漂移，本断言守"真值 vs 预算"膨胀。
check_complexity_budget() {
  local base; base="$(cd "$(dirname "$0")/.." && pwd)"
  local facts="$base/assets/facts.conf"
  [[ -f "$facts" ]] || return 0
  if [[ -z "${FACT_GATES_BUDGET:-}" ]]; then
    set +u; # shellcheck disable=SC1090
    source "$facts"; set -u
  fi
  echo "▶ 复杂度负向预算断言（G9，决策 26）"
  # 复用 check_doc_consistency 的真值派生逻辑（自动计数，不写死）
  local _gates_true _vars_true _v_core _v_arch _v_comp
  _gates_true=$(_count_check_fns "$base")
  _v_core=$(_count_conf_vars "$base" "precheck.conf")
  _v_arch=$(_count_conf_vars "$base" "precheck.arch.conf")
  _v_comp=$(_count_conf_vars "$base" "precheck.compliance.conf")
  _vars_true=$((_v_core + _v_arch + _v_comp))
  # 门禁数预算
  local _gates_budget="${FACT_GATES_BUDGET:-55}"
  if [[ "$_gates_true" -gt "$_gates_budget" ]]; then
    warn "门禁数 ${_gates_true} > 预算 ${_gates_budget}（决策 26）--超预算须等额删除旧门禁，或申请预算上调（决策 26 修订，全文见 docs/design-evolution.md）"
    FAIL=1
  else
    echo "  ✓ 门禁数 ${_gates_true} ≤ 预算 ${_gates_budget}（决策 26，预留 $((_gates_budget - _gates_true)) 增长空间）"
  fi
  # 变量数预算
  local _vars_budget="${FACT_CONF_VARS_BUDGET:-200}"
  if [[ "$_vars_true" -gt "$_vars_budget" ]]; then
    warn "conf 变量数 ${_vars_true} > 预算 ${_vars_budget}（决策 26）--超预算须清理低价值变量，或申请预算上调"
    FAIL=1
  else
    echo "  ✓ 变量数 ${_vars_true} ≤ 预算 ${_vars_budget}（决策 26，预留 $((_vars_budget - _vars_true)) 增长空间）"
  fi
  # 脚本行数（LOC）监控——warn-only 渐进式，根除"写死行数"漂移源
  # 四脚本（precheck.sh + gates-strict/warn/advisory.sh）wc -l 合计，与 FACT_SCRIPT_LOC 对账。
  # LOC 非硬约束（脚本增删正常），仅监控膨胀趋势 + 让文档行数口径以 facts.conf 为准（不写死）。
  local _loc_claim="${FACT_SCRIPT_LOC:-0}"
  if [[ "$_loc_claim" -gt 0 ]]; then
    local _loc_true
    _loc_true=$(_all_gate_files "$base" | xargs wc -l 2>/dev/null | awk '$2=="total"{print $1}')
    _loc_true="${_loc_true:-0}"
    if [[ "$_loc_true" -ne "$_loc_claim" ]]; then
      warn "脚本行数 ${_loc_true} ≠ facts.conf FACT_SCRIPT_LOC ${_loc_claim}--改脚本后须同步 facts.conf（文档行数口径以本 key 为准，不写死）"
    else
      echo "  ✓ 脚本行数 ${_loc_true} = FACT_SCRIPT_LOC（四文件合计，文档不写死行数）"
    fi
  fi
  # 上下文表面预算（决策 32，warn-only 渐进式，对齐 MEASURE 模式）
  # context-surface.sh --gen 计量生成期必读生成期必读文件（SKILL.md + exploration-guide + template-spec）字节。
  # 超预算只 warn 不 fail——避免压缩工作被回涨悄悄侵蚀，但给减重留过渡期（warn-only → 达标后可翻 fail）。
  local _ctx_budget="${FACT_CONTEXT_SURFACE_BUDGET:-180000}"
  local _ctx_script="$base/scripts/context-surface.sh"
  if [[ -f "$_ctx_script" ]]; then
    local _ctx_total
    _ctx_total=$(bash "$_ctx_script" --gen 2>/dev/null | awk -F'\t' '$3=="TOTAL" {print $1}' | head -1)
    _ctx_total="${_ctx_total:-0}"
    if [[ "$_ctx_total" -gt "$_ctx_budget" ]]; then
      warn "上下文表面 ${_ctx_total}B > 预算 ${_ctx_budget}B（决策 32）--生成期必读生成期必读文件超预算，须压缩 SKILL.md/exploration-guide/template-spec 或申请预算上调"
    else
      echo "  ✓ 上下文表面 ${_ctx_total}B ≤ 预算 ${_ctx_budget}B（决策 32，预留 $((_ctx_budget - _ctx_total)) 增长空间）"
    fi
  fi
}
check_complexity_budget

# ===== gates-*.sh 头部注释一致性断言（脚本注释漂移守）=====
# 三轮复盘发现：catchphrase 扫描（check_doc_consistency）只覆盖 .md 文档，
# assets/gates-{strict,warn,advisory}.sh 的头部注释成了无人看守的漂移区——
# 曾长期漂移（strict 声称 17 函数/enforce 20，实际 18/16；advisory 声称 16，实际 15）。
# 本断言只扫头部注释块（第 2-8 行），不全文扫描（门禁逻辑含大量 CWE 编号/阈值，会误伤）。
# 校对两类数字：① "N 个 check_* 函数" vs 该文件实际 ^check_*() 计数；
#              ② "enforce-level <档> N" vs gate-enforce-level.conf 的 =<档>$ 计数。
check_gates_header_comment() {
  local base; base="$(cd "$(dirname "$0")/.." && pwd)"
  local elc="$base/assets/gate-enforce-level.conf"
  [[ -f "$elc" ]] || return 0
  echo "▶ gates-*.sh 头部注释一致性（脚本注释漂移守）"
  local lv f hdr fn_true fn_claim enf_true enf_claim found=0
  for lv in strict warn advisory; do
    f="$base/assets/gates-${lv}.sh"
    [[ -f "$f" ]] || continue
    hdr="$(sed -n '2,8p' "$f" 2>/dev/null)"
    # ① 物理函数数
    fn_true=$(grep -cE '^check_[a-z_0-9]+\(\)' "$f" 2>/dev/null || echo 0)
    fn_claim=$(printf '%s' "$hdr" | grep -oE '[0-9]+ 个 check_\*' | grep -oE '^[0-9]+' | head -1)
    if [[ -n "$fn_claim" && "$fn_claim" != "$fn_true" ]]; then
      warn "gates-${lv}.sh 头部注释声称 ${fn_claim} 个 check_* 函数，实际 ${fn_true}--改门禁增删后须同步头部注释"
      found=1
    fi
    # ② enforce 分档数（注释里形如 "enforce-level strict 16"）
    enf_true=$(grep -cE "=${lv}\$" "$elc" 2>/dev/null || echo 0)
    enf_claim=$(printf '%s' "$hdr" | grep -oE "enforce-level ${lv} [0-9]+" | grep -oE '[0-9]+$' | head -1)
    if [[ -n "$enf_claim" && "$enf_claim" != "$enf_true" ]]; then
      warn "gates-${lv}.sh 头部注释声称 enforce-level ${lv} ${enf_claim}，实际 ${enf_true}（gate-enforce-level.conf）"
      found=1
    fi
  done
  if [[ "$found" -eq 1 ]]; then
    FAIL=1
  else
    echo "  ✓ gates-*.sh 头部注释与真值一致（物理函数数 + enforce 分档数）"
  fi
}
check_gates_header_comment

# ===== FACT_ENFORCE_* 双层对账（此前三键无消费者——死数字）=====
# 静态层（gate-enforce-level.conf，gen-enforce-level 按 fail() 计数生成）对账 FACT_ENFORCE_*；
# 有效层（静态 + precheck.sh _ENFORCE_OVERRIDE 的降级）对账 FACT_ENFORCE_EFFECTIVE_*。
check_enforce_facts() {
  local base; base="$(cd "$(dirname "$0")/.." && pwd)"
  local elc="$base/assets/gate-enforce-level.conf" pc="$base/assets/precheck.sh"
  [[ -f "$elc" && -f "$pc" ]] || return 0
  local _s _w _a bad=0
  _s=$(grep -cE '=strict$' "$elc" 2>/dev/null || echo 0)
  _w=$(grep -cE '=warn$' "$elc" 2>/dev/null || echo 0)
  _a=$(grep -cE '=advisory$' "$elc" 2>/dev/null || echo 0)
  [[ "$_s" -eq "${FACT_ENFORCE_STRICT:-17}" ]] || { warn "FACT_ENFORCE_STRICT 声明 ${FACT_ENFORCE_STRICT:-空} ≠ 静态真值 ${_s}"; bad=1; }
  [[ "$_w" -eq "${FACT_ENFORCE_WARN:-22}" ]] || { warn "FACT_ENFORCE_WARN 声明 ${FACT_ENFORCE_WARN:-空} ≠ 静态真值 ${_w}"; bad=1; }
  [[ "$_a" -eq "${FACT_ENFORCE_ADVISORY:-16}" ]] || { warn "FACT_ENFORCE_ADVISORY 声明 ${FACT_ENFORCE_ADVISORY:-空} ≠ 静态真值 ${_a}"; bad=1; }
  # 有效分层：重放 _ENFORCE_OVERRIDE（单行 K/V 并行写法）
  local _es="$_s" _ew="$_w" _ea="$_a" _line _g _nv _lv
  while IFS= read -r _line; do
    case "$_line" in *_ENFORCE_OVERRIDE_K+=*) ;; *) continue;; esac
    _g=$(printf '%s' "$_line" | sed -n 's/.*_ENFORCE_OVERRIDE_K+=(\([a-z_0-9]*\)).*/\1/p')
    _nv=$(printf '%s' "$_line" | sed -n 's/.*_ENFORCE_OVERRIDE_V+=(\([a-z]*\)).*/\1/p')
    [[ -n "$_g" && -n "$_nv" ]] || continue
    _lv=$(sed -n "s/^${_g}=\\([a-z]*\\).*/\\1/p" "$elc" | head -1)
    [[ -n "$_lv" ]] || _lv="warn"
    [[ "$_lv" == "$_nv" ]] && continue
    case "$_lv" in strict) _es=$((_es-1));; warn) _ew=$((_ew-1));; advisory) _ea=$((_ea-1));; esac
    case "$_nv" in strict) _es=$((_es+1));; warn) _ew=$((_ew+1));; advisory) _ea=$((_ea+1));; esac
  done < <(grep '_ENFORCE_OVERRIDE_K+=' "$pc")
  [[ "$_es" -eq "${FACT_ENFORCE_EFFECTIVE_STRICT:-17}" ]] || { warn "FACT_ENFORCE_EFFECTIVE_STRICT 声明 ${FACT_ENFORCE_EFFECTIVE_STRICT:-空} ≠ 有效真值 ${_es}"; bad=1; }
  [[ "$_ew" -eq "${FACT_ENFORCE_EFFECTIVE_WARN:-17}" ]] || { warn "FACT_ENFORCE_EFFECTIVE_WARN 声明 ${FACT_ENFORCE_EFFECTIVE_WARN:-空} ≠ 有效真值 ${_ew}"; bad=1; }
  [[ "$_ea" -eq "${FACT_ENFORCE_EFFECTIVE_ADVISORY:-21}" ]] || { warn "FACT_ENFORCE_EFFECTIVE_ADVISORY 声明 ${FACT_ENFORCE_EFFECTIVE_ADVISORY:-空} ≠ 有效真值 ${_ea}"; bad=1; }
  if [[ "$bad" -eq 1 ]]; then
    FAIL=1
  else
    echo "  ✓ FACT_ENFORCE 双层对账：静态 ${_s}/${_w}/${_a} + 有效 ${_es}/${_ew}/${_ea}（override 重放一致）"
  fi
}
check_enforce_facts

# 决策 22 第二触发点：profile 漂移自检（warn 不 fail）。
# 第一触发点=precheck --all/--all-full 启动（本批已对决策收窄触发面）；此处为自检面：
# 载体存在 + 阈值单一来源（profile-thresholds.conf，防 auto_detect_profile 漂移副本）。
check_profile_drift() {
  local base; base="$(cd "$(dirname "$0")/.." && pwd)"
  local d="$base/scripts/detect-profile-drift.sh"
  if [[ ! -f "$d" ]]; then
    warn "profile-drift：detect-profile-drift.sh 缺失（决策 22 触发点无载体）"
    return 0
  fi
  if grep -q 'profile-thresholds.conf' "$d" 2>/dev/null; then
    echo "  ✓ profile-drift：载体存在 + 阈值单一来源（profile-thresholds.conf）"
  else
    warn "profile-drift：detect-profile-drift.sh 未读 profile-thresholds.conf（阈值硬编码=漂移副本风险）"
  fi
}
check_profile_drift

# ===== UNIVERSAL_FILES 计数断言（G11）=====
# facts.conf FACT_UNIVERSAL_FILES 声明值须与 generate-skill.sh UNIVERSAL_FILES 数组条目数一致。
# 此前该 FACT 无断言守，曾长期漂移（声明 29，实际 39）。本断言自动计数对齐。
check_universal_files_count() {
  local base; base="$(cd "$(dirname "$0")/.." && pwd)"
  local facts="$base/assets/facts.conf"
  local gen="$base/scripts/generate-skill.sh"
  [[ -f "$facts" && -f "$gen" ]] || return 0
  if [[ -z "${FACT_UNIVERSAL_FILES:-}" ]]; then
    set +u; # shellcheck disable=SC1090
    source "$facts"; set -u
  fi
  echo "▶ UNIVERSAL_FILES 计数断言（G11，C1 修复）"
  local _declared="${FACT_UNIVERSAL_FILES:-61}"
  local _true
  _true=$(sed -n '/^UNIVERSAL_FILES=(/,/^)/p' "$gen" | grep -cE '"[^"]+\|' || echo 0)
  if [[ "$_true" -ne "$_declared" ]]; then
    warn "UNIVERSAL_FILES 声明 ${_declared} 与真值 ${_true} 不符--改 facts.conf FACT_UNIVERSAL_FILES 或核实 generate-skill.sh 数组"
    FAIL=1
  else
    echo "  ✓ UNIVERSAL_FILES ${_true} 条 = FACT_UNIVERSAL_FILES ${_declared}（对齐）"
  fi
  # lite 档条目数断言（FACT_UNIVERSAL_FILES_CORE）——此前该 FACT 无断言守，
  # 曾长期漂移（声明 21，真值 20）。自动计数 UNIVERSAL_FILES 中第三段为 lite 的条目。
  # 计数模式去行尾锚——带尾注释的 lite 条目（gate-plan/audit-closure/ontology-verify/objects.md）
  # 曾被 `\|lite"$` 漏数 4 条（读数 30 ≠ 真值 34，断言假绿）。模式与 generate-skill.sh 解析语义对齐。
  local _core_declared="${FACT_UNIVERSAL_FILES_CORE:-37}"
  local _core_true
  _core_true=$(sed -n '/^UNIVERSAL_FILES=(/,/^)/p' "$gen" | grep -cE '\|lite"' || echo 0)
  if [[ "$_core_true" -ne "$_core_declared" ]]; then
    warn "UNIVERSAL_FILES lite 档声明 ${_core_declared} 与真值 ${_core_true} 不符——改 facts.conf FACT_UNIVERSAL_FILES_CORE 或核实 generate-skill.sh 数组"
    FAIL=1
  else
    echo "  ✓ UNIVERSAL_FILES lite 档 ${_core_true} 条 = FACT_UNIVERSAL_FILES_CORE ${_core_declared}（对齐）"
  fi
}
check_universal_files_count

# ===== 修辞强度扫描（G8）=====
# 数字漂移由 check_doc_consistency 守；本断言守"修辞漂移"--
# 绝对化断言（全行业未解/凭什么检查/停留零/唯一闭环）若未带限定语则 warn。
# 限定语白名单：样本/本轮/调研/限于/非全行业/边界/教学类比/隐喻/代理/未测量。
# warn-only 不置 FAIL：修辞强度是诚实提醒，非数字硬契约。
check_claim_intensity() {
  local base; base="$(cd "$(dirname "$0")/.." && pwd)"
  local _root_docs="$base/.."
  # 与 check_doc_consistency 的 _scan_docs 保持一致（G6/G8 同源盲区）
  local _scan_docs="README.md .claude/commands/swarm-yuan.md $base/../CLAUDE.md references/case-studies/articulation-orchestration.md references/standards-compliance.md ${_root_docs}/verifier/v1/acceptance-criteria.md"
  local _cmd_dir="$base/.claude/commands"
  if [[ -d "$_cmd_dir" ]]; then
    local _cf
    for _cf in "$_cmd_dir"/*.md; do
      [[ -f "$_cf" ]] || continue
      [[ "$(basename "$_cf")" == "swarm-yuan.md" ]] && continue
      _scan_docs="$_scan_docs ${_cf#"$base/"}"
    done
  fi
  echo "▶ 修辞强度扫描（G8）"
  # 绝对化词 -> 限定语白名单（命中即放行）
  # declare -A 在 bash 3.2 不可用，用平行数组 + 索引对齐
  local _abs_words=("全行业未解" "凭什么检查" "停留零" "唯一闭环" "全行业")
  local _qualifiers="样本|本轮|调研|限于|非全行业|边界|教学类比|隐喻|代理|未测量|修辞化|非.*普查|不排除"
  local _hit=0 _total=0 doc docpath
  for doc in $_scan_docs; do
    case "$doc" in
      /*) docpath="$doc" ;;
      *)  docpath="$base/$doc" ;;
    esac
    [[ -f "$docpath" ]] || continue
    local _w
    for _w in "${_abs_words[@]}"; do
      # 取命中行，逐行检查前后 40 字符是否含限定语
      while IFS= read -r _line; do
        [[ -z "$_line" ]] && continue
        _total=$((_total+1))
        # 命中点前后 40 字符窗口
        local _idx; _idx="${_line%%"$_w"*}"
        local _before; _before="${_idx: -40}"
        local _after; _after="${_line#*"$_w"}"
        _after="${_after:0:40}"
        if echo "$_before$_after" | grep -qE "$_qualifiers"; then
          : # 带限定语，放行
        else
          local _docname; _docname="$(basename "$docpath")"
          warn "$_docname: 命中绝对化修辞 '$_w' 未带限定语--建议加「本轮调研样本/非全行业普查/教学类比」等限定"
          _hit=$((_hit+1))
        fi
      done < <(grep -nE "$_w" "$docpath" 2>/dev/null | sed 's/^[0-9]*://')
    done
  done
  if [[ $_hit -eq 0 ]]; then
    echo "  ✓ 修辞强度扫描通过（${_total} 处绝对词均带限定语，或无绝对词）"
  else
    echo "  ℹ 修辞强度扫描发现 $_hit 处未限定绝对词（warn-only，不阻断；详见 P0/P1 修复方案）"
  fi
}
check_claim_intensity

# ===== runtime-update-2026-07：版本 oracle 单源真值断言（G10，claude-mem v13.12.1 吸收）=====
# claude-mem v13.12.1 修复：4 个 worker-script resolver 共享一个确定性 version oracle，
# 永不按 mtime 排序选版本（此前 mtime 排序导致重启风暴，一天 2,424 次回收）。
# 本断言守"选版本/选候选"路径的纪律：version > capability > lexical 全序，禁用 mtime。
# warn-only（对齐 G8 advisory 风格）：发现疑似 mtime 选版本路径则 warn，不阻断。
check_version_oracle_single_source() {
  local base; base="$(cd "$(dirname "$0")/.." && pwd)"
  local facts="$base/assets/facts.conf"
  [[ -f "$facts" ]] || return 0
  if [[ -z "${FACT_VERSION_ORACLE_RULE:-}" ]]; then
    set +u; # shellcheck disable=SC1090
    source "$facts"; set -u
  fi
  # 规则未启用则跳过（FACT_VERSION_ORACLE_RULE=0 时关闭）
  [[ "${FACT_VERSION_ORACLE_RULE:-1}" -eq 1 ]] || return 0
  echo "▶ 版本 oracle 单源真值断言（G10，claude-mem v13.12.1 吸收）"
  # 扫描 swarm-yuan 自身脚本里"按 mtime 选候选"的可疑模式：
  #   - ls -t（按 mtime 降序列目录，常用于"取最新"）
  #   - stat ... -c %Y / -f %m（读 mtime 比较选最新）
  #   - sort ... -k..M / --sort=time（按时间排序选版本）
  # 收窄到"选版本/选候选"语境：排除明显非选版本的用法（如纯日志时间戳）。
  local _scan_scripts=(
    "$base/assets/precheck.sh"
    "$base/assets/state-machine.sh"
    "$base/assets/trace-log.sh"
    "$base/scripts/generate-skill.sh"
    "$base/scripts/conf-render.sh"
    "$base/scripts/inventory-verify.sh"
  )
  local _suspect=0 _scanned=0 _script
  # 可疑模式（ERE）：ls -t / stat 读 mtime / sort 按时间
  local _mtime_patterns='ls[[:space:]]+-[^[:space:]]*t|stat[[:space:]].*%[Ym]|--sort=time|sort[[:space:]].*-k[^[:space:]]*[Mm]'
  for _script in "${_scan_scripts[@]}"; do
    [[ -f "$_script" ]] || continue
    _scanned=$((_scanned+1))
    # 逐行 echo|grep 双 fork 循环向量化为单 awk（行级命中通常为 0，命中行的
    # 消息格式化留在 bash 侧——与原语义逐字节一致）
    while IFS= read -r _ln; do
      [[ -z "$_ln" ]] && continue
      local _sname; _sname="$(basename "$_script")"
      warn "$_sname: 疑似按 mtime 选候选（行: $(printf '%s' "$_ln" | head -c 80)...）--选版本/候选须用 version > capability > lexical 全序，禁用 mtime（claude-mem v13.12.1 教训）"
      _suspect=$((_suspect+1))
    done < <(awk -v pat="$_mtime_patterns" '
      $0 ~ /^[[:space:]]*#/ { next }
      $0 ~ /log|debug|echo|printf|trace/ { next }
      $0 ~ pat { print }
    ' "$_script")
  done
  if [[ $_suspect -eq 0 ]]; then
    echo "  ✓ 版本 oracle 单源真值扫描通过（扫描 ${_scanned} 个脚本，无按 mtime 选候选的可疑路径）"
  else
    echo "  ℹ 版本 oracle 扫描发现 $_suspect 处疑似 mtime 选候选（warn-only，不阻断；误报可加豁免词或注释说明）"
  fi
}
check_version_oracle_single_source

# ===== frontend-design-methodology 引用存在性断言（G13，impeccable v4.0.2 吸收）=====
# impeccable v4.0.2 作为方法论引用层第 5 对象（决策 27 吸收）：
#   - references/frontend-design-methodology.md 必须存在且非空（absorb 载体 ① references 文档）
#   - SKILL.md 方法论引用表须含 impeccable（absorb 载体 ② SKILL.md 叙事）
#   - facts.conf FACT_RUNTIMES_METHOD=5 / FACT_RUNTIMES=12（口径同步硬约束）
# 此断言守 absorb 三载体的一致性，不计入 FACT_GATES_TOTAL=55（决策 27 第 4 条：G<N> 是合规扩展点）。
# 风格：对齐 G10 warn-only——文件缺失才 fail，叙事/口径漂移只 warn。
check_frontend_design_methodology() {
  local base; base="$(cd "$(dirname "$0")/.." && pwd)"
  local facts="$base/assets/facts.conf"
  [[ -f "$facts" ]] || return 0
  if [[ -z "${FACT_RUNTIMES_METHOD:-}" ]]; then
    set +u; # shellcheck disable=SC1090
    source "$facts"; set -u
  fi
  echo "▶ 前端设计方法论引用存在性断言（G13，impeccable v4.0.2 吸收）"
  local _missing=0 _warn=0

  # ① references/frontend-design-methodology.md 存在且非空
  local _ref="$base/references/frontend-design-methodology.md"
  if [[ ! -f "$_ref" ]]; then
    warn "references/frontend-design-methodology.md 缺失（impeccable 吸收载体 ①，应新增该文件）"
    _missing=$((_missing+1)); FAIL=1
  elif [[ ! -s "$_ref" ]]; then
    warn "references/frontend-design-methodology.md 为空（impeccable 吸收载体 ①，应填充内容）"
    _missing=$((_missing+1)); FAIL=1
  else
    echo "  ✓ references/frontend-design-methodology.md 存在且非空"
  fi

  # ② SKILL.md 方法论引用表含 impeccable
  local _skill="$base/SKILL.md"
  if [[ -f "$_skill" ]] && grep -q "impeccable" "$_skill"; then
    echo "  ✓ SKILL.md 含 impeccable 引用（方法论引用层第 5 对象）"
  else
    warn "SKILL.md 未含 impeccable 引用（impeccable 吸收载体 ②，应在方法论引用表加第 5 行）"
    _warn=$((_warn+1))
  fi

  # ③ facts.conf 口径同步（warn-only，对齐 G10 风格）
  if [[ "${FACT_RUNTIMES_METHOD:-0}" -ne 5 ]]; then
    warn "facts.conf FACT_RUNTIMES_METHOD=${FACT_RUNTIMES_METHOD:-（未设）} ≠ 5（impeccable 加入方法论引用层应同步为 5）"
    _warn=$((_warn+1))
  else
    echo "  ✓ facts.conf FACT_RUNTIMES_METHOD=5（方法论引用层 5 对象）"
  fi
  if [[ "${FACT_RUNTIMES:-0}" -ne 13 ]]; then
    warn "facts.conf FACT_RUNTIMES=${FACT_RUNTIMES:-（未设）} ≠ 13（impeccable + codex-security 加入后应同步运行时总数为 13）"
    _warn=$((_warn+1))
  else
    echo "  ✓ facts.conf FACT_RUNTIMES=13（13 个外部运行时，含 codex-security CLI 整合）"
  fi

  if [[ $_missing -gt 0 ]]; then
    echo "  ⚠ 前端设计方法论 absorb 载体缺失 ${_missing} 项（fail）"
  elif [[ $_warn -gt 0 ]]; then
    echo "  ℹ 前端设计方法论 absorb 叙事/口径漂移 ${_warn} 项（warn-only，不阻断）"
  else
    echo "  ✓ 前端设计方法论 absorb 三载体一致（references + SKILL.md + facts.conf）"
  fi
}
check_frontend_design_methodology

# ===== context-engineering-layering 引用存在性断言（G14，2026-07-27 Vibe编码文章吸收）=====
# 上下文工程分层方法论（Prompt U 型曲线 / minimal≠short / 六层上下文模型 / Prompt=model adapter）：
#   - references/context-engineering-layering.md 必须存在且非空（absorb 载体 ① references 文档）
#   - SKILL.md 须含 context-engineering-layering 引用（absorb 载体 ② SKILL.md 叙事）
#   - facts.conf FACT_REFERENCES 同步（口径同步硬约束，当前=33）
# 此断言守 absorb 三载体的一致性，不计入 FACT_GATES_TOTAL=55（决策 27 第 4 条：G<N> 是合规扩展点）。
# 风格：对齐 G13 warn-only——文件缺失才 fail，叙事/口径漂移只 warn。
# 注：本文为"非运行时纯方法论"吸收（不进 FACT_RUNTIMES=12 / FACT_RUNTIMES_METHOD=5），
#    只 +1 FACT_REFERENCES——与 impeccable（运行时+方法论双栖，进 12/5）区分。
check_context_engineering_layering() {
  local base; base="$(cd "$(dirname "$0")/.." && pwd)"
  local facts="$base/assets/facts.conf"
  [[ -f "$facts" ]] || return 0
  if [[ -z "${FACT_REFERENCES:-}" ]]; then
    set +u; # shellcheck disable=SC1090
    source "$facts"; set -u
  fi
  echo "▶ 上下文工程分层方法论引用存在性断言（G14，2026-07-27 Vibe编码文章吸收）"
  local _missing=0 _warn=0

  # ① references/context-engineering-layering.md 存在且非空
  local _ref="$base/references/context-engineering-layering.md"
  if [[ ! -f "$_ref" ]]; then
    warn "references/context-engineering-layering.md 缺失（context-engineering 吸收载体 ①，应新增该文件）"
    _missing=$((_missing+1)); FAIL=1
  elif [[ ! -s "$_ref" ]]; then
    warn "references/context-engineering-layering.md 为空（context-engineering 吸收载体 ①，应填充内容）"
    _missing=$((_missing+1)); FAIL=1
  else
    echo "  ✓ references/context-engineering-layering.md 存在且非空"
  fi

  # ② SKILL.md references 清单含 context-engineering-layering
  local _skill="$base/SKILL.md"
  if [[ -f "$_skill" ]] && grep -q "context-engineering-layering" "$_skill"; then
    echo "  ✓ SKILL.md 含 context-engineering-layering 引用（references 清单 + 吸收引文块）"
  else
    warn "SKILL.md 未含 context-engineering-layering 引用（context-engineering 吸收载体 ②，应在 references 清单与吸收引文块加行）"
    _warn=$((_warn+1))
  fi

  # ③ facts.conf 口径同步（warn-only，对齐 G13 风格）
  # references 数随方法论吸收递增（context-engineering-layering/codex-security-methodology/
  # generation-flow/cordis-composability-methodology 等）。真值由自动计数得出，FACT_REFERENCES 跟随同步。
  # 六轮复盘改进：不再硬编码期望值（原写死 35），改为与实际 ls 计数对比——加 reference 时无需改此处。
  local _ref_true; _ref_true=$(ls "$base"/references/*.md 2>/dev/null | grep -v '/frameworks/' | wc -l | tr -d ' ')
  if [[ "${FACT_REFERENCES:-0}" -ne "$_ref_true" ]]; then
    warn "facts.conf FACT_REFERENCES=${FACT_REFERENCES:-（未设）} ≠ 实际 ${_ref_true}（references 文档数须同步口径）"
    _warn=$((_warn+1))
  else
    echo "  ✓ facts.conf FACT_REFERENCES=${FACT_REFERENCES}（references 文档数同步）"
  fi

  if [[ $_missing -gt 0 ]]; then
    echo "  ⚠ 上下文工程分层 absorb 载体缺失 ${_missing} 项（fail）"
  elif [[ $_warn -gt 0 ]]; then
    echo "  ℹ 上下文工程分层 absorb 叙事/口径漂移 ${_warn} 项（warn-only，不阻断）"
  else
    echo "  ✓ 上下文工程分层 absorb 三载体一致（references + SKILL.md + facts.conf）"
  fi
}
check_context_engineering_layering

# ===== codex-security CLI 整合存在性断言（G15，openai/codex-security v0.1.4 吸收）=====
# codex-security v0.1.4 作为 CLI 整合层第 4 对象（决策 27 吸收）：
#   - references/codex-security-methodology.md 必须存在且非空（absorb 载体 ① references 文档）
#   - SKILL.md CLI 整合表须含 codex-security（absorb 载体 ② SKILL.md 叙事）
#   - facts.conf FACT_RUNTIMES=13 / FACT_RUNTIMES_CLI=4（口径同步硬约束）
# 此断言守 absorb 三载体的一致性，不计入 FACT_GATES_TOTAL=55（决策 27 第 4 条：G<N> 是合规扩展点）。
# 风格：对齐 G13/G14 warn-only——文件缺失才 fail，叙事/口径漂移只 warn。
check_codex_security_cli_wiring() {
  local base; base="$(cd "$(dirname "$0")/.." && pwd)"
  local facts="$base/assets/facts.conf"
  [[ -f "$facts" ]] || return 0
  if [[ -z "${FACT_RUNTIMES:-}" ]]; then
    set +u; # shellcheck disable=SC1090
    source "$facts"; set -u
  fi
  echo "▶ codex-security CLI 整合存在性断言（G15，openai/codex-security v0.1.4 吸收）"
  local _missing=0 _warn=0

  # ① references/codex-security-methodology.md 存在且非空
  local _ref="$base/references/codex-security-methodology.md"
  if [[ ! -f "$_ref" ]]; then
    warn "references/codex-security-methodology.md 缺失（codex-security 吸收载体 ①，应新增该文件）"
    _missing=$((_missing+1)); FAIL=1
  elif [[ ! -s "$_ref" ]]; then
    warn "references/codex-security-methodology.md 为空（codex-security 吸收载体 ①，应填充内容）"
    _missing=$((_missing+1)); FAIL=1
  else
    echo "  ✓ references/codex-security-methodology.md 存在且非空"
  fi

  # ② SKILL.md CLI 整合表含 codex-security
  local _skill="$base/SKILL.md"
  if [[ -f "$_skill" ]] && grep -q "codex-security" "$_skill"; then
    echo "  ✓ SKILL.md 含 codex-security 引用（CLI 整合层第 4 对象）"
  else
    warn "SKILL.md 未含 codex-security 引用（codex-security 吸收载体 ②，应在 CLI 整合表加第 4 行）"
    _warn=$((_warn+1))
  fi

  # ③ facts.conf 口径同步（warn-only，对齐 G13/G14 风格）
  if [[ "${FACT_RUNTIMES_CLI:-0}" -ne 4 ]]; then
    warn "facts.conf FACT_RUNTIMES_CLI=${FACT_RUNTIMES_CLI:-（未设）} ≠ 4（codex-security 加入 CLI 整合层应同步为 4）"
    _warn=$((_warn+1))
  else
    echo "  ✓ facts.conf FACT_RUNTIMES_CLI=4（CLI 整合层 4 对象）"
  fi
  if [[ "${FACT_RUNTIMES:-0}" -ne 13 ]]; then
    warn "facts.conf FACT_RUNTIMES=${FACT_RUNTIMES:-（未设）} ≠ 13（codex-security 加入应同步运行时总数为 13）"
    _warn=$((_warn+1))
  else
    echo "  ✓ facts.conf FACT_RUNTIMES=13（13 个外部运行时）"
  fi

  if [[ $_missing -gt 0 ]]; then
    echo "  ⚠ codex-security absorb 载体缺失 ${_missing} 项（fail）"
  elif [[ $_warn -gt 0 ]]; then
    echo "  ℹ codex-security absorb 叙事/口径漂移 ${_warn} 项（warn-only，不阻断）"
  else
    echo "  ✓ codex-security absorb 三载体一致（references + SKILL.md + facts.conf）"
  fi
}
check_codex_security_cli_wiring
# ===== 标记沿调用链传播断言（G16，决策 28，Palantir markings-propagate 映射）=====
# 决策 28：稳定单元标注是 file-glob 级静态属性，
# 不沿调用链传播——`--stable-diff` 防直接改稳定单元，防不了"改下游依赖间接破坏契约"。
# G16 断言守"下游影响域"标注的覆盖率：
#   - references/exploration-guide.md §11g 含"下游影响域"段（填充指引载体，warn-only）
#   - assets/precheck.arch.conf 含 STABLE_PROPAGATE / STABLE_PROPAGATE_HOPS（开关载体）
#   - facts.conf 含 FACT_STABLE_PROPAGATE / FACT_STABLE_PROPAGATE_HOPS（口径同步）
# 此断言守 absorb 三载体的一致性，不计入 FACT_GATES_TOTAL=55（决策 27 第 4 条：G<N> 是合规扩展点）。
# 风格：对齐 G13/G14/G15 warn-only——开关缺失才 fail，叙事/口径漂移只 warn。
# 目标技能（生成产物）不强制此断言——下游影响域是 swarm-yuan 自身的探查方法论吸收，
# 目标技能的 reference-manual.md §5 是否含 stable-propagate 标记由 AI 探查时按需填（不 fail）。
check_stable_propagate_wiring() {
  local base; base="$(cd "$(dirname "$0")/.." && pwd)"
  local facts="$base/assets/facts.conf"
  [[ -f "$facts" ]] || return 0
  if [[ -z "${FACT_STABLE_PROPAGATE:-}" ]]; then
    set +u; # shellcheck disable=SC1090
    source "$facts"; set -u
  fi
  echo "▶ 标记沿调用链传播断言（G16，决策 28，Palantir markings-propagate 映射）"
  local _missing=0 _warn=0

  # ① assets/precheck.arch.conf 含 STABLE_PROPAGATE / STABLE_PROPAGATE_HOPS（开关载体）
  local _arch="$base/assets/precheck.arch.conf"
  if [[ -f "$_arch" ]] && grep -qE '^STABLE_PROPAGATE=' "$_arch" && grep -qE '^STABLE_PROPAGATE_HOPS=' "$_arch"; then
    echo "  ✓ precheck.arch.conf 含 STABLE_PROPAGATE + STABLE_PROPAGATE_HOPS（开关载体）"
  else
    warn "precheck.arch.conf 缺 STABLE_PROPAGATE/STABLE_PROPAGATE_HOPS（决策 28 开关载体，应补）"
    _missing=$((_missing+1)); FAIL=1
  fi
  # _default_conf 兜底也须含（防 set -u 崩 + 目标技能 conf 缺时降级）
  local _pc="$base/assets/precheck.sh"
  if [[ -f "$_pc" ]] && grep -qE '^\s*STABLE_PROPAGATE=1\b' "$_pc" && grep -qE '^\s*STABLE_PROPAGATE_HOPS=1\b' "$_pc"; then
    echo "  ✓ precheck.sh _default_conf 含 STABLE_PROPAGATE 兜底"
  else
    warn "precheck.sh _default_conf 缺 STABLE_PROPAGATE/STABLE_PROPAGATE_HOPS 兜底（set -u 保护）"
    _warn=$((_warn+1))
  fi

  # ② references/exploration-guide.md 含"下游影响域"段（填充指引载体，warn-only——
  #    这是给 AI 探查时填特征卡第 11 项 §11g 的指引，swarm-yuan 自身有即可，目标技能不强求）
  local _exp="$base/references/exploration-guide.md"
  if [[ -f "$_exp" ]] && grep -qE '下游影响域' "$_exp"; then
    echo "  ✓ references/exploration-guide.md 含'下游影响域'段（填充指引载体）"
  else
    warn "references/exploration-guide.md 缺'下游影响域'段（决策 28 填充指引载体，应补 §11g）"
    _warn=$((_warn+1))
  fi

  # ③ facts.conf 口径同步（warn-only）
  if [[ "${FACT_STABLE_PROPAGATE:-0}" -ne 1 ]]; then
    warn "facts.conf FACT_STABLE_PROPAGATE=${FACT_STABLE_PROPAGATE:-（未设）} ≠ 1（决策 28 启用标志）"
    _warn=$((_warn+1))
  else
    echo "  ✓ facts.conf FACT_STABLE_PROPAGATE=1"
  fi
  if [[ -z "${FACT_STABLE_PROPAGATE_HOPS:-}" ]]; then
    warn "facts.conf 缺 FACT_STABLE_PROPAGATE_HOPS（决策 28 默认跳数，应补=1）"
    _warn=$((_warn+1))
  else
    echo "  ✓ facts.conf FACT_STABLE_PROPAGATE_HOPS=${FACT_STABLE_PROPAGATE_HOPS}"
  fi

  # ④ check_stable_diff 传播段存在（gates-warn.sh 含 stable-propagate / 下游 文字）
  local _gw="$base/assets/gates-warn.sh"
  if [[ -f "$_gw" ]] && grep -qE 'STABLE_PROPAGATE' "$_gw"; then
    echo "  ✓ gates-warn.sh check_stable_diff 含传播段"
  else
    warn "gates-warn.sh check_stable_diff 缺传播段（决策 28 实现，应补 §3 段）"
    _missing=$((_missing+1)); FAIL=1
  fi

  if [[ $_missing -gt 0 ]]; then
    echo "  ⚠ 标记传播 absorb 载体缺失 ${_missing} 项（fail）"
  elif [[ $_warn -gt 0 ]]; then
    echo "  ℹ 标记传播 absorb 叙事/口径漂移 ${_warn} 项（warn-only，不阻断）"
  else
    echo "  ✓ 标记传播 absorb 四载体一致（arch.conf + exploration-guide + facts.conf + gates-warn.sh）"
  fi
}

# ===== G20：多字节相邻变量铁律自动检查（security-spec §6.1）=====
# 铁律：`$var中文` 须 `${var}`——bash 3.2 C-locale 下 $var 紧跟多字节字符会把其字节吞进
# 变量名，报 "<var><乱码>: unbound variable"。曾三次真实踩中（warn 行 / v2 run 脚本
# CORPUS 行 / --remove echo 行——后者是潜伏雷，正常 locale 不炸、C-locale 必炸）。
# 扫描范围：本仓全部 .sh 的【非注释行】（注释不执行，存量注释表述保留不扰动）。
# 违规即 fail（存量已清零，fail 严格成立）。
check_multibyte_var_adjacency() {
  local base; base="$(cd "$(dirname "$0")/.." && pwd)"
  echo "▶ 多字节相邻变量铁律（G20，security-spec §6.1：\$var 紧跟全角标点须 \${var}）"
  local hits=0
  # 原逐行 printf|grep fork 循环扫 22.7k 行耗 11min35s
  # （fork 风暴；G24 check_portability 已有同款问题先例与预筛解法）。向量化为单 awk 进程/检查。
  # 注意 awk 正则是字节级的：全角标点字符类 [）。，…] 会按字节误匹配任意 CJK 第二三字节，
  # 必须写成全角字面量交替（（）|。|，…）保持与 grep -E 字符类等价的语义。
  # 先按存在性收敛文件清单（生成物侧 self-check 无 ../verifier，glob 原样传给 awk 会 fatal）。
  local _g20_files=( ) _g
  for _g in "$base"/scripts/*.sh "$base"/assets/*.sh "$base"/assets/hooks/*.sh \
            "$base"/tests/*.sh "$base"/tests/e2e/*.sh \
            "$base"/../verifier/v1/*.sh "$base"/../verifier/v2/*.sh; do
    [[ -f "$_g" ]] && _g20_files+=( "$_g" )
  done
  if [[ ${#_g20_files[@]} -eq 0 ]]; then
    echo "  ✓ 无 \$var 紧跟多字节标点违规（无可扫描脚本）"
    return
  fi
  hits=$(awk '
    FNR == 1 { bn = FILENAME; sub(/.*\//, "", bn) }
    /^[[:space:]]*#/ { next }
    $0 ~ /\$[A-Za-z_][A-Za-z0-9_]*(）|。|，|：|；|（|！|？|·)/ {
      printf "  ✗ %s: %s\n", bn, $0 > "/dev/stderr"; c++
    }
    END { print c + 0 }
  ' "${_g20_files[@]}")
  hits="${hits:-0}"
  if [[ "$hits" -gt 0 ]]; then
    warn "多字节相邻变量违规 ${hits} 处——\$var 后紧跟全角标点须改 \${var} 形式（C-locale 下 unbound 崩溃）"
    FAIL=1
  else
    echo "  ✓ 无 \$var 紧跟多字节标点违规（全部 \${var} 形式）"
  fi
}
check_stable_propagate_wiring
check_multibyte_var_adjacency

# ===== G22：sed 正则方言铁律自动检查（决策 35 解法占有锚）=====
# BSD sed（macOS）不认 GNU 扩展：\s/\b/\w 被当字面字母（requests→requet 实证），
# BRE 的 \?/\+ 不支持。该类已被修三次——
# 散文纪律（security-spec §6.1）不防复发，机器扫描才占有解法。
# 范围与 G20 同（含 framework-gates）；只查 sed 类（grep -E 的 \s/\b 三平台现行版本
# 均支持，属存量容忍——新增代码仍应优先 POSIX 类）。违规即 fail（清零后严格成立）。
check_sed_regex_dialect() {
  local base; base="$(cd "$(dirname "$0")/.." && pwd)"
  echo "▶ sed 正则方言铁律（G22，security-spec §6.1：BSD 不认 GNU 扩展，POSIX 类 + sed -E 唯一合法）"
  local hits=0
  # 向量化（同 G20 注；单 awk 多文件，动态正则经 -v 传引号字符）
  local _g22_files=( ) _g
  for _g in "$base"/scripts/*.sh "$base"/assets/*.sh "$base"/assets/hooks/*.sh \
            "$base"/assets/framework-gates/*.sh \
            "$base"/tests/*.sh "$base"/tests/e2e/*.sh \
            "$base"/../verifier/v1/*.sh "$base"/../verifier/v2/*.sh; do
    [[ -f "$_g" ]] && _g22_files+=( "$_g" )
  done
  if [[ ${#_g22_files[@]} -eq 0 ]]; then
    echo "  ✓ 无 sed 正则方言违规（无可扫描脚本）"
    return
  fi
  hits=$(awk -v q1="'" -v q2='"' '
    FNR == 1 { bn = FILENAME; sub(/.*\//, "", bn) }
    /^[[:space:]]*#/ { next }
    $0 !~ /sed/ { next }
    {
      r1a = "sed[^|;]*" q1 "[^" q1 "]*\\\\[sbw]"
      r1b = "sed[^|;]*" q2 "[^" q2 "]*\\\\[sbw]"
      if ($0 ~ r1a || $0 ~ r1b) {
        printf "  ✗ %s: %s\n", bn, $0 > "/dev/stderr"; c++; next
      }
      if ($0 !~ /sed -E/) {
        r2 = "sed[^|;]*" q1 "[^" q1 "]*\\\\[?+]"
        if ($0 ~ r2) { printf "  ✗ %s: %s\n", bn, $0 > "/dev/stderr"; c++ }
      }
    }
    END { print c + 0 }
  ' "${_g22_files[@]}")
  hits="${hits:-0}"
  if [[ "$hits" -gt 0 ]]; then
    warn "sed 正则方言违规 ${hits} 处——BSD 不认 \\s/\\b/\\w 与 BRE \\?/\\+，改 POSIX 类 + sed -E（security-spec §6.1）"
    FAIL=1
  else
    echo "  ✓ 无 sed 正则方言违规（POSIX 类 + sed -E 纪律）"
  fi
}
check_sed_regex_dialect

# ===== G24：跨平台可移植性自动检查（麒麟老 bash 3.2 / Git Bash / BSD macOS，portability 轮固化）=====
# 三类坑散文纪律不防复发，机器扫描才占有解法：
#   ① 裸 mktemp（无模板）：BSD mktemp 无模板崩、GNU 在 CWD 创建污染目录——统一 ${TMPDIR:-/tmp} 模板；
#   ② GNU-only 命令：tac（BSD 无）、grep -P（PCRE）、sed -i 无备份后缀（GNU）、readlink -f（BSD 无）；
#   ③ bash 4+ 特性：declare -A/关联数组、mapfile、${var,,}/${var^^}（麒麟老 bash 3.2 崩）。
# 范围与 G22 同。违规即 fail（清零后严格成立）。
check_portability() {
  local base; base="$(cd "$(dirname "$0")/.." && pwd)"
  echo "▶ 跨平台可移植性铁律（G24：mktemp 带 TMPDIR 模板 / GNU-only 命令 / bash4 特性）"
  local hits=0 f
  local _g24_files=( )
  # 性能：行内逐条 grep 会 spawn O(行数×模式) 子进程（190 文件全量实测 2min+ 不可接受）。
  # 先一次 grep -lE 文件级预筛出含嫌疑词的文件，仅对它们进逐行循环（绝大多数文件零嫌疑词被跳过）。
  local _suspect_re='mktemp|(^|[|;&(]) *tac( |$)|grep -P|sed -i|readlink -f|(declare|local) -A|mapfile|readarray|\$\{[A-Za-z_][A-Za-z0-9_]*(,,|\^\^)'
  local files
  files="$(grep -lE "$_suspect_re" "$base"/scripts/*.sh "$base"/assets/*.sh "$base"/assets/hooks/*.sh \
           "$base"/assets/framework-gates/*.sh "$base"/tests/*.sh "$base"/tests/e2e/*.sh \
           "$base"/../verifier/v1/*.sh "$base"/../verifier/v2/*.sh 2>/dev/null)"
  for f in $files; do
    [[ -f "$f" ]] || continue
    # 检查器/lint 文件整文件豁免：它们以字面量引用 declare -A/readlink -f/mktemp 等做拦截，
    # 是"检测规则"而非"违规使用"（self-check.sh 的 check_portability 函数体、
    # verify-framework-ruleset.sh 的片段检查器、cost-report/detect-frameworks 等的兼容注释）。
    case "$f" in
      */scripts/self-check.sh|*/scripts/verify-framework-ruleset.sh) continue ;;
    esac
    _g24_files+=( "$f" )
  done
  if [[ ${#_g24_files[@]} -eq 0 ]]; then
    hits=0
  else
  # 内层逐行 fork 循环向量化为单 awk（\b 在 awk 无支持，改词边界等价式
  # (^|[^A-Za-z0-9_])word([^A-Za-z0-9_]|$)；引号字符经 -v 传入动态正则）
  hits=$(awk -v q1="'" -v q2='"' '
    FNR == 1 { bn = FILENAME; sub(/.*\//, "", bn) }
    /^[[:space:]]*#/ { next }
    {
      if ($0 ~ ("mktemp( -d)? *[" q1 q2 "]? *[\\);&|]") && $0 !~ /TMPDIR/) {
        printf "  ✗ %s: 裸 mktemp（补 ${TMPDIR:-/tmp} 模板）: %s\n", bn, $0 > "/dev/stderr"; c++; next
      }
      if ($0 ~ /(^|[|;&(]) *tac( |$)/) {
        printf "  ✗ %s: GNU-only tac（改 awk 倒序缓冲）: %s\n", bn, $0 > "/dev/stderr"; c++; next
      }
      if ($0 ~ /grep -P/) {
        printf "  ✗ %s: grep -P（PCRE，BSD/老 grep 无；改 grep -E）: %s\n", bn, $0 > "/dev/stderr"; c++; next
      }
      if ($0 ~ ("sed -i( |" q1 "|" q2 ")") && $0 !~ /sed -i\.bak/) {
        printf "  ✗ %s: sed -i 无备份后缀（GNU 写法；改 sed -i.bak+rm）: %s\n", bn, $0 > "/dev/stderr"; c++; next
      }
      if ($0 ~ /readlink -f/) {
        printf "  ✗ %s: readlink -f（BSD 无；改 $(cd+pwd) 替代）: %s\n", bn, $0 > "/dev/stderr"; c++; next
      }
      if ($0 ~ /(^|[^A-Za-z0-9_])(declare|local) -A([^A-Za-z0-9_]|$)/) {
        printf "  ✗ %s: declare -A（bash3.2 崩；用平行数组）: %s\n", bn, $0 > "/dev/stderr"; c++; next
      }
      if ($0 ~ /(^|[^A-Za-z0-9_])(mapfile|readarray)([^A-Za-z0-9_]|$)/) {
        printf "  ✗ %s: mapfile/readarray（bash4+；改 while read）: %s\n", bn, $0 > "/dev/stderr"; c++; next
      }
      if ($0 ~ /\$\{[A-Za-z_][A-Za-z0-9_]*(,,|\^\^)/) {
        printf "  ✗ %s: ${var,,}/${var^^}（bash4+；改 tr）: %s\n", bn, $0 > "/dev/stderr"; c++; next
      }
    }
    END { print c + 0 }
  ' "${_g24_files[@]}")
  fi
  hits="${hits:-0}"
  if [[ "$hits" -gt 0 ]]; then
    warn "跨平台可移植性违规 ${hits} 处——麒麟老 bash/Git Bash/BSD macOS 兼容性风险（SKILL.md 三平台铁律）"
    FAIL=1
  else
    echo "  ✓ 无跨平台可移植性违规（mktemp 模板 / GNU-only / bash4 特性）"
  fi
}
check_portability

# ===== 决策 35 创造锚：gate-enforce-level.conf 再生能力断言 =====
# 入库产物 + 生成器不被运行 = 占有产物但无法证明仍保有创造能力（费曼第一条）。
# 再生到临时 base（不动真文件）与现文件逐字节 diff——漂移即 fail。
check_enforce_level_regen() {
  local base; base="$(cd "$(dirname "$0")/.." && pwd)"
  local gen="$base/scripts/gen-enforce-level.sh" conf="$base/assets/gate-enforce-level.conf"
  [[ -f "$gen" && -f "$conf" ]] || return 0
  echo "▶ enforce-level 再生能力断言（决策 35 创造锚：入库产物须可逐字节再生）"
  local tmp; tmp="$(mktemp -d "${TMPDIR:-/tmp}/enforce-regen.XXXXXX")"
  mkdir -p "$tmp/scripts" "$tmp/assets"
  cp "$gen" "$tmp/scripts/"
  cp "$base/assets/precheck.sh" "$base"/assets/gates-*.sh "$tmp/assets/" 2>/dev/null
  bash "$tmp/scripts/gen-enforce-level.sh" >/dev/null 2>&1
  if [[ -f "$tmp/assets/gate-enforce-level.conf" ]] \
     && diff -q "$conf" "$tmp/assets/gate-enforce-level.conf" >/dev/null 2>&1; then
    echo "  ✓ gate-enforce-level.conf 可逐字节再生（创造能力在）"
  else
    warn "gate-enforce-level.conf 与 gen-enforce-level.sh 再生结果不一致——生成器或入库文件已漂移"
    FAIL=1
  fi
  rm -rf "$tmp"
}
check_enforce_level_regen

# ===== G21：framework-globs 快照对账（impl-conformance：快照消费者，关闭 §11 已知边界②）=====
# assets/rules.d/framework-globs.rules 是 conf 收缩的 glob 默认值快照（43 变量）。
# 本断言让它获得真实消费路径：arch.conf 里的 glob 变量集与值须与快照一致——
# 快照从"无消费者的数据副本"升级为"arch.conf glob 默认值的对账锚"（漂移即 warn）。
check_framework_globs_reconciliation() {
  local base; base="$(cd "$(dirname "$0")/.." && pwd)"
  local snap="$base/assets/rules.d/framework-globs.rules" arch="$base/assets/precheck.arch.conf"
  if [[ ! -f "$snap" || ! -f "$arch" ]]; then
    warn "framework-globs 快照或 arch.conf 缺失——G21 对账跳过（快照失锚）"; return 0
  fi
  local drift=0 total=0 var snap_val arch_val
  while IFS= read -r var; do
    [[ -z "$var" ]] && continue
    total=$((total+1))
    snap_val=$(grep -m1 "^${var}=" "$snap" | sed 's/#.*$//' | tr -d '[:space:]')
    arch_val=$(grep -m1 "^${var}=" "$arch" | sed 's/#.*$//' | tr -d '[:space:]')
    if [[ -z "$arch_val" ]]; then
      warn "G21 快照漂移：${var} 在快照但不在 precheck.arch.conf（删快照行或补 conf 变量）"
      drift=$((drift+1))
    elif [[ "$snap_val" != "$arch_val" ]]; then
      warn "G21 快照漂移：${var} 值不一致（快照=${snap_val} vs arch.conf=${arch_val}）——快照是默认值单一事实源，改值须两侧同步"
      drift=$((drift+1))
    fi
  done < <(grep -oE '^[A-Z_]+=' "$snap" | tr -d '=')
  [[ "$drift" -eq 0 ]] && echo "  ✓ framework-globs 快照对账：${total} 变量集与值均与 arch.conf 一致（G21，默认值漂移可检出）"
}
check_framework_globs_reconciliation

# ===== Cordis 时空可组合性方法论引用存在性断言（G17，DeepSeek Harness/Cordis 吸收）=====
# 决策 27（吸收优先于新增门禁）：Cordis 论文（A Programming Paradigm for Spatiotemporal
# Composability）提出"时间可组合性（移除时撤销副作用）+ 空间可组合性（响应式依赖管理）"，
# 与 swarm-yuan 的框架门禁标记区块（轻量可逆效应）、conf 变量（声明式协效应的缺失）、
# profile 分层（档位过滤 vs 增量 patch）有清晰对照。作为方法论引用层吸收（非运行时，
# 与 context-engineering-layering/frontend-design-methodology 同档）。
# G17 断言守 absorb 三载体一致性（warn-only，对齐 G13-G16），不计入 FACT_GATES_TOTAL=55。
check_cordis_composability_wiring() {
  local base; base="$(cd "$(dirname "$0")/.." && pwd)"
  local facts="$base/assets/facts.conf"
  [[ -f "$facts" ]] || return 0
  if [[ -z "${FACT_REFERENCES:-}" ]]; then
    set +u; # shellcheck disable=SC1090
    source "$facts"; set -u
  fi
  echo "▶ Cordis 时空可组合性方法论引用断言（G17，DeepSeek Harness 吸收）"
  local _warn=0

  # ① references/cordis-composability-methodology.md 存在且非空
  local _ref="$base/references/cordis-composability-methodology.md"
  if [[ -f "$_ref" ]] && [[ -s "$_ref" ]]; then
    echo "  ✓ references/cordis-composability-methodology.md 存在且非空"
  else
    warn "references/cordis-composability-methodology.md 缺失或为空（G17 方法论载体）"
    _warn=$((_warn+1))
  fi

  # ② SKILL.md 含 cordis 引用（方法论引用层整合）
  if grep -q 'cordis' "$base/SKILL.md" 2>/dev/null; then
    echo "  ✓ SKILL.md 含 cordis 引用（方法论引用层）"
  else
    warn "SKILL.md 缺 cordis 引用（G17 整合，应补 references 清单）"
    _warn=$((_warn+1))
  fi

  # ③ facts.conf FACT_REFERENCES 口径同步（35→36）
  local _ref_true; _ref_true=$(ls "$base"/references/*.md 2>/dev/null | grep -v '/frameworks/' | wc -l | tr -d ' ')
  if [[ "${FACT_REFERENCES:-0}" == "$_ref_true" ]]; then
    echo "  ✓ facts.conf FACT_REFERENCES=${FACT_REFERENCES}（与实际 references 计数一致）"
  else
    warn "facts.conf FACT_REFERENCES=${FACT_REFERENCES:-（未设）} ≠ 实际 ${_ref_true}（G17 新增 reference 后须同步口径）"
    _warn=$((_warn+1))
  fi

  if [[ $_warn -gt 0 ]]; then
    echo "  ℹ Cordis absorb 叙事/口径漂移 ${_warn} 项（warn-only，不阻断）"
  else
    echo "  ✓ Cordis absorb 三载体一致（references + SKILL.md + facts.conf）"
  fi
}

# ===== G25：文档索引双向一致性校验断言 =====
# 裂缝背景：46+ 档 references 各自带"路由表见 SKILL.md"头，但第六层长期散文泛列举——
# 约三分之一档位不按名出现（claude-code-capabilities/memory-persistence/review-methodology 等），
# 吸收物之间无整合清单（13 运行时/19 行 upstream-baseline/46 references 三者零对账）。
# references/capability-map.md 为吸收层整合单一事实源 + SKILL.md 第六层五类路由表化。
# 本断言（warn-only，对齐 G13-G17，不计入 FACT_GATES_TOTAL=55）守六面（序号=代码内检查序）：
#   ① 载体存在性：capability-map.md 存在且非空（清单本体）；
#   ② 未登记文档检查：references/*.md（不含 frameworks/ 与 capability-map 自身）basename 必须出现在 map；
#   ③ 失效引用检查：map 整合表中首列为纯档名的行，其档必须实存（防登记不存在的档）；
#   ④ 两级互指：SKILL.md 第六层必须引用 capability-map（路由表→清单）。
#   ⑤ 文档路由覆盖：references/*-methodology.md 每档必须可从 task-methodology-router.md
#      文档路由表到达（反向索引闭环：建档必整合、整合必可达）。
#   ⑥ 分发范围：*-methodology.md 必须随技能分发（UNIVERSAL_FILES）或在路由表标【生成器侧】——
#      分派目标侧可达（随技能分发补缺前实测 13 方法论仅 3 随技能分发，目标技能侧分派悬空）。
check_capability_map_wiring() {
  local base; base="$(cd "$(dirname "$0")/.." && pwd)"
  local map="$base/references/capability-map.md"
  echo "▶ 文档索引双向一致性校验断言（G25）"
  local _warn=0

  # ① 载体存在性（清单本体）
  if [[ -f "$map" ]] && [[ -s "$map" ]]; then
    echo "  ✓ references/capability-map.md 存在且非空"
  else
    warn "references/capability-map.md 缺失或为空（G25 整合清单载体）"
    echo "  ⊘ 跳过 G25 对账"
    return 0
  fi

  # ② 未登记文档检查：每个实存档必须被清单收录
  local orphans="" f b
  for f in "$base"/references/*.md; do
    [[ -f "$f" ]] || continue
    b="$(basename "$f" .md)"
    [[ "$b" == "capability-map" ]] && continue  # 清单自身不入清单
    if ! grep -q -- "$b" "$map" 2>/dev/null; then
      orphans="${orphans}${orphans:+ }$b"
    fi
  done
  if [[ -z "$orphans" ]]; then
    echo "  ✓ 未登记文档检查：全部 references 档被 capability-map 收录"
  else
    warn "G25 孤儿档（吸收未整合，须补 map 行或归档）：$orphans"
    _warn=$((_warn+1))
  fi

  # ③ 失效引用检查：清单表格首列纯档名行 → 档必须实存
  local ghosts="" tok
  for tok in $(awk -F'|' '/^\| [a-z0-9][a-z0-9-]* +\|/ { gsub(/ /, "", $2); if ($2 != "") print $2 }' "$map" 2>/dev/null); do
    if [[ ! -f "$base/references/$tok.md" ]]; then
      ghosts="${ghosts}${ghosts:+ }$tok"
    fi
  done
  if [[ -z "$ghosts" ]]; then
    echo "  ✓ 失效引用检查：清单登记档全部实存"
  else
    warn "G25 幽灵档（清单登记了不存在的档）：$ghosts"
    _warn=$((_warn+1))
  fi

  # ④ 两级互指：SKILL.md 第六层引用 capability-map
  if grep -q 'capability-map' "$base/SKILL.md" 2>/dev/null; then
    echo "  ✓ SKILL.md 引用 capability-map（路由表↔清单两级互指）"
  else
    warn "SKILL.md 缺 capability-map 引用（G25 两级互指断链）"
    _warn=$((_warn+1))
  fi

  # ⑤ 文档路由覆盖（反向索引闭环）：*-methodology.md 每档必须可从路由表到达
  local undispatched="" mf mb
  for mf in "$base"/references/*-methodology.md; do
    [[ -f "$mf" ]] || continue
    mb="$(basename "$mf" .md)"
    if ! grep -q -- "$mb" "$base/references/task-methodology-router.md" 2>/dev/null; then
      undispatched="${undispatched}${undispatched:+ }$mb"
    fi
  done
  if [[ -z "$undispatched" ]]; then
    echo "  ✓ 文档路由覆盖：全部 *-methodology.md 可从文档路由表到达"
  else
    warn "G25 分派落档（方法论不可从任务分派到达，须补路由表行）：$undispatched"
    _warn=$((_warn+1))
  fi

  # ⑥ 分发范围：references/*.md（除 capability-map 自身）凡被路由表
  # 引用，必须随技能分发（UNIVERSAL_FILES）或在路由表标【生成器侧】——路由表随技能分发而被分派的档不随技能分发
  # = 目标技能侧分派悬空（实锤 13 方法论仅 3 随技能分发；扩面首跑抓出 generation-flow/
  # template-spec/quality-management-standards 三处生成器侧引用未标注）。
  local unshipped="" sf sb
  for sf in "$base"/references/*.md; do
    [[ -f "$sf" ]] || continue
    sb="$(basename "$sf")"
    [[ "$sb" == "capability-map.md" ]] && continue  # 清单自身不入分派面
    # 只查被路由表引用的档（未引用的生成器侧文档无需标注——路由表是引用面的事实源）
    grep -qF -- "${sb%.md}" "$base/references/task-methodology-router.md" 2>/dev/null || continue
    if sed -n '/^UNIVERSAL_FILES=(/,/^)/p' "$base/scripts/generate-skill.sh" 2>/dev/null | grep -qF "$sb"; then
      continue
    fi
    if grep -F -- "${sb%.md}" "$base/references/task-methodology-router.md" 2>/dev/null | grep -q '【生成器侧】'; then
      continue
    fi
    unshipped="${unshipped}${unshipped:+ }$sb"
  done
  if [[ -z "$unshipped" ]]; then
    echo "  ✓ 分发范围：路由表引用的档全部随技能分发或标注【生成器侧】（分派目标侧可达）"
  else
    warn "G25 随技能分发缺口（路由表引用但目标技能无此档，须随技能分发或标【生成器侧】）：$unshipped"
    _warn=$((_warn+1))
  fi

  if [[ $_warn -gt 0 ]]; then
    echo "  ℹ 文档索引对账漂移 ${_warn} 项（warn-only，不阻断）"
  else
    echo "  ✓ 文档索引双向一致性校验通过（孤儿零 + 幽灵零 + 互指在 + 文档路由覆盖 + 分发范围）"
  fi
}
check_cordis_composability_wiring
check_capability_map_wiring

echo ""
[[ $FAIL -eq 0 ]] && echo "✓ 自检通过" || echo "⚠ 部分未通过（手动安装的需按提示操作后重跑）"
# ===== 本体层类型对账（objects/links/actions 三目录 vs 实现存证）=====
# 类型目录是承诺清单——每个类型声明了"实现存证"列；本断言抽可自动验证的存证点逐一对账。
# 类型与实现漂移（如 Fingerprint 脚本改名/四本账少一本）→ warn（advisory，本体层是口径不是门禁）。
check_ontology_types() {
  local base; base="$(cd "$(dirname "$0")/.." && pwd)"
  local onto="$base/assets/ontology"
  [[ -f "$onto/objects.md" ]] || { echo "  ⊘ 本体层缺失（assets/ontology/objects.md 不存在）——跳过对账"; return 0; }
  local hits=0 miss=0
  _o_check() { # $1=存证描述关键词 $2=待验证命令
    if eval "$2" >/dev/null 2>&1; then hits=$((hits+1)); else
      warn "本体类型对账失配：$1（$2 无实存）"; miss=$((miss+1))
    fi
  }
  # 独立持续体存证
  _o_check "Repository/PROJECT_DIR 变量"      "grep -q 'PROJECT_DIR' '$base/assets/precheck.conf'"
  _o_check "Generator/版本戳文件模板引用"      "grep -rq 'swarm-yuan-version' '$base/scripts/generate-skill.sh'"
  _o_check "Skill/status 字段翻转"            "grep -q 'status: draft' '$base/scripts/generate-skill.sh'"
  _o_check "RuleFile/rules.d 目录"            "ls '$base/assets/rules.d/'*.rules >/dev/null 2>&1"
  _o_check "Ledger/四本账引用"                "grep -q 'trace.jsonl' '$base/assets/trace-log.sh' && grep -q 'decisions.jsonl' '$base/assets/trace-log.sh' && grep -q 'gate-runs.jsonl' '$base/scripts/gate-report.sh' && grep -q 'gate-audit.jsonl' '$base/assets/hooks/fail-gate-hook.sh'"
  _o_check "HostCLI/双宿主渲染"               "grep -q 'codex-gate-wrapper' '$base/assets/tool-adapters/codex.sh'"
  # 特定依赖持续体的机器锚
  _o_check "StabilityMark/stability-audit"    "grep -q 'stability-audit' '$base/scripts/inventory-verify.sh'"
  _o_check "Fingerprint/指纹脚本"             "test -x '$base/scripts/project-fingerprint.sh'"
  # 类依赖持续体的失锚检测
  _o_check "Methodology/升级机制"             "grep -q '\-\-upgrade' '$base/scripts/generate-skill.sh'"
  _o_check "FrameworkRule/注入机制"           "grep -q 'inject-frameworks' '$base/scripts/generate-skill.sh'"
  # 发生体的记录载体
  _o_check "Decision/outcome 生命周期"        "grep -q 'outcome' '$base/assets/trace-log.sh'"
  _o_check "AuditClosure/goal_id+closure"    "grep -q 'goal_id' '$base/assets/trace-log.sh' && test -x '$base/scripts/audit-closure.sh'"
  # links.md 的锚抽验
  _o_check "represents/path-check"            "grep -q 'path-check' '$base/scripts/inventory-verify.sh'"
  _o_check "anchors/ref_trace_hash"           "grep -q 'ref_trace_hash' '$base/assets/trace-log.sh'"
  _o_check "plans/gate-plan"                 "test -x '$base/scripts/gate-plan.sh'"
  # actions.md 的治理载体抽验
  _o_check "mark_active/三关状态门"           "grep -q 'mark-active' '$base/scripts/generate-skill.sh'"
  _o_check "update_map_entry/inventory-update" "test -x '$base/scripts/inventory-update.sh'"
  _o_check "gate_deny/rules 三值求值器"       "test -x '$base/scripts/gate-rules.sh'"
  echo "  ✓ 本体类型对账：${hits} 实存命中${miss:+ / ${miss} 失配（详见上方 warn）}"
}
check_ontology_types

# ===== 孤儿资产扫描 + 层间反向引用 =====
# G18 孤儿资产（连接性 §4.5.2）：references/*.md 无"何时读我"路由头 = 无消费路径候选；
# rules.d/*.rules 无任何消费者引用 = 死规则。warn-only（advisory，与概念落地问责同构）。
check_r13_orphan_assets() {
  local base; base="$(cd "$(dirname "$0")/.." && pwd)"
  local orphans=0
  for f in "$base"/references/*.md; do
    [[ -f "$f" ]] || continue
    if ! head -3 "$f" 2>/dev/null | grep -q '何时读我'; then
      warn "孤儿资产候选：references/$(basename "$f") 无「何时读我」路由头（无消费路径）"
      orphans=$((orphans+1))
    fi
  done
  # 本体层同纪律：assets/ontology/*.md 随生成物分发，无路由头 = 无消费路径
  for f in "$base"/assets/ontology/*.md; do
    [[ -f "$f" ]] || continue
    if ! head -3 "$f" 2>/dev/null | grep -q '何时读我'; then
      warn "孤儿资产候选：assets/ontology/$(basename "$f") 无「何时读我」路由头（无消费路径）"
      orphans=$((orphans+1))
    fi
  done
  # rules.d 消费者：gate-rules.sh / fail-gate-hook 引用即活
  if [[ -d "$base/assets/rules.d" ]]; then
    _consumers=$(grep -rl "rules.d" "$base/scripts/gate-rules.sh" "$base/assets/hooks/fail-gate-hook.sh" 2>/dev/null | wc -l | tr -d ' ')
    [[ "$_consumers" -ge 1 ]] || warn "rules.d 存在但无消费者（gate-rules/fail-gate-hook 未引用）"
  fi
  # G23：forbid 必带替代方案的格式契约机器锚——此前仅 --persist 写入口有校验，
  # 数据文件本身无锚（手写/探查期生成的 rules.d 缺替代方案不可检出）。fail 级（底座当前 4/4 合规）。
  local _g23_bad=0 _g23_f _g23_hits
  for _g23_f in "$base"/assets/rules.d/*.rules; do
    [[ -f "$_g23_f" ]] || continue
    _g23_hits=$(grep -nE '→[[:space:]]*forbid' "$_g23_f" 2>/dev/null | grep -vE '替代[：:]' || true)
    if [[ -n "$_g23_hits" ]]; then
      warn "G23 forbid 缺替代方案：assets/rules.d/$(basename "$_g23_f")"
      printf '%s\n' "$_g23_hits" | while IFS= read -r _l; do echo "    ${_l}"; done
      _g23_bad=1
    fi
  done
  if [[ "$_g23_bad" -eq 1 ]]; then
    FAIL=1
  else
    echo "  ✓ G23 rules.d forbid 全带替代方案（格式契约机器锚）"
  fi
  [[ "$orphans" -eq 0 ]] && echo "  ✓ 孤儿资产扫描：references+ontology 全部带路由头（连接性）"
}

# G19 层间反向引用（结构性 §4.5.1）：references/ 硬编码 scripts/ 路径 = 地图依赖约束层（违单向性）。
# 例外：路由头/指引文本中的相对提及（含"scripts/"字样但为指针说明非 import）——判据：
# 引用形如 `bash scripts/xxx.sh` 的可执行调用且出现在代码语义行（以 | 或 ``` 起）外的指令句。
check_r13_layer_references() {
  local base; base="$(cd "$(dirname "$0")/.." && pwd)"
  local hits=0
  local _r13_files=( ) _f
  for _f in "$base"/references/*.md; do
    [[ -f "$_f" ]] && _r13_files+=( "$_f" )
  done
  if [[ ${#_r13_files[@]} -eq 0 ]]; then
    echo "  ✓ 层间反向引用：0（无可扫描 references）"
    return
  fi
  # 逐行 printf|sed + printf|grep 双 fork 循环向量化为单 awk（fence 状态机在 awk 内维护）
  while IFS= read -r _hit; do
    [[ -z "$_hit" ]] && continue
    warn "层间反向引用：$_hit"
    hits=$((hits+1))
  done < <(awk '
    FNR == 1 { bn = FILENAME; sub(/.*\//, "", bn); infence = 0 }
    /^```/ { infence = 1 - infence; next }
    /^\|/ || /^#/ || /^>/ { next }
    infence { next }
    {
      stripped = $0
      while (match(stripped, /`[^`]*`/)) {
        stripped = substr(stripped, 1, RSTART - 1) substr(stripped, RSTART + RLENGTH)
      }
      if (stripped ~ /bash +scripts\/|source +scripts\//) {
        line = $0
        if (length(line) > 80) line = substr(line, 1, 80)
        printf "references/%s 含对 scripts/ 的调用依赖（地图不应依赖约束层）：%s\n", bn, line
      }
    }
  ' "${_r13_files[@]}")
  [[ "$hits" -eq 0 ]] && echo "  ✓ 层间反向引用：0（references 不依赖 scripts）"
}
check_r13_orphan_assets
check_r13_layer_references

# 死代码防线（复盘固化）：exit $FAIL 之后不得再有可执行行——断言写在 exit 后 = 永不执行
_last_exit_line=$(grep -n '^exit \$FAIL$' "$0" | tail -1 | cut -d: -f1)
if [[ -n "$_last_exit_line" ]]; then
  _dead_lines=$(tail -n +"$((_last_exit_line+1))" "$0" | grep -cvE '^[[:space:]]*(#|$)')
  [[ "$_dead_lines" -eq 0 ]] || warn "self-check 尾部死代码：exit \$FAIL 后还有 ${_dead_lines} 行可执行内容（断言永不执行）"
fi

exit $FAIL



