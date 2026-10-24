<script setup lang="ts">
import { NForm, NFormItem, NInput, NUpload, NButton, useMessage } from 'naive-ui';
import { ref, reactive } from 'vue';

const message = useMessage();
const formRef = ref();
const form = reactive({ name: '' });
const rules = {
  name: [{ required: true, message: '请输入名称', trigger: 'blur' }],
};

async function submit() {
  await formRef.value?.validate();
  message.success('提交成功');
}

function beforeUpload({ file }: { file: { file?: File } }) {
  const limit = 10 * 1024 * 1024;
  if ((file.file?.size ?? 0) > limit) {
    message.error('文件过大');
    return false;
  }
  return true;
}
</script>

<template>
  <n-form ref="formRef" :model="form" :rules="rules">
    <n-form-item label="名称" path="name">
      <n-input v-model="form.name" />
    </n-form-item>
    <n-upload :before-upload="beforeUpload">
      <n-button>上传</n-button>
    </n-upload>
    <n-button @click="submit">提交</n-button>
  </n-form>
</template>
