#!/usr/bin/env bash
# test-reuse-gate.sh — R30-D9 回归锚：check_reuse 重名检测的表格列语义与胶水形态豁免
#
# 真实执勤实证（2026-09-16 Node 栈 shop-api）：正常拼装 spec 必被拦——
# ① awk 默认空白分字段取 $2 非表格列语义；② 更根本：spec-template §5.5「新增胶水代码」
# 表首列口径就是文件路径，而"胶水落在既有文件内"正是拼装式开发的推荐形态——
# 路径 vs §4/5/6 首列路径对比恒重名，检测语义拧反。且 check_reuse 此前零守门测试。
# 修复：-F'|' 取列；路径形态单元格不参与重名对比（在既有文件加胶水=合法拼装）；
# 单元名形态保留拦截。本测试走真实 precheck.sh --reuse 单门禁入口（拷贝形态同
# run-framework-fixture.sh，不 stub 内部函数——R25"stub 单测盲区"教训）：
#   态1 执勤实证形态（胶水=既有文件路径 + 复用表列既有单元）→ 不误报
#   态2 单元名形态重名（清单名称口径首列同串）→ 仍拦
#   态3 无 §5.5 spec → skip 语义不破坏
set -uo pipefail
G="${G:-}"
[[ -n "$G" ]] || G="$(cd "$(dirname "${0}")/.." && pwd)/assets"
TMP="$(mktemp -d /tmp/reuse.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT
FAIL=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1" >&2; FAIL=1; }

make_proj() { # $1=proj 目录 $2=胶水行
  local p="$1" glue_row="$2"
  mkdir -p "$p/scripts" "$p/docs/specs" "$p/references" "$p/.swarm-yuan"
  for _f in precheck.sh gates-strict.sh gates-warn.sh gates-advisory.sh gate-enforce-level.conf; do
    cp "$G/$_f" "$p/scripts/$_f"
  done
  printf 'PROJECT_DIR="%s"\nTEST_CMD=""\n' "$p" > "$p/scripts/precheck.conf"
  cat > "$p/references/reference-manual.md" <<EOF
# reference-manual
## §4 组件库清单
| 路径 | 说明与约束 |
|------|--------------|
| \`src/db.ts\` | prisma 单例（禁止改） |
| \`src/services/product-service.ts\` | 商品服务（稳定） |
## §6 接口清单
| 路径 | 说明与约束 |
|------|--------------|
| \`src/routes/products.ts\` | 商品路由（稳定） |
EOF
  cat > "$p/docs/specs/spec-feat.md" <<EOF
# spec：demo

## 决策记录

- D1：演示

## 5.5 ★复用约束（拼装式开发——必须填写）

### 复用的既有稳定单元
| 单元名 | 类型 | 签名 | 路径 | 复用方式 |
|--------|------|------|------|---------|
| prisma | 实例 | PrismaClient | \`src/db.ts\` | import 调用 |

### 新增胶水代码（最小化）
| 文件 | 职责 | 为何不能复用既有单元 |
|------|------|---------------------|
$glue_row

### 拼装合规声明
- [x] 已查 reference-manual.md §4/5/6 可复用稳定单元清单，确认无重复造轮子
- [x] 未修改既有稳定单元的签名/行为（无侵入式重构）
- [x] 未修改 upstream 骨架/第三方依赖/框架核心（无破坏性改造）
- [x] 新增代码 = 既有单元拼装 + 最小胶水代码
EOF
}

run_reuse() { # $1=proj → stdout 输出 + RC= 尾行
  local out rc
  out=$( cd "$1" && bash scripts/precheck.sh --reuse 2>&1 ); rc=$?
  printf '%s\nRC=%s' "$out" "$rc"
}

# 态 1：执勤实证形态——胶水首列=既有文件路径（含 /），复用表列既有单元 → 不误报
P1="$TMP/p1"; make_proj "$P1" '| `src/services/product-service.ts` listLowStock | 阈值查询 | 新查询语义 |'
out=$(run_reuse "$P1")
grep -q '疑似重复造轮子' <<<"$out" \
  && bad "态1 正常拼装被误拦: $(printf '%s\n' "$out" | grep -A2 '重复造轮子' | head -3)" \
  || ok "态1 既有文件内加胶水不误报"

# 态 2：单元名形态重名仍拦——清单改名称口径首列（依赖链路/旧版组件清单形态）
P2="$TMP/p2"; make_proj "$P2" '| prisma | 新建客户端 | 无 |'
cat > "$P2/references/reference-manual.md" <<'EOF'
# reference-manual
## §4 组件库清单
| 组件名 | 类型 | 说明 |
|--------|------|------|
| prisma | 实例 | 数据库客户端单例 |
EOF
out=$(run_reuse "$P2")
grep -q '疑似重复造轮子' <<<"$out" && ok "态2 单元名（prisma）重名仍拦" || bad "态2 拦截意图丢失: $out"

# 态 3：无 §5.5 spec → skip 语义不破坏
P3="$TMP/p3"; make_proj "$P3" '| x | y | z |'
rm "$P3/docs/specs/spec-feat.md"
out=$(run_reuse "$P3")
grep -q 'FAIL' <<<"$out" && bad "态3 无 spec 误 fail: $out" || ok "态3 无 §5.5 spec 走 skip/提示语义"

[[ $FAIL -eq 0 ]] && { echo "PASS test-reuse-gate"; exit 0; } || { echo "FAIL test-reuse-gate" >&2; exit 1; }
