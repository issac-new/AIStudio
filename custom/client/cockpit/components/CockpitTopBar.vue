<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const emit = defineEmits<{ (e: 'schedule'): void; (e: 'notify'): void; (e: 'search'): void; (e: 'settings'): void }>()

const now = ref(new Date())
let timer: ReturnType<typeof setInterval> | null = null
onMounted(() => { timer = setInterval(() => { now.value = new Date() }, 1000) })
onUnmounted(() => { if (timer) clearInterval(timer) })

const WK = ['日', '一', '二', '三', '四', '五', '六']
function pad(n: number) { return String(n).padStart(2, '0') }
const dateStr = () => `${now.value.getFullYear()}-${pad(now.value.getMonth() + 1)}-${pad(now.value.getDate())} 周${WK[now.value.getDay()]}`
const timeStr = () => `${pad(now.value.getHours())}:${pad(now.value.getMinutes())}:${pad(now.value.getSeconds())}`

defineProps<{ notifyCount?: number; scheduleCount?: number; userName?: string }>()

interface PlatformInfo {
  name: string
  icon: string
  enabled: boolean
  detail: string
}

const healthStatus = ref<{
  gateway: 'checking' | 'running' | 'stopped'
  bridge: 'checking' | 'ready' | 'offline'
  platforms: PlatformInfo[]
}>({
  gateway: 'checking',
  bridge: 'checking',
  platforms: [],
})

const PLATFORM_ICONS: Record<string, string> = {
  api_server: '🔌',
  matrix: '👥',
  email: '📧',
  chat: '💬',
  group: '🗣',
}

async function fetchGatewayStatus() {
  try {
    const [healthRes, cfgRes] = await Promise.all([
      fetch('/health'),
      fetch('/api/hermes/config'),
    ])
    const health = await healthRes.json()
    healthStatus.value.gateway = health.gateway === 'running' ? 'running' : 'stopped'
    const bridge = health.agent_bridge || {}
    healthStatus.value.bridge = bridge.ready ? 'ready' : 'offline'

    const cfg = await cfgRes.json()
    const pl = cfg.platforms || {}
    const PLATFORM_LABELS: Record<string, string> = {
      api_server: 'API Server',
      matrix: 'Matrix',
      email: 'Email',
    }
    healthStatus.value.platforms = Object.entries(pl)
      .filter(([, v]: [string, any]) => v?.enabled)
      .map(([name, v]: [string, any]) => {
        const detail = name === 'api_server'
          ? `:${v?.extra?.port || '?'}`
          : name === 'matrix'
            ? v?.token ? ' (Token OK)' : ' (未配置)'
            : ''
        return {
          name: PLATFORM_LABELS[name] || name,
          icon: PLATFORM_ICONS[name] || '📡',
          enabled: true,
          detail,
        }
      })
  } catch {
    healthStatus.value.gateway = 'stopped'
    healthStatus.value.bridge = 'offline'
  }
}

onMounted(() => { fetchGatewayStatus() })
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
    <div class="cockpit-top__search" @click="emit('search')">
      {{ t('cockpit.search') }}
      <span class="cockpit-top__kk">⌘K</span>
    </div>
    <div class="cockpit-top__spacer" />
    <div class="cockpit-top__grp">
      <span class="cockpit-top__ustat" :class="'is-' + healthStatus.gateway">
        {{ healthStatus.gateway === 'running' ? '🟢' : healthStatus.gateway === 'stopped' ? '🔴' : '⚪' }}
        Gateway
      </span>
      <span class="cockpit-top__ustat" :class="'is-' + healthStatus.bridge">
        {{ healthStatus.bridge === 'ready' ? '🟢' : healthStatus.bridge === 'offline' ? '🔴' : '⚪' }}
        Bridge
      </span>
      <span
        v-for="pl in healthStatus.platforms" :key="pl.name"
        class="cockpit-top__ustat is-running"
        :title="pl.name + pl.detail"
      >{{ pl.icon }} {{ pl.name }}{{ pl.detail }}</span>
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
</template>

<style scoped lang="scss">
.cockpit-top { flex-shrink: 0; height: 44px; background: var(--bg-card); border-bottom: 1px solid var(--border-color); display: flex; align-items: center; gap: 8px; padding: 0 16px; }
.cockpit-top__brand { font-weight: 700; font-size: 13px; display: flex; align-items: center; gap: 8px; white-space: nowrap; color: var(--text-primary); }
.cockpit-top__mark { width: 8px; height: 8px; border-radius: 2px; background: var(--accent-primary); display: inline-block; }
.cockpit-top__set { width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; border: none; border-radius: 6px; background: transparent; color: var(--text-muted); cursor: pointer; flex-shrink: 0;
  &:hover { background: var(--bg-secondary); color: var(--text-primary); }
}
.cockpit-top__sub { font-weight: 400; font-size: 11px; color: var(--text-muted); }
.cockpit-top__div { width: 1px; height: 20px; background: var(--border-color); margin: 0 4px; }
.cockpit-top__btn { display: flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px; border-radius: 6px; border: 1px solid transparent; background: transparent; color: var(--text-secondary); cursor: pointer; font-size: 12px; font-family: inherit; position: relative;
  &:hover { background: var(--bg-secondary); color: var(--text-primary); }
}
.cockpit-top__bdg { position: absolute; top: -3px; right: -3px; background: var(--accent-primary); color: var(--text-on-accent); font-size: 8px; font-weight: 700; min-width: 13px; height: 13px; border-radius: 7px; display: flex; align-items: center; justify-content: center; border: 1.5px solid var(--bg-card); padding: 0 3px; }
.cockpit-top__bdg--err { background: var(--error); }
.cockpit-top__clock { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-secondary); font-variant-numeric: tabular-nums; white-space: nowrap; }
.cockpit-top__cdate { font-size: 11px; color: var(--text-muted); }
.cockpit-top__ctime { font-weight: 600; color: var(--text-primary); font-family: ui-monospace, 'SF Mono', monospace; letter-spacing: 0.3px; }
.cockpit-top__search { flex: 1; max-width: 280px; height: 28px; display: flex; align-items: center; gap: 6px; padding: 0 10px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 6px; font-size: 11px; color: var(--text-muted); cursor: pointer; }
.cockpit-top__kk { font-size: 9px; border: 1px solid var(--border-color); border-radius: 3px; padding: 0 4px; background: var(--bg-card); color: var(--text-muted); margin-left: auto; }
.cockpit-top__spacer { flex: 1; }
.cockpit-top__grp { display: flex; align-items: center; gap: 6px; }
.cockpit-top__ustat { font-size: 10px; color: var(--text-muted); }
.cockpit-top__user { display: flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px 0 4px; border-radius: 14px; border: 1px solid var(--border-color); background: var(--bg-card); cursor: pointer; font-family: inherit;
  &:hover { background: var(--bg-secondary); }
}
.cockpit-top__avatar { width: 22px; height: 22px; border-radius: 50%; background: var(--accent-primary); color: var(--text-on-accent); display: flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 700; }
.cockpit-top__uname { font-size: 11px; font-weight: 600; color: var(--text-primary); }
.cockpit-top__caret { font-size: 9px; color: var(--text-muted); }
</style>
