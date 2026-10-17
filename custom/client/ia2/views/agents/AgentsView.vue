<!-- overlay/custom/client/ia2/views/agents/AgentsView.vue -->
<!-- D20 智能体工作台（挂账清偿：agent 级模型绑定＋启停 UI）。零新端点——
     列表/启停用上游 profiles API（restart 登录即可，受 per-user 白名单过滤），
     模型绑定用上游 PUT /api/hermes/config（section=model，x-hermes-profile 头
     定向 profile，safeFileStore 带 backup）。旅程步骤 5 落此页。
     设计正本=docs/superpowers/specs/2026-10-17-d20-backlog-clearance.md §一.3/4 -->
<script setup lang="ts">
import IaBreadcrumb from '../../components/IaBreadcrumb.vue'
import TabIntroBanner from '../../components/TabIntroBanner.vue'
import { onMounted, ref } from 'vue'
import { authFetch } from '../../../ide/utils/auth-fetch'
import {
  fetchProfiles, restartProfileGateway, restartProfileRuntime,
  type HermesProfile,
} from '@/api/hermes/profiles'

interface Row extends HermesProfile { busy: boolean; note: string; binding: boolean; bindModel: string; bindProvider: string }

const rows = ref<Row[]>([])
const loadError = ref('')
const loading = ref(true)

async function load(): Promise<void> {
  loading.value = true; loadError.value = ''
  try {
    const list = await fetchProfiles()
    rows.value = list.map(p => ({ ...p, busy: false, note: '', binding: false, bindModel: p.model ?? '', bindProvider: '' }))
  } catch (e) { loadError.value = String(e) } finally { loading.value = false }
}
onMounted(() => { void load() })

function toggleBinding(r: Row): void {
  r.binding = !r.binding
  if (r.binding && !r.bindModel) r.bindModel = r.model ?? ''
}

async function doRestart(r: Row, kind: 'gateway' | 'runtime'): Promise<void> {
  if (r.busy) return
  r.busy = true; r.note = ''
  try {
    if (kind === 'gateway') { await restartProfileGateway(r.name); r.note = '网关已重启' }
    else { await restartProfileRuntime(r.name); r.note = '运行时已重启' }
  } catch (e) { r.note = `失败：${String(e)}` } finally { r.busy = false }
}

/** 模型绑定：PUT /api/hermes/config section=model，x-hermes-profile 定向；
 *  provider 留空=只写 default（deepMerge 保住既有 provider）。 */
async function saveBinding(r: Row): Promise<void> {
  if (r.busy) return
  const model = r.bindModel.trim()
  if (!model) { r.note = '模型名不能为空'; return }
  r.busy = true; r.note = ''
  try {
    const values: Record<string, string> = { default: model }
    if (r.bindProvider.trim()) values.provider = r.bindProvider.trim()
    const res = await authFetch('/api/hermes/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-hermes-profile': r.name },
      body: JSON.stringify({ section: 'model', values, restart: false }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    r.model = model
    r.note = '已保存（config.yaml model 段，带备份；重启后生效）'
    r.binding = false
  } catch (e) { r.note = `保存失败：${String(e)}` } finally { r.busy = false }
}
</script>

<template>
  <div class="agw" data-testid="agents-page">
  <IaBreadcrumb />
  <TabIntroBanner tab="agents" />
    <header class="agw__head">
      <h1 class="agw__title">智能体管理</h1>
      <button type="button" class="agw__refresh" data-testid="agw-refresh" @click="load">刷新</button>
    </header>
    <p class="agw__sub">档案列表与就绪状态；行内可重启网关/运行时、绑定模型（写入该档案 config.yaml 的 model 段，保存带备份，重启后生效）。</p>
    <p v-if="loadError" class="agw__error" data-testid="agw-error">{{ loadError }}</p>
    <p v-if="loading" class="agw__hint">载入中…</p>
    <table v-else class="agw__table" data-testid="agw-table">
      <thead><tr><th>档案</th><th>当前模型</th><th>网关</th><th>操作</th><th /></tr></thead>
      <tbody>
        <tr v-for="r in rows" :key="r.name" :data-testid="`agw-row-${r.name}`">
          <td class="agw__name">{{ r.name }}<span v-if="r.active" class="agw__active" title="当前活动档案">●</span></td>
          <td class="agw__model">{{ r.model || '—' }}</td>
          <td><span class="agw__gw" :class="{ 'agw__gw--on': r.gatewayStatus === 'running' }">{{ r.gatewayStatus || '—' }}</span></td>
          <td class="agw__acts">
            <button type="button" :data-testid="`agw-gw-${r.name}`" :disabled="r.busy" @click="doRestart(r, 'gateway')">重启网关</button>
            <button type="button" :data-testid="`agw-rt-${r.name}`" :disabled="r.busy" @click="doRestart(r, 'runtime')">重启运行时</button>
            <button type="button" :data-testid="`agw-bind-${r.name}`" @click="toggleBinding(r)">{{ r.binding ? '收起' : '模型绑定' }}</button>
          </td>
          <td v-if="r.note" class="agw__note" :data-testid="`agw-note-${r.name}`">{{ r.note }}</td>
          <td v-else />
        </tr>
      </tbody>
    </table>
    <div v-for="r in rows.filter(x => x.binding)" :key="`b-${r.name}`" class="agw__bind" :data-testid="`agw-bindbox-${r.name}`">
      <span class="agw__bind-name">{{ r.name }} →</span>
      <input v-model="r.bindModel" placeholder="model.default（如 glm-4.7）" :data-testid="`agw-bindmodel-${r.name}`" @keyup.enter="saveBinding(r)">
      <input v-model="r.bindProvider" placeholder="model.provider（留空=保持不变）" :data-testid="`agw-bindprov-${r.name}`" @keyup.enter="saveBinding(r)">
      <button type="button" :data-testid="`agw-bindsave-${r.name}`" :disabled="r.busy" @click="saveBinding(r)">保存</button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.agw { display: flex; flex-direction: column; gap: 10px; padding: 16px 24px; height: 100%; overflow: auto; }
.agw__head { display: flex; align-items: center; gap: 12px; }
.agw__title { margin: 0; font-size: 16px; }
.agw__refresh { border: 1px solid var(--border-color); background: transparent; border-radius: 6px; padding: 3px 12px; font-size: 12px; cursor: pointer; }
.agw__sub { margin: 0; font-size: 11.5px; color: var(--text-muted); }
.agw__error { color: var(--ia-fail); font-size: 12px; margin: 0; }
.agw__hint { font-size: 12px; color: var(--text-muted); margin: 0; }
.agw__table { width: 100%; border-collapse: collapse; font-size: 12px; th, td { border: 1px solid var(--border-color); padding: 5px 8px; text-align: left; } }
.agw__name { font-weight: 600; white-space: nowrap; }
.agw__active { color: var(--ia-fresh, var(--ia-fresh)); margin-left: 4px; }
.agw__gw--on { color: var(--ia-fresh, var(--ia-fresh)); }
.agw__acts button { margin-right: 6px; border: 1px solid var(--border-color); background: transparent; border-radius: 5px; font-size: 11px; padding: 2px 8px; cursor: pointer; &:disabled { opacity: 0.5; cursor: wait; } }
.agw__note { font-size: 11px; color: var(--text-muted); }
.agw__bind { display: flex; gap: 8px; align-items: center; border: 1px dashed var(--border-color); border-radius: 8px; padding: 8px 12px; }
.agw__bind-name { font-size: 12px; font-weight: 600; white-space: nowrap; }
.agw__bind input { flex: 1; border: 1px solid var(--border-color); border-radius: 6px; padding: 4px 8px; font-size: 12px; background: transparent; color: inherit; }
.agw__bind button { border: 1px solid var(--accent-primary, var(--color-primary)); color: var(--accent-primary, var(--color-primary)); background: transparent; border-radius: 6px; font-size: 12px; padding: 4px 14px; cursor: pointer; }
</style>
