#!/usr/bin/env bash
# run.sh — 统一测试 runner（WP9）
#
# 用法:
#   bash tests/run.sh [--level all|0-5|0,1] [--jobs N] [--isolated]
#                     [--format text|tap] [--filter SUBSTR] [--list]
#
# 元数据: tests/index.tsv（test / level / parallel_safe / owner / since）。
#   未登记的测试默认 level=2、parallel_safe=yes。
# 并行: 按批启动 N 个后台作业（bash 3.2 无 wait -n），批内并发、批间串行；
#   parallel_safe=no 的测试排到最后逐个独占，不与任何测试同跑。
# 隔离: --isolated 为每个测试设置独立 TMPDIR；不修改 HOME。
# 锁: 同一仓库树单实例；SWARM_RUN_NO_LOCK=1 可跳过（供 runner 自身契约测试）。
set -uo pipefail

BASE="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
. "$BASE/assets/lib/run.sh"
IDX="$BASE/tests/index.tsv"
JOBS=1
LEVEL="all"
FORMAT="text"
FILTER=""
ISOLATED=0
LIST=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --level) LEVEL="${2:?--level 需要 all|0-5|0,1}"; shift 2 ;;
    --jobs) JOBS="${2:?--jobs 需要正整数}"; shift 2 ;;
    --isolated) ISOLATED=1; shift ;;
    --format) FORMAT="${2:?--format 需要 text|tap}"; shift 2 ;;
    --filter) FILTER="${2:?--filter 需要子串}"; shift 2 ;;
    --list) LIST=1; shift ;;
    -h|--help) sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "未知参数: $1" >&2; exit 2 ;;
  esac
done
case "$JOBS" in ''|*[!0-9]*|0) echo "--jobs 必须是正整数" >&2; exit 2 ;; esac
case "$FORMAT" in text|tap) ;; *) echo "--format 只支持 text|tap" >&2; exit 2 ;; esac

# 单实例锁（按仓库路径哈希；陈旧锁回收）
if [[ "${SWARM_RUN_NO_LOCK:-0}" != "1" ]]; then
  LOCK_DIR="${TMPDIR:-/tmp}/swarm-yuan-run.$(printf '%s' "$BASE" | cksum | awk '{print $1}').lock"
  if ! run_lock "$LOCK_DIR"; then
    owner="$(cat "$LOCK_DIR/pid" 2>/dev/null || true)"
    echo "✗ 已有 runner 在本仓库树运行（pid ${owner}）" >&2
    exit 2
  fi
  trap 'run_unlock "$LOCK_DIR"' EXIT
fi

level_of() {  # $1=test basename → level（index 优先，默认 2）
  local l=""
  if [[ -f "$IDX" ]]; then
    l="$(awk -F '\t' -v n="$1" '!/^#/ && $1==n {print $2; exit}' "$IDX")"
  fi
  printf '%s' "${l:-2}"
}
safe_of() {  # $1=test basename → yes/no（默认 yes）
  local s=""
  if [[ -f "$IDX" ]]; then
    s="$(awk -F '\t' -v n="$1" '!/^#/ && $1==n {print $3; exit}' "$IDX")"
  fi
  printf '%s' "${s:-yes}"
}
level_match() {  # $1=level → rc 0=选中
  local l="$1"
  if [[ "$LEVEL" == "all" ]]; then return 0; fi
  if [[ "$LEVEL" == *-* ]]; then
    local lo="${LEVEL%-*}" hi="${LEVEL#*-}"
    [[ "$l" -ge "$lo" && "$l" -le "$hi" ]]
    return
  fi
  case ",${LEVEL}," in *",${l},"*) return 0 ;; *) return 1 ;; esac
}

TESTS=(); LEVELS=(); SAFE=()
for t in "$BASE"/tests/test-*.sh "$BASE"/tests/scripts/test-*.sh; do
  [[ -f "$t" ]] || continue
  n="$(basename "$t")"
  [[ -n "$FILTER" && "$n" != *"$FILTER"* ]] && continue
  l="$(level_of "$n")"
  level_match "$l" || continue
  TESTS+=("$t"); LEVELS+=("$l"); SAFE+=("$(safe_of "$n")")
done

N="${#TESTS[@]}"
if [[ "$LIST" -eq 1 ]]; then
  i=0
  while [[ "$i" -lt "$N" ]]; do
    printf '%s\t%s\t%s\n' "${LEVELS[$i]}" "${SAFE[$i]}" "$(basename "${TESTS[$i]}")"
    i=$((i+1))
  done
  exit 0
fi
if [[ "$N" -eq 0 ]]; then
  echo "✗ 零测试命中（level=${LEVEL} filter=${FILTER}）——拒绝假绿" >&2
  exit 2
fi

LOG_DIR="$(run_tmpdir swarm-run)"
PASS=0; FAIL=0; IDXNO=0
[[ "$FORMAT" == "tap" ]] && echo "1..${N}"

run_one() {  # $1=test path $2=log；后台执行，rc 写入 $2.rc
  local t="$1" log="$2" iso=""
  if [[ "$ISOLATED" -eq 1 ]]; then
    iso="$(mktemp -d "${TMPDIR:-/tmp}/swarm-iso.XXXXXX")"
  fi
  (
    if [[ -n "$iso" ]]; then TMPDIR="$iso" bash "$t" > "$log" 2>&1; else bash "$t" > "$log" 2>&1; fi
    echo $? > "$log.rc"
    [[ -n "$iso" ]] && rm -rf "$iso"
  ) &
}

# 调度：parallel_safe=yes 按 JOBS 批并发；parallel_safe=no 排到最后逐个独占，
# 批内不与任何测试同跑（安装/卸载、self-check 缓存、离线包等共享状态测试）。
SAFE_IDX=(); UNSAFE_IDX=()
k=0
while [[ "$k" -lt "$N" ]]; do
  if [[ "${SAFE[$k]}" == "no" ]]; then UNSAFE_IDX+=("$k"); else SAFE_IDX+=("$k"); fi
  k=$((k+1))
done

run_batches() {  # $1=批大小 $2..=TESTS 下标；每批并发启动、等待、按序汇报
  local jobs="$1"; shift
  local idx=("$@") i=0 n=0 batch_end j p rc name log
  local pids=() logs=()
  n="${#idx[@]}"
  while [[ "$i" -lt "$n" ]]; do
    batch_end=$((i + jobs))
    [[ "$batch_end" -gt "$n" ]] && batch_end="$n"
    pids=(); logs=()
    j="$i"
    while [[ "$j" -lt "$batch_end" ]]; do
      log="$LOG_DIR/$(printf '%03d' "${idx[$j]}")-$(basename "${TESTS[${idx[$j]}]}" .sh).log"
      run_one "${TESTS[${idx[$j]}]}" "$log"
      pids+=("$!"); logs+=("$log")
      j=$((j+1))
    done
    for p in "${pids[@]}"; do wait "$p" 2>/dev/null || true; done
    j="$i"
    while [[ "$j" -lt "$batch_end" ]]; do
      IDXNO=$((IDXNO+1))
      rc="$(cat "${logs[$((j-i))]}.rc" 2>/dev/null || echo 1)"
      name="$(basename "${TESTS[${idx[$j]}]}")"
      if [[ "$rc" -eq 0 ]]; then
        PASS=$((PASS+1))
        if [[ "$FORMAT" == "tap" ]]; then echo "ok ${IDXNO} - ${name}"; else echo "  ✓ ${name}"; fi
      else
        FAIL=$((FAIL+1))
        if [[ "$FORMAT" == "tap" ]]; then
          echo "not ok ${IDXNO} - ${name}"
          echo "# log: ${logs[$((j-i))]}"
        else
          echo "  ✗ ${name}（日志: ${logs[$((j-i))]}）"
        fi
      fi
      j=$((j+1))
    done
    i="$batch_end"
  done
}
run_batches "$JOBS" ${SAFE_IDX[@]+"${SAFE_IDX[@]}"}
run_batches 1 ${UNSAFE_IDX[@]+"${UNSAFE_IDX[@]}"}

echo "=== runner: ${PASS} 通过 / ${FAIL} 失败（共 ${N}，jobs=${JOBS}，独占串行 ${#UNSAFE_IDX[@]}）==="
if [[ "$FAIL" -eq 0 ]]; then rm -rf "$LOG_DIR"; exit 0; fi
echo "失败日志保留: $LOG_DIR"
exit 1
