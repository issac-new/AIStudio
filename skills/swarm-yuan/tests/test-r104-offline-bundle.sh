#!/usr/bin/env bash
# test-r104-offline-bundle.sh — 离线安装包构建器守门测试（R104）
# 覆盖：①清单格式与通道陷阱锁 ②构建器语法与产物模板关键内容 ③安装器协议
# （不实跑构建——npm pack/pip download 非密封；实包验收由收口记录留档）
set -uo pipefail
cd "$(dirname "${0}")/.." || exit 1
FAIL=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1" >&2; FAIL=1; }

# ===== ① 清单格式与通道陷阱 =====
MF="scripts/offline-manifest.conf"
[[ -f "$MF" ]] && ok "1a 清单在位" || { bad "1a 清单缺失"; exit 1; }
# 1b 每行四段管道分隔（runtime|channel|spec|note）
n_bad=0
while IFS='|' read -r a b c d; do
  case "$a" in ''|'#'*) continue ;; esac
  [[ -n "$a" && -n "$b" && -n "$c" && -n "$d" ]] || n_bad=$((n_bad+1))
done < "$MF"
[[ $n_bad -eq 0 ]] && ok "1b 清单行四段格式（${n_bad} 违规）" || bad "1b 清单有 $n_bad 行格式违规"
# 1c 通道陷阱①：graphify 必须走 pip 且包名双 y（裸名 PyPI 无版本/npm 同名异源）
grep -q '^graphify|pip|graphifyy==' "$MF" && ok "1c graphify→pip graphifyy（双 y 陷阱锁）" || bad "1c graphify 通道错误"
# 1d 通道陷阱②：gsd-core 必须用 @opengsd/ 域（裸名占位包）
grep -q '^gsd-core|npm|@opengsd/gsd-core@' "$MF" && ok "1d gsd-core→@opengsd 域名包" || bad "1d gsd-core 裸名违规"
# 1e 通道值合法
grep -E '^[a-z0-9-]+\|(npm|pip|github)\|' "$MF" | wc -l | grep -q '^0$' && bad "1e 无合法行" || ok "1e 通道值枚举合法"
grep -vE '^[a-z0-9-]+\|(npm|pip|github)\||^#|^$' "$MF" | head -1 | grep -q . && bad "1e 存在非法通道行" || ok "1e2 无非法通道行"

# ===== ② 构建器 =====
BD="scripts/make-offline-bundle.sh"
bash -n "$BD" && ok "2a 构建器语法" || bad "2a 语法失败"
# 2b 分发边界与 install.sh 一致（R126 +docs：bundle 侧无装机侧 rm docs 补救，须在清单排除）。
# vendor-knowledge 起为 LFS 第三方规范/版权材料：默认排除、--with-vendor 显式携带（六排除 + 条件分支）。
grep -q 'research|.swarm-yuan|offline-cache|ci|dist|docs) continue' "$BD" && ok "2b 分发边界六排除" || bad "2b 排除清单漂移"
grep -q 'vendor-knowledge) \[\[ "$WITH_VENDOR" -eq 1 \]\] || continue' "$BD" && ok "2b-v1 vendor-knowledge 默认排除（--with-vendor 显式携带）" || bad "2b-v1 vendor-knowledge 分支漂移"
grep -q -- '--with-vendor' "$BD" && ok "2b-v2 --with-vendor 旗标在位" || bad "2b-v2 缺 --with-vendor 旗标"
grep -q 'OUT_ROOT="$(cd "$OUT_ROOT" && pwd)"' "$BD" && ok "2b2 输出目录绝对化（相对路径回归锁）" || bad "2b2 OUT_ROOT 未绝对化"
# 2c pip 用 python3 -m pip（裸 pip 坏解释器坑）
grep -q 'python3 -m pip download' "$BD" && grep -q 'python3 -m pip install' "$BD" && ok "2c python3 -m pip 双点" || bad "2c 裸 pip 残留"
# 2d SWARM_YUAN_DIR 参数化（可从任意位置运行）
grep -q 'SWARM_YUAN_DIR' "$BD" && ok "2d 目录参数化" || bad "2d 缺参数化"
# 2e 无全角紧跟 $var（G20 族——本轮实录坑：$rt（ 触发 unbound；直击常见全角标点四类）
if grep -nE '\$[a-zA-Z_][a-zA-Z0-9_]*[（）：，。「」]' "$BD" | head -3 | grep -q .; then
  bad "2e 疑似全角紧跟 \$var 残留"; else ok "2e 零全角紧跟（G20）"; fi
# 2f 中途失败不留半包：EXIT trap 清理暂存目录
grep -q "trap 'rm -rf" "$BD" && ok "2f trap 清理暂存目录" || bad "2f 缺 trap 清理"
# 2g 始终生成 vendor-status.tsv（条目/实得文件/失败原因）
grep -q 'vendor/vendor-status.tsv' "$BD" && grep -q 'obtained_files' "$BD" && ok "2g vendor 对账表" || bad "2g 缺 vendor-status.tsv"
# 2h SHA256SUMS 覆盖 vendor 与技能包
grep -q 'SHA256SUMS' "$BD" && ok "2h 构建产出 SHA256SUMS" || bad "2h 缺 SHA256SUMS"
# 2i 缺件默认非零，显式 --allow-partial 才放行
grep -q -- '--allow-partial' "$BD" && grep -q '构建不完整' "$BD" && ok "2i 缺件默认非零（--allow-partial 显式接受）" || bad "2i 缺件策略缺失"
# 2j 暂存构建后 rename 到 dist（成功后原子发布）
grep -q 'mv "\$BUNDLE" "\$OUT_ROOT/' "$BD" && ok "2j 原子发布" || bad "2j 缺原子发布"

# ===== ③ 安装器模板关键内容（嵌入 heredoc 断言） =====
grep -q 'install-offline.bat' "$BD" && ok "3a Windows 入口模板" || bad "3a 缺 bat 入口"
grep -q 'Git for Windows' "$BD" && ok "3b README 前置披露 Git Bash" || bad "3b 缺前置说明"
grep -q -- '--with-npm' "$BD" && grep -q -- '--with-pip' "$BD" && ok "3c vendor 旗标" || bad "3c 缺 vendor 旗标"
grep -q 'vendor/npm/\*.tgz' "$BD" && ok "3d npm 本地包免源安装" || bad "3d 缺 tgz 安装"
# 3e 安装器失败传播：set -euo pipefail + install.sh 非零即退出
grep -q 'set -euo pipefail' "$BD" && ok "3e 安装器 set -euo pipefail" || bad "3e 安装器缺严格模式"
grep -q 'bash "$SKILL_DIR/install.sh" "$@" || exit \$\?' "$BD" && ok "3f install.sh 失败不被吞" || bad "3f install.sh 失败被吞"
# 3g 多宿主旗标逐个生效（--all 合并优先）
grep -q 'for _h in \$HOSTS' "$BD" && grep -q 'WANT_ALL' "$BD" && ok "3g 多宿主旗标循环" || bad "3g 多宿主旗标只生效首个"
# 3h 安装前校验 SHA256SUMS
grep -q '校验包完整性' "$BD" && grep -q '拒绝安装' "$BD" && ok "3h 安装器校验 SHA256SUMS" || bad "3h 缺安装前校验"

# ===== ④ 源码包发布器（可复现 + 校验 + 重试 + 资产核验） =====
RS="scripts/release-src-packages.sh"
bash -n "$RS" && ok "4a 发布器语法" || bad "4a 发布器语法失败"
grep -q -- '--pin' "$RS" && grep -q 'rev-parse HEAD' "$RS" && ok "4b 上游 commit 钉定" || bad "4b 缺 commit 钉定"
grep -q 'SHA256SUMS' "$RS" && ok "4c 源码包校验和" || bad "4c 缺 SHA256SUMS"
grep -q 'UPLOAD_RETRIES' "$RS" && grep -q 'retry ' "$RS" && ok "4d 上传有限重试" || bad "4d 缺重试"
grep -q -- '--json assets' "$RS" && ok "4e 资产齐全性核验" || bad "4e 缺资产核验"
grep -q 'rm -f "$TMP/out/${name}-src.zip"' "$RS" && ok "4f zip 前清旧档" || bad "4f zip 残留风险"

if [[ $FAIL -eq 0 ]]; then echo "test-r104-offline-bundle: PASS"; else echo "test-r104-offline-bundle: FAIL" >&2; fi
exit $FAIL
