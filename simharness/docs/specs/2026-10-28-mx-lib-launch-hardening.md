# mx-lib 起跑链加固批：浏览器盘外定址＋构建产物上游解析序＋补丁漂移守卫

日期：2026-10-28 ｜ 状态：已实施 ｜ 关联：run23 起跑（RUN_ID=20261028-v8-run23）；同轮另两修见《2026-10-28-model-preflight-bare-provider.md》（simharness）与《2026-10-28-login-unknown-path-freeze.md》（仓根 docs）

## 变更

`simharness/mux/mx-lib.sh` 三处（均 run 中原子替换热修，本 spec 补齐决策事实源）：

1. `PLAYWRIGHT_BROWSERS_PATH` 统一锚定 `$SIM_ROOT/pw-browsers`（缺省回落 env 显式值）：默认缓存 `~/Library/Caches/ms-playwright` 当日被宿主磁盘水位清扫两次整目录抹除（盘面 91% 满），采集链断供。
2. 新增 `_mx_upstream_studio()` 解析函数并替换三处直读 `$NCWK_ROOT/upstream/hermes-studio`（STUDIO_DIST 回落 / product-dist 供给源 / node_modules 镜像源）：按 AGENTS.md §9 序（显式 env → 仓内 vendor/ → 旧兄弟 upstream/）。原直读旧双仓布局的升级源缓存树——单仓 build:full 落 vendor 树后，快照供给永远读到缓存旧 dist，构建修复进不了 SIM。
3. 新增 `mx_drift_audit()` 守卫，挂在 `mx_apply_agent_patches` 的「语义已在位」跳过路径：补丁触及且树内存在的文件，若该文件在补丁中有 ≥10 字符新增行，树内至少须含其中一条；缺=半应用态 fail 大声拦。

## 决策记录

- D1 浏览器装在 SIM_ROOT（盘 91% 水位清扫不覆盖面）而非重装回 Caches：清扫动因是盘压，Caches 属其清扫面；mx-lib 被 driver 每 30s 重新 source，运行中加固即生效，监督器/驱动无需重启注入 env。
- D2 供给链修在 mx-lib 解析层而非把构建改回 upstream 缓存树：单仓正道=vendor 树（build.mjs 同序），缓存树是升级源通道（VENDOR.md pristine 规则），不应承载本仓构建产物。
- D3 漂移守卫挂在跳过路径而非重写整段 apply 流程：run22 后曾实锤的「marker 在树内任一文件出现即放行」对多文件补丁存在半应用态盲区（605=guard+supervisor+tests 三文件，快照呈 guard 带 marker、supervisor 缺接线时整个漏过、网关带旧码起跑——run23 实锤，deploy --force 收敛后立法防复发）。逐文件新增行审计只收紧跳过路径，不动已验证的 apply/已在位快路径，爆破面有界。
- D4 守卫对「补丁新增行 <10 字符」与「文件不在树内（纯新增文件）」不审计：避免纯删行/短行/新增文件补丁的假拦。

## 验证

- 离线三用例（/tmp/drift-test）：①半应用态（一文件已应用一文件缺）→ 正确拦截并给出收敛指引；②全应用 → 放行；③触及文件缺席 → 不审计放行。
- 活体回归：对已收敛 SIM 快照跑完整 `mx_apply_agent_patches` rc=0，604/605/609 经新守卫路径放行（无误报）。
- `bash -n` 全程；mx-lib 三处改动均原子替换（temp+mv），监督器 30s 循环无半读态。

## 设计文档影响

DESIGN_SYNC: none——harness 起跑链内部加固，不触及方案 V8.55 判据/26 步/六闸与整合正本契约面。
