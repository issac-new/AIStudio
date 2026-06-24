<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'

const { t } = useI18n()
const emit = defineEmits<{ (e: 'schedule'): void; (e: 'notify'): void; (e: 'settings'): void }>()
const store = useCockpitStore()

const now = ref(new Date())
let timer: ReturnType<typeof setInterval> | null = null
onMounted(() => { timer = setInterval(() => { now.value = new Date() }, 1000) })

const WK = ['日', '一', '二', '三', '四', '五', '六']
function pad(n: number) { return String(n).padStart(2, '0') }
const dateStr = () => `${now.value.getFullYear()}-${pad(now.value.getMonth() + 1)}-${pad(now.value.getDate())} 周${WK[now.value.getDay()]}`
const timeStr = () => `${pad(now.value.getHours())}:${pad(now.value.getMinutes())}:${pad(now.value.getSeconds())}`

defineProps<{ notifyCount?: number; scheduleCount?: number; userName?: string }>()

interface PlatformInfo {
  name: string
  icon: string
  state: string
  updated: string
}

const gatewayState = ref<'checking' | 'running' | 'stopped'>('checking')
const platforms = ref<PlatformInfo[]>([])
const refreshing = ref(false)
const rawData = ref<any>(null)
const showDetail = ref(false)

const PLATFORM_ICONS: Record<string, string> = {
  api_server: '🔌', matrix: '👥', email: '📧',
}

function formatTimeAgo(iso: string): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins}分钟前`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}小时前`
  return `${Math.floor(hrs / 24)}天前`
}

// 30s 自动刷新；保存上次状态，仅变化时更新 UI 避免闪动
let pollTimer: ReturnType<typeof setInterval> | null = null
let lastStates: Record<string, string> = {}

async function fetchGatewayStatus(silent = true) {
  if (!silent) refreshing.value = true
  try {
    const res = await fetch('/agent-health/detailed')
    const data = await res.json()
    rawData.value = data

    const gw = data.gateway_state === 'running' ? 'running' as const : 'stopped' as const
    if (gw !== gatewayState.value) gatewayState.value = gw

    const pl = data.platforms || {}
    const newPlatforms: PlatformInfo[] = []
    let changed = false
    for (const [name, info] of Object.entries(pl) as [string, any][]) {
      const state = info.state || 'unknown'
      const key = `${name}:${state}`
      if (lastStates[name] !== key) changed = true
      lastStates[name] = key
      newPlatforms.push({ name, icon: PLATFORM_ICONS[name] || '📡', state, updated: formatTimeAgo(info.updated_at || '') })
    }
    if (changed || platforms.value.length !== newPlatforms.length) {
      platforms.value = newPlatforms
    }
  } catch {
    if (gatewayState.value !== 'stopped') gatewayState.value = 'stopped'
  } finally {
    if (!silent) refreshing.value = false
  }
}

/** 双击手动探测并弹出详情 */
async function manualProbe() {
  await fetchGatewayStatus(false)
  if (rawData.value) showDetail.value = true
}

onMounted(() => {
  fetchGatewayStatus()
  pollTimer = setInterval(() => fetchGatewayStatus(true), 30000)
})
onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
  if (timer) clearInterval(timer)
})
</script>

<template>
  <div class="cockpit-top">
    <div class="cockpit-top__brand">
      <button type="button" class="cockpit-top__set" title="设置" @click="emit('settings')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
      AI协作中心
      <span class="cockpit-top__sub">Swarm Studio</span>
    </div>
    <div class="cockpit-top__div" />
    <button type="button" class="cockpit-top__btn" @click="emit('schedule')">
      📅 {{ t('cockpit.schedule') }}
      <span v-if="scheduleCount" class="cockpit-top__bdg">{{ scheduleCount }}</span>
    </button>
    <div class="cockpit-top__clock">
      <span class="cockpit-top__cdate">{{ dateStr() }}</span>
      <span class="cockpit-top__ctime">{{ timeStr() }}</span>
    </div>
    <div class="cockpit-top__search">
      <span class="cockpit-top__search-icon">🔍</span>
      <input type="text" class="cockpit-top__search-input" :value="store.searchQuery"
        placeholder="搜索 会话/任务/房间" @input="store.runSearch(($event.target as HTMLInputElement).value)" />
      <button v-if="store.searchQuery" type="button" class="cockpit-top__search-clear" @click="store.clearSearch()">×</button>
      <span v-if="store._sessionSearching" class="cockpit-top__search-spinner" />
    </div>
    <div class="cockpit-top__spacer" />
    <div class="cockpit-top__grp" title="双击手动探测" @dblclick="manualProbe">
      <span class="cockpit-top__ustat" :class="'is-' + gatewayState">
        {{ gatewayState === 'running' ? '🟢' : gatewayState === 'stopped' ? '🔴' : '⚪' }}
        Gateway{{ refreshing ? ' ⏳' : '' }}
      </span>
      <span v-for="pl in platforms" :key="pl.name" class="cockpit-top__ustat"
        :class="pl.state === 'connected' ? 'is-running' : 'is-stopped'"
        :title="`${pl.name}: ${pl.state} · ${pl.updated}`">
        {{ pl.icon }} {{ pl.name }}{{ pl.state === 'connected' ? '' : ' ⚠' }}
      </span>
    </div>
    <div class="cockpit-top__div" />
    <button type="button" class="cockpit-top__btn" @click="emit('notify')">
      通知
      <span v-if="notifyCount" class="cockpit-top__bdg cockpit-top__bdg--err">{{ notifyCount }}</span>
    </button>
    <button type="button" class="cockpit-top__user" @click="emit('settings')">
      <span class="cockpit-top__avatar">{{ (userName ?? '你').slice(0, 1) }}</span>
      <span class="cockpit-top__uname">{{ userName ?? '你' }}</span>
      <span class="cockpit-top__caret">▾</span>
    </button>
  </div>

  <!-- 探测结果下拉面板 -->
  <div v-if="showDetail" class="cockpit-probe" @click.stop>
    <div class="cockpit-probe__head">
      <span>Connected Platforms</span>
      <button type="button" class="cockpit-probe__close" @click="showDetail = false">×</button>
    </div>
    <pre class="cockpit-probe__json">{{ JSON.stringify(rawData, null, 2) }}</pre>
  </div>
  <!-- 点击遮罩关闭 -->
  <div v-if="showDetail" class="cockpit-probe__mask" @click="showDetail = false" />
</template>

<style scoped lang="scss">
.cockpit-top { flex-shrink: 0; height: 44px; background: var(--bg-card); border-bottom: 1px solid var(--border-color); display: flex; align-items: center; gap: 8px; padding: 0 16px; position: relative; z-index: 10; }
.cockpit-top__brand { font-weight: 700; font-size: 13px; display: flex; align-items: center; gap: 8px; white-space: nowrap; color: var(--text-primary); }
.cockpit-top__mark { width: 8px; height: 8px; border-radius: 2px; background: var(--accent-primary); display: inline-block; }
.cockpit-top__sub { font-weight: 400; font-size: 11px; color: var(--text-muted); }
.cockpit-top__set { width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; border: none; border-radius: 6px; background: transparent; color: var(--text-muted); cursor: pointer; flex-shrink: 0;
  &:hover { background: var(--bg-secondary); color: var(--text-primary); }
}
.cockpit-top__div { width: 1px; height: 20px; background: var(--border-color); margin: 0 4px; }
.cockpit-top__btn { display: flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px; border-radius: 6px; border: 1px solid transparent; background: transparent; color: var(--text-secondary); cursor: pointer; font-size: 12px; font-family: inherit; position: relative;
  &:hover { background: var(--bg-secondary); color: var(--text-primary); }
}
.cockpit-top__bdg { position: absolute; top: -3px; right: -3px; background: var(--accent-primary); color: var(--text-on-accent); font-size: 8px; font-weight: 700; min-width: 13px; height: 13px; border-radius: 7px; display: flex; align-items: center; justify-content: center; border: 1.5px solid var(--bg-card); padding: 0 3px; }
.cockpit-top__bdg--err { background: var(--error); }
.cockpit-top__clock { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-secondary); font-variant-numeric: tabular-nums; white-space: nowrap; }
.cockpit-top__cdate { font-size: 11px; color: var(--text-muted); }
.cockpit-top__ctime { font-weight: 600; color: var(--text-primary); font-family: ui-monospace, 'SF Mono', monospace; letter-spacing: 0.3px; }
.cockpit-top__search { flex: 1; max-width: 280px; height: 28px; display: flex; align-items: center; gap: 6px; padding: 0 10px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 6px; font-size: 11px; color: var(--text-muted); position: relative; }
.cockpit-top__search-icon { font-size: 12px; flex-shrink: 0; color: var(--text-muted); }
.cockpit-top__search-input { flex: 1; border: none; background: transparent; color: var(--text-primary); font-size: 11px; outline: none; font-family: inherit; min-width: 0; &::placeholder { color: var(--text-muted); } }
.cockpit-top__search-clear { flex-shrink: 0; width: 16px; height: 16px; padding: 0; border: none; background: none; color: var(--text-muted); cursor: pointer; font-size: 12px; &:hover { color: var(--text-primary); } }
.cockpit-top__search-spinner { width: 10px; height: 10px; flex-shrink: 0; border: 1.5px solid var(--border-color); border-top-color: var(--accent-primary); border-radius: 50%; animation: cockpit-tspin 0.6s linear infinite; }
@keyframes cockpit-tspin { to { transform: rotate(360deg); } }
.cockpit-top__spacer { flex: 1; }
.cockpit-top__grp { display: flex; align-items: center; gap: 6px; cursor: default; }
.cockpit-top__ustat { font-size: 10px; color: var(--text-muted); }
.cockpit-top__user { display: flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px 0 4px; border-radius: 14px; border: 1px solid var(--border-color); background: var(--bg-card); cursor: pointer; font-family: inherit;
  &:hover { background: var(--bg-secondary); }
}
.cockpit-top__avatar { width: 22px; height: 22px; border-radius: 50%; background: var(--accent-primary); color: var(--text-on-accent); display: flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 700; }
.cockpit-top__uname { font-size: 11px; font-weight: 600; color: var(--text-primary); }
.cockpit-top__caret { font-size: 9px; color: var(--text-muted); }

/* 探测结果下拉面板 */
.cockpit-probe { position: absolute; top: 100%; right: 16px; min-width: 360px; max-width: 480px; max-height: 320px; overflow: auto; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.12); z-index: 999; }
.cockpit-probe__head { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; border-bottom: 1px solid var(--border-color); font-size: 12px; font-weight: 600; color: var(--text-primary); }
.cockpit-probe__close { border: none; background: none; color: var(--text-muted); cursor: pointer; font-size: 16px; padding: 0 4px; &:hover { color: var(--text-primary); } }
.cockpit-probe__json { padding: 12px 14px; font-size: 11px; line-height: 1.6; white-space: pre-wrap; word-break: break-all; color: var(--text-primary); margin: 0; }
.cockpit-probe__mask { position: fixed; inset: 0; z-index: 998; }
</style>
