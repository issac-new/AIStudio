<!-- overlay/custom/client/ia2/views/gov/GovPostureView.vue -->
<!-- 阶段 ⑥「治理姿态」页签（AGT 吸收轮 2026-10-21）：姿态对账 + 审计链 + MCP 漂移
     + 全局紧急停止。立场：治理面先讲真话——没生效就亮红，不装已治理。 -->
<script setup lang="ts">
import PostureSection from '@/custom/governance/components/PostureSection.vue'
import EmergencyStopSection from '@/custom/governance/components/EmergencyStopSection.vue'
</script>

<template>
  <div class="gp" data-testid="gov-posture-view">
    <PostureSection />
    <EmergencyStopSection />
  </div>
</template>

<style scoped lang="scss">
.gp {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  overflow-y: auto;
  height: 100%;
}
</style>
