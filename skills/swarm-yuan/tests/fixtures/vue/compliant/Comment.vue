<!--
compliant fixture:
  - v-html 渲染前经 DOMPurify.sanitize 净化 → fw_vue_vhtml_sanitize pass
  - v-for 用 item.id 稳定 key → fw_vue_vfor_index_key pass
  - <script setup> 已用 → fw_vue_script_setup pass
期望：bash run-framework-fixture.sh vue → compliant 退出码 0（PASS）
-->
<script setup lang="ts">
import { ref } from 'vue';
import DOMPurify from 'dompurify';

const userContent = ref<string>('');
const safeContent = () => DOMPurify.sanitize(userContent.value); // 净化后再渲染
const items = ref<{ id: number; name: string }[]>([
  { id: 1, name: 'A' },
  { id: 2, name: 'B' },
]);
</script>

<template>
  <!-- v-html 渲染净化后内容，同文件检出 DOMPurify.sanitize -->
  <div v-html="safeContent()"></div>

  <!-- v-for 用 item.id 稳定唯一 key -->
  <ul>
    <li v-for="item in items" :key="item.id">{{ item.name }}</li>
  </ul>
</template>
