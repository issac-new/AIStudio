<script setup lang="ts">
// IdeWorkflowPane — 工作流面板薄壳（workflow 集成轮建立；循环×工作流融合 Phase 1
// 2026-10-01 抽出实体为共享组件 WorkflowObservationPanel，本文件只保留侧栏页签挂载点；
// 工作区=ide.workspace 缺省回落，行为与抽出前一致）。
import WorkflowObservationPanel from '../components/WorkflowObservationPanel.vue'
</script>

<template>
  <WorkflowObservationPanel data-testid="ide-workflow-pane" />
</template>
