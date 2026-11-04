// overlay/projectworkflow: 运行时配置 PUT section 白名单（fail-closed 单一事实源）。
//
// 口径（spec 2026-11-04-agentteams-project-workflow.md D6）：
//   · 只收 PUT /api/hermes/config（updateConfig 通用 deepMerge 分支）的 section 面；
//   · GET 不收紧（读面已受 profile 访问权门禁）；
//   · `proxy` / `gatewayAutoStart` 两个特例分支在 updateConfig 前段各自处理
//     （config.ts:479 proxy 走 .env、config.ts:500-521 gatewayAutoStart 走 app-config），
//     但它们仍是合法 PUT section，白名单必须包含——否则特例分支前的通用拦截
//     会把合法特例请求一并 400 掉。
//   · 白名单外的 section 一律 400，不再落到 config.yaml 任意键写入。
//
// 消费方：patches/733-server-config-section-whitelist.patch 把本模块接线进
// vendor controllers/config.ts 的 updateConfig（import 路径 ../../../custom/…，
// 经 packages/server/src/custom → overlay custom/server 符号链接解析）。
//
// 清点来源锚点见 ALLOWED_CONFIG_SECTIONS 各行注释；宁多勿漏，新增调用方
// 必须先在此登记再上线（守门：custom/server/projectworkflow/__tests__/config-whitelist.test.ts）。

/**
 * PUT /api/hermes/config 允许的 section 全集。
 * 每项注释=该 section 的真实调用方锚点（vendor=hermes-studio 钉版基线内路径）。
 */
export const ALLOWED_CONFIG_SECTIONS: readonly string[] = [
  // —— vendor settings store switch 全部分支（packages/client/src/stores/hermes/settings.ts:107-137 updateLocal / :144-175 saveSection）——
  'display',          // settings.ts:108；调用方 DisplaySettings.vue:35
  'agent',            // settings.ts:109；调用方 AgentSettings.vue:17,31
  'memory',           // settings.ts:110；调用方 MemorySettings.vue:17,31、SessionSettings.vue:53
  'skills',           // settings.ts:111；调用方 SessionSettings.vue:53（write_approval）
  'compression',      // settings.ts:112；调用方 CompressionSettings.vue:23,35
  'session_reset',    // settings.ts:113；调用方 SessionSettings.vue:19,33
  'privacy',          // settings.ts:114；调用方 PrivacySettings.vue:13
  'approvals',        // settings.ts:115；调用方 SessionSettings.vue:43；server 侧 config.ts:15 PLATFORM_SECTIONS 亦含（通用分支写+按需重启）
  'gatewayAutoStart', // settings.ts:116；调用方 GatewayAutoStartSettings.vue:49；updateConfig 特例分支 config.ts:500-521
  'proxy',            // settings.ts:117；调用方 ProxySettings.vue:32；updateConfig 特例分支 config.ts:479-498
  'telegram',         // settings.ts:118；PlatformSettings.vue:99(platform∈:226-279 key 集)
  'discord',          // settings.ts:119；同上 PlatformSettings 平台面
  'slack',            // settings.ts:120；同上
  'whatsapp',         // settings.ts:121；同上
  'matrix',           // settings.ts:122；同上
  'wecom',            // settings.ts:123；同上
  'feishu',           // settings.ts:124；同上
  'dingtalk',         // settings.ts:125；同上
  'qqbot',            // settings.ts:126；同上
  'weixin',           // settings.ts:127；同上
  // settings.ts:128-135 platforms 整段写分支；当前无字面调用方，但 store 双 switch
  // 均保留该 case（平台整段合并通道），按宁多勿漏收录
  'platforms',
  // settings.ts:160 `case 'wechat': case 'wecom'` 上游别名分支——section 原样透传
  // 服务端；当前无字面调用方，按宁多勿漏收录（避免上游后续启用即 400）
  'wechat',

  // —— vendor settings switch 之外、同一 PUT 通道的真实调用面 ——
  // server 通用分支引用 config.ts:534（section==='model' 触发 invalidateProviderRuntime）；
  // 调用方 custom/client/ia2/views/agents/AgentsView.vue:58（模型绑定，x-hermes-profile 定向）
  'model',
  // vendor 语音设置卡片：HermesVoiceConfigSummary.vue:101 updateConfigSection(props.kind,…)
  // kind∈'tts'|'stt'（packages/client/src/types/voice-api.ts:4 VoiceApiKind），走通用 deepMerge 分支
  'tts',
  'stt',

  // —— overlay custom 面 ——
  // custom/client/ide/api/hooks.ts:51（B3 写档面，全量替换 hooks 段）
  'hooks',
]

/**
 * section 是否允许 PUT。白名单外一律 false（fail-closed）。
 */
export function isAllowedConfigSection(s: string): boolean {
  return ALLOWED_CONFIG_SECTIONS.includes(s)
}
