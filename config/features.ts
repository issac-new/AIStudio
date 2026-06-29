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
  cockpit: boolean;
}

export const features: FeatureConfig = {
  matrixChat: import.meta.env.VITE_CUSTOM_MATRIX_CHAT !== 'false',
  matrixAuth: import.meta.env.VITE_CUSTOM_MATRIX_AUTH === 'true',
  matrixAdmin: import.meta.env.VITE_CUSTOM_MATRIX_ADMIN === 'true',
  kanbanEnhancements: import.meta.env.VITE_CUSTOM_KANBAN_ENHANCEMENTS !== 'false',
  branding: import.meta.env.VITE_CUSTOM_BRANDING !== 'false',
  extendedI18n: import.meta.env.VITE_CUSTOM_EXTENDED_I18N !== 'false',
  cockpit: import.meta.env.VITE_CUSTOM_COCKPIT !== 'false',
};

export function isFeatureEnabled(feature: keyof FeatureConfig): boolean {
  return features[feature];
}
