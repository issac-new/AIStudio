#!/bin/bash
# mx-platform.sh — 跨平台原语层（2026-10-12 双模式轮：mac 单机模拟集群 + Windows 三机真集群）
#
# 边界：只收敛「同一语义、不同实现」的平台差异（进程探测/日期解析/文件元数据/
# 目录同步/防睡眠/sqlite 查询/python3 命令名）。业务库（mx-lib/mx-scenario-lib 等）
# 一律调用本层函数，不得直写 lsof/pgrep/stat -f/date -j/rsync/caffeinate 等平台
# 专属命令——直写即破坏另一平台（Git Bash 无 lsof/pgrep -f/pgid，mac 无 wmic）。
# 平台判定：uname -s → Darwin（mac）/ MINGW*|MSYS*（Git Bash）/ 其它（Linux 照 GNU 走）。
# 纪律：函数失败一律「空输出 + 非零返回」交由调用方按既有 || 兜底语义降级，
# 不在本层 fail（监督器/驱动有自己的失败面）。
set -u

# ── 平台判定 ────────────────────────────────────────────
mxp_os() { uname -s 2>/dev/null || echo unknown; }
mxp_is_mac()  { case "$(mxp_os)" in Darwin) return 0 ;; *) return 1 ;; esac; }
mxp_is_gbash() { case "$(mxp_os)" in MINGW*|MSYS*|CYGWIN*) return 0 ;; *) return 1 ;; esac; }

# ── python3 命令名收敛 ──────────────────────────────────
# Windows 官方 Python 只有 python.exe；库内 25 处 `python3` 裸调用不逐处改——
# 缺 python3 且有 python 时在 SIM bin 落一个 sh shim 并前置 PATH（子进程继承）。
# MX_PYTHON 供需要显式解释器的调用点使用（默认 python3）。
mxp_ensure_python3() {
  command -v python3 >/dev/null 2>&1 && { MX_PYTHON="${MX_PYTHON:-python3}"; return 0; }
  command -v python  >/dev/null 2>&1 || { MX_PYTHON="${MX_PYTHON:-python3}"; return 1; }
  local shim_dir="${AIPAY_SIM_ROOT:-$HOME/ncwk-sim-mux}/bin"
  if mkdir -p "$shim_dir" 2>/dev/null; then
    printf '#!/bin/sh\nexec python "$@"\n' > "$shim_dir/python3" && chmod +x "$shim_dir/python3"
    case ":$PATH:" in *":$shim_dir:"*) ;; *) export PATH="$shim_dir:$PATH" ;; esac
  fi
  MX_PYTHON="${MX_PYTHON:-python3}"
}
mxp_ensure_python3
export MX_PYTHON

# ── 时间戳 → epoch（判活核心，三处同格式 "%Y-%m-%d %H:%M:%S"）─────
# mac 的 date -j -f 是 BSD 独有；GNU date 对「无时区秒级」字符串解析方言不稳。
# 走 python datetime 是唯一跨端稳定解（python3 由上面 shim 保证在位）。
mxp_date_to_epoch() { # "<YYYY-MM-DD HH:MM:SS>" → epoch；失败输出 0
  local ts="${1:-}"
  [[ -n "$ts" ]] || { echo 0; return 1; }
  "$MX_PYTHON" - "$ts" <<'PYEOF' 2>/dev/null || echo 0
import sys
from datetime import datetime
ts = sys.argv[1].strip()
for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S"):
    try:
        print(int(datetime.strptime(ts, fmt).timestamp())); sys.exit(0)
    except ValueError:
        continue
try:
    print(int(datetime.fromisoformat(ts).timestamp())); sys.exit(0)
except ValueError:
    print(0); sys.exit(1)
PYEOF
}

# ── 文件元数据（BSD stat -f / GNU stat -c / python 三兜底）────────
mxp_file_size() { # <path> → 字节；失败输出 0
  local p="$1" v
  if v=$(stat -f %z "$p" 2>/dev/null); then echo "$v"; return 0; fi
  if v=$(stat -c %s "$p" 2>/dev/null); then echo "$v"; return 0; fi
  "$MX_PYTHON" -c "import os,sys; print(os.path.getsize(sys.argv[1]))" "$p" 2>/dev/null || echo 0
}
mxp_file_mtime() { # <path> → "%F %T" 形态 mtime（快照判旧键）；失败输出 unknown
  local p="$1" v
  if v=$(stat -f '%Sm' -t '%F %T' "$p" 2>/dev/null); then echo "$v"; return 0; fi
  if v=$(stat -c '%y' "$p" 2>/dev/null | cut -d. -f1); then echo "$v"; return 0; fi
  "$MX_PYTHON" -c "import os,sys,datetime; print(datetime.datetime.fromtimestamp(os.path.getmtime(sys.argv[1])).strftime('%Y-%m-%d %H:%M:%S'))" "$p" 2>/dev/null || echo unknown
}

# ── 进程探测/终止 ────────────────────────────────────────
# mac：lsof/pgrep/ps 原生。Git Bash：netstat -ano + wmic（Win10 在带）+ ps -W。
mxp_port_pids() { # <port> → 监听 pid 列表（空=无）
  local port="$1"
  if mxp_is_mac; then lsof -ti ":$port" 2>/dev/null; return 0; fi
  netstat -ano 2>/dev/null | awk -v p=":$port" '$0 ~ p && /LISTENING/ {print $NF}' | sort -u
}
mxp_pgrep_f() { # <pattern> → 匹配 pid 列表（命令行全文匹配；空=无）
  local pat="$1" out=""
  if command -v pgrep >/dev/null 2>&1 && pgrep -f "$pat" 2>/dev/null; then return 0; fi
  if mxp_is_gbash && command -v wmic >/dev/null 2>&1; then
    out=$(wmic process where "commandline like '%${pat}%'" get processid 2>/dev/null \
      | tr -d '\r' | awk '$1 ~ /^[0-9]+$/ {print $1}')
    [[ -n "$out" ]] && { echo "$out"; return 0; }
  fi
  ps -ef 2>/dev/null | grep -F -- "$pat" | grep -v grep | awk '{print $2}'
}
mxp_ps_command() { # <pid> → 命令行（启动形态核查用；空=查不到）
  local pid="$1"
  ps -o command= -p "$pid" 2>/dev/null && return 0
  if mxp_is_gbash && command -v wmic >/dev/null 2>&1; then
    wmic process where "processid=${pid}" get commandline 2>/dev/null | tr -d '\r' | sed '/^$/d;/CommandLine/d'
  fi
}
mxp_pid_alive() { kill -0 "$1" 2>/dev/null; }
mxp_kill() { # <pid>：TERM→KILL；Git Bash 对 Windows 原生进程按 WINPID 补 taskkill
  local pid="$1" wp
  kill "$pid" 2>/dev/null || true
  if mxp_pid_alive "$pid"; then
    sleep 1
    kill -9 "$pid" 2>/dev/null || true
    if mxp_is_gbash && mxp_pid_alive "$pid"; then
      wp=$(ps -W 2>/dev/null | awk -v m="$pid" '$1==m {print $4}')
      [[ -n "$wp" ]] && taskkill //F //PID "$wp" >/dev/null 2>&1 || true
    fi
  fi
}

# ── 目录同步（快照供给）──────────────────────────────────
# mac/Linux 有 rsync 用 rsync；Git Bash 无 rsync → tar 管道（保符号链/权限位，
# 语义对齐 rsync -a）。mirror=先清目标再拷（--delete 语义）；exclude=目录名排除
# （rsync --exclude / tar --exclude 同名目录，两个实现都吃）。
mxp_sync_dir() { # <src>/ <dst>/ [mirror] [exclude-name]
  local src="$1" dst="$2" mode="${3:-plain}" excl="${4:-}"
  mkdir -p "$dst"
  if command -v rsync >/dev/null 2>&1; then
    if [[ "$mode" == mirror ]]; then
      if [[ -n "$excl" ]]; then rsync -a --delete --exclude="$excl" "$src" "$dst"; else rsync -a --delete "$src" "$dst"; fi
    else
      if [[ -n "$excl" ]]; then rsync -a --exclude="$excl" "$src" "$dst"; else rsync -a "$src" "$dst"; fi
    fi
    return $?
  fi
  [[ "$mode" == mirror ]] && find "$dst" -mindepth 1 -maxdepth 1 -exec rm -rf {} + 2>/dev/null
  if [[ -n "$excl" ]]; then
    tar --exclude="$excl" -cf - -C "$src" . | tar -xf - -C "$dst"
  else
    tar -cf - -C "$src" . | tar -xf - -C "$dst"
  fi
}

# git 跟踪文件工作态拷贝（agent 源码快照专用：rsync --from0 --files-from 的跨端替身）
mxp_copy_git_tracked() { # <src-tree> <dst> <files0-list>
  local src="$1" dst="$2" list="$3"
  mkdir -p "$dst"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --from0 --files-from="$list" "$src"/ "$dst"/ && return $?
  fi
  tar --null -T "$list" -cf - -C "$src" | tar -xf - -C "$dst"
}

# ── 符号链（软链兜 junction；都在失败时以拷贝兜底）────────
mxp_link_dir() { # <target> <linkname>：目录链接
  local target="$1" link="$2"
  if ln -sfn "$target" "$link" 2>/dev/null; then return 0; fi
  if mxp_is_gbash && command -v cmd >/dev/null 2>&1; then
    local wt wl
    wt=$(cygpath -w "$target" 2>/dev/null || echo "$target")
    wl=$(cygpath -w "$link"   2>/dev/null || echo "$link")
    cmd //c mklink //J "$(printf '%s' "$wl")" "$(printf '%s' "$wt")" >/dev/null 2>&1 && return 0
  fi
  cp -R "$target" "$link" 2>/dev/null
}

# ── 防睡眠（mac caffeinate；Windows 提示走电源策略，不阻断）──────
_mxp_caffeinate_pidfile=""
mxp_prevent_sleep_on() {
  if mxp_is_mac; then
    if ! pgrep -f "caffeinate -dims" >/dev/null 2>&1; then
      nohup caffeinate -dims >/dev/null 2>&1 &
      _mxp_caffeinate_pidfile="/tmp/mx-caffeinate-$!.pid"; echo $! > "$_mxp_caffeinate_pidfile"
      echo "[mxp] caffeinate -dims 已拉起（pid $!，推演期防休眠）"
    fi
    return 0
  fi
  echo "[mxp] 非 mac 平台无 caffeinate——请确保电源计划不在推演期睡眠（管理员: powercfg /change standby-timeout-ac 0）" >&2
}
mxp_prevent_sleep_off() {
  [[ -n "$_mxp_caffeinate_pidfile" && -f "$_mxp_caffeinate_pidfile" ]] && {
    kill "$(cat "$_mxp_caffeinate_pidfile" 2>/dev/null)" 2>/dev/null; rm -f "$_mxp_caffeinate_pidfile"; }
}

# ── 负载预检（mac loadavg；其它平台静默跳过——仅告警面）────────
mxp_loadavg_1m() { # → 数值或空
  uptime 2>/dev/null | sed -E 's/.*load averages?: ([0-9.]+).*/\1/'
}

# ── sqlite（CLI 缺位时走 python 标准库）──────────────────
mxp_sqlite() { # <db> <sql> → 查询输出
  local db="$1" sql="$2"
  if command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 "$db" "$sql" 2>/dev/null
    return $?
  fi
  "$MX_PYTHON" - "$db" "$sql" <<'PYEOF' 2>/dev/null
import sqlite3, sys
con = sqlite3.connect(sys.argv[1])
try:
    for row in con.execute(sys.argv[2]):
        print("\t".join("" if v is None else str(v) for v in row))
finally:
    con.close()
PYEOF
}

# ── 平台自检（mx-doctor/prelaunch 复用；输出人话清单）──────
mxp_selfcheck() {
  local os; os=$(mxp_os); echo "os=$os"
  for c in bash git curl jq node python3; do
    command -v "$c" >/dev/null 2>&1 && echo "ok $c" || echo "MISSING $c"
  done
  mxp_is_gbash && { for c in wmic netstat taskkill; do
    command -v "$c" >/dev/null 2>&1 && echo "ok $c (win)" || echo "MISSING $c (win)"
  done; }
  command -v rsync >/dev/null 2>&1 && echo "ok rsync" || echo "fallback rsync=tar-pipe"
  command -v sqlite3 >/dev/null 2>&1 && echo "ok sqlite3" || echo "fallback sqlite3=python"
}
