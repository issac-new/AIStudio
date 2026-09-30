<!-- overlay/custom/client/ia2/views/IaSettingsView.vue -->
<!-- 设置页壳内布局（2026-09-30 用户裁定）：左侧栏位于注意力条下方——壳层
     fullscreen 保持 true（App.vue 不再挂 AppSidebar，顶栏/注意力条全宽），
     本包装在壳主区内自绘 [IaSettingsSidebar | 上游 SettingsView] 两栏。
     侧栏功能面恢复（原三侧栏并集）见 IaSettingsSidebar 头注。 -->
<script setup lang="ts">
import SettingsView from '@/views/hermes/SettingsView.vue'
import IaSettingsSidebar from '../components/IaSettingsSidebar.vue'
</script>

<template>
  <div class="ia-set" data-testid="ia-settings-page">
    <div class="ia-set__row">
      <IaSettingsSidebar />
      <div class="ia-set__main">
        <SettingsView />
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
/* 根节点承接 .ia-shell__main > :first-child 的 flex column 收缩；行内两栏。
 * SettingsView 根节点固定 100vh 高度，在本列容器内经 flex-shrink 收敛
 * （与壳内其他上游视图同款语义），其 .settings-content 自持滚动。 */
.ia-set { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.ia-set__row { flex: 1; min-height: 0; display: flex; }
.ia-set__main { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
</style>
