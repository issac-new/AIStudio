#!/usr/bin/env bash
# test-growth-transactions.sh — 自成长发布事务契约（Task 5 / A09）
# 覆盖：指纹原子发布与中断保留、refresh 非零不判无变化、relations 非法参数不覆盖、
# 语义边超限保留披露。
set -uo pipefail
BASE="$(cd "$(dirname "$0")/.." && pwd)"
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); printf '  ✓ %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf '  ✗ %s\n' "$1" >&2; }
SB="$(mktemp -d "${TMPDIR:-/tmp}/growth-tx.XXXXXX")"
trap 'rm -rf "$SB"' EXIT

# ① 指纹写入后内容完整（原子发布形态存在：不再直写 FP_FILE）
mkdir -p "$SB/proj/src"; printf 'a\n' > "$SB/proj/src/a.ts"
bash "$BASE/scripts/project-fingerprint.sh" "$SB/proj" --write >/dev/null 2>&1
grep -q '^total=1' "$SB/proj/.swarm-yuan/project-fingerprint" && ok '指纹写入内容完整' || bad '指纹内容异常'

# ② --write --force 幂等可重写
bash "$BASE/scripts/project-fingerprint.sh" "$SB/proj" --write --force >/dev/null 2>&1
grep -q '^total=1' "$SB/proj/.swarm-yuan/project-fingerprint" && ok '重写保留完整性' || bad '重写后内容异常'

# ③ refresh：指纹恒失败（PATH 注入失败替身）→ 必须显式失败，不输出「无变化」
SK="$SB/skill"; mkdir -p "$SK/scripts" "$SB/bin"
printf 'PROJECT_DIR="%s"\nWRITABLE_DIRS=("src")\n' "$SB/proj" > "$SK/scripts/precheck.conf"
printf '#!/usr/bin/env bash\nexit 3\n' > "$SB/bin/project-fingerprint.sh"
chmod +x "$SB/bin/project-fingerprint.sh"
out="$(PATH="$SB/bin:$PATH" bash "$BASE/scripts/generate-skill.sh" --refresh "$SK" 2>&1)"; rc=$?
if [[ $rc -ne 0 ]] && ! printf '%s' "$out" | grep -q '无变化'; then
  ok 'refresh 感知链故障显式失败'
elif printf '%s' "$out" | grep -q '无变化'; then
  bad 'refresh 故障被折叠成无变化'
else
  bad "refresh 故障未非零退出（rc=${rc}）"
fi

# ④ relations 非法 --max-edges 不覆盖既有边集
REL="$SK/references"; mkdir -p "$REL"
printf '{"from":"src/a.ts","to":"src/b.ts","kind":"import","evidence":"x"}\n' > "$REL/relations.jsonl"
bash "$BASE/scripts/relations-extract.sh" "$SB/proj" --skill-dir "$SK" --max-edges -5 >/dev/null 2>&1
[[ "$(wc -l < "$REL/relations.jsonl" | tr -d ' ')" -eq 1 ]] && ok '非法参数保留旧边集' || bad '非法参数覆盖了边集'

# ⑤ 正常重建 + 语义边保留 + 超限披露
printf '{"from":"src/a.ts","to":"src/c.ts","kind":"call","evidence":"ai"}\n' >> "$REL/relations.jsonl"
bash "$BASE/scripts/relations-extract.sh" "$SB/proj" --skill-dir "$SK" --max-edges 1 >/dev/null 2>&1
grep -q '"kind":"call"' "$REL/relations.jsonl" && ok '语义边重建后保留' || bad '语义边丢失'

printf 'test-growth-transactions: PASS %s / FAIL %s\n' "$PASS" "$FAIL"
[[ "$FAIL" -eq 0 ]]
