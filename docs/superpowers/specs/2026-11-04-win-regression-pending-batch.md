# Windows 离线回归挂账台账（P2 性能与本地脚本项）

来源：`2026-11-04-win-regression-p1-fixes.md` 收口挂账。三段结构=待办 / 已裁定不处置 / 计数。

## 待办

- **N01 Monaco 首挂 6-12s**【Windows 批】：预取/worker 本地化、减少首包体积（报告 P2-1）。锚点：`/hermes/files` Monaco 挂载实测 6-12s（Windows）——验收锚点在 Windows 实测，本机 mac 不可验收，留 Windows 批。
- **N02 后端耗时剖析**【Windows 批】：`/api/hermes/journey` 8.7s、`/api/studio/performance/runtime` 7.7s、monaco-stats 3.4s，做一次后端剖析（含 Windows 文件扫描与外部调用，报告 P2-2）——耗时锚点为 Windows 文件系统特性，本机剖析不可迁移，留 Windows 批。
- **N03 慢路由骨架屏**【Windows 批】：`/hermes/models`、`/studio/agents` 约 9-13s，加骨架屏与分批加载（报告 P2-3）——两页均在 vendor，页面级改造无 Windows 实测数据不宜动；且 N04 上限已兜底「慢接口长时间遮挡」，收益优先级下降。
- **N04 pageLoading 统一上限**：**已完成（2026-11-05 总收口批，patch 752）**——vendor `PageLoading.vue` 增最长遮挡上限（默认 10s，`VITE_PAGE_LOADING_MAX_MS` 覆盖、0=不限；cap 放行只隐 overlay 不置 initialLoadComplete），行为测试 `custom/client/__tests__/page-loading-cap.test.ts` 5/5；spec `2026-11-05-pending-ledgers-closeout.md`。
- **N05 Windows 本地回归脚本修正**【Windows 批】（`E:\AIS\regression`，仓外文件，需在 Windows 侧执行）：`/app/agent` 导航前关闭残留弹层、marker 改精确选择器；GBK 控制台采集乱码（脚本内 `chcp 65001` 或 UTF-8 输出）；采集器忽略 opaque origin（about:blank）的 storage 访问错误；Playwright 复用 vendor node_modules + `MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*'` 写进脚本头。判定口径可直接复制本仓 `scripts/regression/api-expected.mjs`。
- **N06 部署文档补环境变量说明**：**已完成（2026-11-05 总收口批）**——`docs/USAGE.md` §4 新增可选环境变量表（两变量的作用/缺席行为=503 fail-closed 属设计内，附代码锚点）。
- **N07 `/api/studio/backprompt-status` 404 用例清理**：**已定谳（2026-11-05 总收口批）**——全仓源码（custom/scripts/simharness/vendor client）零调用方、仓内探测清单（api-expected.mjs）无该端点；按台账判据走「无调用方→从探测清单移除」分支，清单在 Windows 侧仓外脚本（E:\AIS\regression），Windows 批执行时照办，本仓无动作面。

## 已裁定不处置

- **`/app/settings` 403 计入 FAIL 的判定口径**：报告建议角色门判 WARN 而非 FAIL——已由本仓 walk-routes 既有 permissionReq 白名单（403 → WARN）覆盖，Windows 侧复制 api-expected.mjs 后同样覆盖，无需另改产品。
- **`/api/hermes/config/providers` 405、`films/start` 缺参 400**：探测用例自身方法/参数错误，非产品缺陷；随 N05 的 Windows 脚本修正消化（expected 白名单），产品侧不动。

## 计数

待办 4（N01/N02/N03/N05，均【Windows 批】＝验收锚点在 Windows 实测环境）；已完成 3（N04/N06，2026-11-05 总收口批）；定谳 1（N07）；不处置 2。2026-11-04 立账，2026-11-05 总收口批更新。
