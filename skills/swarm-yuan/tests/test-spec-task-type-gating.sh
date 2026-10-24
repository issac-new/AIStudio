#!/usr/bin/env bash
# test-spec-task-type-gating.sh — WP-C：spec 节按任务类型机械校验测试
# 断言：
#   态1：fix 类型 spec（认知段标不适用 + 必填段填实）→ --reuse --task-type fix exit 0
#   态2：feature 类型 spec 缺版本约束段 → --reuse --task-type feature exit≠0
#   态3：未知任务类型 → --reuse --task-type bogus exit≠0
#   态4：不传 --task-type → 向后兼容（只校验复用约束，不校验节落实）
# 注：断言消息避免 §（U+00A7）字符——bash 3.2 + set -u 下该 2 字节 UTF-8 字符会损坏
# [[ ]] && ok "..." || { bad "..." } 复合语句的解析（rc 变量被误判 unbound）。
set -uo pipefail
cd "$(dirname "${0}")/.." || exit 1
TMP="$(mktemp -d /tmp/spttg.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT
FAIL=0
ok()  { echo "  ok $1"; }
bad() { echo "  bad $1" >&2; FAIL=1; }

# 复用 precheck.sh + gates-*.sh（从 assets/ 拷贝，与 run-e2e.sh 同款）
mkdir -p "$TMP/scripts"
cp assets/precheck.sh "$TMP/scripts/"
for gf in gates-strict.sh gates-warn.sh gates-advisory.sh; do
  [[ -f "assets/$gf" ]] && cp "assets/$gf" "$TMP/scripts/$gf"
done

# --- 构造 fix 类型 spec（必填段填实，认知段标「不适用」）---
mkdir -p "$TMP/specs"
cat > "$TMP/specs/spec.md" <<'SPECEOF'
# 设计文档：fix 类型示例

## 1. 背景与目标
修复 User.java 的 lombok @Data 懒加载递归问题。

## 2. 决策记录
| 类型 | 决策 | 理由 |
|------|------|------|
| Mechanical | 改 @Data 为 @Getter @Setter | 避免递归 |

## 3. 改造类型与侵入点
| 侵入点 | 文件 |
|--------|------|
| User.java | src/main/java/com/demo/User.java |

## 4. Spec Delta
- 修改 User.java：@Data -> @Getter @Setter

## 5.5 ★复用约束（拼装式开发——必须填写）

### 拼装合规声明
- [x] 已盘点既有稳定单元
- [x] 本次新增单元均不与既有重名
- [x] 复用方式已标注
- [x] 稳定性已标注

## 12. 风险与回滚
| 风险 | 回滚 |
|------|------|
| getter/setter 缺失行为变化 | git revert |

## 14. ★交付衰减分析
不适用

## 15. ★蓝图任务
不适用

## 16. ★认知偏差自检
不适用

## 17. ★辩证映射分析
不适用

## 18. ★领域知识约束
不适用
SPECEOF

cat > "$TMP/scripts/precheck.conf" <<CONFEOF
PROJECT_DIR="$TMP"
WRITABLE_DIRS=()
READONLY_DIRS=()
SCAN_DIRS=()
CONSISTENCY_DIRS=()
CONFEOF

# 态1：fix 类型 + 节落实 → 期望 exit 0
( cd "$TMP" && bash scripts/precheck.sh --reuse --task-type fix >/tmp/spttg1.log 2>&1 )
rc1=$?
if [[ $rc1 -eq 0 ]]; then ok "tai1: fix-type spec (cog sections N/A) --reuse --task-type fix exit 0"; else bad "tai1: fix-type exit=$rc1 (want 0)"; cat /tmp/spttg1.log >&2; fi

# 态2：feature 类型 + 缺版本约束段(5.6) → 期望 exit≠0
( cd "$TMP" && bash scripts/precheck.sh --reuse --task-type feature >/tmp/spttg2.log 2>&1 )
rc2=$?
if [[ $rc2 -ne 0 ]]; then ok "tai2: feature-type spec missing 5.6 -> exit!=0 (rc=$rc2)"; else bad "tai2: feature-type should fail but exit=0"; fi

# 态3：未知任务类型 → 期望 exit≠0
( cd "$TMP" && bash scripts/precheck.sh --reuse --task-type bogus >/tmp/spttg3.log 2>&1 )
rc3=$?
if [[ $rc3 -ne 0 ]]; then ok "tai3: unknown task-type bogus -> exit!=0 (rc=$rc3)"; else bad "tai3: unknown task-type should fail but exit=0"; fi

# 态4：不传 --task-type → 向后兼容（只校验复用约束，不校验节落实）
( cd "$TMP" && bash scripts/precheck.sh --reuse >/tmp/spttg4.log 2>&1 )
rc4=$?
if [[ $rc4 -eq 0 ]]; then ok "tai4: no --task-type backward-compat exit 0"; else bad "tai4: backward-compat should exit 0 but rc=$rc4"; cat /tmp/spttg4.log >&2; fi

[[ $FAIL -eq 0 ]] && { echo "PASS test-spec-task-type-gating"; exit 0; } || { echo "FAIL test-spec-task-type-gating" >&2; exit 1; }
