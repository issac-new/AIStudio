# 2026-11-04 回归工装清偿批（r26 全功能回归的欠账与未做项）

## 变更

r26 全功能回归轮（2026-11-04，本会话）定谳的三件工装欠账与一件未做项，本批清偿：

1. **修 `scripts/regression/run-surface-fusion-walkthrough.mjs`**：`const results`/`record` 声明在 `try {}` 块内、汇总在块外——`ReferenceError: results is not defined`（r26 实录）。修法：`results`/`record` 提至 try 外。实跑另发现三处断言漂移一并修：旧起点 `goto #/` 落地非 ia2 壳（日程按钮等 20s 超时假红，02 截图 17.6K 空页）→ 改 `#/app` 直进壳；旧运行中心页签 `rc-tab-workflows` 已随 0d44031ee 死件删除收敛 → 改 `/app/runs` 深链可达断言；看板页签 `ia-tasks-tab-observatory` → `ia-tasks-tab-effectiveness`（TasksView 四页签重构现名）；IDE 侧栏页签按组过滤渲染（groupFilter 持久化恢复为 code 组时 workflow 页签不可见）→ 显式点 observe 组走真实用户路径。终态 10/10。
2. **修 `scripts/regression/absorb-msg-surface-walkthrough.mjs` ③**：`fill('[data-testid="ia-header-search-input"]')` 命中页头输入框（该 testid 在页头与检索对话框内 `.srch__input` 双绑定，v-model 同源所以写入有效），但「Esc 关闭→再点页头→fill('')」序列中对话框实际处于关闭态，`search-command-c:board` 永不出现——r26 定谳为工具选择器歧义非产品缺陷。修法：③ 全程在对话框开着的状态下 fill 对话框内输入框，去掉 Esc+重开序列。终态 5/5。
3. **收敛 `scripts/regression/gateway-caps-walkthrough.mjs`**：蓝图画廊 16 卡+槽位表单断言面已被 0d44031ee 有意删除（运行中心死件收敛，端点保留 UI 移除）；旧④ `forkBtn >= 0` 恒真（自我豁免）。修法：删除画廊两断言；① 改挂载真实入口 `#/app/stage/setup?tab=assets`（GovRegistryRulesView→StageAssetsPanel；旧 `/app/board?tab=gov-registry` 页签已失效落回看板列表；metrics 页同名族是 EfficiencyRuntimeSection 非 RuntimeSection，勿混），gateway 卡按 `v-if="gateway && gateway.healthy"` 数据条件断言（8647 无 runtime-caps 源=诚实空态，环境态非缺陷）；④ 改真实链路：`?task=t_5233eb3a` 深链（无任务时 IdeChatPane 不渲染）→ `ide-chat-history` 开历史 → fork 按钮行级断言（无历史行=空态合法）。终态 5/5。
4. **反转 `scripts/regression/absorb-round2-walkthrough.mjs` A1 断言**：设置侧栏 terminal 条目在 Task 7（2026-10-27）设置目录注册表化后入口收敛（IDE 底部/驾驶舱面板内嵌，独立路由保留可直达）。断言从「条目在（superadmin）」反转为「条目不在」——负断言锁收敛决策。实跑另发现两处漂移一并修：④ FlowNav 排序挂 WorkbenchView（`#/app/collab`），旧 `goto #/app` 已落驾驶舱 dash 必超时；排序持久化走 settings-layers 分层键 `sl:user:flow.sortMode`（JSON 包裹），旧裸键 `ia2.flow.sortMode` 仅作收养源读必 null。终态 10/10。
5. **新增 `scripts/regression/feature-off-walkthrough.mjs`**：r26 未做项「特性门关闭态」。s3-feature-gates.test.ts 已有源码级守门（开关值+patch 挂载点），本脚本补浏览器级「关闭门不泄漏」：voice（设置页无 stt/tts tab）、pet（设置侧栏无 petdex + /desktop-pet 透明空态，可见尺寸判据：0×0 canvas/隐藏 img 属透明壳不算泄漏）、connectionsExtras（连接页无 app/mcu 面+remote 单面板直显——关闭态产品形态是单面板无 tab 切换条，非数据缺失）、agentManager（/studio/agents 路由不可达守卫弹回）、externalLinks（外链路由守卫弹回）、imageAssist（模型页无 auxiliary tab）。matrixAuth 定性：开关在（features.ts:76）但全仓无 UI 消费面（仅 s3 开关断言引用），浏览器级无测试对象，脚本注释如实说明、不测。终态 8/8。
6. **新增 `scripts/regression/dual-user-walkthrough.mjs`**：r26 未做项「双用户并发协同」。walktemp/admin 双会话双浏览器 context：①Matrix——A 走网关凭据 REST 建房发消息，B 页面会话注入网关矩阵三键（纯 JWT 会话无矩阵凭据=/matrix 访客态，对齐 dev 自动登录桥接链）后直达房间路由 45s sync 窗内时间线实时见 A 消息；②看板——A 建卡（`POST /api/hermes/kanban`）→B 列表可见（并发读不串会话）→B PATCH review（200）→A 数据层 GET 读到 status=review（LWW 收敛；review 态卡走评审流不在默认板列，UI 面由 daily E5b 覆盖不重复）。终态 6/6。环境要求：admin:dev-bootstrap＋walktemp:walk-temp-r26 两账户（头注注明）。

## 生产构建走查（r26 未做项之二）

`npm run build`（verify-dist 出厂口令扫描零命中）→ `serve-dist.mjs --port 8653 --api 8647` 静态托管＋反代 → `WALK_BASE=8653 WALK_LOGIN=admin:dev-bootstrap` 全量走查。首轮 431 pass / 116 defect，全部集中于两类：110×403 `available-models?profile=default`＋3 页 502 瞬时（同页 profiles 等端点同窗 502，负载瞬时）。403 定谳：`resolveUserProfile` 对非 super_admin 校验 `userCanAccessProfile`，admin（id=3，本批补建的走查账户）无 user_profiles 授权行 → 带 profile 查询全线 403；无 profile 参数 200（resolveRequestedProfile 对该端点空参放行）。这是走查账户授权环境态非产品缺陷（dev 链 walkadmin=super_admin 跳过检查故全绿）。处置：user_profiles 补 (3,'default') 授权行后复跑全量 **430 pass / 0 defect**（148 帧，/tmp/regression-shots-r26-prod2/）。502 首轮瞬时未复现。产品结论：生产包 158 访问态全绿。

## 决策记录

- **D1（Mechanical）**：过期断言的处置分两档——断言面已被有意删除的（蓝图画廊）删除断言；断言面被有意收敛/迁移的（terminal 条目、observatory 页签）更新为新语义断言而非删除，锁住收敛决策防回潮。
- **D2（Mechanical）**：matrixAuth 无 UI 消费面不虚构测试对象；「测不到」如实写进脚本注释与本 spec，等该门接上 UI 面时补。
- **D3（Taste）**：feature-off 走查做成浏览器级负断言脚本（.mjs，连 dev 链），不做成 vitest——s3-feature-gates.test.ts 已占源码级档位，双层互补，浏览器层验证「用户看不见」的最终真值。

## 验证

- 四个修复脚本逐一实跑（dev 链 8649→8647，admin 会话）：run-surface-fusion 10/10 无 ReferenceError；absorb-msg-surface ①-⑤ 5/5；gateway-caps 收敛后 5/5；absorb-round2 反转后 10/10。
- feature-off-walkthrough 全部负断言通过（8/8：六门不泄漏 + matrixAuth 注释说明）。
- dual-user-walkthrough 6/6（Matrix 双账号实时收发＋看板并发 LWW）。
- `npx vitest run custom/client/__tests__/s3-feature-gates.test.ts` 保持绿（本批不动产品代码）；docs-ssot-guard/interactive-training-manual 新 spec 登记后 20/20。
- 合并前 `npm test` 全量：7672 过/17 失败——15 个失败域低负载单跑全绿（负载峰值 loadavg 48-75 下活体服务类 542s 超时族+20s 装载超时，环境态非本批引入；本批只改 scripts/regression/*.mjs 与文档，不在 vitest 收集面）；2 个失败为本批新 spec 未登记 A.1/设计索引，已补（531→532）后复绿。

## 设计文档影响

DESIGN_SYNC: none
纯回归走查工装（scripts/regression/）修复与新增，不改产品代码、不触及整合正本与数字总账；走查清单仍由 route-manifest 注册链单一事实源派生，本批未新增第二份路由数组。
