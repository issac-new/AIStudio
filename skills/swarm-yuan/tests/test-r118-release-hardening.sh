#!/usr/bin/env bash
# test-r118-release-hardening.sh — 离线包/源码包发布链行为测试（R118）
#
# 全程在 /tmp 内：假 HOME、假 npm/pip/gh（PATH 前置）、本地上游 git 仓库，无网络、无真实 gh。
# 覆盖：
#   ① 构建：成功构建的 vendor-status.tsv / SHA256SUMS 覆盖全部 vendor 与技能包
#   ② 构建：vendor 失败默认非零退出且如实登记，--allow-partial 才放行
#   ③ 构建：中途失败 trap 清理，不留半包、不破坏既有产物
#   ④ 安装器：install.sh 失败传播（非零、不打印完成）、多宿主旗标逐个生效、SHA256SUMS 校验
#   ⑤ 发布器：上传首败重试成功、资产缺失非零、commit 钉定写入 notes、SHA256SUMS 随发
#   ⑥ 清单对账：offline-manifest.conf 版本 vs docs/upstream-baseline.md（显式豁免可登记）
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"   # SWARM_YUAN_HOME
FAIL=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1" >&2; FAIL=1; }

TMPROOT="$(mktemp -d /tmp/swarm-yuan-r118.XXXXXX)"
if [[ "${KEEP_TMP:-0}" == "1" ]]; then
  trap 'echo "KEEP_TMP: $TMPROOT"' EXIT
else
  trap 'rm -rf "$TMPROOT"' EXIT
fi
export HOME="$TMPROOT/home"
export PATH="$TMPROOT/bin:$PATH"
mkdir -p "$HOME" "$TMPROOT/bin"

# ===== 假命令：npm / python3 / gh / xargs =====
cat > "$TMPROOT/bin/npm" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
case "${1:-}" in
  pack)
    spec="${2:-}"
    case "${FAKE_NPM_FAIL:-}" in *"$spec"*) echo "npm ERR! simulated pack failure: $spec" >&2; exit 1 ;; esac
    base="${spec//@/}"; base="${base//\//-}"
    echo "fake npm tarball: $spec" > "./${base}.tgz" ;;
  install)
    [[ "${FAKE_NPM_INSTALL_FAIL:-0}" == "1" ]] && { echo "npm ERR! simulated install failure" >&2; exit 1; }
    exit 0 ;;
  *) exit 0 ;;
esac
EOF
cat > "$TMPROOT/bin/python3" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
[[ "${1:-}" == "-m" && "${2:-}" == "pip" ]] || exit 0
shift 2
sub="${1:-}"; shift || true
case "$sub" in
  download)
    spec=""; dir=""
    while [[ $# -gt 0 ]]; do
      case "$1" in
        -d) dir="${2:-}"; shift 2 ;;
        -*) shift ;;
        *) spec="$1"; shift ;;
      esac
    done
    case "${FAKE_PIP_FAIL:-}" in *"$spec"*) echo "ERROR: simulated pip download failure: $spec" >&2; exit 1 ;; esac
    [[ -n "$dir" ]] || exit 1
    name="${spec%%==*}"; ver="${spec##*==}"
    echo "fake wheel: $spec" > "$dir/${name}-${ver}-py3-none-any.whl" ;;
  install) exit 0 ;;
esac
EOF
cat > "$TMPROOT/bin/xargs" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if [[ "${FAKE_XARGS_FAIL:-0}" == "1" ]]; then echo "xargs: simulated failure" >&2; exit 1; fi
exec /usr/bin/xargs "$@"
EOF
cat > "$TMPROOT/bin/gh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
S="${FAKE_GH_STATE:?FAKE_GH_STATE unset}"
mkdir -p "$S"; : >> "$S/calls.log"
echo "$*" >> "$S/calls.log"
cmd="${1:-}"; shift || true
case "$cmd" in
  auth) exit 0 ;;
  release)
    sub="${1:-}"; shift || true
    case "$sub" in
      view)
        tag="${1:-}"; shift || true
        json=0
        while [[ $# -gt 0 ]]; do
          case "$1" in
            --json) [[ "${2:-}" == "assets" ]] && json=1; shift 2 ;;
            --jq) shift 2 ;;
            -R|--repo) shift 2 ;;
            *) shift ;;
          esac
        done
        [[ -f "$S/release_exists" ]] || exit 1
        if [[ "$json" -eq 1 ]]; then
          if [[ -n "${FAKE_GH_DROP_ASSET:-}" ]]; then
            grep -vxF "$FAKE_GH_DROP_ASSET" "$S/assets" 2>/dev/null || true
          elif [[ -f "$S/assets" ]]; then
            cat "$S/assets"
          fi
          :
        fi ;;
      create)
        tag="${1:-}"; shift || true
        while [[ $# -gt 0 ]]; do
          case "$1" in
            --notes-file) cp "${2:-}" "$S/notes"; shift 2 ;;
            -R|--repo) shift 2 ;;
            *) shift ;;
          esac
        done
        : > "$S/release_exists" ;;
      edit)
        tag="${1:-}"; shift || true
        while [[ $# -gt 0 ]]; do
          case "$1" in
            --notes-file) cp "${2:-}" "$S/notes"; shift 2 ;;
            -R|--repo) shift 2 ;;
            *) shift ;;
          esac
        done ;;
      upload)
        tag="${1:-}"; shift || true
        asset=""
        while [[ $# -gt 0 ]]; do
          case "$1" in
            -R|--repo) shift 2 ;;
            --clobber) shift ;;
            -*) shift ;;
            *) asset="$1"; shift ;;
          esac
        done
        [[ -n "$asset" ]] || exit 1
        name="$(basename "$asset")"
        af="$S/attempts-$name"
        n=0; [[ -f "$af" ]] && n="$(cat "$af")"
        n=$((n+1)); echo "$n" > "$af"
        if [[ "$n" -le "${FAKE_GH_FAIL_UPLOADS:-0}" ]]; then echo "gh: simulated upload failure ($name #$n)" >&2; exit 1; fi
        cp "$asset" "$S/$name"
        echo "$name" >> "$S/assets" ;;
      *) exit 1 ;;
    esac ;;
  *) exit 0 ;;
esac
EOF
chmod +x "$TMPROOT/bin/npm" "$TMPROOT/bin/python3" "$TMPROOT/bin/xargs" "$TMPROOT/bin/gh"

gh_reset() {
  rm -rf "${FAKE_GH_STATE:?}"
  mkdir -p "$FAKE_GH_STATE"
  : > "$FAKE_GH_STATE/assets"
}

# ===== ①–③ 构建器行为 =====
echo "① 构建器：成功构建 / vendor 失败 / 中途失败清理"
SKILL="$TMPROOT/skill/swarm-yuan"
mkdir -p "$SKILL/scripts" "$SKILL/assets"
cp "$REPO_ROOT/scripts/make-offline-bundle.sh" "$REPO_ROOT/scripts/offline-manifest.conf" "$SKILL/scripts/"
echo "# fake skill" > "$SKILL/SKILL.md"
mkdir -p "$SKILL/docs"
echo "fake spaced file" > "$SKILL/docs/带 空格 的 文件.md"
echo "FACT_FAKE=1" > "$SKILL/assets/facts.conf"
cat > "$SKILL/install.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
echo "install.sh $*" >> "${FAKE_INSTALL_LOG:?FAKE_INSTALL_LOG unset}"
if [[ "${FAKE_INSTALL_FAIL:-0}" == "1" ]]; then echo "install.sh simulated failure" >&2; exit 42; fi
exit 0
EOF
chmod +x "$SKILL/install.sh"

OUT_OK="$TMPROOT/out-ok"
SWARM_YUAN_DIR="$SKILL" bash "$SKILL/scripts/make-offline-bundle.sh" "$OUT_OK" > "$TMPROOT/build-ok.log" 2>&1
RC=$?
if [[ "$RC" -eq 0 ]]; then ok "1a 正常构建退出 0"; else bad "1a 正常构建退出 ${RC}（$(tail -3 "$TMPROOT/build-ok.log" | tr '\n' ' ')）"; fi
ZIP="$OUT_OK/swarm-yuan-offline-unknown.zip"
BUNDLE="$TMPROOT/x-ok"; mkdir -p "$BUNDLE"
if unzip -q "$ZIP" -d "$BUNDLE" 2>/dev/null; then :
elif tar -xf "$ZIP" -C "$BUNDLE" 2>/dev/null; then :
else bad "1b 产物无法解压"; fi
ROOT="$BUNDLE/swarm-yuan-offline-unknown"
if [[ -f "$ROOT/vendor/vendor-status.tsv" ]]; then ok "1b vendor-status.tsv 在位"; else bad "1b 缺 vendor-status.tsv"; fi
if [[ "$(head -1 "$ROOT/vendor/vendor-status.tsv" 2>/dev/null)" == *"obtained_files"* ]]; then ok "1c vendor-status 表头含实得文件列"; else bad "1c 表头不符"; fi
N_FAILED=$(grep -c $'\tfailed\t' "$ROOT/vendor/vendor-status.tsv" 2>/dev/null || true)
[[ "${N_FAILED:-0}" -eq 0 ]] && ok "1d 成功构建零 failed 行" || bad "1d 成功构建有 $N_FAILED 个 failed 行"
if ( cd "$ROOT" && { find vendor swarm-yuan -type f; printf '%s\n' install-offline.sh install-offline.bat README-OFFLINE.md; } | LC_ALL=C sort > "$TMPROOT/expected.txt" && cut -c67- SHA256SUMS | LC_ALL=C sort > "$TMPROOT/listed.txt" && cmp -s "$TMPROOT/expected.txt" "$TMPROOT/listed.txt" ); then
  ok "1e SHA256SUMS 覆盖 vendor+技能包+安装器三件套全部文件（$(wc -l < "$ROOT/SHA256SUMS" | tr -d ' ') 个）"
else
  bad "1e SHA256SUMS 覆盖不全"; diff "$TMPROOT/expected.txt" "$TMPROOT/listed.txt" | head -5 >&2
fi
if ( cd "$ROOT" && { command -v sha256sum >/dev/null 2>&1 && sha256sum -c SHA256SUMS || shasum -a 256 -c SHA256SUMS; } >/dev/null 2>&1 ); then
  ok "1f SHA256SUMS 逐条校验通过"
else
  bad "1f SHA256SUMS 校验失败"
fi

OUT_FAIL="$TMPROOT/out-fail"
# 模拟失败的包规格从清单动态取，不硬编码版本——清单升版时测试不随之失配
CM_SPEC=$(grep -E '^claude-mem\|npm\|' "$REPO_ROOT/scripts/offline-manifest.conf" | cut -d'|' -f3)
[[ -n "$CM_SPEC" ]] || { bad "2-pre 清单无 claude-mem npm 行，无法构造失败场景"; CM_SPEC="claude-mem@0.0.0"; }
FAKE_NPM_FAIL="$CM_SPEC" SWARM_YUAN_DIR="$SKILL" bash "$SKILL/scripts/make-offline-bundle.sh" "$OUT_FAIL" > "$TMPROOT/build-fail.log" 2>&1
RC=$?
if [[ "$RC" -ne 0 ]]; then ok "2a vendor 失败默认非零退出（rc=${RC}）"; else bad "2a vendor 失败仍返回 0"; fi
if [[ -f "$OUT_FAIL/swarm-yuan-offline-unknown.zip" ]]; then ok "2b 缺件产物仍生成（供诊断）"; else bad "2b 缺件时无产物"; fi
ZIPF="$TMPROOT/x-fail"; mkdir -p "$ZIPF"; unzip -q "$OUT_FAIL/swarm-yuan-offline-unknown.zip" -d "$ZIPF" 2>/dev/null || tar -xf "$OUT_FAIL/swarm-yuan-offline-unknown.zip" -C "$ZIPF"
FAILROOT="$ZIPF/swarm-yuan-offline-unknown"
if grep -q $'^claude-mem\tnpm\t.*\tfailed\t' "$FAILROOT/vendor/vendor-status.tsv" 2>/dev/null; then
  ok "2c 缺件行含 failed 与失败原因（$(grep $'^claude-mem\t' "$FAILROOT/vendor/vendor-status.tsv" | cut -f6 | cut -c1-60)）"
else
  bad "2c vendor-status 未登记缺件"
fi
if ! ( cd "$FAILROOT" && cut -c67- SHA256SUMS ) | grep -q 'vendor/npm/claude-mem'; then
  ok "2d 缺件未混入校验和清单"
else
  bad "2d 缺件出现在 SHA256SUMS"
fi

OUT_PART="$TMPROOT/out-partial"
FAKE_NPM_FAIL="$CM_SPEC" SWARM_YUAN_DIR="$SKILL" bash "$SKILL/scripts/make-offline-bundle.sh" "$OUT_PART" --allow-partial > "$TMPROOT/build-partial.log" 2>&1
RC=$?
[[ "$RC" -eq 0 ]] && ok "2e --allow-partial 显式接受缺件（rc=0）" || bad "2e --allow-partial 仍非零（rc=${RC}）"
# 2e 的探针必须真触达缺件路径：无 failed 行则 rc=0 是空过而非接受缺件
if grep -q $'^claude-mem\tnpm\t.*\tfailed\t' "$OUT_PART"/swarm-yuan-offline-unknown/vendor/vendor-status.tsv 2>/dev/null \
   || ( unzip -p "$OUT_PART/swarm-yuan-offline-unknown.zip" 'swarm-yuan-offline-unknown/vendor/vendor-status.tsv' 2>/dev/null | grep -q $'^claude-mem\tnpm\t.*\tfailed\t' ); then
  ok "2f --allow-partial 场景确有缺件登记（探针真触达，非空过）"
else
  bad "2f --allow-partial 场景无缺件登记——探针未触达失败路径，2e 为空过"
fi

# 中途失败：SHA256SUMS 阶段的 xargs 失败 → trap 清理暂存，旧产物原样保留
OUT_TRAP="$TMPROOT/out-trap"; mkdir -p "$OUT_TRAP"
echo "old-artifact-sentinel" > "$OUT_TRAP/swarm-yuan-offline-unknown.zip"
FAKE_XARGS_FAIL=1 SWARM_YUAN_DIR="$SKILL" bash "$SKILL/scripts/make-offline-bundle.sh" "$OUT_TRAP" > "$TMPROOT/build-trap.log" 2>&1
RC=$?
[[ "$RC" -ne 0 ]] && ok "3a 中途失败非零退出（rc=${RC}）" || bad "3a 中途失败返回 0"
[[ "$(cat "$OUT_TRAP/swarm-yuan-offline-unknown.zip")" == "old-artifact-sentinel" ]] && ok "3b 失败不破坏既有产物" || bad "3b 既有产物被破坏"
if [[ -z "$(find "$OUT_TRAP" -maxdepth 1 -name '.swarm-yuan-offline-*' -print -quit)" ]]; then ok "3c trap 清理暂存目录"; else bad "3c 残留暂存目录"; fi
[[ ! -d "$OUT_TRAP/swarm-yuan-offline-unknown" ]] && ok "3d 未发布半包目录" || bad "3d 半包目录残留"

# ===== ④ 安装器行为 =====
echo "④ 安装器：失败传播 / 多宿主 / 校验和"
INST="$TMPROOT/install-ok"; mkdir -p "$INST"
unzip -q "$ZIP" -d "$INST" 2>/dev/null || tar -xf "$ZIP" -C "$INST"
IROOT="$INST/swarm-yuan-offline-unknown"
export FAKE_INSTALL_LOG="$TMPROOT/install-calls.log"
: > "$FAKE_INSTALL_LOG"

bash "$IROOT/install-offline.sh" --claude --cursor > "$TMPROOT/install-multi.log" 2>&1
RC=$?
[[ "$RC" -eq 0 ]] && ok "4a 多宿主安装退出 0" || bad "4a 多宿主安装退出 $RC"
[[ "$(grep -c 'install.sh --claude' "$FAKE_INSTALL_LOG")" -eq 1 && "$(grep -c 'install.sh --cursor' "$FAKE_INSTALL_LOG")" -eq 1 ]] \
  && ok "4b --claude 与 --cursor 均生效（各一次）" || bad "4b 多宿主只生效首个"
: > "$FAKE_INSTALL_LOG"
bash "$IROOT/install-offline.sh" --claude --all > "$TMPROOT/install-all.log" 2>&1
RC=$?
[[ "$RC" -eq 0 && "$(grep -c 'install.sh --all' "$FAKE_INSTALL_LOG")" -eq 1 && "$(grep -c 'install.sh --claude' "$FAKE_INSTALL_LOG")" -eq 0 ]] \
  && ok "4c --all 合并优先（单次 --all）" || bad "4c --all 合并策略不符"

: > "$FAKE_INSTALL_LOG"
FAKE_INSTALL_FAIL=1 bash "$IROOT/install-offline.sh" --claude > "$TMPROOT/install-fail.log" 2>&1
RC=$?
[[ "$RC" -eq 42 ]] && ok "4d install.sh 失败码原样传播（42）" || bad "4d install.sh 失败被吞（rc=${RC}）"
if grep -q '离线安装完成' "$TMPROOT/install-fail.log"; then bad "4e 失败仍打印「离线安装完成」"; else ok "4e 失败不打印完成"; fi

cp -R "$IROOT" "$TMPROOT/install-tamper"
TAMPER_FILE="$(ls "$TMPROOT/install-tamper/vendor/npm/"*.tgz | head -1)"
echo "tampered" >> "$TAMPER_FILE"
: > "$FAKE_INSTALL_LOG"
bash "$TMPROOT/install-tamper/install-offline.sh" --claude > "$TMPROOT/install-tamper.log" 2>&1
RC=$?
[[ "$RC" -ne 0 ]] && ok "4f 篡改 vendor 后拒绝安装（rc=${RC}）" || bad "4f 篡改未被校验拦截"
grep -q '校验失败\|完整性校验失败' "$TMPROOT/install-tamper.log" && ok "4g 校验失败信息可读" || bad "4g 缺校验失败信息"
[[ ! -s "$FAKE_INSTALL_LOG" ]] && ok "4h 校验失败未执行 install.sh" || bad "4h 校验失败仍安装"

cp -R "$IROOT" "$TMPROOT/install-nosums"; rm -f "$TMPROOT/install-nosums/SHA256SUMS"
bash "$TMPROOT/install-nosums/install-offline.sh" --claude > "$TMPROOT/install-nosums.log" 2>&1
RC=$?
[[ "$RC" -ne 0 ]] && grep -q '缺少 SHA256SUMS' "$TMPROOT/install-nosums.log" && ok "4i 缺 SHA256SUMS 拒绝安装" || bad "4i 缺校验和未拒绝"

# ===== ⑤ 源码包发布器 =====
echo "⑤ 发布器：重试 / 资产核验 / commit 钉定"
REPOS="$TMPROOT/repos"; mkdir -p "$REPOS"
make_repo() {
  local d="$REPOS/$1"
  mkdir -p "$d"
  git -C "$d" init -q
  git -C "$d" config user.email test@example.invalid
  git -C "$d" config user.name test
  echo "$1 content" > "$d/README.md"
  git -C "$d" add README.md
  git -C "$d" commit -qm "init $1"
  git -C "$d" rev-parse HEAD
}
SHA_GSTACK="$(make_repo gstack)"
make_repo superpowers >/dev/null
make_repo ecc >/dev/null
export SWARM_YUAN_SRC_URL_GSTACK="$REPOS/gstack"
export SWARM_YUAN_SRC_URL_SUPERPOWERS="$REPOS/superpowers"
export SWARM_YUAN_SRC_URL_ECC="$REPOS/ecc"
# R134：scripts/src-pins.conf 钉真上游 SHA——夹具仓没有，须 env 覆写为夹具 HEAD（优先级 env>conf）
export SWARM_YUAN_SRC_PINS="gstack=$SHA_GSTACK superpowers=$(git -C "$REPOS/superpowers" rev-parse HEAD) ecc=$(git -C "$REPOS/ecc" rev-parse HEAD)"
export UPLOAD_RETRY_BASE_DELAY=0
export UPLOAD_RETRIES=3
GH_STATE="$TMPROOT/gh-state"; export FAKE_GH_STATE="$GH_STATE"
RS="$REPO_ROOT/scripts/release-src-packages.sh"

gh_reset
FAKE_GH_FAIL_UPLOADS=1 bash "$RS" 20261018 --pin "gstack=$SHA_GSTACK" > "$TMPROOT/release-ok.log" 2>&1
RC=$?
[[ "$RC" -eq 0 ]] && ok "5a 上传首败重试后成功（rc=0）" || bad "5a 重试后仍失败（rc=$RC: $(tail -3 "$TMPROOT/release-ok.log" | tr '\n' ' ')）"
[[ "$(cat "$GH_STATE/attempts-gstack-src.zip" 2>/dev/null)" == "2" ]] && ok "5b gstack 上传尝试 2 次（首败+重试）" || bad "5b 重试次数不符（$(cat "$GH_STATE/attempts-gstack-src.zip" 2>/dev/null)）"
ALL3=1
for a in gstack-src.zip superpowers-src.zip ecc-src.zip SHA256SUMS; do grep -qxF "$a" "$GH_STATE/assets" || ALL3=0; done
[[ "$ALL3" -eq 1 ]] && ok "5c 三件源码包 + SHA256SUMS 均上传" || bad "5c 资产不齐"
if ( cd "$GH_STATE" && { command -v sha256sum >/dev/null 2>&1 && sha256sum -c SHA256SUMS || shasum -a 256 -c SHA256SUMS; } >/dev/null 2>&1 ); then
  ok "5d 上传的 SHA256SUMS 与三件资产一致"
else
  bad "5d 上传校验和不匹配"
fi
grep -q "$SHA_GSTACK" "$GH_STATE/notes" && ok "5e release notes 记录钉定 commit SHA" || bad "5e notes 缺钉定 SHA"

gh_reset
FAKE_GH_DROP_ASSET=ecc-src.zip bash "$RS" 20261018 > "$TMPROOT/release-missing.log" 2>&1
RC=$?
[[ "$RC" -ne 0 ]] && ok "5f 资产缺失非零退出（rc=${RC}）" || bad "5f 资产缺失仍返回 0"
grep -q '缺资产: ecc-src.zip' "$TMPROOT/release-missing.log" && ok "5g 缺资产点名" || bad "5g 未点名缺失资产"

bash "$RS" 20261018 --pin gstack=abc123 > "$TMPROOT/release-badpin.log" 2>&1
RC=$?
[[ "$RC" -ne 0 ]] && grep -q '非 40 位' "$TMPROOT/release-badpin.log" && ok "5h 非法短 SHA 拒绝" || bad "5h 短 SHA 未被拒"

# 5i 清单（src-pins.conf）读取钉定 SHA
PIN_DIR="$TMPROOT/pin-script/scripts"; mkdir -p "$PIN_DIR"
cp "$RS" "$PIN_DIR/"
echo "gstack=$SHA_GSTACK" > "$PIN_DIR/src-pins.conf"
gh_reset
bash "$PIN_DIR/release-src-packages.sh" 20261019 > "$TMPROOT/release-pins-file.log" 2>&1
RC=$?
[[ "$RC" -eq 0 ]] && grep -q "$SHA_GSTACK" "$GH_STATE/notes" && ok "5i src-pins.conf 清单钉定生效" || bad "5i 清单钉定未生效（rc=${RC}）"

# 5j 钉定非 HEAD SHA：上游前移后仍复现旧 commit 内容
OLD_SHA="$(git -C "$REPOS/gstack" rev-parse HEAD)"
echo "second commit" >> "$REPOS/gstack/README.md"
git -C "$REPOS/gstack" add README.md
git -C "$REPOS/gstack" commit -qm "second"
gh_reset
bash "$RS" 20261020 --pin "gstack=$OLD_SHA" > "$TMPROOT/release-oldpin.log" 2>&1
RC=$?
if [[ "$RC" -eq 0 ]] && grep -q "$OLD_SHA" "$GH_STATE/notes" \
   && ! unzip -p "$GH_STATE/gstack-src.zip" 'gstack/README.md' 2>/dev/null | grep -q 'second commit'; then
  ok "5j 非 HEAD 钉定 SHA 复现旧 commit 内容"
else
  bad "5j 非 HEAD 钉定失败（rc=$RC: $(tail -2 "$TMPROOT/release-oldpin.log" | tr '\n' ' ')）"
fi

# ===== ⑥ 清单 ↔ 上游基线自动对账 =====
echo "⑥ 清单与 upstream-baseline 对账"
MF="$REPO_ROOT/scripts/offline-manifest.conf"
BL="$REPO_ROOT/docs/upstream-baseline.md"
if [[ -f "$MF" && -f "$BL" ]]; then
  SYNC_OK=0; SYNC_EXEMPT=0; SYNC_CHECKED=0
  while IFS='|' read -r rt ch spec _note; do
    case "$rt" in ''|'#'*) continue ;; esac
    case "$ch" in
      npm) v="${spec##*@}" ;;
      pip) v="${spec##*==}" ;;
      github) continue ;;
      *) bad "6a 清单通道非法: $rt"; continue ;;
    esac
    case "$rt" in
      claude-code-host) bn="claude-code" ;;
      codex-host) bn="codex-cli" ;;
      gitnexus) bn="GitNexus" ;;
      *) bn="$rt" ;;
    esac
    row="$(awk -F'|' -v n="$bn" '{name=$2; gsub(/^ +| +$/,"",name); if (tolower(name)==tolower(n)) {print; exit}}' "$BL")"
    if [[ -z "$row" ]]; then bad "6b 清单行无基线登记: $rt"; continue; fi
    SYNC_CHECKED=$((SYNC_CHECKED+1))
    v5="$(printf '%s' "$row" | awk -F'|' '{print $5}' | grep -oE '[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z]+)*' | head -1)"
    v6="$(printf '%s' "$row" | awk -F'|' '{print $6}' | grep -oE '[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z]+)*' | head -1)"
    if [[ "$v" == "$v5" || "$v" == "$v6" ]]; then
      SYNC_OK=$((SYNC_OK+1))
    elif grep -qF "# baseline-exempt: $rt " "$MF" && [[ -n "$(grep -F "# baseline-exempt: $rt " "$MF" | head -1 | sed "s/.*# baseline-exempt: $rt //")" ]]; then
      SYNC_EXEMPT=$((SYNC_EXEMPT+1))
    else
      bad "6c 版本失配: $rt 清单=$v 基线=$v5/最新=${v6}（如需接受请登记 '# baseline-exempt: $rt <原因>'）"
    fi
  done < "$MF"
  [[ "$SYNC_CHECKED" -gt 0 ]] && ok "6d 对账覆盖 $SYNC_CHECKED 个版本化清单行（同步 $SYNC_OK / 显式豁免 ${SYNC_EXEMPT}）" || bad "6d 无可对账行"
  while IFS= read -r line; do
    case "$line" in "# baseline-exempt: "*) ex_rt="${line#\# baseline-exempt: }"; ex_rt="${ex_rt%% *}"
      grep -qE "^${ex_rt}\|" "$MF" || bad "6e 豁免指向不在册条目: $ex_rt" ;;
    esac
  done < "$MF"
else
  bad "6f 清单或基线文档缺失"
fi

if [[ "$FAIL" -eq 0 ]]; then echo "test-r118-release-hardening: PASS"; else echo "test-r118-release-hardening: FAIL" >&2; fi
exit "$FAIL"
