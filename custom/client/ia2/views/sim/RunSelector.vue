<!-- 全流程推演·运行选择器（2026-10-18 推演区批）：
     一个页头区域统一「本轮看哪次运行」，不再让每个面板各打一遍运行目录名。
     2026-10-27 产品一致性 Task 9 分区：当前运行与历史运行分开表达——当前运行是
     正在查看的对象（可读日期为主文案，目录名收进 title 供反查）；历史列表只列
     其他运行，没有其他记录时如实说「无其他历史运行」，不再出现「暂无历史运行」
     与已选运行并存的矛盾。数据来自 runcenter 既有运行列表；选择写 ?run=，
     刷新/分享保持；面板经 useRunContext 跟随。 -->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useRunContext, LAST_RUN_KEY } from '../../composables/useRunContext'
import { buildRunOptions, buildHistoryOptions } from '../../utils/run-options'
import { runDisplayName } from '../../run-display'
import { useRunCenterStore } from '@/custom/loop/runcenter/store/runs'

const route = useRoute()
const router = useRouter()
const i18nCtx = useI18n() as { locale?: { value?: string } }
const zh = computed(() => String(i18nCtx?.locale?.value ?? 'zh').startsWith('zh'))
const runsStore = useRunCenterStore()
const { run } = useRunContext('sim')

const current = computed(() => run.value.trim())
/** 全量选项（含当前值，加载窗口语义见 utils/run-options）：自动落最新一轮与
 *  清场判定仍以它为准——分区只是展示层，切换行为不变。 */
const options = computed(() => buildRunOptions(
  (runsStore.sortedRuns ?? []).map(r => r.runId),
  current.value,
  Boolean(runsStore.loading),
))
/** 历史清单=当前运行之外的其他运行（分区表达，Task 9） */
const historyOptions = computed(() => buildHistoryOptions(
  (runsStore.sortedRuns ?? []).map(r => r.runId),
  current.value,
))

function selectRun(value: string): void {
  const query = { ...route.query }
  if (value) query.run = value
  else delete query.run
  void router.replace({ query })
}

function onChange(e: Event): void {
  const value = (e.target as HTMLSelectElement).value
  // 空值占位项不触发切换（当前运行在另一分区呈现，不在本下拉里）
  if (value) selectRun(value)
}

// 「列表已权威为空」须等一次真实加载结束：加载前清 ?run 会把合法深链抹掉。
// 测试态不发起加载，也不做清场（mock 列表为空不代表真实运行不存在）。
const fetchSettled = ref(false)

// 无选中 run 时自动落到最新一轮（2026-10-19 走查：运行总览曾停在「选择运行…」
// 空态，而运行记录实际存在；用户看到的应是最近一轮的进度）。
onMounted(() => {
  const fetchRuns = (runsStore as { fetchRuns?: () => Promise<void> }).fetchRuns
  const isTest = typeof import.meta !== 'undefined' && (import.meta as { env?: { MODE?: string } }).env?.MODE === 'test'
  if (isTest) return
  if ((runsStore.sortedRuns ?? []).length) { fetchSettled.value = true; return }
  if (typeof fetchRuns !== 'function') return
  void Promise.resolve(fetchRuns.call(runsStore)).finally(() => { fetchSettled.value = true })
})
watch(options, (list) => {
  if (!current.value && list.length) { selectRun(list[0]); return }
  // 运行记录已确认清场（加载完成且无错误）：丢掉记忆值与 ?run，面板回到无运行态
  if (!list.length && current.value && fetchSettled.value && !runsStore.loading && !runsStore.error) {
    try { localStorage.removeItem(LAST_RUN_KEY) } catch { /* 隐私模式 */ }
    selectRun('')
  }
}, { immediate: true })
</script>

<template>
  <div class="rs" data-testid="sim-run-selector">
    <span class="rs__slot">
      <span class="rs__label">{{ zh ? '当前运行' : 'Current run' }}</span>
      <span
        class="rs__current"
        data-testid="sim-run-current"
        :title="current || undefined"
      >{{ current ? runDisplayName(current) : (zh ? '未选择' : 'none') }}</span>
    </span>
    <span class="rs__slot">
      <span class="rs__label">{{ zh ? '历史运行' : 'History' }}</span>
      <select
        v-if="historyOptions.length"
        class="rs__select"
        data-testid="sim-run-history"
        :aria-label="zh ? '切换到其他运行' : 'Switch to another run'"
        @change="onChange"
      >
        <option value="">{{ zh ? '切换运行…' : 'Switch…' }}</option>
        <option v-for="r in historyOptions" :key="r" :value="r" :title="r">{{ runDisplayName(r) }}</option>
      </select>
      <span v-else-if="runsStore.loading" class="rs__empty" data-testid="sim-run-history-loading">
        {{ zh ? '读取历史运行…' : 'Loading runs…' }}
      </span>
      <span v-else class="rs__empty" data-testid="sim-run-history-empty">
        {{ zh ? '无其他历史运行' : 'No other runs' }}
      </span>
    </span>
  </div>
</template>

<style scoped>
.rs { display: inline-flex; align-items: center; gap: 12px; font-size: 12px; flex-wrap: wrap; }
.rs__slot { display: inline-flex; align-items: center; gap: 6px; }
.rs__label { color: var(--text-muted); font-size: 11px; white-space: nowrap; }
.rs__current { font-size: 12px; white-space: nowrap; }
.rs__select {
  border: 1px solid var(--border-color); border-radius: 6px; background: transparent;
  color: var(--text-primary); font-family: inherit; font-size: 12px; padding: 3px 8px;
  max-width: 220px;
}
.rs__select:focus-visible { outline: 2px solid var(--accent-primary); outline-offset: 2px; }
.rs__empty { color: var(--text-muted); font-size: 11px; }
</style>
