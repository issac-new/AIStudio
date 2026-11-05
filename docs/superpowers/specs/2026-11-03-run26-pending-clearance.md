# run26 挂账清偿批 N10-N13＋采集呈现两反馈根治（2026-11-03）

## 变更

用户令「完成挂账内容」（N10-N13，当批过程记录 `simharness/docs/2026-11-03-run26-collection-backfill.md`；run26 挂账唯一事实源=`docs/superpowers/specs/2026-11-03-run26-pending-batch.md`），执行中追加两条用户反馈根治：小程序首帧空白页、方案 HTML 裸文本。

### N12 中央仓分叉仲裁（已完成）

本地 main 独有 6 笔与 origin/main 重写版**逐文件 diff 零差异**（等价血统）——`git reset --hard origin/main` 弃冗余，run25 收官治理态刷新产物（work-report/domain-audit/.qgate 发布报告）随件落 main（`0bbf6b7`）。终态分叉 0/0。

### 小程序首帧空白页根治（用户反馈①）

根因链（实测定谳）：run25 首帧=BFF 禁外呼守卫态空白 → 本轮初版复跑仍空白有两层真因：(a) 运行副本 app.js 注入时注释插进对象字面量吞掉逗号=语法错整个小程序白屏；(b) 副本页面为 agent 旧联调版（数据结构与仓内正本不符）。根治=运行副本**重建为仓内正本**+两处注入（appid/bffBaseUrl）+新增 `tools/mock-bff.js`（概设 §4.1 契约三端点，mock 渠道口径）真实应答查单；`tools/runtime-proof.js` 重写为「等 data.order 装载后截帧」（轮询，`mini.evaluate` 通道——本机 automator `Page.data()` 报 page node not found 不可用）＋R1 三要素（businessLogicRan 判据=首页 data.order 装载）。终态首帧：`businessLogicRan=true, amount=99.00, channels=[WECHAT]`，frame-verify 语义过（中央仓 `87c7e8b`）。

### 1/4 排版（用户反馈②同批）

`mx-report-gen.py` 帧渲染加竖屏判据（零依赖 PNG IHDR 宽高读，高>宽×1.2）→ `.shot.portrait`（flex 25%）——手机竖屏帧按 1/4 宽排版，横屏平台帧布局不变（`grep` 实证 final-report 生效 1 处）。

### 方案 HTML 自包含渲染（用户反馈③：裸文本）

根因=此前 pandoc 产物依赖 CDN CSS（离线即裸文本）且 mermaid 未渲染。新增 `mux/plan-html-render.py`：pandoc 骨架+mermaid 块经 mmdc 预渲染 SVG 内联回嵌+内联 CSS，产出零外部依赖单文件（425KB，mermaid 3 块）。

### N13 行覆盖实测（已完成）

四后端 app `vitest --coverage` 实跑（% Lines）：pay-core 93.09 / wechat 75.66 / alipay 94.98 / merchant-api 92.85；G4 §12 覆盖数值化更新（中央仓 `cb08d51`）。MP unit 面暴露交付债：vitest globals 修复（10 文件 describe 未定义族）后实跑 78/163，85 红=API 名漂移族（测试调 `parseEntryParams` 而实现导出 `parseCashierEntry`）+FE 断言族——登记 ISSUES-LOG `mp-unit-vitest-red`（`ce3e941`），**不代修**（代修=重做 TEST-FE 且可能掩盖真缺陷），MP 行覆盖以口径声明替代。

### N10 18b 程序接线（已完成）

- SDK：中央仓 package.json 已声明+`npm i` 实测解析 OK；微信开发者工具 CLI 在位。
- prelaunch ㉜ 探针（fail-soft 不计数）：双通道=CLI 文件在位+产品端点可达（HTTP 401=面在，端点带鉴权实测）——活体绿。
- 驱动 18b 核验点（fail-soft）：devimpl 段核验 origin/main 本轮新鲜（repo_has 自带新鲜度）且 `launchOk=true` 的 runtime-proof；缺席登记 `runtime-proof-missing` 声明态不阻断（G3⑦ 按 V8.17 红线②降级）。
- 守门：`capture-plan-registry-coverage.test.ts` 追加两断言（8/8 过）。

### N11 补做真实过程（见决策 2）

支付红线三条对账实测全过：①敏感认证数据不存储（pay-core src grep CVV/磁道/交易密码 零命中）②密钥不出服务端（小程序三目录 grep 渠道凭证/私钥 零命中）③日志脱敏（types.ts raw=summary 摘要形态+console 金额/卡号直写零命中；安全测试锚=G4 §6.2+验签失败双侧用例）。双人复核=两个独立 AI 实例并行抽验意见书锚（复核记录随件）。豁免五字段=意见书实无豁免登记，N/A 如实。评测族五字段=按「未发起三态声明」填充（零虚构）。

## 决策记录

1. **MP unit 85 红不代修**：API 名漂移属 TEST-FE 交付债，导演代修=代偿越界且可能掩盖真缺陷（测试期望可能比实现对）；登记 ISSUES-LOG 交 run26 TEST-FE 轮清偿。
2. **N11「补做」边界=只补真实发生的过程**：红线对账/双人复核为可真实执行的核对动作（标注 2026-11-03 补做时点）；评测未发起的事实以三态声明填充字段（在场且如实），不跑一轮评测来「造」数据（跑评测=新轮次行为非本批挂账）。
3. **探针双通道替代带鉴权探测**：health 端点带产品鉴权（实测 401），prelaunch 不引入登录链——HTTP 401 即证端点在；工具在位以 CLI 文件判。
4. 运行副本纪律入工具注释：副本=仓内正本+注入（appid/bffBaseUrl），旧联调版副本不得复用（数据结构与正本分叉=白屏排查黑洞）。

## 验证

- 守门 8/8 过；`bash -n` 两脚本过；prelaunch ㉜ 活体绿。
- runtime-proof 三证：`businessLogicRan=true`（evaluate 取数）+frame-verify 语义过+新 PNG/JSON 落中央仓 main（`87c7e8b`）。
- 红线对账三条命令锚在案（本 spec 变更节引述）。
- 全量 `npm test`（合并前）；simharness 域 260+。

## 设计文档影响

DESIGN_SYNC: none。理由：18b 接线是方案 §2.5 已声明面的执行对齐（语义未变）；1/4 排版与自包含渲染为呈现层；不触及整合正本与数字总账。N10-N13 台账状态随批更新为已完成/部分清偿。
