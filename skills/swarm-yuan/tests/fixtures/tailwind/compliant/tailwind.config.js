// compliant fixture: content 完整 + prefix + darkMode + 自定义颜色
module.exports = {
  content: ['./src/**/*.{vue,tsx,ts,html}'],
  darkMode: 'class',
  prefix: 'tw-',
  corePlugins: {
    preflight: false,
  },
  theme: {
    colors: {
      brand: '#1890ff',
    },
    extend: {},
  },
  plugins: [],
};
