<!-- overlay/custom/client/loop/components/LoopTenantPanel.vue -->
<script setup lang="ts">
import { ref, onMounted } from 'vue'

interface TenantStats {
  tenantId: string
  activeLoops: number
  totalCost: number
  completedLoops: number
}

const tenants = ref<TenantStats[]>([])
const loading = ref(false)

async function fetchTenants() {
  loading.value = true
  try {
    const res = await fetch('/api/loop/tenants')
    const data = await res.json()
    // Fetch stats for each tenant
    tenants.value = await Promise.all(
      (data.tenants || []).map(async (t: { id: string; name: string }) => {
        const statRes = await fetch(`/api/loop/tenants/${t.id}/stats`)
        return await statRes.json()
      }),
    )
  } catch (e) {
    // Error fetching — SaaS mode not enabled
  } finally {
    loading.value = false
  }
}

onMounted(() => { fetchTenants() })
</script>

<template>
  <div class="loop-tenant-panel">
    <h3>租户管理</h3>
    <div v-if="loading">加载中...</div>
    <div v-else-if="tenants.length === 0">无租户数据（SaaS 模式未启用）</div>
    <div v-else class="loop-tenant-panel__list">
      <div v-for="t in tenants" :key="t.tenantId" class="loop-tenant-panel__card">
        <h4>{{ t.tenantId }}</h4>
        <p>活跃 Loop: {{ t.activeLoops }}</p>
        <p>已完成: {{ t.completedLoops }}</p>
        <p>总费用: ${{ t.totalCost.toFixed(2) }}</p>
      </div>
    </div>
  </div>
</template>
