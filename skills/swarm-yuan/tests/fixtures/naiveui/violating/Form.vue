<script setup lang="ts">
import { createDiscreteApi } from 'naive-ui';
import { ref } from 'vue';

const { message } = createDiscreteApi(['message']);
const name = ref('');

function submit() {
  if (!name.value) {
    message.error('请输入名称');
    return;
  }
}
</script>

<template>
  <n-form>
    <n-form-item label="名称">
      <n-input v-model="name" />
    </n-form-item>
    <n-upload>
      <n-button>上传</n-button>
    </n-upload>
  </n-form>
</template>
