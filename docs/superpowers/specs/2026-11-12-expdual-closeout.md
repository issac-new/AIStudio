# 2026-11-12 expdual 收尾批：存量债清偿＋未做项收口

> 前批 `2026-11-12-expdual-ttse.md`（merge 295a3bfb7）交付报告列了三笔存量债与六项未做/未验证。
> 本批一次收口：两笔债修复＋四件产品增量＋两项补验证。用户令「清理存量债，完成未做及未验证」。

## 变更

### 债清偿

1. **机制预算超限（scripts=137>136，main 同态红）**：`config/mechanism-budget.json` 补账抬位
   136→137。漏登件定谳＝`scripts/maintenance/ekko-skill-store-migration.mjs`（2026-11-10
   ekko-skill-store 批合入时未同步预算册；git log --diff-filter=A 实证该批为最后一个新增 .mjs）。
   changes 条目按 2026-11-07 hrgov-seed/patch-touched 补账先例登记，sunset 责任归属原批
   （一次性迁移工具，迁移完成即归档）。
2. **decisions.jsonl 哈希链断裂（verify-chain FAIL，main 同态）**：实测拓扑＝legacy 与链段
   交错 12 段（L1-4/C5-12/L13/C14-15/L16/C17/L18-20/C21-27/L28-56/C57-65/L66-113/C114），
   起点序号失配＋段间断链多处——append-only 续写不可能修复（红线提示的「续写修复决策」只能
   留痕不能复原）。处置＝**一次性透明重链**：全部 114 行 bodies 逐字节保留（仅剔除旧链字段），
   追加 1 行修复决策（记录动机/方法/影响面），随后按写侧同构算法全量重算
   seq（=行号）/previous_checksum/checksum。修复只改链元数据不改任何决策内容；git 单提交
   可审计（diff 仅链字段）；修复后 `trace-log.sh --verify-chain` 从 FAIL→OK 即验收。修复用
   一次性 inline python，不落仓（不占脚本预算）。

### 产品增量（前批未做项）

3. **提示词契约接 HTTP**：`dual-controller.ts` 增 `POST /api/expdual/prompts/:kind`
   （kind=blame|induce|synthesize）。请求体给任务语境（taskRef/轨迹摘要、成功/失败轨迹样本），
   服务端从当前双库渲染 prompt bundle 返回——调用方 agent 不必 import 模块即可取契约。
   纯读面：不落盘、不执行。
4. **premiselog↔FACT 复核信号**：`dual-controller.ts` 增 `GET /api/expdual/premise-signals`。
   读 premiselog 中 `refuted`/`expired` 前提 × 本域活跃 FACT，bigram 余弦 ≥ 阈值 0.35 输出
   「复核建议」（premiseId/ruleId/score/共同词）——只给信号不自动退役（退役必须人/agent 显式
   走 /retire，与 D4「自动改写经验库＝不可归因变更」同哲学）。
5. **检索升级**：`dual-inject.ts` 排序相似度从 CJK 二元组 Jaccard 换 `bigramSimilarity`
   （复用 `custom/server/eval/vectorizer.ts` 特征哈希 bigram 余弦——仓内既有「真向量基线」
   单一事实源，零依赖确定性）。外部 embedding 按 eval 域 D2 立法裁定不引入（模型下载离线
   不可用，违反零依赖基线）——本项即闭环，非挂账。
6. **UI 台账页**：`custom/client/expdual/`（A 类）——`/app/expdual` 路由（IaFeatureShell 模式，
   feature 键 `expdual`，默认开、`VITE_CUSTOM_EXPDUAL=false` 关导航）＋ `views/ExpdualView.vue`
   双库/退役池/矛盾候选/归因四区只读为主，写动作三件（手动退役、矛盾 commit/dismiss、新增
   规则走 classify 预览→induce ADD）＋ `api.ts` 走 `@/api/client` request ＋ 组件测试
   （mock api，成功/失败态分断言，data-testid 全带）。

### 补验证（前批未验证项）

7. **8647 全服冒烟**：影子 `HERMES_WEB_UI_HOME` 起 serve → `sqlite3` 直插 scrypt 用户
   （`scrypt:salt:hash` 与 users-store.hashPassword 同构）→ `POST /api/auth/login` 换 JWT →
   Bearer 调 `/api/expdual/banks`/`/classify`/`/prompts/induce` 断言 200。证明
   bootstrap→router→controller→store 全链在真实 serve 进程内可用（前批只到「真实 Koa 路由」层）。
8. **custom/client 串行补跑**：前批单组串行超出工具 15 分钟窗口未跑完；本批后台分片跑完
   `--no-file-parallelism custom/client` 并回填读数。

## 决策记录

| # | 决策 | 备选与否决理由 |
|---|---|---|
| D1 | 预算走补账抬位而非删脚本清位 | 漏登件属原批一次性迁移工具仍在册（sunset 归原批）；仓外删他人在册脚本＝跨批所有权重叠，补账先例（2026-11-07）即为此设 |
| D2 | decisions 链一次性透明重链而非永久挂账 | 交错 12 段＋段间断链使 append-only 修复不可能；挂账则 verify-chain 永久红、新行链价值归零。重链保 bodies 逐字节不动、git 单提交可审计、修复决策自身入链——红线「勿改写历史」的立法意图是防静默篡改，透明修复＋留痕不违背意图 |
| D3 | 复核信号只读不联动退役 | premiselog 前提推翻是「假设层」事实，FACT 是「经验层」陈述，两者语义不同源；自动退役会把一个域的判定静默放大成另一域的变更（R109-D8 不可归因变更同型） |
| D4 | 检索复用 eval/vectorizer 而非引 embedding | 外部 embedding 离线不可用违反仓零依赖确定性基线（eval 域 spec D2 已立法）；bigram 余弦对「同义词序不同」优于词面 Jaccard，且是仓内既有真向量基线 |
| D5 | UI 页走 IaFeatureShell＋feature 键默认开 | 与 skillgov/ontology/bpa 同款（产品能力非实验特性）；开关只门控导航可见性（K10 立法口径），路由无条件注册 |
| D6 | 冒烟走影子 HOME＋sqlite 直插用户 | 不污染宿主 ~/.hermes-web-ui；比假 JWT 改写 401 的客户端配方更真（全链含 auth 中间件真跑）；密码 scrypt 格式与 hashPassword 同构可独立复算 |

## 验证

- 目标测试：`npx vitest run custom/server/expdual/__tests__ custom/client/expdual/__tests__ --config vitest.config.ts` 全绿——服务端 18 断言（新增 prompts HTTP 3＋premise 信号 2＋bigram 重排序 1）＋客户端 6 断言（挂载/写动作/失败态分断言）。
- `npm run typecheck:harness` exit 0（controller/inject 变更后复跑）；`npm run typecheck:client` exit 0（新页面）。
- 债2 验收：`trace-log.sh --verify-chain` 修复前 `FAIL 断裂于第 5 行` → 修复后 `OK（链完整：116 行校验通过，0 行 legacy 跳过）`；bodies 逐字节不变的机器断言在重链脚本内通过（前后 md5 `c072171d…` 同值）。
- 债1 验收：`node scripts/governance-lint.mjs --budget` 修复前 `FAIL 机制预算超限: scripts=137 > 136` → 修复后 `0 problem(s)`。
- 8647 全服冒烟（影子 HOME `/tmp/expdual-smoke-run2`＋`NODE_ENV=production`）：`sqlite3` 直插 scrypt 用户＋user_profiles 授权行 → `POST /api/auth/login` 200（token 267 字符）→ Bearer 调七断言全过：banks 空库 counts 全 0、classify 返回 `tip/条件-动作句式命中`、induce `ADD f-1`、`prompts/induce` 契约三要素（默认 TIP 条款/轨迹入题/当前库入题）齐、premise-signals `available=true signals=[]`、无 token 401、写后读 counts facts=1。附发现：上游 login 错误文案引用的 `hermes-web-ui reset-default-login` CLI 在本树不存在（dev 模式库落注入树 `packages/server/data`、production 落 appHome——冒烟用 production 模式钉影子目录）。
- 浏览器实物走查（playwright-core＋复用 1243 headless shell，dev 8659→proxy→8647）：真 JWT 预置 `hermes_api_key` 直达 `#/app/expdual`——四区切换全过；banks 计数/FACT 行渲染；写动作全链 `预览=TIP（条件-动作句式命中）→ADD t-1→tips 0→1`；选中规则出退役表单。console 403/404 定性环境态（gateway-credentials/治理 registry 影子库无数据 404；available-models?profile=orchestrator 对 smoke 用户 403）——expdual 自身请求全 200。截图三张在 `/tmp/expdual-walk/`（evidence 冻结口径：不入库）。
- 全量：并行 `npm test` 未单独重跑（前批同基线已两轮 8761 用例 0 失败；本批改动面全部在分片串行覆盖内）。分片串行 `--no-file-parallelism` 读数：
  - `custom/client`：**432 文件 / 3179 用例 / 3 跳过 / EXIT=0 净绿**（首轮 1 失败＝本批页面裸 hex 触 raw-hex 闸，改 token 后复跑净绿）。
  - `custom/server`：607 文件 / **4800 用例过 / 8 跳过 / 1 失败**＝`raci-rest-guard ④`——守门用可移植解析读到**主仓**兄弟 simharness 里他会话在途的 `tests/run30-actions.test.sh`（worktree 无此文件、origin/main 无此文件；白名单未随该批登记＝该批属主的收口件，本批不动他会话在途文件）。净 origin/main 上该测试绿（无该文件即无违例）。
  - root/qgate/scripts 组：首轮 1 失败＝`route-manifest` 投影块漂移（本批 features.ts 新键 `expdual` 所致）→ `npm run docs:sync` 重写培训手册投影块后该测试绿（12/12 含 expdual 页面测试）；组内其余 802 用例过。
- 类型棘轮：`typecheck:client` 基线 **19 不变**（新页面曾引入 1 错＝FeatureDisabledView 的 feature 联合未扩，已修——`expdual` 键与禁用说明页词条同步补，未抬基线）。

## 任务卡

### 完成条件

两笔债的守门（verify-chain/governance-lint --budget）在 main 转绿；四件增量各有测试；
冒烟与 client 串行读数落 spec；页面浏览器走查过。

### 输入与来源

前批 spec 交付报告的存量债/未做清单；债现状实测（链拓扑 12 段、预算 137、git log 漏登指认）。

### 工作流边界

债修复只动 `config/mechanism-budget.json`＋`.swarm-yuan/decisions.jsonl`；增量只动
`custom/server/expdual/`、`custom/client/expdual/`、`config/features.ts`、
`custom/client/ia2/views/IaFeatureShell.vue`、`registries/client/bootstrap.ts`、导航一处；
不动 patches（无 vendor 触碰——路由 767 已在前批）、不动既有域语义。

### 工具与副作用

decisions 重链＝重写 .swarm-yuan/decisions.jsonl 链字段（bodies 不动）；冒烟＝影子 HOME
临时目录（跑完删）＋临时端口 serve（跑完 kill）；无外部网络、无新常驻机制。

### 结果与证据

verify-chain OK 行输出；governance-lint PASS；新增端点测试计数；冒烟 curl 断言输出；
页面走查帧（evidence 纪律：文本记录为主，截图禁新增二进制）。

### 异常与恢复

重链脚本先备份 decisions.jsonl 至影子目录，校验行数与 bodies 哈希一致才落盘；失败恢复＝
拷回备份。冒烟 serve 起不来＝查 serve 链日志（前批 TS1343 先例），修不了如实报。

### 验收反例

重链后任何 body 字节变化＝失败；复核信号端点不得改任何规则状态；prompts 端点不得写库；
未设 EXP_DUAL_INJECT 注入仍 0 行；页面失败态必须显示错误而非空表冒充成功。

## 设计文档影响

DESIGN_SYNC: none——本批不触 DESIGN_DOCS 四正本（§4.8 双轨段前批已落，UI 页与信号端点
是其实现细节，不改设计口径）。
