<!-- overlay/custom/client/bpa/components/BpaMapPanel.vue -->
<!-- L1 流程地图：一张图按构图法分区（OES/POS/MOS/O-MS 可切换），L1 卡片入区、
     卡内列 L2 流程组。分类法只管「图怎么画」，不进分级清单（关键认知内置提示）。 -->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { bpaApi, type BpaArchitectureDto, type BpaFramework, type BpaSection } from '@/custom/bpa/api'
import type { BpaMessages } from '@/custom/bpa/i18n'

const props = defineProps<{ L: BpaMessages; dto: BpaArchitectureDto }>()
const emit = defineEmits<{ (e: 'updated', dto: BpaArchitectureDto): void }>()

const busy = ref(false)
const error = ref('')
const framework = ref<BpaFramework>(props.dto.config.framework)

/** 构图法特化区标：POS 的 M 区承载 P（规划）；O/MS 的 M 区=管理+支撑合并。 */
function sectionLabel(s: BpaSection): string {
  const fw = props.dto.config.framework
  if (fw === 'POS+PCF5' && s === 'MANAGING') return 'P · 规划 Planning'
  if (fw === 'OMS+PCF5' && s === 'MANAGING') return 'MS · 管理和支撑 Mgmt & Support'
  return `${props.L.sectionLetters[s]} · ${props.L.sectionNames[s]}`
}

const sections = computed(() => props.dto.config.mapSections)
const l1s = computed(() => props.dto.nodes.filter((n) => n.level === 1))
const childrenOf = (id: string | null) => props.dto.nodes.filter((n) => n.parentId === id)

async function switchFramework(fw: BpaFramework): Promise<void> {
  if (fw === props.dto.config.framework) return
  busy.value = true; error.value = ''
  try {
    const next = await bpaApi.saveConfig({ framework: fw })
    framework.value = next.config.framework
    emit('updated', next)
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    busy.value = false
  }
}

const frameworkOptions: BpaFramework[] = ['OES+PCF6', 'POS+PCF5', 'MOS+PCF5', 'OMS+PCF5']
</script>

<template>
  <div class="bpa-map" data-testid="bpa-map-panel">
    <div class="bpa-map__bar">
      <p class="muted hint">{{ L.map.hint }}</p>
      <label class="fw">
        {{ L.map.switchFramework }}
        <select :value="dto.config.framework" :disabled="busy" data-testid="bpa-framework-select" @change="switchFramework(($event.target as HTMLSelectElement).value as BpaFramework)">
          <option v-for="f in frameworkOptions" :key="f" :value="f">{{ L.frameworkNames[f] }}</option>
        </select>
      </label>
    </div>

    <p v-if="error" class="err">{{ error }}</p>

    <div class="bpa-map__grid" :style="{ gridTemplateColumns: `repeat(${Math.max(1, sections.length)}, minmax(220px, 1fr))` }">
      <section v-for="s in sections" :key="s" class="bpa-map__col" :data-testid="`bpa-map-section-${s}`">
        <h3 class="col-head">{{ sectionLabel(s) }}</h3>
        <p v-if="l1s.filter((n) => n.section === s).length === 0" class="muted small empty">{{ L.map.emptySection }}</p>
        <article v-for="n in l1s.filter((x) => x.section === s)" :key="n.id" class="l1-card" :data-testid="`bpa-map-card-${n.id}`">
          <header>
            <span class="mono muted">{{ n.id }}</span>
            <strong>{{ n.name }}</strong>
          </header>
          <p class="muted small">Owner：{{ n.owner || '—' }}</p>
          <ul>
            <li v-for="g in childrenOf(n.id)" :key="g.id">
              <span class="mono muted">{{ g.id }}</span> {{ g.name }}
              <span class="muted small">（{{ childrenOf(g.id).length }} L3）</span>
            </li>
          </ul>
        </article>
      </section>
    </div>
  </div>
</template>

<style scoped lang="scss">
.bpa-map { display: flex; flex-direction: column; gap: 12px; }
.bpa-map__bar { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; flex-wrap: wrap;
  .hint { margin: 0; flex: 1; min-width: 260px; }
  .fw { display: flex; flex-direction: column; gap: 3px; font-size: 12px; min-width: 320px;
    select { border: 1px solid var(--border-color, #e5e7eb); border-radius: 8px; padding: 6px 10px; font-size: 12px; background: var(--bg-primary, #fff); color: inherit; } } }
.bpa-map__grid { display: grid; gap: 12px; align-items: start; }
.bpa-map__col { border: 1px solid var(--border-color, #e5e7eb); border-radius: 10px; padding: 10px; display: flex; flex-direction: column; gap: 8px; min-height: 120px;
  .col-head { margin: 0; font-size: 13px; border-bottom: 2px solid var(--accent, #4f6ef7); padding-bottom: 6px; }
  .empty { margin: 0; } }
.l1-card { border: 1px solid var(--border-color, #e5e7eb); border-radius: 8px; padding: 8px 10px; display: flex; flex-direction: column; gap: 4px; background: var(--bg-secondary, rgba(255,255,255,0.55));
  header { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; strong { font-size: 13px; } }
  ul { margin: 0; padding-left: 14px; font-size: 12px; display: flex; flex-direction: column; gap: 2px; } }
.err { color: var(--danger, #dc2626); font-size: 13px; margin: 0; }
.muted { opacity: 0.65; font-size: 12px; }
.small { font-size: 11px; }
.mono { font-family: var(--font-mono, monospace); font-size: 11px; }
</style>
