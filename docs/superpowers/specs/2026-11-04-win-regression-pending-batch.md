# Windows 离线回归挂账台账（P2 性能与本地脚本项）

来源：`2026-11-04-win-regression-p1-fixes.md` 收口挂账。三段结构=待办 / 已裁定不处置 / 计数。

## 待办

- **N01 Monaco 首挂 6-12s**：预取/worker 本地化、减少首包体积（报告 P2-1）。锚点：`/hermes/files` Monaco 挂载实测 6-12s（Windows）。
- **N02 后端耗时剖析**：`/api/hermes/journey` 8.7s、`/api/studio/performance/runtime` 7.7s、monaco-stats 3.4s，做一次后端剖析（含 Windows 文件扫描与外部调用，报告 P2-2）。
- **N03 慢路由骨架屏**：`/hermes/models`、`/studio/agents` 约 9-13s，加骨架屏与分批加载（报告 P2-3）。
- **N04 pageLoading 统一上限**：统一 PageLoading 最长展示时间，避免慢接口长时间遮挡可用内容（报告 P2-4；本批服务端超时收紧后 version-preview 遮挡已从 ~21s 降到 ≤10s，剩余为通用机制）。
- **N05 Windows 本地回归脚本修正**（`E:\AIS\regression`，仓外文件，需在 Windows 侧执行）：`/app/agent` 导航前关闭残留弹层、marker 改精确选择器；GBK 控制台采集乱码（脚本内 `chcp 65001` 或 UTF-8 输出）；采集器忽略 opaque origin（about:blank）的 storage 访问错误；Playwright 复用 vendor node_modules + `MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*'` 写进脚本头。判定口径可直接复制本仓 `scripts/regression/api-expected.mjs`。
- **N06 部署文档补环境变量说明**：`ORGLOOP_LEDGER_TSV`、`OBS_SIM_ROOT`（报告五-2：未配置时 503 属 fail-closed 设计，需在部署文档明确配置项才能启用对应页面）。
- **N07 `/api/studio/backprompt-status` 404 用例清理**：后端无此端点，需确认是否有前端调用方；有则补端点、无则从探测清单移除（报告三-10）。

## 已裁定不处置

- **`/app/settings` 403 计入 FAIL 的判定口径**：报告建议角色门判 WARN 而非 FAIL——已由本仓 walk-routes 既有 permissionReq 白名单（403 → WARN）覆盖，Windows 侧复制 api-expected.mjs 后同样覆盖，无需另改产品。
- **`/api/hermes/config/providers` 405、`films/start` 缺参 400**：探测用例自身方法/参数错误，非产品缺陷；随 N05 的 Windows 脚本修正消化（expected 白名单），产品侧不动。

## 计数

待办 7（N01-N07）；不处置 2。2026-11-04 立账。
