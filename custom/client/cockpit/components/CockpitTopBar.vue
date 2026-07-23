<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'
import ThemeSwitch from '@/components/layout/ThemeSwitch.vue'
import LanguageSwitch from '@/components/layout/LanguageSwitch.vue'
import { useAppStore } from '@/stores/hermes/app'

const { t } = useI18n()
const emit = defineEmits<{ (e: 'schedule', btn: HTMLElement): void; (e: 'loop'): void; (e: 'notify'): void; (e: 'settings'): void; (e: 'runtrace'): void }>()
const store = useCockpitStore()
const appStore = useAppStore()

const now = ref(new Date())
let timer: ReturnType<typeof setInterval> | null = null
onMounted(() => { timer = setInterval(() => { now.value = new Date() }, 1000) })

const WK = [t('cockpit.weekPrefix') + '日', t('cockpit.weekPrefix') + '一', t('cockpit.weekPrefix') + '二', t('cockpit.weekPrefix') + '三', t('cockpit.weekPrefix') + '四', t('cockpit.weekPrefix') + '五', t('cockpit.weekPrefix') + '六']
function pad(n: number) { return String(n).padStart(2, '0') }
const dateStr = () => `${now.value.getFullYear()}-${pad(now.value.getMonth() + 1)}-${pad(now.value.getDate())} ${WK[now.value.getDay()]}`
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
const countdown = ref(30)
let countdownTimer: ReturnType<typeof setInterval> | null = null

const PLATFORM_ICONS: Record<string, string> = {
  api_server: '🔌', matrix: '👥', email: '📧',
}

function formatTimeAgo(iso: string): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return t('cockpit.justNow')
  if (mins < 60) return t('cockpit.minutesAgo', { n: mins })
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return t('cockpit.hoursAgo', { n: hrs })
  return t('cockpit.daysAgo', { n: Math.floor(hrs / 24) })
}

// 保存上次状态，仅变化时更新 UI 避免闪动
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

	    // 成功收到返回 → 重置倒计时
	    countdown.value = 30
	  } catch {
	    if (gatewayState.value !== 'stopped') gatewayState.value = 'stopped'
	    // 收不到返回 → 倒计时保持不动（卡在 0s）
	  } finally {
	    if (!silent) refreshing.value = false
	  }
	}

/** 点击手动探测并弹出详情 */
async function manualProbe() {
  // 先切换显示状态，再异步刷新数据
  showDetail.value = !showDetail.value
  if (showDetail.value) {
    await fetchGatewayStatus(false)
  }
}

	onMounted(() => {
	  fetchGatewayStatus()
	  // 倒计时驱动定时探测：归零时发起请求，成功则复位 30s，失败则卡在 0s
	  countdownTimer = setInterval(() => {
	    if (countdown.value > 0) {
	      countdown.value--
	      if (countdown.value === 0) {
	        fetchGatewayStatus(true)
	      }
	    }
	  }, 1000)
	})
	onUnmounted(() => {
	  if (timer) clearInterval(timer)
	  if (countdownTimer) clearInterval(countdownTimer)
	})
</script>

<template>
  <div class="cockpit-top">
    <div class="cockpit-top__brand">
      <ThemeSwitch />
      <LanguageSwitch />
      <span class="cockpit-top__conn" :class="appStore.connected ? 'is-ok' : 'is-err'"
        :title="appStore.connected ? t('cockpit.connected') : t('cockpit.disconnected')"
      >{{ appStore.connected ? '🟢' : '🔴' }}</span>
      {{ t('cockpit.brandTitle') }}
      <span class="cockpit-top__sub">Swarm Studio</span>
    </div>
    <div class="cockpit-top__div" />
    <button type="button" class="cockpit-top__btn" @click="emit('schedule', $event.currentTarget as HTMLElement)">
      📅 {{ t('cockpit.schedule') }}
      <span v-if="scheduleCount" class="cockpit-top__bdg">{{ scheduleCount }}</span>
    </button>
    <button type="button" class="cockpit-top__btn" @click="emit('loop')" title="Loop Engineering — 循环工程">
      🔄 {{ t('sidebar.loop') }}
    </button>
    <button type="button" class="cockpit-top__btn" @click="emit('runtrace')" title="Run Observatory — 运行观察台">
      🔭 Run Observatory
    </button>
    <div class="cockpit-top__clock">
      <span class="cockpit-top__cdate">{{ dateStr() }}</span>
      <span class="cockpit-top__ctime">{{ timeStr() }}</span>
    </div>
    <div class="cockpit-top__search">
      <span class="cockpit-top__search-icon">🔍</span>
      <input type="text" class="cockpit-top__search-input" :value="store.searchQuery"
        :placeholder="t('cockpit.searchPlaceholder')" @input="store.runSearch(($event.target as HTMLInputElement).value)" />
      <button v-if="store.searchQuery" type="button" class="cockpit-top__search-clear" @click="store.clearSearch()">×</button>
      <span v-if="store._sessionSearching" class="cockpit-top__search-spinner" />
    </div>
    <div class="cockpit-top__spacer" />
    <div class="cockpit-top__grp" :title="t('cockpit.gatewayProbeTitle')" @click.stop="manualProbe">
      <span class="cockpit-top__cd" :title="t('cockpit.countdownTitle')">{{ countdown }}s</span>
      <span class="cockpit-top__ustat" :class="'is-' + gatewayState">
        {{ gatewayState === 'running' ? '🟢' : gatewayState === 'stopped' ? '🔴' : '⚪' }}
        Gateway{{ refreshing ? ' ⏳' : '' }}
      </span>
      <span v-for="pl in platforms" :key="pl.name" class="cockpit-top__ustat"
        :class="pl.state === 'connected' ? 'is-running' : 'is-stopped'"
      >{{ pl.icon }} {{ pl.name }}{{ pl.state === 'connected' ? '' : ' ⚠' }}</span>
    </div>
    <div class="cockpit-top__div" />
    <button type="button" class="cockpit-top__btn" @click="emit('notify')">
      {{ t('cockpit.notifications') }}
      <span v-if="notifyCount" class="cockpit-top__bdg cockpit-top__bdg--err">{{ notifyCount }}</span>
    </button>
    <button type="button" class="cockpit-top__user" @click="emit('settings')">
      <span class="cockpit-top__avatar">{{ (userName ?? t('cockpit.defaultUser')).slice(0, 1) }}</span>
      <span class="cockpit-top__uname">{{ userName ?? t('cockpit.defaultUser') }}</span>
      <span class="cockpit-top__caret">▾</span>
    </button>

    <!-- 探测结果下拉面板（必须在 cockpit-top 内部，才能相对其定位） -->
    <div v-if="showDetail" class="cockpit-probe" @click.stop>
      <div class="cockpit-probe__head">
        <span>Connected Platforms</span>
        <button type="button" class="cockpit-probe__close" @click="showDetail = false">×</button>
      </div>
      <div v-if="rawData" class="cockpit-probe__body">
        <div class="cockpit-probe__row">
          <span class="cockpit-probe__label">Gateway</span>
          <span class="cockpit-probe__val" :class="rawData.gateway_state === 'running' ? 'is-ok' : 'is-err'">
            {{ rawData.gateway_state === 'running' ? '🟢 running' : '🔴 ' + (rawData.gateway_state || 'stopped') }}
          </span>
        </div>
        <div class="cockpit-probe__row">
          <span class="cockpit-probe__label">Active Agents</span>
          <span class="cockpit-probe__val">{{ rawData.active_agents ?? 0 }}</span>
        </div>
        <div v-if="rawData.platforms" class="cockpit-probe__section">
          <div class="cockpit-probe__section-title">Platforms</div>
          <div v-for="(info, name) in rawData.platforms" :key="name" class="cockpit-probe__row">
            <span class="cockpit-probe__label">{{ PLATFORM_ICONS[name as string] || '📡' }} {{ name }}</span>
            <span class="cockpit-probe__val" :class="info.state === 'connected' ? 'is-ok' : 'is-err'">
              {{ info.state || 'unknown' }}
            </span>
            <span v-if="info.updated_at" class="cockpit-probe__ago">{{ formatTimeAgo(info.updated_at) }}</span>
          </div>
        </div>
        <div v-if="rawData.pid || rawData.version" class="cockpit-probe__footer">
          <span v-if="rawData.version">v{{ rawData.version }}</span>
          <span v-if="rawData.pid">PID {{ rawData.pid }}</span>
        </div>
      </div>
      <div v-else class="cockpit-probe__body cockpit-probe__body--empty">
        {{ refreshing ? t('cockpit.detecting') + '…' : t('cockpit.noData') }}
      </div>
    </div>
    <!-- 点击遮罩关闭 -->
    <div v-if="showDetail" class="cockpit-probe__mask" @click="showDetail = false" />
  </div>
</template>

<style scoped lang="scss">
.cockpit-top { flex-shrink: 0; height: 44px; background: var(--bg-card); border-bottom: 1px solid var(--border-color); display: flex; align-items: center; gap: 8px; padding: 0 16px; position: relative; z-index: 10; }
.cockpit-top__brand { font-weight: 700; font-size: 13px; display: flex; align-items: center; gap: 8px; white-space: nowrap; color: var(--text-primary); }
.cockpit-top__mark { width: 8px; height: 8px; border-radius: 2px; background: var(--accent-primary); display: inline-block; }
.cockpit-top__sub { font-weight: 400; font-size: 11px; color: var(--text-muted); }
.cockpit-top__conn { font-size: 10px; flex-shrink: 0; }
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
.cockpit-top__grp { display: flex; align-items: center; gap: 6px; cursor: pointer; padding: 4px 10px; border-radius: 6px; transition: background 0.12s;
  &:hover { background: var(--bg-secondary); }
}
.cockpit-top__ustat { font-size: 11px; color: var(--text-muted); }
.cockpit-top__cd { font-size: 11px; color: var(--text-muted); font-variant-numeric: tabular-nums; min-width: 28px; text-align: right; }
.cockpit-top__user { display: flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px 0 4px; border-radius: 14px; border: 1px solid var(--border-color); background: var(--bg-card); cursor: pointer; font-family: inherit;
  &:hover { background: var(--bg-secondary); }
}
.cockpit-top__avatar { width: 22px; height: 22px; border-radius: 50%; background: var(--accent-primary); color: var(--text-on-accent); display: flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 700; }
.cockpit-top__uname { font-size: 11px; font-weight: 600; color: var(--text-primary); }
.cockpit-top__caret { font-size: 9px; color: var(--text-muted); }

/* 探测结果下拉面板 */
.cockpit-probe { position: absolute; top: 100%; right: 16px; min-width: 320px; max-width: 420px; max-height: 400px; overflow: auto; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.12); z-index: 999; }
.cockpit-probe__head { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; border-bottom: 1px solid var(--border-color); font-size: 12px; font-weight: 600; color: var(--text-primary); }
.cockpit-probe__close { border: none; background: none; color: var(--text-muted); cursor: pointer; font-size: 16px; padding: 0 4px; &:hover { color: var(--text-primary); } }
.cockpit-probe__body { padding: 8px 14px 12px; }
.cockpit-probe__body--empty { text-align: center; color: var(--text-muted); font-size: 12px; padding: 24px; }
.cockpit-probe__row { display: flex; align-items: center; gap: 8px; padding: 5px 0; }
.cockpit-probe__label { font-size: 12px; color: var(--text-secondary); flex: 1; min-width: 0; }
.cockpit-probe__val { font-size: 12px; font-weight: 600; flex-shrink: 0; }
.cockpit-probe__val.is-ok { color: var(--success, #52c41a); }
.cockpit-probe__val.is-err { color: var(--error); }
.cockpit-probe__ago { font-size: 10px; color: var(--text-muted); font-family: monospace; flex-shrink: 0; }
.cockpit-probe__section { margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border-color); }
.cockpit-probe__section-title { font-size: 10px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; margin-bottom: 4px; }
.cockpit-probe__footer { display: flex; gap: 12px; margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border-color); font-size: 10px; color: var(--text-muted); font-family: monospace; }
.cockpit-probe__mask { position: fixed; inset: 0; z-index: 998; }
</style>
