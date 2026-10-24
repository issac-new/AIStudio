// violating fixture 追加（2026-07-20 P1 唤醒）：
// runtimeConfig.public 块硬编码敏感 key（public 打包进客户端 bundle 泄露）
// → fw_nuxt_runtime_config_secret(fail)
export default defineNuxtConfig({
  runtimeConfig: {
    apiSecret: 'server-only-value',
    public: {
      apiKey: 'pk-live-hardcoded',
    },
  },
});
