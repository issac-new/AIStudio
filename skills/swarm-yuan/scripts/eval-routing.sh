#!/usr/bin/env bash
# eval-routing.sh — 技能描述路由评测（Tier-2 词法近似，零依赖：bash + awk）
#
# 查的是两件真实发生过的事故：描述缺用户会说的词（该触发不触发）、描述过宽（挤掉正确的技能）。
# 机制来源：addyosmani/agent-skills evals Tier-2（TF-IDF 余弦排序 + 正例 top-k + 反例 owner 压过 + rank-1 棘轮），
# 按本仓纪律改写为 bash+awk、用例走 TSV（不引入 node/jq）。
#
# 用法:
#   bash eval-routing.sh --cases <cases.tsv> --skill-dir <目录（内含 */SKILL.md）> [--min-rank1 N]
#   bash eval-routing.sh --cases <cases.tsv> --skill <SKILL.md 路径>...      # 只评单技能（生成期常用）
#
# cases.tsv（制表符分隔；首行表头必须存在）:
#   skill    kind        prompt                     top_k  owner
#   <技能名> positive    <用户的真实说法>            <N>    -
#   <技能名> negative    <本该由别的技能接的话>       -      <那个技能名>
#   top_k 缺省 3；owner 缺省 -（负例不带 owner 只能证明"没排第一"，带 owner 才是成对路由测试）
#
# 判据：正例须排进 top_k；负例不得排第一，带 owner 时须 owner 压过本技能；rank-1 率 ≥ --min-rank1。
# 退出码：0 全过；1 有错级失败；2 无法运行（缺用例/缺技能描述）——2 绝不读成 0。

set -u

CASES=""
SKILL_DIR=""
SKILL_FILES=()
MIN_RANK1=""
TOP_K_DEFAULT=3
COLLISION_ERROR="0.75"   # 两两描述余弦 ≥ 此值判碰撞（两条技能在抢同一批说法）
COLLISION_WARN="0.50"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --cases) CASES="${2:-}"; shift 2 ;;
    --skill-dir) SKILL_DIR="${2:-}"; shift 2 ;;
    --skill) SKILL_FILES+=("${2:-}"); shift 2 ;;
    --min-rank1) MIN_RANK1="${2:-}"; shift 2 ;;
    -h|--help) sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "eval-routing: 未知参数 $1" >&2; exit 2 ;;
  esac
done

[[ -n "$CASES" && -f "$CASES" ]] || { echo "eval-routing: 缺 --cases 或文件不存在（${CASES:-未给}）" >&2; exit 2; }

TMP="$(mktemp -d "${TMPDIR:-/tmp}/swarm-routing.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT
CORPUS="$TMP/corpus.tsv"
: > "$CORPUS"

# 从 SKILL.md frontmatter 取 name / description（description 取单行；缺任一则该文件不计入语料）
_extract() {
  awk -v F="$1" '
    NR == 1 && $0 ~ /^---[[:space:]]*$/ { in_fm = 1; next }
    in_fm && $0 ~ /^---[[:space:]]*$/ { in_fm = 0; exit }
    in_fm && /^name:[[:space:]]*/ { n = $0; sub(/^name:[[:space:]]*/, "", n); name = n }
    in_fm && /^description:[[:space:]]*/ { d = $0; sub(/^description:[[:space:]]*/, "", d); desc = d }
    END {
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", name)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", desc)
      gsub(/^"|"$/, "", desc)
      if (name == "" || desc == "") exit 0
      gsub(/\t/, " ", desc)
      print name "\t" desc
    }' "$1"
}

if [[ ${#SKILL_FILES[@]} -gt 0 ]]; then
  for f in "${SKILL_FILES[@]}"; do
    [[ -f "$f" ]] || { echo "eval-routing: 技能文件不存在：$f" >&2; exit 2; }
    _extract "$f" >> "$CORPUS"
  done
fi
if [[ -n "$SKILL_DIR" ]]; then
  [[ -d "$SKILL_DIR" ]] || { echo "eval-routing: 技能目录不存在：$SKILL_DIR" >&2; exit 2; }
  for f in "$SKILL_DIR"/*/SKILL.md; do
    [[ -f "$f" ]] || continue
    _extract "$f" >> "$CORPUS"
  done
fi
if [[ ${#SKILL_FILES[@]} -eq 0 && -z "$SKILL_DIR" ]]; then
  echo "eval-routing: 缺 --skill-dir 或 --skill" >&2; exit 2
fi
# 去重（同一技能同时由 --skill 与 --skill-dir 提供时不重复计权）
if [[ -s "$CORPUS" ]]; then
  awk -F '\t' '!seen[$1]++' "$CORPUS" > "$TMP/dedup.tsv" && mv "$TMP/dedup.tsv" "$CORPUS"
fi

if [[ ! -s "$CORPUS" ]]; then
  echo "eval-routing: 语料为空（没有任何 SKILL.md 带 name+description）" >&2; exit 2
fi

LC_ALL=C awk -v CORPUS="$CORPUS" -v CASES="$CASES" -v TK="$TOP_K_DEFAULT" -v MINR="${MIN_RANK1:-}" \
    -v CERR="$COLLISION_ERROR" -v CWARN="$COLLISION_WARN" '
function stem(t,   i, suf) {
  if (length(t) > 10 && t ~ /ifications?$/) sub(/ications?$/, "i", t)
  for (i = 1; i <= 6; i++) {
    suf = SFX[i]
    if (length(t) > length(suf) + 3 && substr(t, length(t) - length(suf) + 1) == suf) {
      t = substr(t, 1, length(t) - length(suf)); break
    }
  }
  if (length(t) > 3 && substr(t, length(t)) == "s" && substr(t, length(t) - 1) != "ss") t = substr(t, 1, length(t) - 1)
  if (length(t) > 4 && substr(t, length(t)) == "e") t = substr(t, 1, length(t) - 1)
  if (length(t) > 4) {
    if (substr(t, length(t)) == substr(t, length(t) - 1) && index("aeiou", substr(t, length(t))) == 0) t = substr(t, 1, length(t) - 1)
  }
  if (length(t) > 3 && substr(t, length(t)) == "y") t = substr(t, 1, length(t) - 1) "i"
  return t
}
function flushword(w, out, k,   s2) {
  if (w == "") return k
  if (length(w) <= 2) return k
  if (w in STOP) return k
  out[++k] = stem(w)
  return k
}
function flushcjk(run, out, k,   j, g) {
  # 中文无空格：取 3 字节 n-gram（一个汉字 3 字节），跨字 n-gram 同样稳定可比
  if (length(run) < 3) return k
  for (j = 1; j + 2 <= length(run); j++) {
    g = substr(run, j, 3)
    out[++k] = "c" g
  }
  return k
}
function tok(text, out,   i, n, c, w, run, k) {
  n = length(text); w = ""; run = ""; k = 0
  for (i = 1; i <= n; i++) {
    c = substr(text, i, 1)
    if (c ~ /[A-Za-z0-9]/) {
      if (run != "") { k = flushcjk(run, out, k); run = "" }
      w = w c
    } else if (c ~ /[^ -~]/) {
      if (w != "") { k = flushword(tolower(w), out, k); w = "" }
      run = run c
    } else {
      if (w != "") { k = flushword(tolower(w), out, k); w = "" }
      if (run != "") { k = flushcjk(run, out, k); run = "" }
    }
  }
  if (w != "") k = flushword(tolower(w), out, k)
  if (run != "") k = flushcjk(run, out, k)
  return k
}
BEGIN {
  split("a an and any are as at be before by for from in into is it its my need needs of on or our so that the them this to use want we when with you your help me i", tmp, " ")
  for (i in tmp) STOP[tmp[i]] = 1
  split("ally ing ations ation ed es", SFX, " ")

  nd = 0
  while ((getline line < CORPUS) > 0) {
    if (line == "") continue
    split(line, f, "\t"); if (f[1] == "") continue
    nd++; NM[nd] = f[1]; DS[nd] = f[2]
    delete a; k = tok(f[1], a)
    for (i = 1; i <= k; i++) TF[nd, a[i]] += 2        # 技能名权重 2×
    delete b; k = tok(f[2], b)
    for (i = 1; i <= k; i++) TF[nd, b[i]] += 1
  }
  close(CORPUS)
  if (nd == 0) { print "eval-routing: 语料为空" > "/dev/stderr"; exit 2 }

  for (k in TF) { split(k, kk, SUBSEP); DF[kk[2]]++ }
  for (t in DF) IDF[t] = log(1 + nd / (1 + DF[t]))
  for (d = 1; d <= nd; d++) {
    nrm = 0
    for (k in TF) { split(k, kk, SUBSEP); if (kk[1] != d) continue
      w = TF[d, kk[2]] * (kk[2] in IDF ? IDF[kk[2]] : 0); nrm += w * w }
    NRM[d] = sqrt(nrm)
  }

  pos = 0; neg = 0; rank1 = 0; errs = 0
  while ((getline line < CASES) > 0) {
    if (line ~ /^#/ || line == "") continue
    split(line, f, "\t")
    if (f[1] == "skill") continue
    cs = f[1]; ck = f[2]; cp = f[3]; ctop = f[4]; cown = f[5]
    if (cs == "" || cp == "" || ck == "") continue
    if (ctop == "" || ctop == "-") ctop = TK
    if (cown == "") cown = "-"

    sidx = 0
    for (d = 1; d <= nd; d++) if (NM[d] == cs) sidx = d
    if (sidx == 0) { printf "ERR  用例技能不在语料：%s\n", cs; errs++; continue }

    delete pv; k = tok(cp, pv)
    delete PTF
    for (i = 1; i <= k; i++) PTF[pv[i]]++
    np = 0
    for (t in PTF) { w = PTF[t] * (t in IDF ? IDF[t] : 0); np += w * w }
    np = sqrt(np)
    for (d = 1; d <= nd; d++) {
      dot = 0
      for (t in PTF) {
        if ((d, t) in TF) dot += PTF[t] * TF[d, t] * (t in IDF ? IDF[t] * IDF[t] : 0)
      }
      SC[d] = (np > 0 && NRM[d] > 0) ? dot / (np * NRM[d]) : 0
    }

    sval = SC[sidx]; rank = 1
    for (d = 1; d <= nd; d++) if (SC[d] > sval + 1e-12) rank++
    bestv = -1; best = ""
    for (d = 1; d <= nd; d++) if (SC[d] > bestv) { bestv = SC[d]; best = NM[d] }

    if (ck == "positive") {
      pos++; if (rank == 1) rank1++
      if (rank <= ctop) printf "PASS 正例 top-%s 命中（rank=%d）: %s\n", ctop, rank, cp
      else { printf "FAIL 正例未进 top-%s（rank=%d）: %s\n", ctop, rank, cp; errs++ }
    } else {
      neg++
      if (best == cs) { printf "FAIL 反例被本技能抢走（排第一）: %s\n", cp; errs++ }
      else if (cown != "-") {
        oidx = 0
        for (d = 1; d <= nd; d++) if (NM[d] == cown) oidx = d
        if (oidx == 0) { printf "ERR  反例 owner 不在语料：%s\n", cown; errs++ }
        else if (SC[oidx] > sval) printf "PASS 反例由 owner 压过（%s > %s）: %s\n", cown, cs, cp
        else { printf "FAIL 反例 owner 未压过本技能（%s ≤ %s）: %s\n", cown, cs, cp; errs++ }
      } else printf "PASS 反例未被本技能抢走: %s\n", cp
    }
  }
  close(CASES)

  for (x = 1; x <= nd; x++) for (y = x + 1; y <= nd; y++) {
    delete af; delete bf
    k = tok(DS[x], av); for (i = 1; i <= k; i++) af[av[i]]++
    k = tok(DS[y], bv); for (i = 1; i <= k; i++) bf[bv[i]]++
    na = 0; nb = 0; dot = 0
    for (t in af) { w = af[t] * (t in IDF ? IDF[t] : 0); na += w * w }
    for (t in bf) { w = bf[t] * (t in IDF ? IDF[t] : 0); nb += w * w }
    for (t in af) if (t in bf) dot += af[t] * bf[t] * (t in IDF ? IDF[t] * IDF[t] : 0)
    c = (na > 0 && nb > 0) ? dot / (sqrt(na) * sqrt(nb)) : 0
    if (c >= CERR + 0) { printf "FAIL 描述碰撞 %.2f ≥ %s：%s ↔ %s\n", c, CERR, NM[x], NM[y]; errs++ }
    else if (c >= CWARN + 0) printf "WARN 描述偏近 %.2f ≥ %s：%s ↔ %s\n", c, CWARN, NM[x], NM[y]
  }

  if (pos > 0) {
    rate = int(rank1 * 100 / pos)
    if (MINR != "" && rate < MINR + 0) { printf "FAIL rank-1 率 %d%% < 棘轮下限 %s%%\n", rate, MINR; errs++ }
    else printf "rank-1 率 %d%%（%d/%d 正例排第一）\n", rate, rank1, pos
  }
  printf "用例 %d 正 / %d 反，错误 %d\n", pos, neg, errs
  exit(errs > 0 ? 1 : 0)
}
'