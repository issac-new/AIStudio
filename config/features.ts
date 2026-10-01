// overlay/config/features.ts
// 功能开关。默认全部开启(向后兼容),可经环境变量关闭。
//
// 必须用 `import.meta.env.VITE_*` 读取——这是 Vite 向浏览器暴露环境变量的
// 唯一通道。早先版本用 `process.env.*`,而 `process` 在浏览器中未定义,会在
// bootstrap 阶段抛 ReferenceError("process is not defined")。同时所有 key 都
// 必须带 `VITE_` 前缀,否则 Vite 不会把该变量注入到客户端 bundle。
export interface FeatureConfig {
  matrixChat: boolean;
  matrixAuth: boolean;
  matrixAdmin: boolean;
  kanbanEnhancements: boolean;
  branding: boolean;
  extendedI18n: boolean;
  /** P4 用户裁决（2026-09-11）：原有 AI 协作中心（cockpit）保留功能、与新 /app
   *  六区域 IA 平行共存——不再退役，旗标回归默认开启。 */
  cockpit: boolean;
  /** IDE 工作台主页面（/ide）：codex 底座 + zcode 会话 UI 全量复用，
   *  登录落点由 patch 276/277 指向 /ide（2026-09-16 用户裁决）。 */
  ide: boolean;
  /** S3（补遗⑤ §13.4，B 档默认关）：语音对话（RealtimeVoiceStage 挂载 +
   *  设置语音区 stt/tts tab）。VITE_CUSTOM_VOICE=true 再开。组件与 API 全保留。 */
  voice: boolean;
  /** S3：桌面宠物三件（desktop.pet 路由 + WebPet 浮层 + petdex 商店入口）。
   *  VITE_CUSTOM_PET=true 再开。 */
  pet: boolean;
  /** S3：connections 的社媒 app tab + ESP32 mcu tab。
   *  VITE_CUSTOM_CONNECTIONS_EXTRAS=true 再开。 */
  connectionsExtras: boolean;
  /** S3：ekko 配置面（AgentManagerView 卡片 + /ekko/* 路由守卫 + 四页 superadmin
   *  运维面；VITE_CUSTOM_EKKO=true 再开）。 */
  ekko: boolean;
  /** S3：/studio/agents 配置中心（hermes.agentManager 侧栏条目与收编路由门控；
   *  VITE_CUSTOM_AGENT_MANAGER=true 再开）。 */
  agentManager: boolean;
  /** S3：三个外链页路由（/share/group-chat、/group-chat-link、/desktop-chat，
   *  bootstrap 摘除；VITE_CUSTOM_EXTERNAL_LINKS=true 再开）。 */
  externalLinks: boolean;
  /** S3：图像生成辅助模型面板（ModelsView auxiliary tab）。
   *  VITE_CUSTOM_IMAGE_ASSIST=true 再开。 */
  imageAssist: boolean;
}

export const features: FeatureConfig = {
  matrixChat: import.meta.env.VITE_CUSTOM_MATRIX_CHAT !== 'false',
  matrixAuth: import.meta.env.VITE_CUSTOM_MATRIX_AUTH === 'true',
  matrixAdmin: import.meta.env.VITE_CUSTOM_MATRIX_ADMIN === 'true',
  kanbanEnhancements: import.meta.env.VITE_CUSTOM_KANBAN_ENHANCEMENTS !== 'false',
  branding: import.meta.env.VITE_CUSTOM_BRANDING !== 'false',
  extendedI18n: import.meta.env.VITE_CUSTOM_EXTENDED_I18N !== 'false',
  cockpit: import.meta.env.VITE_CUSTOM_COCKPIT !== 'false',
  ide: import.meta.env.VITE_CUSTOM_IDE !== 'false',
  // S3（补遗⑤）：未用大块功能面默认关——显式环境变量再开（=== 'true'）
  voice: import.meta.env.VITE_CUSTOM_VOICE === 'true',
  pet: import.meta.env.VITE_CUSTOM_PETS === 'true',
  connectionsExtras: import.meta.env.VITE_CUSTOM_CONNECTIONS_EXTRAS === 'true',
  ekko: import.meta.env.VITE_CUSTOM_EKKO === 'true',
  agentManager: import.meta.env.VITE_CUSTOM_AGENT_MANAGER === 'true',
  externalLinks: import.meta.env.VITE_CUSTOM_EXTERNAL_LINKS === 'true',
  imageAssist: import.meta.env.VITE_CUSTOM_IMAGE_ASSIST === 'true',
};

export function isFeatureEnabled(feature: keyof FeatureConfig): boolean {
  return features[feature];
}
