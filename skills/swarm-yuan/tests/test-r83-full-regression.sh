#!/usr/bin/env bash
# test-r83-full-regression.sh — R83 全量回归轮防复发锁（Angular 21 栈执勤实证 r83-drill-kanban）
#
# D1（P1）generate-skill.sh 未知旗标静默落入 skill-name 位置 + SKILL.md ⑦ 行宣称幽灵入口：
#   按 SKILL.md 生成流程表对 generate-skill.sh 调 `--review <skill_dir>`（⑦ 行原文只写
#   "--review（ocr 5 维度或 AI 清单）"未标脚本归属，同表其余行均为 generate-skill.sh 调用）
#   → "--review" 被当技能名、目标技能目录被当项目根，在其内部嵌套生成
#   .claude/skills/--review/ 垃圾骨架（109 文件污染交付物）。审查旗标真身是
#   precheck.sh --review（GATE_FLAGS 在册），generate-skill.sh 从未实现 --review。
#   修：① 主位置参数路径加未知旗标守卫（首参 -- 开头即 fail-closed 报错列支持旗标）；
#       ② SKILL.md ⑦ 行钉死脚本归属（precheck.sh --review + R83-D1 注记）。
#
# D2（P1）check_reuse §5.5 勾选核验 awk 区间自塌：
#   原区间 '/复用约束|拼装合规声明/,/^## [0-9]/' 的终止模式与 spec-template.md 自身
#   标题形态冲突——模板 §5.5 标题 "## 5.5 ★复用约束" 同一行命中起止两模式 → 区间
#   自塌为单标题行 → 规范填齐 4 勾仍恒报 "0/4 已勾" 假拦（R82 靠 "## §5.5" 形态碰巧
#   绕过，模板形态从未走通）。且终止只认数字标题 → 非数字标题（## 回滚）不终止，
#   区间吞到文件尾，后续段落 checkbox 误计入本段（未勾箱假拦面/勾选箱假放行面）。
#   修：区间改为「标题含关键词进、任意其它 ## 标题出」，两种标题形态均正确解析。
#
# 本锁：行为锁（真生成器 fixture 实跑 --reuse 断言模板形态 spec 通过 + 少勾形态仍拦）
#       + 行为锁（未知旗标拒止且零污染 + 合法 create 不回归）+ 源码锁（修复注记在位）。
set -u
cd "$(dirname "${0}")/.." || exit 1
pass=0; fail=0
ok() { echo "  ✓ $1"; pass=$((pass+1)); }
bad() { echo "  ✗ $1"; fail=$((fail+1)); }

FXROOT=$(mktemp -d "${TMPDIR:-/tmp}/r83-fx.XXXXXX")
trap 'rm -rf "$FXROOT"' EXIT
FXPROJ="$FXROOT/proj"; FXSK="$FXROOT/skills"
mkdir -p "$FXPROJ" "$FXSK"
printf '{ "name": "fx-api", "scripts": { "test": "echo ok" } }\n' > "$FXPROJ/package.json"

# ---- D1 行为锁 1：未知旗标 fail-closed 且零污染 ----
out="$(bash scripts/generate-skill.sh --review "$FXPROJ" 2>&1)"; rc=$?
[[ $rc -ne 0 ]] && ok "D1 未知旗标 --review 非零退出（fail-closed）" || bad "D1 --review 退出码 ${rc}——守卫失效，幽灵旗标又落 skill-name 位"
printf '%s' "$out" | grep -q '未知旗标' \
  && ok "D1 报错信息指明旗标错误并指向 precheck.sh --review" \
  || bad "D1 报错文案缺'未知旗标'——排障指引丢失"
[[ ! -e "$FXPROJ/.claude" ]] \
  && ok "D1 目标目录零污染（.claude/skills/--review 骨架未生成）" \
  || bad "D1 污染复发：$FXPROJ/.claude 被创建（嵌套垃圾骨架）"

# ---- D1 行为锁 2：任意未知旗标同守卫（家族面，非 --review 特判）----
bash scripts/generate-skill.sh --bogus-flag "$FXPROJ" >/dev/null 2>&1
[[ $? -ne 0 && ! -e "$FXPROJ/.claude" ]] \
  && ok "D1 家族面：任意未知旗标同样拒止" \
  || bad "D1 家族面失守：--bogus-flag 未被守卫拦下"

# ---- D1 行为锁 3（正路回归）：合法 create 在守卫加入后不受影响 ----
bash scripts/generate-skill.sh fx-dev "$FXPROJ" "$FXSK" >/dev/null 2>&1
[[ -d "$FXSK/fx-dev" ]] \
  && ok "D1 正路回归：合法 create 照常生成（自定义 target-dir fixture 就位）" \
  || { bad "D1 守卫误伤合法 create——fixture 塌"; exit 1; }

# ---- D2 fixture：模板形态 spec（数字标题 ## 5.5 + 4 勾 + 后续非数字标题段带未勾箱）----
#   旧码两复发面都在场：① "## 5.5 ★复用约束" 同行命中起止 → 自塌 → 0/4 假拦；
#   ② 若形态改 § 规避①，"## 回滚" 非数字不终止 → 吞入 `- [ ] 后续项` → unchecked 假拦。
mkdir -p "$FXPROJ/docs/specs"
cat > "$FXPROJ/docs/specs/wp-fx.md" <<'EOF'
# fixture spec（模板标题形态——与 spec-template.md §5.5 标题一致）

## 1. 背景
fixture。

## 5.5 ★复用约束（拼装合规声明）

- [x] 已查 reference-manual §4 组件库清单
- [x] 已查 §6 接口清单
- [x] 复用 TaskService 派生链，未建副本状态
- [x] 零新增轮子

## 回滚

- [ ] 后续项（非 §5.5 段的未勾箱——不得计入本段核验）

## 12. 风险
无。
EOF

# ---- D2 行为锁 4：模板形态 spec 4 勾齐全 → 不拦（旧码此处 0/4 假拦）----
out4="$(cd "$FXROOT" && bash "$FXSK/fx-dev/scripts/precheck.sh" --reuse 2>&1)"; rc4=$?
if printf '%s' "$out4" | grep -q '拼装合规声明未全部勾选\|缺少 §5.5 复用约束段'; then
  bad "D2 复发：模板形态 spec 4 勾齐全仍被拦（区间自塌或未勾箱误计）"
else
  ok "D2 模板形态 spec 4 勾通过（区间两种标题形态均正确解析+计数收紧到本段）"
fi

# ---- D2 行为锁 5（fail 方向对照）：勾选不足仍必须拦 ----
sed -i.bak 's/^- \[x\] 复用 TaskService 派生链，未建副本状态$/- [ ] 复用 TaskService 派生链，未建副本状态/' "$FXPROJ/docs/specs/wp-fx.md" && rm -f "$FXPROJ/docs/specs/wp-fx.md.bak"
out5="$(cd "$FXROOT" && bash "$FXSK/fx-dev/scripts/precheck.sh" --reuse 2>&1)"; rc5=$?
printf '%s' "$out5" | grep -q '拼装合规声明未全部勾选' \
  && ok "D2 fail 方向保持：勾选不足（3/4+1 未勾）仍拦" \
  || bad "D2 执法面丢失：勾选不足未拦——check_reuse 契约被误改"

# ---- D1 源码锁：守卫与文档归属在位 ----
grep -q '未识别 flag 守卫' scripts/generate-skill.sh \
  && ok "generate-skill.sh 未知旗标守卫 R83-D1 注记在位" \
  || bad "generate-skill.sh R83-D1 注记丢失（守卫同族溯源断裂）"
grep -q 'precheck.sh --review' SKILL.md && ! grep -q '^| ⑦ | 独立审查 | `--review`（ocr 5 维度或 AI 清单）+ review-record 落盘 |$' SKILL.md \
  && ok "SKILL.md ⑦ 行脚本归属钉死（precheck.sh --review，幽灵入口句已清）" \
  || bad "SKILL.md ⑦ 行归属句丢失或幽灵句复现"

# ---- D2 源码锁：区间修复形态在位 ----
grep -q '同一行同时命中起止模式' assets/gates-strict.sh \
  && ok "gates-strict.sh §5.5 区间修复 R83-D2 注记在位" \
  || bad "gates-strict.sh R83-D2 注记丢失（同族溯源断裂）"
grep -q "inr && /\^## / && !/复用约束|拼装合规声明/{inr=0}" assets/gates-strict.sh \
  && ok "gates-strict.sh 区间形态锁（任意 ## 标题出区间）在位" \
  || bad "gates-strict.sh 区间形态丢失（旧 '/^## [0-9]/' 终止复发面）"

echo "—— R83 锁：$pass pass / $fail fail ——"
[[ $fail -eq 0 ]] || exit 1
exit 0
