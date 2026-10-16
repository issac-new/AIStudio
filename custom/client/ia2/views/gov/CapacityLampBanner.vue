<!-- overlay/custom/client/ia2/views/gov/CapacityLampBanner.vue -->
<!-- 容量阈值灯（C4 增件·Q3 双通道之被动面，R13——设计正本 §二 S12）：
     与巡检官 disk.capacity 检测器同源同值（GET /api/hermes/cluster-inspector/
     snapshot 的 anomalies 面），超阈值红灯常挂度量体检签顶部；无异常=不渲染
     （被动展示面不制造噪音）；端点缺席=如实缺席标注。 -->
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { authFetch } from '../../../ide/utils/auth-fetch'

interface Anomaly { detector: string; subject?: string; severity?: string; summary?: string }

const anomalies = ref<Anomaly[] | null>(null)
const absent = ref(false)
const expanded = ref(false)

async function refresh(): Promise<void> {
  absent.value = false
  try {
    const res = await authFetch('/api/hermes/cluster-inspector/snapshot')
    if (!res.ok) throw new Error(String(res.status))
    const body = await res.json() as { anomalies?: Anomaly[] }
    anomalies.value = (body.anomalies ?? []).filter(a => a.detector === 'disk.capacity')
  } catch {
    anomalies.value = null
    absent.value = true
  }
}

onMounted(() => { void refresh() })
</script>

<template>
  <div v-if="absent" class="clb clb--absent" data-testid="clb-absent">
    容量水位面缺席（巡检官快照端点未接或未启）——如实呈现，不猜。
  </div>
  <div
    v-else-if="anomalies && anomalies.length > 0"
    class="clb"
    :class="{ 'clb--critical': anomalies.some(a => a.severity === 'critical') }"
    data-testid="clb-lamp"
    role="alert"
  >
    <div class="clb__head">
      <span class="clb__title">⚠ 磁盘水位越阈（{{ anomalies.length }} 卷）——主动告警已由巡检官通道发群（同源同值）</span>
      <button class="clb__toggle" type="button" data-testid="clb-toggle" @click="expanded = !expanded">{{ expanded ? '收起' : '明细' }}</button>
    </div>
    <ul v-if="expanded" class="clb__list" data-testid="clb-list">
      <li v-for="(a, i) in anomalies" :key="i">{{ a.subject }}｜{{ a.summary }}</li>
    </ul>
  </div>
</template>

<style scoped lang="scss">
.clb {
  border: 1px solid rgba(221, 51, 51, 0.5);
  border-radius: 6px;
  padding: 8px 12px;
  background: rgba(221, 51, 51, 0.08);
  font-size: 12px;
}
.clb--critical { background: rgba(221, 51, 51, 0.16); }
.clb--absent {
  border-style: dashed;
  border-color: var(--border-color, #e5e7eb);
  background: transparent;
  color: var(--text-muted, #878c99);
}
.clb__head { display: flex; align-items: center; gap: 10px; }
.clb__title { color: #d33; }
.clb__toggle {
  margin-left: auto;
  border: 1px solid rgba(221, 51, 51, 0.5);
  background: transparent;
  color: #d33;
  border-radius: 4px;
  font-size: 11px;
  padding: 1px 8px;
  cursor: pointer;
}
.clb__list { margin: 6px 0 0; padding-left: 16px; color: inherit; }
.clb__list li { margin: 2px 0; word-break: break-all; }
</style>
