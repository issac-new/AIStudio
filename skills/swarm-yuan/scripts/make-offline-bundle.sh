#!/usr/bin/env bash
# make-offline-bundle.sh — 离线安装包构建器（Windows 目标机；npm/pip 镜像可解决部分依赖）
#
# 产物：<out>/swarm-yuan-offline-<ver>.zip
#   swarm-yuan/            技能本体（离线完备：外部运行时未装时技能按诚实降级运行，不阻塞）
#   vendor/npm/*.tgz       清单中 npm 通道运行时的本地包（目标机 npm i -g ./xxx.tgz 免源安装）
#   vendor/pip/            清单中 pip 通道运行时（目标机 pip install --no-index --find-links 免源安装）
#   vendor/vendor-status.tsv  逐条清单对账（条目/实得文件/状态/失败原因）
#   SHA256SUMS             vendor 与技能包全文件校验和（install-offline.sh 安装前校验）
#   install-offline.bat/.sh/README-OFFLINE.md  Windows 入口 + 安装器 + 说明
#
# 用法：bash scripts/make-offline-bundle.sh [<输出目录>] [--allow-partial]
#   缺省输出 dist/。vendor 缺件时默认构建产物照常生成、退出码 1（诚实的部分包）；
#   --allow-partial 显式接受缺件并以 0 退出（缺件清单仍写入 vendor-status.tsv）。
# 清单：scripts/offline-manifest.conf（runtime|channel|spec|note；channel ∈ npm|pip|github）
#   github 通道运行时不入 vendor（源码仓不可免源分发）——README-OFFLINE 披露其离线不可得与降级语义。
# 依赖：zip、npm pack（在线拉包）；pip 通道需 pip download。缺 zip 降级 tar.gz。
set -euo pipefail

SELF_DIR="$(cd "$(dirname "$0")" && pwd)"
# 技能本体目录：默认构建器所在 scripts/ 的上级；保留 SWARM_YUAN_DIR 兼容入口。
SKILL_ROOT="${SWARM_YUAN_HOME:-${SWARM_YUAN_DIR:-$(cd "$SELF_DIR/.." && pwd)}}"
SWARM_YUAN_HOME="$SKILL_ROOT"
SWARM_YUAN_SOURCE_ROOT="${SWARM_YUAN_SOURCE_ROOT:-$(cd "$SWARM_YUAN_HOME/../.." && pwd)}"
[[ -f "$SKILL_ROOT/install.sh" ]] || { echo "✗ 技能目录无效（缺 install.sh）: $SKILL_ROOT——用 SWARM_YUAN_DIR=/path/to/swarm-yuan 指定" >&2; exit 1; }
MANIFEST="$SELF_DIR/offline-manifest.conf"
ALLOW_PARTIAL=0
NO_VENDOR=0
WITH_VENDOR=0
WITH_DOCS=0
WITH_GH_SRC=0
OUT_ROOT=""
for arg in "$@"; do
  case "$arg" in
    --allow-partial) ALLOW_PARTIAL=1 ;;
    --no-vendor) NO_VENDOR=1 ;;
    --with-vendor) WITH_VENDOR=1 ;;
    --with-docs) WITH_DOCS=1 ;;
    --with-github-src) WITH_GH_SRC=1 ;;
    --everything) NO_VENDOR=1; WITH_VENDOR=1; WITH_DOCS=1; WITH_GH_SRC=1 ;;  # R134 终口径：可经 npm/pip 源装的不内嵌（安装命令走源），只随包源装不了的
    -h|--help)
      echo "用法: bash $0 [<输出目录>] [--allow-partial] [--no-vendor] [--with-vendor] [--with-docs] [--with-github-src] [--everything]" >&2
      echo "  --with-docs      仓库 docs/ 档案随包（包根 docs/，设计文档/使用手册/轮档）" >&2
      echo "  --with-github-src  gstack/superpowers/ECC 源码包内嵌（MIT；按 src-pins/基线钉定，经 release-src-packages --no-upload 产出）" >&2
      echo "  --everything     = --no-vendor + --with-vendor(knowledge) + --with-docs + --with-github-src（零降级件：npm/pip 走源安装，包只带源装不了的）" >&2
      echo "  --no-vendor   不携带 npm/pip 通道运行时（目标机经镜像源安装）；清单行登记 skipped，不计缺件" >&2
      echo "  --with-vendor 携带 vendor-knowledge（默认排除；含第三方规范/版权材料，按需显式启用）" >&2
      exit 0 ;;
    -*) echo "✗ 未知参数: $arg" >&2; exit 1 ;;
    *) [[ -z "$OUT_ROOT" ]] || { echo "✗ 只接受一个输出目录参数" >&2; exit 1; }; OUT_ROOT="$arg" ;;
  esac
done
OUT_ROOT="${OUT_ROOT:-$SWARM_YUAN_SOURCE_ROOT/dist}"
VER="$(git -C "$SKILL_ROOT" describe --tags --always 2>/dev/null || echo unknown)"
VER="${VER#swarm-yuan-}"   # AIStudio tag 形如 swarm-yuan-v2.95.0，包名与版本文件只留 v 前缀
VER="${VER//\//-}"
BUNDLE_NAME="swarm-yuan-offline-$VER"
if [[ "$WITH_DOCS" -eq 1 && "$WITH_GH_SRC" -eq 1 && "$WITH_VENDOR" -eq 1 ]]; then
  BUNDLE_NAME="${BUNDLE_NAME}-everything"   # 零降级件（npm/pip 走源）——后缀不与 -novendor 叠用
elif [[ "$NO_VENDOR" -eq 1 ]]; then
  BUNDLE_NAME="${BUNDLE_NAME}-novendor"
fi

# npm 缺失不提前中止：逐条登记 failed 后由缺件策略统一裁决（始终产出 vendor-status.tsv）
[[ -f "$MANIFEST" ]] || { echo "✗ 清单缺失: $MANIFEST" >&2; exit 1; }
mkdir -p "$OUT_ROOT"
# R119：输出目录绝对化——相对路径 + npm 子命令 cd 会让日志重定向落到错误 cwd（8 个 npm 包全部漏拉实证）。
OUT_ROOT="$(cd "$OUT_ROOT" && pwd)"
# 暂存目录：构建全程在此完成；任何中途失败由 trap 整体清走，dist 旧产物保持原样。
STAGE="$(mktemp -d "$OUT_ROOT/.$BUNDLE_NAME.XXXXXX")"
# R135 修复（审计 R4）：信号路径同样清场（INT/TERM 显式退出码）
trap 'rm -rf "${STAGE:-}"' EXIT
trap 'rm -rf "${STAGE:-}"; exit 130' INT
trap 'rm -rf "${STAGE:-}"; exit 143' TERM
BUNDLE="$STAGE/$BUNDLE_NAME"
mkdir -p "$BUNDLE/vendor/npm" "$BUNDLE/vendor/pip"

echo "=== 构建离线安装包: $BUNDLE_NAME ==="
echo "  暂存: $STAGE"

# ① 技能本体（分发边界与 install.sh 一致：research/.swarm-yuan/offline-cache/ci 不入包）
echo "① 技能本体…"
SRC_BASE="$(basename "$SKILL_ROOT")"
mkdir -p "$BUNDLE/$SRC_BASE/scripts"
for item in "$SKILL_ROOT"/* "$SKILL_ROOT"/.[!.]*; do
  [[ -e "$item" ]] || continue
  base="$(basename "$item")"
  # R118：vendor-knowledge 为第三方规范/版权材料（MANIFEST 声明不分发），与 install.sh 同步排除。
  # R126-dist8：docs/ 补入排除——install.sh 装机侧有 rm -rf $dest/docs 补救（:263 一带），bundle 侧
  # 此前无对应排除，R125 重建生成器侧 docs/（预算例外台账等档案）后会被打进离线包，
  # 两条分发路径产物内容悄然分叉（历史实证：v2.83.0 包内嵌套上层 dist 包的自我污染残骸）。
  case "$base" in
    research|.swarm-yuan|offline-cache|ci|dist|docs) continue ;;
    vendor-knowledge) [[ "$WITH_VENDOR" -eq 1 ]] || continue ;;
  esac
  cp -R "$item" "$BUNDLE/$SRC_BASE/"
done
# 构建器与清单随包（目标机可重打包/核对版本口径）
cp "$SELF_DIR/make-offline-bundle.sh" "$SELF_DIR/offline-manifest.conf" "$BUNDLE/$SRC_BASE/scripts/"

# 版本溯源随包（R133）：包内无 .git，目标机 install.sh 的 git describe 落空——兜底读此文件，
# 离线安装的 .swarm-yuan-version 与 install.sh --version 不再是 unknown。
_bv_ver="$(git -C "$SKILL_ROOT" describe --tags --always 2>/dev/null || true)"
_bv_ver="${_bv_ver#swarm-yuan-}"
_bv_sha="$(git -C "$SKILL_ROOT" rev-parse --short HEAD 2>/dev/null || true)"
# 重写后 main 摸不到 swarm-yuan-* tag（describe 落 --always SHA）——CHANGELOG 首版本行兜底，
# 与 tag 可达时同格式 v<N>-g<sha>（main 侧 R133 既有机制，core 血统 tag 可达故无此块）
if [[ ! "$_bv_ver" =~ ^v[0-9] ]]; then
  _cv=$(sed -nE 's/^## \[(v[0-9]+\.[0-9]+\.[0-9]+)\].*/\1/p' "$SKILL_ROOT/CHANGELOG.md" 2>/dev/null | head -1 || true)
  [[ -n "$_cv" ]] && _bv_ver="${_cv}${_bv_sha:+-g$_bv_sha}"
fi
cat > "$BUNDLE/$SRC_BASE/.bundle-version" <<EOF
version=${_bv_ver:-unknown}
source_commit=${_bv_sha:-unknown}
built_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
bundle=${BUNDLE_NAME}
EOF

# ①b 技能根 docs/ 档案随包（R134 --with-docs）：放包根 docs/（不进技能目录——安装侧对 dest/docs
# 有清理惯例；档案是阅读材料，随解压目录常在即"不丢失"）。
if [[ "$WITH_DOCS" -eq 1 ]]; then
  if [[ -d "$SWARM_YUAN_HOME/docs" ]]; then
    cp -R "$SWARM_YUAN_HOME/docs" "$BUNDLE/docs/"
    echo "  ✓ docs/ 档案随包（$(find "$BUNDLE/docs" -type f | wc -l | tr -d ' ') 个文件）"
  else
    echo "  ⚠ --with-docs：仓库无 docs/ 目录，跳过" >&2
  fi
fi

# ①c gstack/superpowers/ECC 源码包内嵌（R134 --with-github-src，MIT 可分发；与公开 -src release 同内容同钉定）
if [[ "$WITH_GH_SRC" -eq 1 ]]; then
  mkdir -p "$BUNDLE/vendor/github"
  if bash "$SELF_DIR/release-src-packages.sh" --no-upload --out "$BUNDLE/vendor/github"; then
    echo "  ✓ github 源码包内嵌（gstack/superpowers/ECC + SRC-PINS.txt）"
  else
    echo "  ✗ github 源码包构建失败——everything 包不完整，中止（不允许静默缺件）" >&2
    exit 1
  fi
fi

# ② vendor：按清单通道拉包（在线侧动作；失败逐条如实登记，不静默吞掉）
echo "② vendor 运行时（npm/pip 本地包）…"
STATUS="$BUNDLE/vendor/vendor-status.tsv"
printf 'runtime\tchannel\tspec\tobtained_files\tstatus\treason\n' > "$STATUS"
npm_fail=0; pip_fail=0; gh_list=""; skipped_n=0
shopt -s nullglob
sanitize() { tr '\t\r\n' '   ' | sed 's/  */ /g' | cut -c1-200; }
while IFS='|' read -r rt ch spec _note; do
  case "$rt" in ''|'#'*) continue ;; esac
  # --no-vendor：npm/pip 通道不入包（目标机经镜像源按 spec 安装），逐条登记 skipped，不计缺件
  if [[ "$NO_VENDOR" -eq 1 && ( "$ch" == "npm" || "$ch" == "pip" ) ]]; then
    printf '%s\t%s\t%s\t\tskipped\t--no-vendor：本包不携带，目标机经镜像源安装（%s）\n' "$rt" "$ch" "$spec" "$spec" >> "$STATUS"
    echo "  · skipped（--no-vendor）: ${rt}（${ch} ${spec}）"
    skipped_n=$((skipped_n+1))
    continue
  fi
  case "$ch" in
    npm)
      _stage="$STAGE/npm-$rt"; mkdir -p "$_stage"; _log="$STAGE/npm-$rt.log"
      _obtained=""; _rc=0
      if command -v npm >/dev/null 2>&1; then
        (cd "$_stage" && npm pack "$spec" >"$_log" 2>&1 </dev/null) || _rc=$?
      else
        _rc=127; echo "npm 未安装（PATH 中无 npm）" >"$_log"
      fi
      if [[ "$_rc" -eq 0 ]]; then
        for f in "$_stage"/*; do
          [[ -f "$f" ]] || continue
          mv "$f" "$BUNDLE/vendor/npm/"
          _obtained="${_obtained:+$_obtained,}npm/$(basename "$f")"
        done
      fi
      if [[ -n "$_obtained" ]]; then
        printf '%s\tnpm\t%s\t%s\tok\t-\n' "$rt" "$spec" "$_obtained" >> "$STATUS"
        echo "  ✓ npm: ${rt}（${spec}）"
      else
        _why="npm pack 失败或未产出文件（exit=${_rc}）：$(tail -n 5 "$_log" 2>/dev/null | sanitize || true)"
        printf '%s\tnpm\t%s\t\tfailed\t%s\n' "$rt" "$spec" "$_why" >> "$STATUS"
        echo "  ✗ npm: ${rt}（${spec}）拉包失败——目标机走镜像安装或降级" >&2
        npm_fail=$((npm_fail+1))
      fi ;;
    pip)
      _stage="$STAGE/pip-$rt"; mkdir -p "$_stage"; _log="$STAGE/pip-$rt.log"
      _obtained=""; _rc=0
      # 用 python3 -m pip（裸 pip 可能是坏解释器垫片——brew 升级挪走旧 python 的实录坑）
      if command -v python3 >/dev/null 2>&1; then
        python3 -m pip download "$spec" -d "$_stage" --no-deps -q >"$_log" 2>&1 </dev/null || _rc=$?
      else
        _rc=127; echo "python3 未安装（PATH 中无 python3）" >"$_log"
      fi
      if [[ "$_rc" -eq 0 ]]; then
        for f in "$_stage"/*; do
          [[ -f "$f" ]] || continue
          mv "$f" "$BUNDLE/vendor/pip/"
          _obtained="${_obtained:+$_obtained,}pip/$(basename "$f")"
        done
      fi
      if [[ -n "$_obtained" ]]; then
        printf '%s\tpip\t%s\t%s\tok\t-\n' "$rt" "$spec" "$_obtained" >> "$STATUS"
        echo "  ✓ pip: ${rt}（${spec}）"
      else
        _why="pip download 失败或未产出文件（exit=${_rc}）：$(tail -n 5 "$_log" 2>/dev/null | sanitize || true)"
        printf '%s\tpip\t%s\t\tfailed\t%s\n' "$rt" "$spec" "$_why" >> "$STATUS"
        echo "  ✗ pip: ${rt}（${spec}）下载失败——目标机走镜像安装或降级" >&2
        pip_fail=$((pip_fail+1))
      fi ;;
    github)
      if [[ -f "$BUNDLE/vendor/github/${rt}-src.zip" ]]; then
        printf '%s\tgithub\t%s\tvendor/github/%s-src.zip\tok\t-\n' "$rt" "$spec" "$rt" >> "$STATUS"
        echo "  ✓ github(src): ${rt}（源码包已内嵌，install-offline.sh --with-github 安装）"
      else
        printf '%s\tgithub\t%s\t\t-excluded\t本包未携带源码包（--with-github-src 可内嵌；方法论引用不装也可运行）\n' "$rt" "$spec" >> "$STATUS"
        gh_list="$gh_list $rt"
      fi
      ;;
    *)
      printf '%s\t%s\t%s\t\tinvalid\t通道值非法（枚举 npm|pip|github）\n' "$rt" "$ch" "$spec" >> "$STATUS"
      echo "  ✗ 清单通道非法: ${rt}（${ch}）" >&2
      npm_fail=$((npm_fail+1)) ;;
  esac
done < "$MANIFEST"
shopt -u nullglob
MISSING=$((npm_fail+pip_fail))

# ③ 离线安装器（Windows 入口 .bat + bash 安装器 + 说明）
echo "③ 离线安装器…"
cat > "$BUNDLE/install-offline.sh" <<'IOF'
#!/usr/bin/env bash
# install-offline.sh — swarm-yuan 离线安装器（Windows 经 Git Bash 运行；同伴 .bat 为入口）
# 用法：bash install-offline.sh [--claude|--zcode|--codex|--cursor|--windsurf|--opencode|--gemini|--kimi|--hermes|--dsh|--ccswitch|--all]
#                 [--with-npm] [--with-pip]   # 默认只装技能本体；带旗标才装 vendor 运行时
#                 [--with-github] [--with-knowledge]
#   --with-github    装 vendor/github 内嵌源码包（gstack→~/.claude/skills + ./setup --no-browser；
#                     superpowers/ECC→~/.claude/plugins；MIT，与公开 -src release 同源）
#   --with-knowledge 把 vendor-knowledge（第三方知识资产）复制进已装技能目录（支付 profile 离线生成可用）
# 多宿主旗标逐个生效（每个旗标调用一次 install.sh）；--all 与其它宿主旗标同时给出时按 --all 一次安装。
# 安装前校验 SHA256SUMS（vendor 与技能包）；校验失败拒绝安装。
# 前置：bash（Git Bash）；运行时安装需 node+npm 或 python+pip——未随包条目经目标机 npm/pip 源安装（镜像源可达前提）。git 非必需（版本溯源随包 .bundle-version）。
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SKILL_DIR=""
for _c in "$HERE"/swarm-yuan "$HERE"/Swarm-yuan; do
  [[ -d "$_c" ]] && { SKILL_DIR="$_c"; break; }
done
[[ -z "$SKILL_DIR" ]] && { echo "✗ 未找到技能目录（$HERE/swarm-yuan）" >&2; exit 1; }

# 一键默认（用户指令）：无任何旗标 = 三平台（zcode/hermes/dsh）+ 运行时走源 + github 源码 + 知识入驻。
# 各段对缺失内容自动跳过（novendor→走源；无源码包/知识→披露跳过），显式旗标仍可指定单宿主。
WITH_NPM=1; WITH_PIP=1; WITH_GH=1; WITH_KNOW=1; WANT_ALL=0; HOSTS="" DEFAULT_HOSTS=1
while [[ $# -gt 0 ]]; do
  case "$1" in
    --with-npm) WITH_NPM=1; shift ;;
    --with-pip) WITH_PIP=1; shift ;;
    --with-github) WITH_GH=1; shift ;;
    --minimal) WITH_NPM=0; WITH_PIP=0; WITH_GH=0; WITH_KNOW=0; DEFAULT_HOSTS=0; shift ;;  # 关闭一键默认（只装技能本体/显式旗标）
    --with-knowledge) WITH_KNOW=1; shift ;;
    --all) WANT_ALL=1; shift ;;
    --claude|--zcode|--codex|--cursor|--windsurf|--opencode|--gemini|--kimi|--hermes|--dsh|--ccswitch) HOSTS="$HOSTS $1"; shift ;;
    *) echo "未知参数: $1" >&2; exit 1 ;;
  esac
done

sha_of() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | awk '{print $1}'
  else return 1; fi
}

echo "=== ⓪ 校验包完整性（SHA256SUMS）==="
SUMS="$HERE/SHA256SUMS"
if [[ ! -f "$SUMS" ]]; then
  echo "✗ 缺少 SHA256SUMS——离线包不完整或来源不可信，拒绝安装" >&2
  exit 1
fi
_checked=0; _bad=0
while IFS= read -r _line; do
  # R134：vendor-knowledge 文件名可含空格——按「hash␣␣path」整行切（read 双字段会在空格截断）
  # R135 修复（审计 R7）：先剥首个空格再剥一个前导空格——双空格分隔与文件名内双空格均保真
  _hash="${_line%% *}"
  _rel="${_line#* }"; _rel="${_rel# }"
  [[ -n "${_hash:-}" ]] || continue
  if [[ -z "${_rel:-}" ]]; then
    echo "  ✗ 校验和行格式非法: $_hash" >&2; _bad=$((_bad+1)); continue
  fi
  _checked=$((_checked+1))
  if [[ ! -f "$HERE/$_rel" ]]; then
    echo "  ✗ 缺文件: $_rel" >&2; _bad=$((_bad+1)); continue
  fi
  _actual="$(sha_of "$HERE/$_rel" || true)"
  if [[ -z "$_actual" ]]; then
    echo "  ✗ 无可用 sha256 工具（需 sha256sum 或 shasum）" >&2; exit 1
  fi
  if [[ "$_actual" != "$_hash" ]]; then
    echo "  ✗ 校验失败: $_rel" >&2; _bad=$((_bad+1))
  fi
done < "$SUMS"
if [[ "$_checked" -eq 0 ]]; then
  echo "✗ SHA256SUMS 为空，拒绝安装" >&2; exit 1
fi
if [[ "$_bad" -ne 0 ]]; then
  echo "✗ 完整性校验失败（$_bad/$_checked 项）——离线包损坏或被篡改，拒绝安装" >&2
  exit 1
fi
echo "  ✓ SHA256SUMS 校验通过（$_checked 个文件）"

install_one() {
  bash "$SKILL_DIR/install.sh" "$@" || exit $?
}

echo "=== ① 安装技能本体 ==="
if [[ "$WANT_ALL" -eq 1 ]]; then
  install_one --all
elif [[ -z "$HOSTS" && "$DEFAULT_HOSTS" -eq 1 ]]; then
  # R139：一键默认空检测回落通用安装（~/.claude/skills）——旧实现无脑 --all，空检测时
  # install.sh 直接 exit 1，技能本体一行没装就整包中止，与「诚实降级」承诺相悖。
  # （--all 显式旗标仍保持空检测即失败的严格语义，不放宽。）
  if bash "$SKILL_DIR/install.sh" --list </dev/null 2>/dev/null | grep -q '✅'; then
    echo "（一键默认（Windows .bat / macOS / Linux 同构）：自动检测本机全部已装 AI 工具安装；运行时走 npm/pip 源 + github 源码 + 知识资产自动装载——单宿主 --claude/--zcode/--hermes/--dsh/--ccswitch 等，或 --minimal 只装本体）"
    install_one --all
  else
    echo "（一键默认：未检测到已装 AI 工具——回落通用安装到 ~/.claude/skills/；单宿主 --claude/--zcode/--hermes 等可显式指定）"
    install_one
  fi
elif [[ -n "$HOSTS" ]]; then
  # shellcheck disable=SC2086
  for _h in $HOSTS; do install_one "$_h"; done
else
  install_one
fi

FAIL=0
# R133 两层安装：本地 vendor 包优先（全量包，免源）→ 未随包/拉包失败条目经目标机 npm/pip 源安装
# （--no-vendor 包=全部走源）。前提：目标机 npm/pip 源（内部镜像）可达，依赖树亦由源解析。逐条披露，不静默。
_ST="$HERE/vendor/vendor-status.tsv"
_rows_not_ok() {  # $1=npm|pip → 打印未随包条目的 spec（status≠ok：skipped/failed）
  [[ -f "$_ST" ]] || return 0
  awk -F'\t' -v ch="$1" 'NR>1 && $2==ch && $5!="ok" && $3!="" {print $3}' "$_ST"
}
if [[ "$WITH_NPM" -eq 1 ]]; then
  echo "=== ② npm 运行时（本地 vendor 包优先 → 未随包条目经目标机 npm 源）==="
  # R139：缺 node/npm 从逐条 FAIL 改披露式跳过——技能本体已装，运行时缺件按「诚实降级」
  # 语义披露跳过（旧实现报错文案还误导指向「检查 npm 源」）。
  if ! command -v npm >/dev/null 2>&1; then
    echo "  · 缺 node/npm——npm 运行时未安装（技能核心能力不受影响；装好 node 后重跑 bash install-offline.sh 可补装）" >&2
  else
  shopt -s nullglob 2>/dev/null || true
  _n=0
  for tgz in "$HERE"/vendor/npm/*.tgz; do
    [[ -e "$tgz" ]] || continue
    if npm install -g "$tgz"; then _n=$((_n+1)); else
      echo "  ✗ $(basename "$tgz") 本地包安装失败（可经 npm 源重试：npm i -g <包名>）" >&2
      FAIL=$((FAIL+1))
    fi
  done
  _r=0
  _list="$(_rows_not_ok npm)"
  while IFS= read -r _spec; do
    [[ -n "$_spec" ]] || continue
    echo "  · 未随包，经目标机 npm 源安装：npm i -g $_spec"
    if npm install -g "$_spec"; then _r=$((_r+1)); else
      echo "  ✗ npm i -g $_spec 失败（检查 npm 源/镜像：npm config get registry）" >&2
      FAIL=$((FAIL+1))
    fi
  done <<< "$_list"
  echo "  npm 运行时：本地包 $_n 个 + 源安装 $_r 个（失败 $FAIL 个）"
  fi
fi
if [[ "$WITH_PIP" -eq 1 ]]; then
  echo "=== ③ pip 运行时（本地 vendor 包优先 → 未随包条目经目标机 pip 源）==="
  if ! command -v python3 >/dev/null 2>&1; then
    echo "  · 缺 python3——pip 运行时未安装（技能核心能力不受影响；装好 python3 后重跑 bash install-offline.sh 可补装）" >&2
  else
    # 本地 wheel：包名从对账表读（wheel 文件名推导不可靠）；用 python3 -m pip（裸 pip 垫片可能坏解释器）
    _pkgs=""
    if [[ -f "$_ST" ]]; then
      while IFS=$'\t' read -r _rt _ch _spec _obt _status _reason; do
        [[ "$_ch" == "pip" && "$_status" == "ok" ]] || continue
        _pkgs="${_pkgs} ${_spec%%[=<>~]*}"
      done < "$_ST"
    fi
    if [[ -n "$_pkgs" ]]; then
      # shellcheck disable=SC2086
      if ! python3 -m pip install --no-index --find-links "$HERE/vendor/pip" --no-deps $_pkgs; then
        echo "  ✗ pip 本地包安装失败（可经 pip 源重试：pip install <包名>）" >&2
        FAIL=$((FAIL+1))
      fi
    fi
    _r=0
    _list="$(_rows_not_ok pip)"
    while IFS= read -r _spec; do
      [[ -n "$_spec" ]] || continue
      echo "  · 未随包，经目标机 pip 源安装：python3 -m pip install '$_spec'"
      if python3 -m pip install "$_spec"; then _r=$((_r+1)); else
        echo "  ✗ pip install $_spec 失败（检查 pip 源/镜像：pip config list）" >&2
        FAIL=$((FAIL+1))
      fi
    done <<< "$_list"
    echo "  pip 运行时：本地 wheel $( [[ -n "$_pkgs" ]] && echo 已装 || echo 无 ) + 源安装 $_r 个（失败 $FAIL 个）"
  fi
fi

# R134 --with-github：vendor/github 内嵌源码包安装（MIT；语义对齐 self-check install_from_src_release）
# 解压工具链 unzip → tar（bsdtar 识 zip）→ python3 zipfile 三级降级：Git for Windows
# 标准发行不带 unzip，旧实现裸调 unzip 缺件必报「解压失败」计 FAIL（R139 实抓）；
# 三者皆无=披露跳过不计 FAIL（对齐「装不上不影响技能核心能力」），包损坏仍计 FAIL。
_extract_zip() {  # $1=zip $2=dest → 0=成功 1=缺解压工具 2=解压失败（包损坏/被改动）
  local _tried=0
  mkdir -p "$2" 2>/dev/null || true
  if command -v unzip >/dev/null 2>&1; then
    _tried=1
    unzip -q "$1" -d "$2" 2>/dev/null && return 0
  fi
  if command -v tar >/dev/null 2>&1; then
    _tried=1
    tar -xf "$1" -C "$2" 2>/dev/null && return 0
  fi
  if command -v python3 >/dev/null 2>&1; then
    _tried=1
    python3 -c 'import sys,zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])' "$1" "$2" 2>/dev/null && return 0
  fi
  [[ "$_tried" -eq 0 ]] && return 1
  return 2
}
_gh_install_one() {  # $1=zip $2=dest $3=后置命令(可空)
  local _tmp; _tmp="$(mktemp -d "${TMPDIR:-/tmp}/ghsrc.XXXXXX")"
  _xrc=0; _extract_zip "$1" "$_tmp/x" || _xrc=$?
  if [[ "$_xrc" -eq 1 ]]; then
    echo "  · 跳过 $(basename "$1")：缺解压工具（unzip / bsdtar / python3 任一）——装好其一后重跑可补装，或手动解压到 $2" >&2
    rm -rf "$_tmp"; return 0
  fi
  if [[ "$_xrc" -ne 0 ]]; then
    echo "  ✗ $(basename "$1") 解压失败（包损坏或校验前被改动）" >&2; FAIL=$((FAIL+1)); rm -rf "$_tmp"; return 0
  fi
  local _inner; _inner="$(find "$_tmp/x" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | head -1 || true)"
  local _src="${_inner:-$_tmp/x}"
  mkdir -p "$2"
  if ! cp -R "$_src"/. "$2/" 2>/dev/null; then
    echo "  ✗ 复制到 $2 失败（目标存在同名冲突请先清理）" >&2; FAIL=$((FAIL+1)); rm -rf "$_tmp"; return 0
  fi
  rm -rf "$_tmp"
  if [[ -n "$3" ]] && ! ( cd "$2" && bash -c "$3" ); then
    echo "  ✗ $2 后置命令失败：$3" >&2; FAIL=$((FAIL+1))
  fi
}
if [[ "$WITH_GH" -eq 1 ]]; then
  echo "=== ④ github 源码包（gstack/superpowers/ECC，MIT；钉定 SHA 见 vendor/github/SRC-PINS.txt）==="
  _ghn=0
  if [[ -f "$HERE/vendor/github/gstack-src.zip" ]]; then
    # gstack setup 需 Bun：缺失时经目标机 npm 源补装（走源前提）
    if ! command -v bun >/dev/null 2>&1; then
      echo "  · gstack setup 需 Bun，未检出——经 npm 源安装：npm i -g bun"
      npm install -g bun || echo "  ⚠ bun 安装失败（gstack setup 可能不完整，可装好后重跑 ./setup --no-browser）" >&2
    fi
    _gh_install_one "$HERE/vendor/github/gstack-src.zip" "$HOME/.claude/skills/gstack" "./setup --no-browser"
    _ghn=$((_ghn+1))
  else
    echo "  · 本包未内嵌 gstack-src.zip（构建加 --with-github-src）"
  fi
  for _p in superpowers ecc; do
    if [[ -f "$HERE/vendor/github/${_p}-src.zip" ]]; then
      _gh_install_one "$HERE/vendor/github/${_p}-src.zip" "$HOME/.claude/plugins/${_p}" ""
      _ghn=$((_ghn+1))
    else
      echo "  · 本包未内嵌 ${_p}-src.zip"
    fi
  done
  echo "  github 源码包安装 ${_ghn} 件（失败 $FAIL 个）；gstack 浏览器面默认 --no-browser（Chromium 离线不可引导=环境限制，非包缺件）"
fi
if [[ "$WITH_KNOW" -eq 1 ]]; then
  echo "=== ⑤ vendor-knowledge 知识资产入驻已装技能目录 ==="
  _kn=0
  if [[ -d "$SKILL_DIR/vendor-knowledge" ]]; then
    for _d in "$HOME/.claude/skills/swarm-yuan" "$HOME/.zcode/skills/swarm-yuan" "$HOME/.codex/skills/swarm-yuan" \
              "$HOME/.cursor/skills/swarm-yuan" "$HOME/.codeium/windsurf/skills/swarm-yuan" "$HOME/.config/opencode/skills/swarm-yuan" \
              "$HOME/.gemini/skills/swarm-yuan" "$HOME/.kimi-code/skills/swarm-yuan" "$HOME/.kimi/skills/swarm-yuan" \
              "$HOME/.hermes/skills/swarm-yuan" "$HOME/.dsh/skills/swarm-yuan" "$HOME/.cc-switch/skills/swarm-yuan"; do
      if [[ -d "$_d" ]]; then
        if cp -R "$SKILL_DIR/vendor-knowledge" "$_d/"; then _kn=$((_kn+1)); else
          echo "  ✗ 复制到 $_d 失败" >&2; FAIL=$((FAIL+1))
        fi
      fi
    done
    echo "  vendor-knowledge 入驻 ${_kn} 个已装技能目录（支付 profile 离线生成可用）"
  else
    echo "  · 本包未携带 vendor-knowledge（构建加 --with-vendor/--everything）"
  fi
fi

if [[ "$FAIL" -ne 0 ]]; then
  echo "=== 安装未完成：$FAIL 项失败（详见上方逐条披露）==="
  exit 1
fi
echo "=== 离线安装完成 ==="
echo "后续：对 AI 说「为 /path/to/project 生成开发技能」；外部运行时缺装时技能按诚实降级运行（披露不阻塞）——详见 README-OFFLINE.md"
IOF
chmod +x "$BUNDLE/install-offline.sh"

cat > "$BUNDLE/install-offline.bat" <<'IEOF'
@echo off
rem swarm-yuan 离线安装入口（Windows）：自动查找 bash 并运行 install-offline.sh（R128 起与 install.bat 同构）
rem R128 对齐 install.bat：where bash 加 \Git\ 过滤（裸 where 会先命中 WSL 的 System32\bash.exe）、
rem 参数 Win32 盘符路径转 POSIX（swarm-yuan:argv-posix-convert v1）、WSL 模式 HOME 修正（wslpath）。
rem 注意：本模板由 scripts/make-offline-bundle.sh 生成，Windows 实机未验证（静态审查口径）。

setlocal enabledelayedexpansion

rem 查找 bash（优先级：Git Bash > WSL > MSYS2；与 install.bat 一致）
set "BASH_CMD="
set "BASH_KIND="

rem 1. Git for Windows 默认路径（含空格，优先于 where bash，符合 Git Bash>WSL>MSYS2 优先级）
if exist "C:\Program Files\Git\bin\bash.exe" ( set "BASH_CMD=C:\Program Files\Git\bin\bash.exe" & set "BASH_KIND=gitbash" & goto :found )
if exist "C:\Program Files (x86)\Git\bin\bash.exe" ( set "BASH_CMD=C:\Program Files (x86)\Git\bin\bash.exe" & set "BASH_KIND=gitbash" & goto :found )

rem 2. where bash -- 仅当命中路径含 \Git\ 才认 Git Bash，避免误匹配 WSL 的 System32\bash.exe
for /f "delims=" %%i in ('where bash 2^>nul') do (
    echo %%i | findstr /i "\\Git\\" >nul 2>&1 && ( set "BASH_CMD=%%i" & set "BASH_KIND=gitbash" & goto :found )
)

rem 3. WSL（独立探查，不会被 where bash 短路）
where wsl >nul 2>&1 && ( set "BASH_CMD=wsl bash" & set "BASH_KIND=wsl" & goto :found )

rem 4. MSYS2
if exist "C:\msys64\usr\bin\bash.exe" ( set "BASH_CMD=C:\msys64\usr\bin\bash.exe" & set "BASH_KIND=msys2" & goto :found )

echo [ERROR] 未找到 bash——请先安装 Git for Windows（https://git-scm.com/download/win）或 WSL（wsl --install）。
exit /b 1

:found
echo 检测到 bash: !BASH_CMD! (!BASH_KIND!)

rem 获取脚本所在目录（去掉末尾反斜杠）
set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

rem 将 Windows 路径转换为 bash 路径（WSL 用 /mnt/c/，Git Bash/MSYS2 用 /c/）
set "BASH_DIR=%SCRIPT_DIR%"
set "BASH_DIR=!BASH_DIR:\=/!"
for %%d in (A B C D E F G H I J K L M N O P Q R S T U V W X Y Z) do (
    if "!BASH_KIND!"=="wsl" (
        set "BASH_DIR=!BASH_DIR:%%d:=/mnt/%%d!"
    ) else (
        set "BASH_DIR=!BASH_DIR:%%d:=/%%d!"
    )
)

rem swarm-yuan:argv-posix-convert v1 -- 参数 Win32 盘符路径转 POSIX（R128；与 install.bat 同块）
rem 背景：Git Bash 对 argv 不做 Win→POSIX 转换，%* 原样透传时 bash 侧路径判断恒假，静默失败。
rem 限制：参数含 ! 会被 delayedexpansion 改写；嵌套双引号不支持；UNC 与盘符相对路径不转换，原样透传。
set "SW_ARGV="
:sw_argv_loop
if [%1]==[] goto :sw_argv_done
set "SW_ARG=%~1"
if not defined SW_ARG (
    rem 空串参数（""）原样保留为一个空参数
    set "SW_ARGV=!SW_ARGV! """
    shift
    goto :sw_argv_loop
)
for %%d in (a b c d e f g h i j k l m n o p q r s t u v w x y z) do (
    if /i "!SW_ARG:~0,1!"=="%%d" if "!SW_ARG:~1,1!"==":" if "!SW_ARG:~2,1!"=="\" (
        set "SW_ARG=!SW_ARG:\=/!"
        if "!BASH_KIND!"=="wsl" ( set "SW_ARG=/mnt/%%d!SW_ARG:~2!" ) else ( set "SW_ARG=/%%d!SW_ARG:~2!" )
    )
)
set "SW_ARGV=!SW_ARGV! "!SW_ARG!""
shift
goto :sw_argv_loop
:sw_argv_done

rem 运行 install-offline.sh
if "!BASH_KIND!"=="wsl" (
    rem WSL：bash 的 HOME 默认是 Linux 用户目录，安装会落进 WSL 的 HOME（Windows 侧看不到）。
    rem 用 wslpath 把 Windows 用户目录转成 WSL 路径并显式作为 HOME；转换失败则明确报错（与 install.bat 对齐）。
    set "WSL_HOME="
    for /f "usebackq delims=" %%h in (`wsl wslpath -u "%USERPROFILE%" 2^>nul`) do set "WSL_HOME=%%h"
    if "!WSL_HOME!"=="" (
        echo [ERROR] WSL 模式下无法把 Windows 用户目录转换为 WSL 路径（wslpath 不可用）。
        echo   请改用 Git for Windows 自带的 Git Bash 运行 install-offline.bat（推荐），或手动设置 HOME。
        exit /b 1
    )
    echo WSL 模式：HOME 指向 Windows 用户目录 "!WSL_HOME!"
    wsl --exec env "HOME=!WSL_HOME!" bash "!BASH_DIR!/install-offline.sh" !SW_ARGV!
) else (
    "!BASH_CMD!" "!BASH_DIR!/install-offline.sh" !SW_ARGV!
)
IEOF
# R128：install-offline.bat 统一 CRLF 行尾（与仓内 .bat 一致；cmd 对 LF-only 批处理的解析无官方保证）。
# awk sub("$","\r") 为 BSD awk/gawk 通用的 unix2dos 惯用法（记录尾追加 \r，print 再补 \n）。
awk 'sub("$", "\r")' "$BUNDLE/install-offline.bat" > "$BUNDLE/.install-offline.bat.crlf" \
  && mv "$BUNDLE/.install-offline.bat.crlf" "$BUNDLE/install-offline.bat"

cat > "$BUNDLE/README-OFFLINE.md" <<'IMD'
# swarm-yuan 离线安装包（Windows）

## 前置条件（目标机）
- **Git for Windows**（提供 bash；技能脚本与门禁均为 bash——仓库三平台铁律：Windows 走 Git Bash。git 本身非必需：版本溯源随包 `.bundle-version`）
- AI 编码工具任一：Claude Code / Codex / Cursor / Windsurf / OpenCode / Gemini CLI / Kimi / ZCode
- 运行时安装（`--with-npm`/`--with-pip`）：node+npm、python+pip，且目标机 npm/pip 源（内部镜像）可达——未随包条目与依赖树均由源解析；不装运行时时核心能力亦离线完备
- 源码包安装（默认/everything 件）：需 unzip、bsdtar（tar）、python3 任一作解压工具（Git for Windows 标准发行不带 unzip）；三者皆缺时该件披露跳过，不影响技能本体

## 安装
1. 解压本包到任意目录（路径不含空格更稳）。
2. 双击 `install-offline.bat`（或在其目录开 Git Bash 跑 `bash install-offline.sh`）——自动检测已装 AI 工具并安装技能。
3. 指定目标：`install-offline.bat --claude`；多宿主：`--claude --cursor`（逐个安装）；全部：`--all`；连运行时一起装：`--all --with-npm --with-pip`（本地 vendor 包优先，未随包条目自动经 npm/pip 源安装）。
4. 安装器先校验 `SHA256SUMS`（vendor 与技能包全文件），校验失败拒绝安装。

## vendor 与镜像源说明
- `vendor/npm/*.tgz`、`vendor/pip/`：构建机预拉的本地产物包，安装免网络（npm i -g ./xxx.tgz；pip --no-index --find-links）。
- `vendor/vendor-status.tsv`：清单逐条对账（条目、实得文件、状态、失败原因）。`failed` 行即本包缺件；`skipped` 行=本包以 `--no-vendor` 构建、按口径不携带 npm/pip 包。`install-offline.sh --with-npm/--with-pip` 对 `skipped`/`failed` 行自动执行 `npm i -g <spec>` / `python3 -m pip install <spec>`（经目标机源安装），逐条披露结果。
- 前提与边界：目标机 npm/pip 源（内部镜像）可达；本地 vendor 包只含顶层包，**依赖树由源解析**（完全气隙环境需先把依赖同步进镜像）；装不上不影响技能核心能力（诚实降级）。github 通道仅剩方法论引用行（superpowers/gstack），无需安装。

## everything 全量件（--everything 构建，零降级口径）
- 组成：技能本体（含 `vendor-knowledge` 知识资产）+ 仓库 `docs/` 档案（包根 `docs/`，随解压目录常在）+ gstack/superpowers/ECC 源码包（`vendor/github/`，MIT，钉定 SHA 见 `SRC-PINS.txt`）+ npm/pip 顶层包 vendor。
- 安装：`bash install-offline.sh --all --with-npm --with-pip --with-github --with-knowledge`（--with-github 装 gstack/superpowers/ECC 到 ~/.claude；--with-knowledge 把 vendor-knowledge 复制进已装技能目录，支付 profile 离线生成可用）。
- 边界（如实）：gstack 浏览器面 `--no-browser`（Chromium 离线不可引导=环境限制，非包缺件）；npm/pip 依赖树由目标机源解析；vendor-knowledge 含第三方版权材料，本件不公开分发（仅本地/内部分发渠道）。

## 外部运行时的离线语义（诚实降级）
技能的深度运行时（代码图谱/记忆插件等）未安装时**不阻塞**：相关门禁与能力按「未装披露」降级运行。
核心能力（生成技能、门禁检查、spec-first 四层拦截、提交时 pre-commit）零外部依赖，离线完备。
GitHub 通道运行时空白清单见 scripts/offline-manifest.conf（channel=github 行）。

## 首次使用
对 AI 说：「为 /path/to/project 生成开发技能」。之后每个需求按 SKILL.md 九节点工作流协作。
IMD

# ④ 校验和（覆盖 vendor 与技能包；安装器逐条校验）
echo "④ 生成 SHA256SUMS…"
SUMTOOL=""
if command -v sha256sum >/dev/null 2>&1; then SUMTOOL="sha256sum"
elif command -v shasum >/dev/null 2>&1; then SUMTOOL="shasum -a 256"
else echo "✗ 缺 sha256sum/shasum，无法生成校验和" >&2; exit 1; fi
# R126：安装器自身入校验链——旧版只覆盖 vendor/ 与技能树，篡改 install-offline.sh/
# install-offline.bat/README-OFFLINE.md（注入任意命令）可绕过完整性校验，而
# README-OFFLINE 宣称「安装器先校验 SHA256SUMS」——完整性链在入口文件上断环。
# shellcheck disable=SC2086
( cd "$BUNDLE" && { find vendor "$SRC_BASE" -type f; [[ -d docs ]] && find docs -type f; printf '%s\n' install-offline.sh install-offline.bat README-OFFLINE.md; } \
    | LC_ALL=C sort -u | tr '\n' '\0' | xargs -0 $SUMTOOL ) > "$BUNDLE/SHA256SUMS"
SUM_N=$(wc -l < "$BUNDLE/SHA256SUMS" | tr -d ' ')
[[ "$SUM_N" -gt 0 ]] || { echo "✗ SHA256SUMS 为空" >&2; exit 1; }
echo "  ✓ SHA256SUMS 覆盖 $SUM_N 个文件（含安装器自身）"

# ⑤ 打包（zip 优先，缺 zip 降级 tar.gz；先删旧档避免 zip -qr 增量残留）
echo "⑤ 打包…"
ARCHIVE=""
if command -v zip >/dev/null 2>&1; then
  ARCHIVE="$BUNDLE_NAME.zip"
  ( cd "$STAGE" && rm -f "$ARCHIVE" && zip -qr "$ARCHIVE" "$BUNDLE_NAME" )
else
  ARCHIVE="$BUNDLE_NAME.tar.gz"
  ( cd "$STAGE" && tar -czf "$ARCHIVE" "$BUNDLE_NAME" )
fi

# ⑥ 发布：删除旧目录/旧档后原子 rename（同一文件系统内 rename 原子，dist 不出现半包）
echo "⑥ 发布到 ${OUT_ROOT}…"
rm -rf "${OUT_ROOT:?}/$BUNDLE_NAME"
mv "$BUNDLE" "$OUT_ROOT/$BUNDLE_NAME"
rm -f "$OUT_ROOT/$BUNDLE_NAME.zip" "$OUT_ROOT/$BUNDLE_NAME.tar.gz"
mv "$STAGE/$ARCHIVE" "$OUT_ROOT/$ARCHIVE"
ART="$OUT_ROOT/$ARCHIVE"

echo "=== 完成: $ART ==="
echo "  vendor: npm 失败 $npm_fail 个 / pip 失败 $pip_fail 个 / --no-vendor 跳过 $skipped_n 个 / github 通道不入（${gh_list:-无}）——详见 vendor/vendor-status.tsv"
du -sh "$ART" 2>/dev/null || true
if [[ "$MISSING" -gt 0 ]]; then
  if [[ "$ALLOW_PARTIAL" -eq 1 ]]; then
    echo "=== 部分构建：$MISSING 个 vendor 条目缺失（--allow-partial 已显式接受）===" >&2
  else
    echo "✗ 构建不完整：$MISSING 个 vendor 条目缺失（产物已生成，vendor-status.tsv 有失败原因）" >&2
    echo "  如确认接受缺件，请加 --allow-partial 重跑；否则修复拉包环境后重跑。" >&2
    exit 1
  fi
fi
