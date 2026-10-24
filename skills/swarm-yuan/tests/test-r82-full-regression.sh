#!/usr/bin/env bash
# test-r81-full-regression.sh — R82 全量回归轮防复发锁
#
# 背景（r81-drill-taskboard NestJS+TypeORM+better-sqlite3 执勤实证，2026-10-01）：
#   D2 verify-completeness 决策账本回退盲区（R36-D6 同族第三现）：技能侧缺账时项目根
#     从 skill_dir 上三级推导（.claude/skills/<name> 布局假设）——自定义 target-dir
#     （rNN-drill-skills/ 先例）上三级不是项目根，conf 里明明有 PROJECT_DIR 真值却
#     不读：独立调用 --verify-completeness --strict 按文档把决策写进项目侧
#     .swarm-yuan/decisions.jsonl（trace-log 行为）仍误报「缺少决策记录」死锁。
#     修：对齐 detect-profile-drift.sh:39 三级解析（①env ②技能 conf PROJECT_DIR=
#     ③旧布局兜底），且 conf 值剥 `# AUTO:detected` 尾注（conf-render 固定溯源形态，
#     不剥则路径带注释垃圾——detect-profile-drift ②级同族盲区一并修，R28-DF7 剥法）。
#   D1 版本表语义未钉死：codebase.md 技术栈版本表记 lock 实装值（诚实填充）而
#     manifest 声明 ^12.0.0 时，check_deps 基线比较（两侧同为声明值契约）假阳性
#     fail。修：骨架填充行 + template-spec ★版本锁定原则 双触点钉死「记 manifest
#     声明值、range 原样；实装版本写说明列」。
# 本锁：行为锁（真生成器造 fixture 实跑 verify-completeness 断言回退命中）+
#       源码锁（修复注记/剥法/语义句在位），任一被拆即红。
set -u
cd "$(dirname "${0}")/.." || exit 1
pass=0; fail=0
ok() { echo "  ✓ $1"; pass=$((pass+1)); }
bad() { echo "  ✗ $1"; fail=$((fail+1)); }

# ---- fixture：自定义 target-dir 技能 + 项目侧决策账本（conf 值带 # AUTO:detected 尾注）----
FXROOT=$(mktemp -d "${TMPDIR:-/tmp}/r81-fx.XXXXXX")
trap 'rm -rf "$FXROOT"' EXIT
FXPROJ="$FXROOT/proj"; FXSK="$FXROOT/skills"
mkdir -p "$FXPROJ" "$FXSK"
cat > "$FXPROJ/package.json" <<'EOF'
{ "name": "fx-api", "dependencies": { "@nestjs/core": "^11.0.0" } }
EOF
git -C "$FXPROJ" init -q 2>/dev/null || true
bash scripts/generate-skill.sh fx-dev "$FXPROJ" "$FXSK" >/dev/null 2>&1
[[ -d "$FXSK/fx-dev" ]] && ok "fixture 技能骨架生成（自定义 target-dir）" || { bad "骨架未生成（fixture 塌）"; exit 1; }
# conf PROJECT_DIR 写真值 + conf-render 固定溯源尾注形态
_conf="$FXSK/fx-dev/scripts/precheck.conf"
sed -i.bak "s|^PROJECT_DIR=.*|PROJECT_DIR=$FXPROJ  # AUTO:detected|" "$_conf" && rm -f "$_conf.bak"
mkdir -p "$FXPROJ/.swarm-yuan"
printf '%s\n' '{"type":"Mechanical","suggestion":"fixture decision","user-action":"approved"}' \
  > "$FXPROJ/.swarm-yuan/decisions.jsonl"

# ---- 行为锁 1：独立调用 verify-completeness --strict（不导出 PROJECT_DIR）----
#    决策在项目侧 + skill_dir 上三级≠项目根：回退必须读技能 conf 才能命中账本。
#    断言聚焦「缺少决策记录」不出现（draft 骨架其余占位符 hits 属预期，不在本锁语义内）。
out="$(env -u PROJECT_DIR bash scripts/generate-skill.sh --verify-completeness "$FXSK/fx-dev" --strict 2>&1)"; rc=$?
if printf '%s' "$out" | grep -q '缺少决策记录'; then
  bad "D2 复发：项目侧账本在 conf 真值下仍失明（回退未读技能 conf / 未剥尾注）"
else
  ok "决策账本回退命中项目侧（conf PROJECT_DIR 三级解析 + 尾注剥除）"
fi

# ---- 行为锁 2（变异方向对照）：无账本无真值时如实报缺（fail 方向不放过）----
#    独立空项目（无 .swarm-yuan/decisions.jsonl 任何一处）：strict 必须报「缺少决策记录」。
FXPROJ2="$FXROOT/proj2"; FXSK2="$FXROOT/skills2"; mkdir -p "$FXPROJ2" "$FXSK2"
cat > "$FXPROJ2/package.json" <<'EOF'
{ "name": "fx2-api", "dependencies": { "@nestjs/core": "^11.0.0" } }
EOF
bash scripts/generate-skill.sh fx2-dev "$FXPROJ2" "$FXSK2" >/dev/null 2>&1
out2="$(env -u PROJECT_DIR bash scripts/generate-skill.sh --verify-completeness "$FXSK2/fx2-dev" --strict 2>&1)"; rc2=$?
printf '%s' "$out2" | grep -q '缺少决策记录' \
  && ok "无账本形态如实报缺（fail 方向保持，不放行）" \
  || bad "无账本形态未报缺——C2 strict 契约被误改"

# ---- 源码锁：D2 修复形态在位 ----
grep -q '不剥则路径拼接失明' scripts/generate-skill.sh \
  && ok "verify-completeness 回退 R82-D2 注记在位" \
  || bad "generate-skill.sh R82-D2 注记丢失（同族溯源断裂）"
grep -q "cut -d'#' -f1" scripts/generate-skill.sh && grep -q '去尾空格 + 去引号' scripts/generate-skill.sh \
  && ok "generate-skill.sh 回退剥法（cut # 尾注）在位" \
  || bad "generate-skill.sh 剥法形态丢失（尾注垃圾复发面）"
# 顺序锁：尾空格必须先于闭引号剥离（值与 # 尾注间的对齐空格使 s/"$// 失配、引号残留路径尾，
# 项目侧决策账本回退失明 → strict 误报缺决策记录；task-forge 全栈样例实证）
grep -q "s/\[\[:space:\]\]\*\$//;s/^\"//;s/\"\$//" scripts/generate-skill.sh \
  && ok "剥引号顺序正确（尾空格先剥，防引号残留）" \
  || bad "剥引号顺序回退（闭引号先于尾空格剥——R93 实证缺陷形态复发）"
grep -q '同族剥法' scripts/detect-profile-drift.sh && grep -q "cut -d'#' -f1" scripts/detect-profile-drift.sh \
  && ok "detect-profile-drift ②级同族剥法在位" \
  || bad "detect-profile-drift 同族修复丢失（静默跳过复发面）"

# ---- 行为锁 3：D1 骨架填充行带版本表语义（真生成器输出面）----
gline="$(grep -m1 '^    codebase.md)' scripts/generate-skill.sh)"
printf '%s' "$gline" | grep -q 'manifest 声明值' && printf '%s' "$gline" | grep -q 'R82-D1' \
  && ok "codebase.md 填充行钉版本表语义（manifest 声明值+实装写说明列）" \
  || bad "填充行版本语义丢失（check_deps 假阳性复发面）"

# ---- 源码锁：template-spec 版本语义单一约定在位 ----
grep -q '版本语义单一约定' references/template-spec.md \
  && ok "template-spec ★版本锁定原则语义钉死" \
  || bad "template-spec 版本语义句丢失（文档侧契约断裂）"

echo "—— R82 锁：$pass pass / $fail fail ——"
[[ $fail -eq 0 ]] || exit 1
exit 0
