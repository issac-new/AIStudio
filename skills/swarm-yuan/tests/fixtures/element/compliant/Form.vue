<script setup lang="ts">
// compliant fixture: 按需引入 + rules 校验 + i18n + 弹窗销毁 + 上传大小校验
import { ref, reactive } from 'vue';
import { ElMessage } from 'element-plus';
import { useI18n } from 'vue-i18n';
import type { FormInstance, FormRules } from 'element-plus';

const { t } = useI18n();
const formRef = ref<FormInstance>();
const form = reactive({ name: '', visible: false });
const rules: FormRules = {
  name: [{ required: true, message: t('form.nameRequired'), trigger: 'blur' }],
};
const file = ref<File | null>(null);

async function submit() {
  if (!formRef.value) return;
  await formRef.value.validate();
  ElMessage.success(t('form.submitSuccess'));
}

function beforeUpload(f: File) {
  const limit = 10 * 1024 * 1024;
  if (f.size > limit) {
    ElMessage.error(t('form.fileTooLarge'));
    return false;
  }
  return true;
}
</script>

<template>
  <el-form ref="formRef" :model="form" :rules="rules">
    <el-form-item :label="t('form.name')" prop="name">
      <el-input v-model="form.name" :placeholder="t('form.namePlaceholder')" />
    </el-form-item>
    <el-form-item>
      <el-button @click="submit">{{ t('form.submit') }}</el-button>
    </el-form-item>
  </el-form>

  <el-dialog v-model="form.visible" :title="t('form.edit')" destroy-on-close>
    <el-input v-model="form.name" />
  </el-dialog>

  <el-upload :before-upload="beforeUpload">
    <el-button>{{ t('form.upload') }}</el-button>
  </el-upload>
</template>
