#!/usr/bin/env bash
# test-r106-devchain-fixes.sh — 生成链五缺陷防复发锁（R106 第二批：D9/D10/D12/D13/D14）
# D9  交付形态嗅探 backend-service 判据偏 JS（Go/Django/JVM 后端全漏）
# D10 trace-log.sh --project-dir 旗标文档有、解析器无（传入即未知参数 exit 1）
# D12 inject/upgrade 的"行存在即跳过"≠mark-active 的"空=未填"——照交接清单填必漏框架
# D13 check_security 把 ? 绑定值实参位拼接误判 SQL 注入（参数化子查询 fail）
# D14 spf_path_in_dirs 只认独立参数迭代——L3 传 "${ARR[*]}" 拼接串永远不命中（多目录可写区 L3 盲）
set -uo pipefail
cd "$(dirname "${0}")/.." || exit 1   # swarm-yuan/
FAIL=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1" >&2; FAIL=1; }

GEN_ROOT="$(cd .. && pwd)"
SB="$(mktemp -d "${TMPDIR:-/tmp}/r106-fixes.XXXXXX")"
trap 'rm -rf "$SB"' EXIT

# ===== ① D9：Go 后端形态嗅探 =====
mkdir -p "$SB/goproj"
printf 'module t\n\ngo 1.24\n' > "$SB/goproj/go.mod"
printf 'package main\nfunc main(){}\n' > "$SB/goproj/main.go"
bash scripts/generate-skill.sh d9-probe "$SB/goproj" > "$SB/d9.log" 2>&1
if grep -q 'backend-service' "$SB/goproj/.claude/skills/d9-probe/SKILL.md" 2>/dev/null; then
  ok "1a Go 后端（go.mod+main.go）嗅出 backend-service"
else
  bad "1a Go 后端形态嗅探漏（D9 回潮）"
fi
# 1b Django 形态
mkdir -p "$SB/djproj"
printf '# manage\n' > "$SB/djproj/manage.py"
bash scripts/generate-skill.sh d9-dj "$SB/djproj" > "$SB/d9b.log" 2>&1
grep -q 'backend-service' "$SB/djproj/.claude/skills/d9-dj/SKILL.md" 2>/dev/null && ok "1b Django（manage.py）嗅出 backend-service" || bad "1b Django 形态嗅探漏"
# 1c 去重防拼接：双信号并存只计一次
n_bs=$(grep -m1 '交付形态嗅探' "$SB/goproj/.claude/skills/d9-probe/SKILL.md" 2>/dev/null | grep -o 'backend-service' | wc -l | tr -d ' ')
[[ "$n_bs" -eq 1 ]] && ok "1c backend-service 单次计形（去重）" || bad "1c 形态标记重复拼接（${n_bs} 次）"

# ===== ② D10：trace-log --project-dir 旗标 =====
mkdir -p "$SB/proj/.swarm-yuan"
out=$(bash assets/trace-log.sh --project-dir "$SB/proj" --node "t" --tool "probe" 2>&1); rc=$?
if [[ $rc -eq 0 && "$out" != *"未知参数"* ]]; then
  ok "2a --project-dir 旗标可解析（rc=0）"
else
  bad "2a --project-dir 旗标回潮失效（rc=${rc} out=${out}）"
fi
[[ -f "$SB/proj/.swarm-yuan/trace.jsonl" ]] && ok "2b 留痕落指定 --project-dir" || bad "2b trace.jsonl 未落指定目录"

# ===== ③ D12：模板空值行就地打 TODO 标记 =====
# react 的 REACT_SRC_GLOBS 在静态模板中存在且为空——inject 后该行必须带 TODO(framework-gates) 标记
mkdir -p "$SB/feproj/src"
printf '{"name":"fe","dependencies":{"react":"^18.0.0","antd":"^5.0.0","vite":"^5.0.0"}}\n' > "$SB/feproj/package.json"
printf '<!doctype html><html></html>\n' > "$SB/feproj/index.html"
printf 'export default {}\n' > "$SB/feproj/src/App.jsx"
bash scripts/generate-skill.sh --profile standard d12-probe "$SB/feproj" > "$SB/d12.log" 2>&1
ARCH="$SB/feproj/.claude/skills/d12-probe/scripts/precheck.arch.conf"
if [[ -f "$ARCH" ]] && grep -q '^REACT_SRC_GLOBS=.*TODO(framework-gates)' "$ARCH"; then
  ok "3a 模板空值行（REACT_SRC_GLOBS）就地带 TODO 标记"
else
  bad "3a 空值行无 TODO 标记（D12 回潮——照清单填必漏 react）"
fi
# 3b 幂等：重跑 inject 不重复打标
n_mark=$(grep -c 'REACT_SRC_GLOBS=.*TODO(framework-gates)' "$ARCH" 2>/dev/null || echo 0)
bash scripts/generate-skill.sh --inject-frameworks "$SB/feproj/.claude/skills/d12-probe" > "$SB/d12b.log" 2>&1
n_mark2=$(grep -c 'REACT_SRC_GLOBS=.*TODO(framework-gates)' "$ARCH" 2>/dev/null || echo 0)
[[ "$n_mark" -eq "$n_mark2" && "$n_mark2" -ge 1 ]] && ok "3b inject 幂等（标记数 ${n_mark2} 稳定）" || bad "3b 重跑后标记漂移（${n_mark}→${n_mark2}）"

# ===== ④ D13：参数化绑定值豁免（行为级=security 夹具双态，compliant 含豁免形态） =====
if bash tests/run-gate-fixture.sh security > "$SB/d13.log" 2>&1; then
  ok "4a security 夹具双态绿（compliant 含 ? 绑定值拼接豁免形态；violating 真拼接仍拦）"
else
  bad "4a security 夹具双态红（豁免形态误判回潮或真拼接漏拦）"
fi
# 4b 豁免正则在位（配置锁）
grep -q '参数化绑定值豁免' assets/gates-strict.sh && ok "4b gates-strict 含参数化绑定值豁免段" || bad "4b 豁免段缺失"

# ===== ⑤ D14：spf_path_in_dirs 两态传参 + 文件型条目 =====
cat > "$SB/spf-unit.sh" <<'UNIT'
source "${SPF_LIB}"
r1=0; spf_path_in_dirs "/p/root/internal/a.go" "/p/root" "internal frontend/src main.go" || r1=1
r2=0; spf_path_in_dirs "/p/root/internal/a.go" "/p/root" internal frontend/src main.go || r2=1
r3=0; spf_path_in_dirs "/p/root/main.go" "/p/root" "internal frontend/src main.go" || r3=1
r4=1; spf_path_in_dirs "/p/root/README.md" "/p/root" "internal frontend/src main.go" && r4=0
[[ "$r1$r2$r3$r4" == "0001" ]] && exit 13 || exit 1
UNIT
SPF_LIB="$GEN_ROOT/swarm-yuan/assets/spec-first-lib.sh" bash "$SB/spf-unit.sh" > /dev/null 2>&1
_rc=$?
if [[ "$_rc" -eq 13 ]]; then
  ok "5 拼接串目录命中+多参数命中+文件条目命中+未命中正确返回"
else
  bad "5 D14 部分回潮（退出码 $_rc——四判据有未过项）"
fi

if [[ $FAIL -eq 0 ]]; then echo "test-r106-devchain-fixes: PASS"; else echo "test-r106-devchain-fixes: FAIL" >&2; fi
exit $FAIL
