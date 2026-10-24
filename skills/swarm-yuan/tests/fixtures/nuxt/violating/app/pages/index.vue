<script setup lang="ts">
// violating fixture:
//   - useAsyncData 无 key 参数 → fw_nuxt_fetch_key(fail)
//   - Date.now() 在 render 阶段（setup 顶层，非 onMounted）→ fw_nuxt_hydration(fail) 主触发
//   - useState 无 key 参数 → fw_nuxt_usestate_key(fail)（2026-07-20 P1 唤醒）
//   - app/ 页面 import server/ 内部 → fw_nuxt_server_boundary(fail)（2026-07-20 P1 唤醒）
// 期望：bash run-framework-fixture.sh nuxt → violating 退出码 != 0（FAIL）
import { now } from '~/server/api/now.get';

const { data } = await useAsyncData(() => $fetch('/api/now'));

// render 阶段调用 Date.now()：服务端渲染值 ≠ 客户端 hydration 值 → mismatch
const renderedAt = Date.now();

// useState 未传唯一 key：跨组件状态互相覆盖风险
const count = useState(() => 0);
</script>

<template>
  <div>
    <p>data: {{ data }}</p>
    <p>rendered at: {{ renderedAt }}</p>
    <p>count: {{ count }}</p>
    <p>server now: {{ now }}</p>
  </div>
</template>
