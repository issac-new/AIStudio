#!/usr/bin/env bash
# release-src-packages.sh — 打包 gstack/superpowers/ECC 源码并上传 GitHub Release
#
# 这三个运行时无法走 npm/pip，发版时把上游源码打成 zip 挂到 Release v<ver>-src，
# self-check.sh 的 install_from_src_release() 从该 Release 拉取一键安装。
#
# 用法:
#   bash scripts/release-src-packages.sh [YYYYMMDD] [--pin <runtime>=<40位commit SHA>]...
#   本地模式（R134，供离线 everything 包内嵌）：--no-upload [--out <dir>]——只打包不上传，
#   产物 <dir>/{<runtime>-src.zip,SHA256SUMS,SRC-PINS.txt}（默认 dist-src/）；gh 非必需。
#   版本号默认当天。上游 commit 钉定优先级：--pin > 环境变量 SWARM_YUAN_SRC_PINS
#   （"gstack=<sha> superpowers=<sha>"）> scripts/src-pins.conf（存在时，行格式 name=<sha>）
#   > 克隆时默认分支 HEAD（自动记录实际 SHA 到 release notes）。
#   打包用 git archive（内容随 commit 确定），发布同时上传 SHA256SUMS。
#   上传失败有限重试（指数退避）：UPLOAD_RETRIES（默认 3）、UPLOAD_RETRY_BASE_DELAY（默认 5 秒）。
#   上传后以 `gh release view --json assets` 校验资产齐全，缺件非零退出。
# 前置: 已安装 gh 并登录（gh auth status）
set -euo pipefail

SELF_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="issac-new/Swarm-yuan"
VERSION=""
PINS_CLI=""
NO_UPLOAD=0
OUT_DIR=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-upload) NO_UPLOAD=1; shift ;;
    --out) [[ $# -ge 2 ]] || { echo "✗ --out 需要参数 <目录>" >&2; exit 1; }; OUT_DIR="$2"; shift 2 ;;
    --out=*) OUT_DIR="${1#--out=}"; shift ;;
    --pin)
      [[ $# -ge 2 ]] || { echo "✗ --pin 需要参数 <runtime>=<sha>" >&2; exit 1; }
      PINS_CLI="$PINS_CLI $2"; shift 2 ;;
    --pin=*) PINS_CLI="$PINS_CLI ${1#--pin=}"; shift ;;
    -h|--help)
      echo "用法: bash $0 [YYYYMMDD] [--pin <runtime>=<40位commit SHA>]..." >&2
      exit 0 ;;
    -*) echo "✗ 未知参数: $1" >&2; exit 1 ;;
    *) [[ -z "$VERSION" ]] || { echo "✗ 只接受一个版本号参数" >&2; exit 1; }; VERSION="$1"; shift ;;
  esac
done
VERSION="${VERSION:-$(date -u +%Y%m%d)}"
TAG="v${VERSION}-src"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/swarm-yuan.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT
MAX_ATTEMPTS="${UPLOAD_RETRIES:-3}"
RETRY_BASE="${UPLOAD_RETRY_BASE_DELAY:-5}"

# 上游仓库（默认值；SWARM_YUAN_SRC_URL_<大写下划线名> 可覆盖，供离线镜像/测试使用）
src_url() {
  case "$1" in
    gstack) echo "${SWARM_YUAN_SRC_URL_GSTACK:-https://github.com/garrytan/gstack.git}" ;;
    superpowers) echo "${SWARM_YUAN_SRC_URL_SUPERPOWERS:-https://github.com/obra/superpowers.git}" ;;
    ecc) echo "${SWARM_YUAN_SRC_URL_ECC:-https://github.com/affaan-m/ECC.git}" ;;
    *) return 1 ;;
  esac
}
# 注意：superpowers 源是 obra/superpowers（核心插件本体，含 skills/ 与 plugin.json），
#   非 obra/superpowers-marketplace（仅 marketplace 元数据，无 skills/ 本体，会被
#   check_superpowers 的 fail-closed 空壳检测判 miss）。
SOURCES="gstack
superpowers
ecc"

# commit 钉定：文件 → 环境变量 → CLI（后者覆盖前者）
PINS=""
if [[ -f "$SELF_DIR/src-pins.conf" ]]; then
  while IFS= read -r line; do
    case "$line" in ''|'#'*) continue ;; esac
    line="${line%%#*}"
    name="${line%%[=|]*}"; sha="${line#*[=|]}"
    name="$(echo "$name" | tr -d '[:space:]')"; sha="$(echo "$sha" | tr -d '[:space:]')"
    [[ -n "$name" && -n "$sha" ]] && PINS="$PINS $name=$sha"
  done < "$SELF_DIR/src-pins.conf"
fi
if [[ -n "${SWARM_YUAN_SRC_PINS:-}" ]]; then
  PINS="$PINS $(echo "$SWARM_YUAN_SRC_PINS" | tr ',;' '  ')"
fi
PINS="$PINS $PINS_CLI"
pin_for() {
  local n="$1" p="" pair
  for pair in $PINS; do
    case "$pair" in "$n="*) p="${pair#*=}" ;; esac
  done
  echo "$p"
}

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | awk '{print $1}'
  else shasum -a 256 "$1" | awk '{print $1}'; fi
}

echo "=== swarm-yuan 源码包发版 ==="
echo "  版本: $VERSION  tag: $TAG"
echo "  临时目录: $TMP"
echo ""

# 前置检查
if ! command -v git &>/dev/null; then echo "✗ 需 git"; exit 1; fi
# R135 修复（审计 R1）：gh 两道检查仅在 upload 模式要求——--no-upload 本地打包 gh 非必需
if [[ "$NO_UPLOAD" -ne 1 ]]; then
  if ! command -v gh &>/dev/null; then
    echo "✗ 需先安装 GitHub CLI: https://cli.github.com/（或用 --no-upload 本地打包）"
    exit 1
  fi
  if ! gh auth status &>/dev/null; then
    echo "✗ gh 未登录，请先 gh auth login（或用 --no-upload 本地打包）"
    exit 1
  fi
fi
if [[ "$NO_UPLOAD" -eq 1 ]]; then
  OUT_DIR="${OUT_DIR:-$(cd "$SELF_DIR/../.." && pwd)/dist-src}"
  mkdir -p "$OUT_DIR"
fi

mkdir -p "$TMP/out"
RESOLVED=""

# 1. 克隆（按钉定 SHA / 默认分支 HEAD）+ 打包
while IFS= read -r name; do
  [[ -n "$name" ]] || continue
  url="$(src_url "$name")"
  pin="$(pin_for "$name")"
  if [[ -n "$pin" ]]; then
    case "$pin" in
      *[!0-9a-fA-F]*) echo "✗ $name 的钉定 SHA 非法（需 40 位十六进制）: $pin" >&2; exit 1 ;;
    esac
    if [[ ${#pin} -ne 40 ]]; then
      echo "✗ $name 的钉定 SHA 非 40 位: $pin" >&2; exit 1
    fi
  fi
  echo "--- $name ---"
  if ! git clone --depth 1 --quiet "$url" "$TMP/$name" 2>/dev/null; then
    echo "  ✗ $name 克隆失败: $url" >&2; exit 1
  fi
  resolved="$(git -C "$TMP/$name" rev-parse HEAD)"
  if [[ -n "$pin" && "$resolved" != "$pin" ]]; then
    # 钉定 SHA 不在浅克隆顶端：先按 SHA 取；取不到或检出失败再退回完整 fetch（可复现要求全 40 位）
    git -C "$TMP/$name" fetch --quiet --depth 1 origin "$pin" 2>/dev/null || true
    if ! git -C "$TMP/$name" checkout --quiet "$pin" 2>/dev/null; then
      git -C "$TMP/$name" fetch --quiet origin '+refs/heads/*:refs/remotes/origin/*' '+refs/tags/*:refs/tags/*'
      git -C "$TMP/$name" checkout --quiet "$pin"
    fi
    resolved="$(git -C "$TMP/$name" rev-parse HEAD)"
    if [[ "$resolved" != "$pin" ]]; then
      echo "  ✗ ${name} 无法检出钉定 SHA ${pin}（实得 ${resolved}）" >&2; exit 1
    fi
  fi
  RESOLVED="$RESOLVED$name|$resolved|$url
"
  # git archive 内容由 commit 确定；先删旧档（防 zip 追加残留），再用 --prefix 保留 <name>/ 顶层目录
  rm -f "$TMP/out/${name}-src.zip"
  git -C "$TMP/$name" archive --format=zip --prefix="$name/" -o "$TMP/out/${name}-src.zip" "$resolved"
  echo "  ✓ ${name}-src.zip @ ${resolved} ($(du -h "$TMP/out/${name}-src.zip" | cut -f1))"
done <<< "$SOURCES"

# 2. 校验和
echo ""
echo "--- SHA256SUMS ---"
SUM_TOOL="shasum -a 256"
if command -v sha256sum >/dev/null 2>&1; then SUM_TOOL="sha256sum"; fi
( cd "$TMP/out" && rm -f SHA256SUMS
  for _z in *.zip; do
    [[ -e "$_z" ]] || continue
    # shellcheck disable=SC2086
    $SUM_TOOL "$_z"
  done > SHA256SUMS )
cat "$TMP/out/SHA256SUMS"
while IFS= read -r line; do
  [[ -n "$line" ]] || continue
  _h="${line%% *}"; _f="${line##* }"
  [[ "$(sha256_file "$TMP/out/$_f")" == "$_h" ]] || { echo "✗ SHA256SUMS 自检失败: $_f" >&2; exit 1; }
done < "$TMP/out/SHA256SUMS"

# 2b. 本地模式出口（R134）：拷贝产物 + 写 SRC-PINS.txt（name=sha，消费方可复现核对）
if [[ "$NO_UPLOAD" -eq 1 ]]; then
  cp "$TMP/out"/*.zip "$TMP/out/SHA256SUMS" "$OUT_DIR/"
  : > "$OUT_DIR/SRC-PINS.txt"
  while IFS='|' read -r _n _s _u; do
    [[ -n "$_n" ]] || continue
    printf '%s=%s\n' "$_n" "$_s" >> "$OUT_DIR/SRC-PINS.txt"
  done <<< "$RESOLVED"
  echo ""
  echo "=== 本地打包完成（未上传）: $OUT_DIR ==="
  ls -1 "$OUT_DIR"
  exit 0
fi

# 3. release notes（记录钉定 SHA——复现凭据）
NOTES="$TMP/release-notes.md"
{
  echo "gstack / superpowers / ECC 源码包，供 self-check.sh install_from_src_release() 一键安装。"
  echo ""
  echo "上游 commit SHA（固定钉定，可复现）："
  while IFS='|' read -r _n _s _u; do
    [[ -n "$_n" ]] || continue
    echo "- ${_n}: \`${_s}\`（${_u}）"
  done <<< "$RESOLVED"
  echo ""
  echo "校验和见 SHA256SUMS 资产。"
  echo "下载地址前缀: https://github.com/${REPO}/releases/download/${TAG}/"
} > "$NOTES"

# 4. 创建/更新 Release 并逐件上传（有限重试 + 指数退避）
retry() {
  local desc="$1"; shift
  local attempt=1 delay
  while :; do
    if "$@"; then return 0; fi
    if [[ "$attempt" -ge "$MAX_ATTEMPTS" ]]; then
      echo "  ✗ $desc 失败（已尝试 $attempt 次）" >&2
      return 1
    fi
    delay=$(( RETRY_BASE * (1 << (attempt-1)) ))
    [[ "$delay" -gt 60 ]] && delay=60
    echo "  ⚠ $desc 失败（第 $attempt/$MAX_ATTEMPTS 次），${delay}s 后重试" >&2
    sleep "$delay"
    attempt=$((attempt+1))
  done
}

echo ""
if gh release view "$TAG" -R "$REPO" &>/dev/null; then
  echo "=== Release $TAG 已存在，更新 notes 并覆盖上传 ==="
  retry "更新 Release notes" gh release edit "$TAG" -R "$REPO" --notes-file "$NOTES"
else
  echo "=== 创建 Release $TAG ==="
  retry "创建 Release" gh release create "$TAG" -R "$REPO" \
    --title "swarm-yuan 源码包 $VERSION" --notes-file "$NOTES"
fi

EXPECTED=""
for name in $SOURCES; do EXPECTED="$EXPECTED ${name}-src.zip"; done
EXPECTED="$EXPECTED SHA256SUMS"
for asset in $EXPECTED; do
  retry "上传 $asset" gh release upload "$TAG" -R "$REPO" "$TMP/out/$asset" --clobber
done

# 5. 资产齐全性校验（三件源码包 + 校验和）
echo ""
echo "=== 校验 Release 资产 ==="
ASSETS="$(gh release view "$TAG" -R "$REPO" --json assets --jq '.assets[].name')" \
  || { echo "✗ 无法读取 Release 资产列表" >&2; exit 1; }
missing=0
for asset in $EXPECTED; do
  if printf '%s\n' "$ASSETS" | grep -qxF "$asset"; then
    echo "  ✓ $asset"
  else
    echo "  ✗ 缺资产: $asset" >&2
    missing=$((missing+1))
  fi
done
if [[ "$missing" -ne 0 ]]; then
  echo "✗ Release 资产不齐（缺 $missing 件），发布未完成" >&2
  exit 1
fi

echo ""
echo "=== 完成 ==="
echo "  Release: https://github.com/${REPO}/releases/tag/${TAG}"
while IFS='|' read -r _n _s _u; do
  [[ -n "$_n" ]] || continue
  echo "    - ${_n} @ ${_s}: https://github.com/${REPO}/releases/download/${TAG}/${_n}-src.zip"
done <<< "$RESOLVED"
