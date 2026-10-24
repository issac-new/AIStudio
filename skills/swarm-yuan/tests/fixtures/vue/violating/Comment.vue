<!--
violating fixture:
  - v-html 渲染未净化字符串（userContent 来自用户输入），同文件无净化调用 → fw_vue_vhtml_sanitize(fail) 主触发
  - v-for 用 index 作 key → fw_vue_vfor_index_key(warn)
  - 本文件 setup 语法糖合规；同目录 Legacy.vue 为普通 script + Options API → fw_vue_script_setup + fw_vue_no_options_api(fail)
期望：bash run-framework-fixture.sh vue → violating 退出码 != 0（FAIL）
-->
<script setup lang="ts">
import { ref } from 'vue';

const userContent = ref<string>(''); // 模拟来自用户输入的富文本
const items = ref<{ id: number; name: string }[]>([
  { id: 1, name: 'A' },
  { id: 2, name: 'B' },
]);
</script>

<template>
  <!-- v-html 渲染未净化内容，同文件无净化调用 → XSS 风险 -->
  <div v-html="userContent"></div>

  <!-- v-for 用 index 作 key → 增删/排序时 DOM 复用错位 -->
  <ul>
    <li v-for="(item, index) in items" :key="index">{{ item.name }}</li>
  </ul>
</template>
