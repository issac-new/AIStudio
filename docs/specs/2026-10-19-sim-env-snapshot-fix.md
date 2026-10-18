# SIM studio 环境与 dist 快照链修复（2026-10-19）

来源：V8.44 全页走查。8802 studio 进程未带 `OBS_SIM_ROOT`，所有推演端点按 fail-closed 返回 503；`SIM_BRANCHES_REPO`/`SIM_ANCHOR_REPO` 也未注入，分支交付与 commit 锚 503。另 `mx_provision_product_dist` 只比较 `server/index.js` mtime，只重建客户端时误判「已同步」，新 RunSelector 修复没有进入 SIM 快照。

## 变更

- `ensure_studio_up` 环境块增加 `OBS_SIM_ROOT`、`SIM_BRANCHES_REPO`、`SIM_ANCHOR_REPO`（后两者缺省 `$SIM_ROOT/central/aipaydev`）。
- product-dist 新鲜度改为 `server/index.js` + `client/index.html` 双 mtime 串。
- prelaunch ⑤ 增加 studio 进程 `OBS_SIM_ROOT` 机械检查（只测 `/health/ready` 会把 503 推演端点放行）。

## 决策记录

- D-1：SIM 根以 `AIPAY_SIM_ROOT`/默认值为单一事实源；studio 子进程显式注入，避免依赖调用者 shell 继承。
- D-2：分支仓与 commit 锚仓同指中央仓 `$SIM_ROOT/central/aipaydev`；显式 env 优先。
- D-3：快照新鲜度必须覆盖服务端与客户端两个入口，禁止只看一个文件 mtime。
- D-4：prelaunch ⑤ 对 studio 进程 env 做机械检查，防止「健康检查绿、推演端点 503」的假绿。
- D-5（2026-10-19 清场实测）：`mx-clean` 分支删除校验的 `$_miss` 后接全角括号会被 macOS bash 3.2 吸入变量名（`_miss�: unbound variable`，纪律 76 同族）；改为 `${_miss}`，机械检查=`bash -n`。
