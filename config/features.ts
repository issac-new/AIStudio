// overlay/config/features.ts
// 功能开关。默认全部开启(向后兼容),可经环境变量关闭。
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
  matrixChat: process.env.VITE_CUSTOM_MATRIX_CHAT !== 'false',
  matrixAuth: process.env.CUSTOM_MATRIX_AUTH === 'true',
  matrixAdmin: process.env.CUSTOM_MATRIX_ADMIN === 'true',
  kanbanEnhancements: process.env.CUSTOM_KANBAN_ENHANCEMENTS !== 'false',
  branding: process.env.VITE_CUSTOM_BRANDING !== 'false',
  extendedI18n: process.env.VITE_CUSTOM_EXTENDED_I18N !== 'false',
  cockpit: process.env.VITE_CUSTOM_COCKPIT !== 'false',
};

export function isFeatureEnabled(feature: keyof FeatureConfig): boolean {
  return features[feature];
}
