#!/usr/bin/env bash
# ops-readonly-guard.sh — 外部研发资源操作只读守卫（fail-closed，运维排障底座件）
# 场景：AI 连研发环境数据库/服务器日志/隧道做排障取证（references/bugfix-runbook.md 流水线）时，
#   一切对外部资源的操作先过本守卫：只读放行、写操作拒绝、未识别默认拒绝。
# 与 rules.d/readonly-safe.rules 分工：那份管宿主侧 git/CLI 只读白名单（Codex 适配）；
#   本脚本管 AI 对研发环境（DB/SSH 远端）的外部操作，二者对象不同。
# 三道防线：① 凭证层只读账号（账号只授 SELECT——守卫拦不住凭证本身的权限，这是第一道）；
#   ② 本守卫 fail-closed 静态判定（第二道，尽力而为：引号/注释可绕过静态匹配，故凭证层必须先行）；
#   ③ .swarm-yuan/ops.jsonl 账本事后审计（第三道，与 trace.jsonl 同目录同构）。
# 用法:
#   bash ops-readonly-guard.sh sql -- 'SELECT 1'                 # 判定+留痕；写语句 exit 22
#   bash ops-readonly-guard.sh shell -- 'tail -n 200 app.log'    # 判定+留痕；写命令 exit 22
#   bash ops-readonly-guard.sh classify sql 'UPDATE t SET x=1'   # 只打印 verdict|reason，不落盘（测试/预检）
#   可选: --project-dir <dir>  账本落盘根（默认 pwd → <dir>/.swarm-yuan/ops.jsonl）
# 退出码: 0=只读放行 / 22=写操作或未识别（拒绝） / 2=用法错误。
# 约定: 判定结果追加 JSON 行到 ops.jsonl（ts/kind/verdict/reason/op 截断 200 字符）；
#   账本写失败仅 warn 到 stderr，不改变判定与退出码（对齐 trace-log.sh 永不阻塞主流程）。
# 三平台兼容：bash 3.2 / 无 declare -A / date -u / POSIX 字符类。
set -uo pipefail

OPS_KIND=""
OPS_MODE="judge"   # judge=判定+留痕；classify=只判定不落盘
OPS_TEXT=""
PROJECT_DIR="$(pwd)"

_log() { printf '%s\n' "$*" >&2; }

# JSON 最小转义（ASCII 控制字符按 \u00xx，UTF-8 保留；对齐 trace-log.sh 同构实现）
_json_esc() {
  local LC_ALL=C value="$1" char code i out=""
  for ((i=0; i<${#value}; i++)); do
    char="${value:i:1}"
    case "$char" in
      '"') out="${out}\\\"" ;;
      '\') out="${out}\\\\" ;;
      *)
        printf -v code '%d' "'$char"
        if [[ "$code" -ge 0 && "$code" -lt 32 ]]; then
          printf -v char '\\u%04x' "$code"
        fi
        out="${out}${char}" ;;
    esac
  done
  printf '%s' "$out"
}

verdict() { GUARD_VERDICT="$1"; GUARD_REASON="$2"; }

# ---- SQL 判定：剥注释 → 按 ; 拆句 → 逐句验首词；白名单外一律 deny ----
_SQL_READ_FIRST='^(select|show|explain|describe|desc|analyze|with)$'
classify_sql() {
  local sql="$1" stmt first
  # 行级剥注释（-- 与 # 与单行 /* */）；引号内注释符会被误剥——静态判定尽力而为，凭证层先行
  sql="$(printf '%s' "$sql" | sed -e 's/--.*//g' -e 's/#.*//g' -e 's|/\*.*\*/||g' | tr '\n' ' ')"
  [[ -z "${sql//[[:space:];]/}" ]] && { verdict "allow" "空语句（仅注释/空白）"; return 0; }
  local IFS=';'
  for stmt in $sql; do
    # 取首词：压缩空白 → 去行首空格 → 去行首括号（(SELECT ...) UNION 形态）→ 截到首个空格 → 小写化
    first="$(printf '%s' "$stmt" | tr -s '[:space:]' ' ' | sed -e 's/^ *//' -e 's/^( *//' -e 's/).*//' -e 's/ .*//' | tr '[:upper:]' '[:lower:]')"
    [[ -z "$first" ]] && continue
    if [[ "$first" == "with" ]]; then
      # WITH 仅当句内最终动词是 SELECT（CTE 读）放行；WITH ... INSERT/UPDATE/DELETE/MERGE 拒
      if printf '%s' "$stmt" | grep -qiE '[[:space:](]select[[:space:](]' && \
         ! printf '%s' "$stmt" | grep -qiE '[[:space:](](insert|update|delete|merge)[[:space:]]'; then
        continue
      fi
      verdict "deny" "WITH 语句非纯读（含写动词或缺 SELECT）"; return 1
    fi
    if ! printf '%s' "$first" | grep -qE "$_SQL_READ_FIRST"; then
      verdict "deny" "SQL 首词「${first}」不在只读白名单（SELECT/SHOW/EXPLAIN/DESCRIBE/DESC/WITH-SELECT）"; return 1
    fi
    # 读语句内嵌写侧信道：SELECT ... INTO OUTFILE/DUMPFILE、COPY ... FROM PROGRAM
    if printf '%s' "$stmt" | grep -qiE 'into[[:space:]]+(outfile|dumpfile)|from[[:space:]]+program'; then
      verdict "deny" "读语句携带文件写出侧信道（INTO OUTFILE/DUMPFILE / COPY FROM PROGRAM）"; return 1
    fi
  done
  verdict "allow" "全部语句首词在只读白名单"
  return 0
}

# ---- shell 判定：写动词全串扫描 → 首词白名单 → 白名单工具写形态逐项堵 ----
# 只读白名单首词（解释器类 python/node/java 不收——任意代码执行无法静态保证只读；
#   JVM 取证只收 jstack/jstat/jinfo 纯读三件，jmap/jcmd 因可触发 dump/动作从严拒绝）
_SH_READ_FIRST='^(cat|less|more|head|tail|grep|egrep|fgrep|rg|awk|wc|du|df|ls|pwd|file|stat|jq|yq|nc|nslookup|dig|ping|ps|top|htop|netstat|ss|lsof|whoami|id|date|env|printenv|echo|printf|true|journalctl|dmesg|free|uptime|jstack|jstat|jinfo|mysql|psql|mongosh|redis-cli|ssh|scp|rsync|git|kubectl|docker|podman|systemctl|service|curl|wget|sed|find)$'
# 写动词前导字符类含 ( 与反引号：堵命令替换/子壳包裹的写动词（`echo $(rm -rf x)`、
#   `` grep f `rm x` `` 曾因 ( 不在类内而整体放行——R139 实抓，测试电池锁）。
_SH_WRITE_WORD='(^|[[:space:];&|(`(])(rm|rmdir|mv|cp|dd|shred|truncate|split|tee|fdisk|mkfs|mount|umount|chmod|chown|chgrp|chattr|kill|pkill|killall|reboot|shutdown|halt|poweroff|crontab|useradd|userdel|usermod|passwd|visudo|iptables|firewall-cmd|ufw)([[:space:]]|$)'
classify_shell() {
  local cmd="$1" first low last
  cmd="$(printf '%s' "$cmd" | tr '\n' ' ' | sed 's/^ *//')"
  [[ -z "$cmd" ]] && { verdict "deny" "空命令（无法判定，fail-closed 拒绝）"; return 1; }
  first="${cmd%% *}"; low="$(printf '%s' "$first" | tr '[:upper:]' '[:lower:]')"
  last="${cmd##* }"
  # 0) 全串写动词扫描（; & | 分隔的多命令与 ssh 远端串一并覆盖）
  if printf '%s' "$cmd" | grep -qiE "$_SH_WRITE_WORD"; then
    verdict "deny" "命令含写/破坏动词（rm/mv/dd/kill/chmod 等）"; return 1
  fi
  # 1) 首词不在白名单 → 拒（fail-closed）
  if ! printf '%s' "$low" | grep -qE "$_SH_READ_FIRST"; then
    verdict "deny" "命令「${first}」不在只读白名单（fail-closed 默认拒绝；确需执行由人操作或扩白名单+补测试）"; return 1
  fi
  # 2) 白名单工具的写形态逐项堵
  case "$low" in
    sed)
      printf '%s' "$cmd" | grep -qE '(^|[[:space:]])-[a-zA-Z]*[iw]' && { verdict "deny" "sed 携带 -i/-w（就地改写/写文件）"; return 1; } ;;
    find)
      printf '%s' "$cmd" | grep -qE '(^|[[:space:]])-(delete|exec|execdir|fprint|fls|fprintf|ok|okdir)' && { verdict "deny" "find 携带 -delete/-exec 等执行/写侧参数"; return 1; } ;;
    curl)
      printf '%s' "$cmd" | grep -qE '(^|[[:space:]])(-X[[:space:]]*(POST|PUT|DELETE|PATCH)|--data(-raw|-binary|-urlencode)?([[:space:]]|=)|-d[[:space:]=]|-T[[:space:]]|--upload-file)' && { verdict "deny" "curl 非读方法/带请求体（可能写远端）"; return 1; } ;;
    wget)
      printf '%s' "$cmd" | grep -qE '(^|[[:space:]])-O[[:space:]]+[^/[:space:]]' && { verdict "deny" "wget -O 指向具体文件（覆盖写）"; return 1; } ;;
    git)
      printf '%s' "$cmd" | grep -qiE '(^|[[:space:]])(push|commit|checkout|reset|rebase|merge|cherry-pick|revert|clean|restore|switch|tag([[:space:]]+-[dfs])|stash([[:space:]]+(drop|pop|clear))?)($|[[:space:]])' && { verdict "deny" "git 写/变更分支状态子命令（push/commit/checkout 等）"; return 1; } ;;
    kubectl)
      printf '%s' "$cmd" | grep -qiE '^kubectl([[:space:]]+-[a-zA-Z-]+([[:space:]]+[^-][^[:space:]]*)?)*[[:space:]]+(get|describe|logs|top|explain|diff|version|api-resources|api-versions|cluster-info)([[:space:]]|$)' || { verdict "deny" "kubectl 非只读子命令（仅 get/describe/logs/top/explain/diff/version/api-*/cluster-info 放行）"; return 1; }
      printf '%s' "$cmd" | grep -qiE '[[:space:]]exec([[:space:]]|$)' && { verdict "deny" "kubectl exec 进入执行（无法静态保证只读）"; return 1; } ;;
    docker|podman)
      printf '%s' "$cmd" | grep -qiE "^(docker|podman)([[:space:]]+-[a-zA-Z-]+)*[[:space:]]+(ps|images|logs|inspect|version|stats)([[:space:]]|$)" || { verdict "deny" "容器 CLI 非只读子命令（仅 ps/images/logs/inspect/version/stats 放行）"; return 1; } ;;
    systemctl)
      printf '%s' "$cmd" | grep -qiE '^systemctl([[:space:]]+-[a-zA-Z-]+)*[[:space:]]+(status|show|list-units|list-unit-files|is-active|is-enabled|cat)([[:space:]]|$)' || { verdict "deny" "systemctl 非只读子命令（仅 status/show/list-*/is-*/cat 放行）"; return 1; } ;;
    service)
      printf '%s' "$cmd" | grep -qiE '^service([[:space:]]+-[a-zA-Z-]+)*[[:space:]]+[a-zA-Z0-9_.-]+[[:space:]]+status$' || { verdict "deny" "service 仅「<服务名> status」放行"; return 1; } ;;
    redis-cli)
      if printf '%s' "$cmd" | grep -qiE '(^|[[:space:]])((set|setex|mset|del|unlink|expire|persist|hset|hdel|lset|lpush|rpush|lpop|rpop|sadd|srem|spop|zadd|zrem|rename|flushdb|flushall|multi|exec|publish|config|shutdown|slaveof|replicaof))([[:space:]]|$)'; then
        verdict "deny" "redis-cli 写/管理命令（set/del/flush*/config 等）"; return 1
      fi ;;
    mysql|psql|mongosh)
      local q
      q="$(printf '%s' "$cmd" | grep -oE "(-e[[:space:]]+|-c[[:space:]]+)'[^']*'" | sed -E -e "s/^-[ec][[:space:]]+'//" -e "s/'\$//")"
      [[ -z "$q" ]] && { verdict "deny" "DB 客户端未携带可判定的 -c/-e 单引号语句（fail-closed 拒绝；语句请放单引号）"; return 1; }
      classify_sql "$q"; return $? ;;
    scp)
      # scp 最后一个参数恒为目的地：含 : 即上行写远端 → 拒；不含即下行/本地 → 放行
      if printf '%s' "$last" | grep -q ':'; then
        verdict "deny" "scp 目的地含远端（上行写）；仅下行拉取放行"; return 1
      fi ;;
    rsync)
      printf '%s' "$cmd" | grep -qE '[^[:space:]]:[^[:space:]]*([[:space:]]|$)' && printf '%s' "$last" | grep -q ':' && { verdict "deny" "rsync 上行方向（写远端）；仅远端→本地拉取放行"; return 1; }
      printf '%s' "$cmd" | grep -qE '(^|[[:space:]])--delete([[:space:]]|$)' && { verdict "deny" "rsync --delete（删除目标侧文件）"; return 1; } ;;
    ssh)
      # 取末段单引号内远端命令递归判定；无远端命令（交互/隧道）拒——隧道须走 tunnel.sh 统一编排
      local remote
      remote="$(printf '%s' "$cmd" | sed -n "s/.*'\(.*\)'.*/\1/p" | tail -1)"
      if [[ -z "$remote" ]]; then
        verdict "deny" "ssh 未携带远端命令（交互会话无法静态判定；远端取证用 ssh <host> '<命令>' 形态，隧道用 scripts/tunnel.sh）"; return 1
      fi
      classify_shell "$remote"; return $? ;;
  esac
  verdict "allow" "命令只读（白名单首词 ${low}，写形态未命中）"
  return 0
}

GUARD_VERDICT=""; GUARD_REASON=""
main() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      sql|shell) OPS_KIND="$1" ;;
      classify) OPS_MODE="classify" ;;
      --project-dir) PROJECT_DIR="$2"; shift ;;
      --) shift; OPS_TEXT="$*"; break ;;
      -h|--help) sed -n '2,17p' "$0"; exit 0 ;;
      -*) _log "未知选项：$1（用法见 --help）"; exit 2 ;;
      *) OPS_TEXT="$*"; break ;;
    esac
    shift
  done
  [[ -z "$OPS_TEXT" && $# -gt 0 ]] && OPS_TEXT="$*"
  [[ -z "$OPS_KIND" ]] && { _log "缺 kind（sql|shell）"; exit 2; }
  [[ -z "$OPS_TEXT" ]] && { _log "缺操作文本（-- '<SQL 或命令>'）"; exit 2; }

  case "$OPS_KIND" in
    sql) classify_sql "$OPS_TEXT" ;;
    shell) classify_shell "$OPS_TEXT" ;;
  esac
  local rc=$?

  if [[ "$OPS_MODE" == "classify" ]]; then
    printf '%s|%s\n' "$GUARD_VERDICT" "$GUARD_REASON"
    exit 0
  fi

  # 账本留痕（写失败不阻塞：warn 到 stderr，判定与退出码不变）
  local op_esc ts dir
  op_esc="$(_json_esc "${OPS_TEXT:0:200}")"
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  dir="${PROJECT_DIR%/}/.swarm-yuan"
  if ! { mkdir -p "$dir" 2>/dev/null && printf '{"ts":"%s","kind":"%s","verdict":"%s","reason":"%s","op":"%s"}\n' \
      "$ts" "$OPS_KIND" "$GUARD_VERDICT" "$(_json_esc "$GUARD_REASON")" "$op_esc" >> "$dir/ops.jsonl" 2>/dev/null; }; then
    _log "⚠ ops.jsonl 留痕失败（不影响本次判定）"
  fi
  printf '→ ops-readonly-guard[%s] %s — %s\n' "$OPS_KIND" "$GUARD_VERDICT" "$GUARD_REASON" >&2
  [[ $rc -eq 0 ]] || exit 22
  exit 0
}
main "$@"
