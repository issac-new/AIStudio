# IDE 电脑操作真接通 + 思考档双源根治

日期：2026-10-18 ｜ 状态：实施中 ｜ 分支：`feat/ide-cua-and-effort`

## 主旨三句话

- 唯一主旨：①「电脑操作」按钮从声明式升为真接线——经引擎 WS 桥调 zcode 引擎插件面（listPlugins/setPluginEnabled），状态/切换均以引擎为单一事实源；②思考档「目录给出 disabled/enabled、发送链拒收」的双源缺陷根治。
- 受众及所需：SwarmStudio IDE 日常使用者（用户本人）。
- 读完促成什么动作：验收=开 IDE 看电脑操作按钮反映引擎真值、点开关真切换插件；GLM-5.3 思考档出现 低/高/最高 且发送不再报错。

## 事实锚点（探查实证）

- 引擎插件面：`IZCodeAgentService.listPlugins/setPluginEnabled`（upstream/zcode packages/services/src/zcode-agent/zcodeAgent.ts:658/792）；参数形状 zcodeAgentPluginParams.ts（workspacePath+pluginId+enabled+scope）；CUA 插件 id=`computer-use@zcode-plugins-official`（packages/shared/src/mcp.ts:10）。活引擎实测（本机 :3030）：插件**已装且 enabled=true**（user 级，rootPath ~/.zcode/cli/plugins/cache/...），listPlugins 经既有 engine-bridge 可调（探针 19 插件返回）。
- 插件启停热更新运行态（pluginManagementService.ts 头注：事实源在 zcode-cli 进程，读写 ~/.zcode 插件目录并热更新）——IDE 侧无需重启引擎。
- 思考档双源根因：目录侧 `zcodeModelReasoningLevels`（custom/server/controllers/ide/engine-models.ts:229）用**大小写敏感、不锚定**的 `re.test`，只命中通配规则 `.*`→[disabled,enabled]；引擎与发送链均为**大小写不敏感+全匹配** `^(?:p)$`/i（引擎真值 packages/provider/src/config/model-config.ts:408,545；发送链 upstream model-options.ts:43-49）→ GLM-5.3 三方实为 [low,high,max]。修复=目录侧改用引擎同款匹配语义（含 builtinProviderModelRules 精确覆盖与 null 清空），发送链/上游零改动。

## 方案

1. **思考档**：重写 `zcodeModelReasoningLevels` 为引擎语义（`^(?:pattern)$`+i，modelRules 后命中覆盖，builtinProviderModelRules providerId+modelId 精确覆盖，reasoningLevel:null 清空）；manifest 读取器补出 builtinProviderModelRules；调用点传 engineId。
2. **电脑操作后端**：新 `custom/server/controllers/ide/computer-use-routes.ts`（原生中间件风格=ideNativeRoutes 同款，精确匹配 GET/PUT /api/ide/computer-use）：GET=listPlugins 投影 {supported,enabled}；PUT=setPluginEnabled({workspacePath,pluginId,enabled,scope:'user'}) 回投新态；引擎拒绝（会话忙等）如实 ok:false+detail。经 patch 662 注册进 routes.ts。
3. **电脑操作前端**：IdeChatPane 控件挂载即拉真值、点击 PUT（带工作区根）；状态点=引擎真值（on/off/error），弃声明消息与 localStorage 逐会话键；tooltip 诚实注明「新会话生效；运行中会话需重开」。
4. **清理**：一次性活探针测试删除；i18n 词条更新；相关测试迁移。

## 决策记录

- D-1：经 engine-bridge 的 agent 服务调 listPlugins/setPluginEnabled，不读不写 ~/.zcode 插件目录。理由=pluginManagementService 头注明示事实源在 CLI 进程且热更新；旁路写文件制造第三源。
- D-2：开关为 user 级全局态（ZCode 同语义：插件启停=全局，session-busy 时锁）；不做 per-session 粒度。理由=引擎 scope 就是 user/workspace 二选一，per-session 无对应面。
- D-3：思考档修复在目录侧对齐引擎语义，不发 patch 改发送链。理由=引擎/发送链语义本就一致（实证），错的是目录侧手写匹配器；改上游无收益只添风险。
- D-4：路由走原生中间件（精确匹配+next 放行）而非 koa Router。理由=489 补丁先例（非 GET 新路由挂 router 真进程不生效），同款绕开。
- D-5：不接 setThoughtLevel/setMode 会话内即时切换（同批发现引擎已有此 RPC）——那是「模式即时生效」独立挂账的根治路径，本轮不扩面，记档待下批。
- D-6：modelApiRules/providerSiteRules 覆盖面（需 apiType/baseUrl 上下文）目录侧暂不模拟。理由=实证 glm/kimi 族无此类带值规则；模拟需引入 provider api 解析链，收益不成比例。残留风险记档：若某 provider 靠 site 规则改档位，目录可能仍与引擎有偏差——届时升 D-5 同批的引擎查询面。

## 验收

- [ ] GLM-5.3 目录档位=[低,高,最高]；选「高」发送不再报 Unsupported（浏览器实测）
- [ ] 电脑操作按钮反映引擎真值（本机初始=已启用）；点击调 PUT 后引擎侧 enabled 翻转（listPlugins 复核）
- [ ] 引擎不可达 → 按钮 error 态不炸
- [ ] vitest 全绿（新增 computer-use 路由测试+档位语义 fixture 测试；前端 computer-use 断言迁移）
- [ ] patch 662 登记进 series；inject 重放 RC=0
