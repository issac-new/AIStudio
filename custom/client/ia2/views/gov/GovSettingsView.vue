<!-- overlay/custom/client/ia2/views/gov/GovSettingsView.vue -->
<!-- 治理·系统设置页（C9，R9——设计正本 §二 设置）：既有设置页按治理域分区的
     导航层（同域同区合并呈现、来源只标注不分隔——对账总表 E/F/G 合账裁决）；
     表单本体在各设置页不复制（合并铁律）。分区说明常驻；superAdmin 条目对
     非管理员不可见（两项 C9 验收门）。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { GOV_SETTINGS_DOMAINS, entryVisible, currentSuperAdmin } from './gov-settings-registry'

const router = useRouter()
const route = useRoute()

const superAdmin = currentSuperAdmin()
const domains = computed(() =>
  GOV_SETTINGS_DOMAINS.map(d => ({
    ...d,
    entries: d.entries.filter(e => entryVisible(e, router, superAdmin)),
  })).filter(d => d.entries.length > 0),
)

const SOURCE_LABEL = { native: '原生', legacy: '旧族' } as const

function go(name: string): void {
  void router.push({ name })
}
</script>

<template>
  <div class="gs" data-testid="gs-page">
    <header class="gs__head">
      <h2 class="gs__title">系统设置</h2>
      <span class="gs__sub">按治理域分区（{{ domains.length }} 区）——同域同区合并呈现，来源只标注不分隔；点入各设置页编辑。</span>
      <button class="gs__back" type="button" data-testid="gs-back" @click="void router.push({ name: 'ia2.governance' })">返回治理中心</button>
    </header>

    <section
      v-for="d in domains"
      :key="d.key"
      class="gs__domain"
      :data-testid="`gs-domain-${d.key}`"
    >
      <div class="gs__domain-head">
        <h3 class="gs__domain-title">{{ d.title }}</h3>
        <p class="gs__domain-note">{{ d.note }}</p>
      </div>
      <ul class="gs__entries">
        <li v-for="e in d.entries" :key="e.name" class="gs__entry" :data-testid="`gs-entry-${e.name}`">
          <button class="gs__entry-btn" type="button" :class="{ 'gs__entry-btn--active': route.name === e.name }" @click="go(e.name)">
            <span class="gs__entry-label">{{ e.label }}</span>
            <span class="gs__entry-source" :class="`gs__entry-source--${e.source}`" :data-testid="`gs-source-${e.name}`">{{ SOURCE_LABEL[e.source] }}</span>
            <span v-if="e.superAdmin" class="gs__entry-admin" title="仅管理员可见">管</span>
          </button>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped lang="scss">
.gs { display: flex; flex-direction: column; gap: 14px; padding: 16px; height: 100%; overflow: auto; }
.gs__head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.gs__title { margin: 0; font-size: 15px; }
.gs__sub { font-size: 12px; color: var(--text-muted); }
.gs__back {
  margin-left: auto;
  border: 1px solid var(--border-color);
  background: transparent;
  color: inherit;
  border-radius: 4px;
  padding: 2px 10px;
  font-size: 12px;
  cursor: pointer;
}
.gs__domain { border: 1px solid var(--border-color); border-radius: 6px; padding: 10px 12px; }
.gs__domain-head { display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; margin-bottom: 8px; }
.gs__domain-title { margin: 0; font-size: 13px; font-weight: 600; }
.gs__domain-note { margin: 0; font-size: 12px; color: var(--text-muted); }
.gs__entries { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }
.gs__entry-btn {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  border: 1px solid var(--border-color);
  background: transparent;
  color: inherit;
  border-radius: 5px;
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
  &:hover { background: rgba(127, 127, 127, 0.08); }
}
.gs__entry-btn--active { border-color: var(--accent-primary); }
.gs__entry-label { font-weight: 500; }
.gs__entry-source { font-size: 10px; padding: 0 5px; border-radius: 3px; }
.gs__entry-source--native { color: var(--ia-fresh); background: rgba(46, 158, 91, 0.12); }
.gs__entry-source--legacy { color: var(--accent-info); background: rgba(122, 176, 232, 0.12); }
.gs__entry-admin { font-size: 10px; color: var(--ia-stale); border: 1px solid var(--ia-stale); border-radius: 3px; padding: 0 4px; }
</style>
