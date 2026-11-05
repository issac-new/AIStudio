# 挂账台账总收口（2026-11-05）：AgentTeams/Windows/run26 三台账清账

> 定位：用户指令「完成所有 spec 及代办」。盘点三份活跃挂账台账＋registers deferred 项，
> 可本机完成的完成，外部条件项显式定谳归档，台账与事实对齐。

## 变更

1. **AgentTeams 台账（N01-N03）→ 已完成**：三项已由清偿批 `1a2cd9350`（spec
   `2026-11-04-agentteams-ledger-items.md`）落地——N01 profile env 编辑面（userenv 域＋
   ProfileEnvPanel）、N02 权限变更审计（patch 740 中间件＋`/api/userperms/audit`）、
   N03 移植评估（spec 附节三判定）。本批只同步台账状态，零代码改动。
2. **Win N06（部署文档补环境变量）**：`docs/USAGE.md` 新增「可选环境变量」节——
   `ORGLOOP_LEDGER_TSV`（清偿台账 TSV 路径，缺席=orgloop 端点 503 fail-closed）与
   `OBS_SIM_ROOT`（SIM 根目录，缺席=observability/precedent 相关面 503/降级，
   均为设计内 fail-closed 而非故障）。
3. **Win N07（backprompt-status 404）→ 定谳**：全仓源码（custom/scripts/simharness/
   vendor client）零调用方、仓内探测清单（api-expected.mjs）无该端点——按台账判据
   「无调用方则从探测清单移除」定谳；该清单在 Windows 侧仓外脚本，Windows 批执行时照办。
4. **Win N04（PageLoading 统一上限）→ 实施（patch 752）**：vendor
   `PageLoading.vue` 增加最长遮挡上限——pending 持续超上限即放行页面内容（overlay
   消隐），默认 10s，`VITE_PAGE_LOADING_MAX_MS` 可覆盖（0=不限）。防止慢接口长时间
   遮挡可用内容。
5. **外部条件项定谳（不处置节）**：Win N01（Monaco 首挂优化）/N02（后端耗时剖析）/
   N03（慢路由骨架屏）/N05（Windows 仓外脚本修正）——验收锚点均为 Windows 实测
   环境，本机 mac 无法验收；N03 页面级改造（vendor 页面）在无实测数据下不宜动。
   四项合并为「Windows 批」留存台账，判据与实施建议在册。run26 N12 维持「run27
   观察」原判。
6. **pre-existing 4 红定谳与修复（全量验证时撞出，非本批引入——main 单跑同红）**：
   - specialist-presets 防漂移用例 ENOENT：根因=upstream 缓存卷（/Volumes/nvme2230）未挂载，
     `~/lab/upstream/routa` 断链。修复=源缺席时显式 skip（标题注明缺席路径与恢复条件），
     仓内四用例照常执行——fail-soft 不造假，源恢复自动恢复守门。
   - diagram-export 3 红：playwright chromium 缓存缺席（清理轮误伤）——重装
     `npx playwright install chromium` 恢复环境（环境恢复非代码变更）。
7. **D-GOV-4 → resolved**：`.qgate/registers/decisions.json` 的 deferred 项
   （releaseBatches 留空）已由收尾批落真（v1.0.12 批次＋release:preflight 串
   release-evidence --write），revisitBy 条件提前达成。

## 决策记录

| # | 决策 | 备选 | 取舍理由 | 类型 |
|---|---|---|---|---|
| D1 | N04 上限实现放 PageLoading 组件内 | 各页面各自超时 / 全局路由守卫 | 单点组件是遮挡行为的唯一事实源；页面各自处理=十九处重复且新页面必漏 | Mechanical |
| D2 | N04 默认 10s、env 可覆盖、0=不限 | 固定不可配 / 默认关 | 报告实测最差 ~21s 已由服务端超时批降到 ≤10s，10s 与该基线一致；可配留给慢环境逃生 | Judgment |
| D3 | N04 cap 放行只隐 overlay，不置 initialLoadComplete | cap 同时置 initialLoadComplete | initialOnly 语义是「首显完成后续请求不再全遮」，cap 是「超时放行」；混用会让后续真实加载丢失遮挡 | Mechanical |
| D4 | Win N01/N02/N03/N05 留 Windows 批 | 本机盲改 | 四项验收锚点均为 Windows 实测（6-12s Monaco、8.7s journey、9-13s 慢路由、E:\AIS 仓外脚本）；无实测环境的改动无法证明有效甚至可能反向 | Judgment |
| D5 | N07 定谳而不补端点 | 补 `/api/studio/backprompt-status` 端点 | 全仓零调用方；为不存在的消费方补端点=伪需求（fail-soft 纪律：不猜需求） | Judgment |
| D6 | AgentTeams 台账只改状态不动事实 | 重写台账 | 台账是事实源，清偿证据（commit＋spec＋测试）已固化；只补指针 | Mechanical |

## 验证

- patch 752：干净树 `npm run inject` 重放成功＋`git apply --reverse --check` 通过
- N04 行为测试：`npx vitest run custom/client/__tests__/page-loading-cap.test.ts`
  （遮挡 10s 后 cap 放行／cap 后再 pending 正常遮挡／MAX_MS=0 不上限／initialOnly
  cap 不置首显完成）
- 台账一致性：三份台账计数节与正文条目状态一致
- specialist-presets：源缺席 → 4 过＋1 skip（标题含原因）；源在位分支不变（CI/有源机照常对照）
- 全量 `npm test` 对照基线 8041/0

## 设计文档影响

- DESIGN_SYNC: none
  - 理由：N04 是既有 PageLoading 机制的上限参数化，不新增能力面；台账/文档为治理面；
    四份设计正本无需同步。
