#!/usr/bin/env bash
# upstream-probe.sh — 上游运行时查新探针（WP3）
#
# 用法:
#   bash upstream-probe.sh --offline --check   # 只校验 runtimes.tsv 结构/计数，不联网
#   bash upstream-probe.sh --json [--offline]  # 输出 JSON 漂移报告；--offline 时 latest=null
#   bash upstream-probe.sh --help
#
# 设计: 权威源 assets/registry/runtimes.tsv；本脚本只读表，不写基线。
# 通道: npm / pypi / git / materialized / host。网络失败一律 unknown，不 fail。
# 依赖: curl（在线）；git（git 通道）；npm（npm 通道）。缺失时对应行 unknown。
set -uo pipefail

BASE="$(cd "$(dirname "$0")/.." && pwd)"
REG="$BASE/assets/registry/runtimes.tsv"
OFFLINE=0
MODE="json"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --offline) OFFLINE=1; shift ;;
    --json) MODE="json"; shift ;;
    --check) MODE="check"; shift ;;
    -h|--help) sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "未知参数: $1" >&2; exit 2 ;;
  esac
done

[[ -f "$REG" ]] || { echo "ERROR: runtimes.tsv 缺失: $REG" >&2; exit 1; }

# shellcheck disable=SC1091
. "$BASE/assets/lib/json.sh"

check_table() {
  local total deep cli method synced watch license bad
  total="$(awk -F '\t' '!/^#/ && NF{n++} END{print n+0}' "$REG")"
  deep="$(awk -F '\t' '!/^#/ && $8=="deep"{n++} END{print n+0}' "$REG")"
  cli="$(awk -F '\t' '!/^#/ && $8=="cli"{n++} END{print n+0}' "$REG")"
  method="$(awk -F '\t' '!/^#/ && $8=="method"{n++} END{print n+0}' "$REG")"
  synced="$(awk -F '\t' '!/^#/ && $10=="synced"{n++} END{print n+0}' "$REG")"
  watch="$(awk -F '\t' '!/^#/ && $10=="watch"{n++} END{print n+0}' "$REG")"
  license="$(awk -F '\t' '!/^#/ && $10=="license-risk"{n++} END{print n+0}' "$REG")"
  bad=""
  [[ "$total" -eq 22 ]] || bad="$bad total=$total"
  [[ "$deep" -eq 4 ]] || bad="$bad deep=$deep"
  [[ "$cli" -eq 6 ]] || bad="$bad cli=$cli"
  [[ "$method" -eq 5 ]] || bad="$bad method=$method"
  [[ "$synced" -eq 19 ]] || bad="$bad synced=$synced"
  [[ "$watch" -eq 2 ]] || bad="$bad watch=$watch"
  [[ "$license" -eq 1 ]] || bad="$bad license=$license"
  # 必填列与 claim/status 枚举
  local id repo lic chan pkg tag base wire claim status
  while IFS=$'\t' read -r id repo lic chan pkg tag base wire claim status; do
    if [[ "$id" =~ ^# ]]; then continue; fi
    if [[ -z "$id" ]]; then continue; fi
    [[ -n "$repo" && -n "$lic" && -n "$chan" && -n "$base" && -n "$wire" ]] || bad="$bad $id:empty"
    case "$claim" in M0|M1|M2|M3|M4) ;; *) bad="$bad $id:claim=$claim";; esac
    case "$status" in synced|watch|license-risk|retired) ;; *) bad="$bad $id:status=$status";; esac
  done < "$REG"
  if [[ -z "$bad" ]]; then
    echo "✓ runtimes.tsv 结构通过（22 = 4 deep + 6 cli + 5 method + 7 未接线；19 synced / 2 watch / 1 license-risk）"
    return 0
  fi
  echo "✗ runtimes.tsv 结构异常:$bad" >&2
  return 1
}

latest_for() {  # $1=channel $2=pkg $3=repo $4=tag_regex → stdout（空=unknown）
  local chan="$1" pkg="$2" repo="$3" rx="$4"
  [[ "$OFFLINE" -eq 1 ]] && { printf ''; return 0; }
  case "$chan" in
    npm)
      command -v npm >/dev/null 2>&1 || { printf ''; return 0; }
      npm view "$pkg" version 2>/dev/null | head -1 ;;
    pypi)
      command -v curl >/dev/null 2>&1 || { printf ''; return 0; }
      curl -fsS --max-time 10 "https://pypi.org/pypi/${pkg}/json" 2>/dev/null \
        | sed -n 's/.*"version":[[:space:]]*"\([^"]*\)".*/\1/p' | head -1 ;;
    git)
      command -v git >/dev/null 2>&1 || { printf ''; return 0; }
      git ls-remote --tags --refs --sort=-v:refname "https://github.com/${repo}.git" 2>/dev/null \
        | sed 's#.*refs/tags/##' | grep -E "$rx" | head -1 ;;
    materialized)
      printf 'materialized' ;;
    host)
      printf 'host' ;;
    *) printf '' ;;
  esac
}

probe_json() {
  local id repo lic chan pkg tag base wire claim status latest drift checked first=1
  printf '['
  while IFS=$'\t' read -r id repo lic chan pkg tag base wire claim status; do
    if [[ "$id" =~ ^# ]]; then continue; fi
    if [[ -z "$id" ]]; then continue; fi
    latest="$(latest_for "$chan" "$pkg" "$repo" "$tag")"
    drift="unknown"; checked="offline"
    if [[ "$OFFLINE" -eq 1 ]]; then
      latest=""
    else
      checked="$chan"
      if [[ -n "$latest" && "$latest" != "materialized" && "$latest" != "host" ]]; then
        if [[ "$latest" == "$base" ]]; then drift="no"; else drift="yes"; fi
      fi
    fi
    [[ $first -eq 0 ]] && printf ','
    first=0
    printf '{"id":"%s","repo":"%s","license":"%s","channel":"%s","pkg_name":"%s","baseline":"%s","latest":"%s","drift":"%s","wiring":"%s","claim":"%s","status":"%s","checked":"%s"}' \
      "$(json_escape "$id")" "$(json_escape "$repo")" "$(json_escape "$lic")" "$(json_escape "$chan")" \
      "$(json_escape "$pkg")" "$(json_escape "$base")" "$(json_escape "$latest")" "$drift" \
      "$(json_escape "$wire")" "$(json_escape "$claim")" "$(json_escape "$status")" "$checked"
  done < "$REG"
  printf ']\n'
}

case "$MODE" in
  check) check_table ;;
  json) probe_json ;;
esac
