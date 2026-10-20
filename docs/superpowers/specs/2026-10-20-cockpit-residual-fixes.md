# 驾驶舱验收挂账清零轮 spec（W2/W3/W4 + 上游断言补丁）

> 日期：2026-10-20。分支：`feat/cockpit-residual-fixes`（批A）、`feat/sim-run-bridge`（批B）。
> 上游正本=《2026-10-20-cockpit-m3-acceptance.md》挂账 W2-W5（W5 已复核 PASS，本批不含）。

## 一、内容

1. **W2 路由级加载骨架**：排查白屏根因（lazy chunk + 数据加载期无反馈），在壳层
   Suspense/路由出口补加载指示，首帧不再纯白。
2. **W4 台账 503 降噪**：orgloop ledger 未配置（503）时前端标记「未配置」并停止
   轮询重试（空态展示本就已如实），控制台不再每页刷 503。
3. **补丁 670（上游 store 断言次序）**：`stores/hermes/kanban.ts` 的
   `fetchDiagnostics` 把 `assertCapability` 移入 try/catch（与函数自身「失败
   console.error 不抛出」设计一致），能力缺失时安静跳过而非未捕获异常。
4. **W3 导演 run 贯通**：推演运行选择器混列导演 run（`run-sim-director-*`），
   旧 26 步 run-state/journal 读不到 → 404 噪音。桥接：识别导演 run，
   旧体系探针跳过并自动落到导演台视图（其运行数据走图运行时 API）。

## 二、决策记录

| # | 决策 | 理由 |
|---|---|---|
| D1 | W2 修在壳层加载反馈，不做数据面重构 | 白屏主因是 vite dev 冷 transform+并行数据加载（生产构建快得多）；骨架解决「无反馈」而非「慢」本身，数据面优化另立批 |
| D2 | W4 降噪=前端标记未配置后停轮询，不改服务端 | 503 是端点对未配置环境的如实回答；前端记住并停探是最小侵入 |
| D3 | 断言次序修上游（补丁 670）而非仅调用侧守卫 | M3 已在调用侧（SwarmKanbanView）加守卫，但根因在上游 store 自身设计不一致；补丁根治所有未来消费方，调用侧守卫保留作纵深 |
| D4 | W3 桥接走「识别+改道导演台」，不把导演 run 塞进 run-state | 两体系数据模型不同（26 步键空间 vs 图运行时事件）；强行翻译会造语义假象，改道到各自正确的面板才是诚实呈现 |
| D5 | 导演 run 识别用 `run-sim-director-` 前缀（graph-rest start 生成的 runId 词表） | 单一事实源=graph-rest.ts 的 spec.id 生成规则（`sim-director-*`），前缀匹配零新状态 |

## 三、验证账（收口回填）

- [x] 骨架：IaShell 路由出口 Suspense 兜底「页面加载中…」（编译验证通过）；首帧另有
  补丁 671 的 boot-fallback 文字（patch(1)+字节比对，manifest 383）
- [x] 台账 503 降噪：gatekeeper 未配置闩（503/「未配置」记一次停轮询），守门测试
  `gatekeeper-ledger-latch.test.ts` 2 例绿（503 闩住只发一次/非 503 不闩）
- [x] 补丁 670（断言次序）patch(1) 应用+字节比对；看板套件 53/53 绿、ia2 全目录 782 绿
- [x] 导演 run 改道：API 层守卫（overview 四端点+supervision journal+useStageProgress
  即时拒答零网络）+ SimCenterView 自动落「导演台」；活验三深链（supervision/ops/
  evidence）全部自动改道且 sim 4xx 归零；守门测试 `director-run-guard.test.ts` 3 例绿
- [x] 批A 相关套件 782 绿；批B 相关套件（下补）
- [ ] 全量回归无新增失败（合并前跑）
