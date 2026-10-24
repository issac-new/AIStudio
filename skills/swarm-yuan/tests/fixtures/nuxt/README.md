# nuxt fixture 说明

- violating 主触发 6 个 fail 意图：useAsyncData 无 key（app/pages/index.vue）/ Date.now 在 render 阶段（index.vue）/
  useState 无 key（index.vue）/ app/ 页面 import server/ 内部（index.vue）/ composables/ 导出与内置 useFetch 同名
  （app/composables/useFetch.ts）/ runtimeConfig.public 硬编码 apiKey（nuxt.config.ts）。
- 断言登记：**6/6 主触发已断言**（`violating/expected-fail-ids`：`fw_nuxt_fetch_key`、`fw_nuxt_hydration`、
  `fw_nuxt_usestate_key`、`fw_nuxt_autoimport_conflict`、`fw_nuxt_server_boundary`、`fw_nuxt_runtime_config_secret`）。
- 2026-07-20 P1 唤醒记录：`fw_nuxt_usestate_key`/`fw_nuxt_autoimport_conflict`/`fw_nuxt_server_boundary`/
  `fw_nuxt_runtime_config_secret` 原 fixture 无触发样本而沉睡。本批 index.vue 追加无 key useState 与
  `~/server/` 导入、新增 app/composables/useFetch.ts 与 nuxt.config.ts 实例化唤醒；门禁判定逻辑未动。
  composable 冲突样本选用 useFetch 命名（而非 useState），避免在 usestate_key 门禁上产生函数定义式二次命中噪音。
- 无法实例化项登记：无（6 个 fail 门禁全部实例化）。
- compliant 侧 useAsyncData/useState 均传 key、error.vue 已配、无 server 跨界导入，期望全 pass。
