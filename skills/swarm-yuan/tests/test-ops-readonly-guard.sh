#!/usr/bin/env bash
# test-ops-readonly-guard.sh — 运维排障底座四件套接线与行为断言（运维排障底座轮 2026-10-22）
#
# 覆盖四件产物：①ops-readonly-guard.sh（分类判定电池 + judge 留痕/退出码）
# ②tunnel.sh/tunnel.conf（占位模板 fail-closed、配置后 print/dry-run/doctor、坏条目拒）
# ③references/bugfix-runbook.md + remote-debug-jvm.md（实存/路由头/分发纪律）
# ④登记面六处（dist.tsv/references.tsv/UNIVERSAL_FILES 块/capability-map/
# task-methodology-router/SKILL.md 路由 + facts 计数 + USER_FILLABLE + _idx_desc）。
#
# 用法: bash tests/test-ops-readonly-guard.sh（parallel_safe：只读写 mktemp 临时目录）
set -u
cd "$(dirname "${0}")/.." || exit 1
pass=0; fail=0
ok() { echo "  ✓ $1"; pass=$((pass+1)); }
bad() { echo "  ✗ $1"; fail=$((fail+1)); }
has() {  # $1=文件 $2=固定串 $3=说明
  if grep -qF -- "$2" "$1" 2>/dev/null; then ok "$3"; else bad "$3（缺: $2）"; fi
}
hasnt() {  # $1=文件 $2=ERE $3=说明
  if grep -qE -- "$2" "$1" 2>/dev/null; then bad "$3（命中: $2）"; else ok "$3"; fi
}

GUARD=scripts/ops-readonly-guard.sh
TUNNEL=scripts/tunnel.sh
TCONF=assets/tunnel.conf
RB=references/bugfix-runbook.md
JDWP=references/remote-debug-jvm.md

echo "▶ 文件实存与路由头"
for f in "$GUARD" "$TUNNEL" "$TCONF" "$RB" "$JDWP"; do
  if [[ -s "$f" ]]; then ok "$f 非空"; else bad "$f 缺失或为空"; fi
done
for f in "$RB" "$JDWP"; do
  has "$f" "何时读我" "$f 带路由头"
done
has "$TCONF" "（填入" "tunnel.conf 保留（填入占位（用户可填充门禁依赖此标记）"

echo "▶ 守卫分类判定（fail-closed 电池）"
g() {  # $1=expect(allow/deny) $2=kind $3=文本 $4=说明
  local out
  out="$(bash "$GUARD" classify "$2" "$3" 2>/dev/null | cut -d'|' -f1)"
  if [[ "$out" == "$1" ]]; then ok "$4"; else bad "$4（expect=${1} got=${out}）"; fi
}
g allow sql "SELECT * FROM t WHERE x=1" "SQL SELECT 放行"
g allow sql "WITH c AS (SELECT 1) SELECT * FROM c" "SQL WITH-SELECT 放行"
g allow sql "(SELECT 1) UNION (SELECT 2)" "SQL 括号联合查询放行"
g allow sql "explain select * from t; show processlist;" "SQL 多语句只读放行"
g deny  sql "UPDATE t SET x=1" "SQL UPDATE 拒绝"
g deny  sql "select 1; drop table t" "SQL 夹带 DROP 拒绝"
g deny  sql "WITH c AS (SELECT 1) INSERT INTO t SELECT * FROM c" "SQL WITH-INSERT 拒绝"
g deny  sql "SELECT * FROM t INTO OUTFILE '/tmp/x'" "SQL OUTFILE 侧信道拒绝"
g deny  sql "TRUNCATE TABLE t" "SQL TRUNCATE 拒绝"
g allow shell "tail -n 200 /var/log/app.log" "shell tail 放行"
g allow shell "ssh jump 'tail -n 100 /var/log/app/trace.log'" "shell ssh 远端只读取证放行"
g allow shell "mysql -h db -u reader -e 'SELECT COUNT(*) FROM orders'" "shell mysql 只读语句放行"
g allow shell "jstack 12345" "shell jstack 现场取证放行"
g allow shell "scp -P 22 user@host:/var/log/app.log /tmp/app.log" "shell scp 下行拉取放行"
g allow shell "kubectl get pods -n prod" "shell kubectl get 放行"
g allow shell "systemctl status nginx" "shell systemctl status 放行"
g deny  shell "rm -rf /tmp/x" "shell rm 拒绝"
g deny  shell "sed -i.bak 's/a/b/' f.txt" "shell sed -i 拒绝"
g deny  shell "find /var -name '*.log' -delete" "shell find -delete 拒绝"
g deny  shell "curl -X POST http://api/x -d '{}'" "shell curl 写方法拒绝"
g deny  shell "git push origin main" "shell git push 拒绝"
g deny  shell "kubectl delete pod api-7d9" "shell kubectl delete 拒绝"
g deny  shell "docker exec -it app sh" "shell docker exec 拒绝"
g deny  shell "systemctl restart nginx" "shell systemctl restart 拒绝"
g deny  shell "redis-cli -h r SET k v" "shell redis 写命令拒绝"
g deny  shell "mysql -h db -u reader -e 'DELETE FROM orders'" "shell mysql 写语句拒绝"
g deny  shell "scp /tmp/local.txt user@host:/tmp/r.txt" "shell scp 上行拒绝"
g deny  shell "rsync -av /tmp/x/ user@host:/tmp/x/" "shell rsync 上行拒绝"
g deny  shell "ssh jump 'rm /var/log/app.log'" "shell ssh 远端写拒绝"
g deny  shell "python3 -c 'print(1)'" "shell 解释器类拒绝（任意代码执行）"
g deny  shell 'echo $(rm -rf /tmp/x)' "shell 命令替换包裹写动词拒绝（R139）"
g deny  shell 'grep foo `rm -rf /tmp/x` app.log' "shell 反引号包裹写动词拒绝（R139）"
g deny  shell 'tail -n 10 $(chmod 777 /tmp/x)' "shell $() 内 chmod 拒绝（R139）"
g deny  shell '(kill 12345)' "shell 子壳括号写动词拒绝（R139）"
g allow shell 'echo $(date)' "shell 只读命令替换放行（不误伤）"
g deny  shell "foo bar baz" "shell 未识别命令拒绝（fail-closed）"
g deny  shell "ssh -f -N -L 5432:db:5432 jump" "shell 裸隧道拒绝（须走 tunnel.sh）"

echo "▶ 守卫 judge 模式留痕与退出码"
TD="$(mktemp -d "${TMPDIR:-/tmp}/swarm-ops-guard.XXXXXX")"
bash "$GUARD" --project-dir "$TD" sql -- "SELECT 1" >/dev/null 2>&1; rc1=$?
bash "$GUARD" --project-dir "$TD" shell -- "DROP TABLE t" >/dev/null 2>&1; rc2=$?
_lines="$(wc -l < "$TD/.swarm-yuan/ops.jsonl" 2>/dev/null | tr -d ' ')"
_v2="$(sed -n '2p' "$TD/.swarm-yuan/ops.jsonl" 2>/dev/null | grep -o '"verdict":"[a-z]*"')"
[[ $rc1 -eq 0 ]] && ok "只读 exit 0" || bad "只读 exit=${rc1}（应 0）"
[[ $rc2 -eq 22 ]] && ok "写操作 exit 22" || bad "写操作 exit=${rc2}（应 22）"
[[ "$_lines" == "2" ]] && ok "ops.jsonl 两条留痕" || bad "ops.jsonl 行数=${_lines}（应 2）"
[[ "$_v2" == '"verdict":"deny"' ]] && ok "第二条留痕 verdict=deny" || bad "第二条 verdict=$_v2"
rm -rf "$TD"

echo "▶ 隧道编排（tunnel.sh）"
TT="$(mktemp -d "${TMPDIR:-/tmp}/swarm-ops-tunnel.XXXXXX")"
bash "$TUNNEL" --conf "$TCONF" doctor >/dev/null 2>&1; _rc=$?
[[ $_rc -eq 1 ]] && ok "占位模板 fail-closed（doctor exit 1）" || bad "占位模板 doctor exit=${_rc}（应 1）"
cat > "$TT/tunnel.conf" <<'EOF'
JUMP_HOST="ops@bastion.corp -p 2222"
TUNNELS="db:15432:db-internal.rd:5432,jdwp:15005:app-internal.rd:5005"
EOF
_out="$(bash "$TUNNEL" --conf "$TT/tunnel.conf" print 2>/dev/null)"
if printf '%s' "$_out" | grep -q 'ssh -f -N -J ops@bastion.corp -p 2222 -L 127.0.0.1:15432:db-internal.rd:5432'; then
  ok "print 输出 ProxyJump 命令（db 条目）"
else bad "print 未含 db 条目命令"; fi
if printf '%s' "$_out" | grep -q '127.0.0.1:15005:app-internal.rd:5005'; then
  ok "print 输出 jdwp 条目（回环绑定）"
else bad "print 未含 jdwp 条目"; fi
_up="$(bash "$TUNNEL" --conf "$TT/tunnel.conf" up --dry-run 2>/dev/null)"
if printf '%s' "$_up" | grep -q '\[dry-run\].*db：ssh'; then
  ok "up --dry-run 只打印不执行"
else bad "up --dry-run 输出异常"; fi
bash "$TUNNEL" --conf "$TT/tunnel.conf" doctor >/dev/null 2>&1; _rc=$?
[[ $_rc -eq 1 ]] && ok "doctor 端口不通 exit 1（体检语义）" || bad "doctor exit=${_rc}（应 1）"
printf 'JUMP_HOST="a@b"\nTUNNELS="db:xx:host:5432"\n' > "$TT/tunnel.conf"
if bash "$TUNNEL" --conf "$TT/tunnel.conf" up 2>&1 | grep -q "格式错误"; then
  ok "坏条目（非数字端口）拒绝"
else bad "坏条目未拒绝"; fi
# R139 闭环：伪进程以 print 输出的同构参数序起（不真连 ssh）——status 须见「进程在」、
# down 须能结束该进程。旧模式要求 -N 在 -L 段之后而 ssh_cmd 把 -N 放最前，两项皆空转。
printf 'JUMP_HOST="probe@jump.test -p 2222"\nTUNNELS="db:15432:db-internal:5432"\n' > "$TT/t2.conf"
_ssh_cmd="$(bash "$TUNNEL" --conf "$TT/t2.conf" print 2>/dev/null | tail -1)"
# （sleep 后接 true 成复合命令：单命令会被 bash -c 优化为 exec，附加 argv 丢失）
# shellcheck disable=SC2086
bash -c 'sleep 20; true' $_ssh_cmd &
_fpid=$!
sleep 1
if bash "$TUNNEL" --conf "$TT/t2.conf" status 2>/dev/null | grep -q '进程在(pid'; then
  ok "status 能看到本脚本特征的隧道进程（参数序与 ssh_cmd 一致）"
else bad "status 看不到隧道进程（匹配模式与 ssh_cmd 参数序漂移）"; fi
bash "$TUNNEL" --conf "$TT/t2.conf" down >/dev/null 2>&1
wait "$_fpid" 2>/dev/null; _wrc=$?
if [[ $_wrc -gt 128 ]]; then
  ok "down 结束隧道进程（信号终止，rc=${_wrc}）"
else bad "down 后进程未终止（wait rc=${_wrc}，泄漏）"; kill -9 "$_fpid" 2>/dev/null; wait "$_fpid" 2>/dev/null; fi
rm -rf "$TT"

echo "▶ 登记面（六处接线）"
has assets/registry/dist.tsv "scripts/ops-readonly-guard.sh	target	standard	copy	gen" "dist.tsv 登记守卫"
has assets/registry/dist.tsv "scripts/tunnel.sh	target	standard	copy	gen" "dist.tsv 登记 tunnel.sh"
has assets/registry/dist.tsv "scripts/tunnel.conf	target	standard	copy	assets" "dist.tsv 登记 tunnel.conf"
has assets/registry/dist.tsv "references/bugfix-runbook.md" "dist.tsv 登记 runbook"
has assets/registry/dist.tsv "references/remote-debug-jvm.md" "dist.tsv 登记 JDWP 档"
has assets/registry/references.tsv "bugfix-runbook	verification" "references.tsv 登记 runbook（verification 族）"
has assets/registry/references.tsv "remote-debug-jvm	verification" "references.tsv 登记 JDWP 档"
has scripts/generate-skill.sh "scripts/ops-readonly-guard.sh|gen|standard" "UNIVERSAL_FILES 含守卫"
has scripts/generate-skill.sh "scripts/tunnel.sh|gen|standard" "UNIVERSAL_FILES 含 tunnel.sh"
has scripts/generate-skill.sh "scripts/tunnel.conf|assets|standard" "UNIVERSAL_FILES 含 tunnel.conf"
has scripts/generate-skill.sh "references/bugfix-runbook.md|ref|standard" "UNIVERSAL_FILES 含 runbook"
has scripts/generate-skill.sh "references/remote-debug-jvm.md|ref|standard" "UNIVERSAL_FILES 含 JDWP 档"
has scripts/generate-skill.sh '"scripts/tunnel.conf"' "tunnel.conf 入 USER_FILLABLE_FILES（升级保留）"
has scripts/generate-skill.sh 'ops-readonly-guard.sh) echo "外部操作只读守卫"' "_idx_desc 守卫用途"
has scripts/generate-skill.sh 'bugfix-runbook.md) echo "排障六步流水线"' "_idx_desc runbook 用途"
has references/capability-map.md "| bugfix-runbook |" "capability-map 登记 runbook"
has references/capability-map.md "| remote-debug-jvm |" "capability-map 登记 JDWP 档"
has references/task-methodology-router.md "bugfix-runbook（六步流水线" "task-router fix 分派接 runbook"
has SKILL.md "bugfix-runbook（fix 任务连研发环境排障六步流水线）" "SKILL.md 路由表接 runbook"
has assets/facts.conf "FACT_REFERENCES=57" "facts FACT_REFERENCES=57"
has assets/facts.conf "FACT_UNIVERSAL_FILES=103" "facts FACT_UNIVERSAL_FILES=103"
has assets/env-setup.sh "tunnel.sh\" doctor" "env-setup 隧道体检示例"

echo "▶ 分发面纪律（目标技能 --verify-completeness 兼容）"
for f in "$RB" "$JDWP"; do
  hasnt "$f" '待填充|<占位符>|填充指引' "$f 无占位符模式"
  hasnt "$f" '^[[:space:]]*- \[ \]' "$f 无未勾选 checkbox"
  _sz=$(wc -c < "$f" | tr -d ' ')
  if [[ "$_sz" -le 40960 ]]; then ok "$f 体积 ${_sz}B ≤ 40KiB"; else bad "$f 体积 ${_sz}B 超 40KiB"; fi
done
# runbook 交叉接线：runbook ↔ JDWP ↔ 守卫/隧道互引
has "$RB" "remote-debug-jvm.md" "runbook 引用 JDWP 档"
has "$JDWP" "bugfix-runbook.md" "JDWP 档引用 runbook"
has "$RB" "ops-readonly-guard.sh" "runbook 接守卫"
has "$RB" "tunnel.conf" "runbook 接隧道配置"

echo ""
echo "pass=$pass fail=$fail"
[[ $fail -eq 0 ]] || exit 1
exit 0
