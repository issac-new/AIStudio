<script setup lang="ts">
// violating fixture: 全量引入 + 手动校验 + 硬编码中文 + 表单项缺字段映射
// + 弹窗缺销毁配置 + 上传缺大小校验（主触发 fail）
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import { ref } from 'vue';

const name = ref('');
const file = ref<File | null>(null);

function submit() {
  if (!name.value) {
    alert('请输入名称');
    return;
  }
  alert('提交成功');
}

function onFile(f: File) {
  file.value = f;
}
</script>

<template>
  <el-form>
    <el-form-item label="名称">
      <el-input v-model="name" placeholder="请输入名称" />
    </el-form-item>
    <el-form-item>
      <el-button @click="submit">提交</el-button>
    </el-form-item>
  </el-form>

  <el-dialog :model-value="true" title="编辑">
    <el-input v-model="name" />
  </el-dialog>

  <el-upload :on-change="onFile">
    <el-button>上传文件</el-button>
  </el-upload>
</template>
