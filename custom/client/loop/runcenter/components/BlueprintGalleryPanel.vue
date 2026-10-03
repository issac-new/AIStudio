<!-- overlay/custom/client/loop/runcenter/components/BlueprintGalleryPanel.vue -->
<!-- 蓝图画廊（2026-10-02 三受阻项解封 #11：hermes cron blueprint_catalog 的 UI 化）。
     语义：运行中心 runs 页签的自动化模板横条——每卡=一个蓝图（标题/描述/分类），
     点开=类型化槽位表单（time/enum/weekdays/text，结构与运行时 dataclass 同源），
     提交=填槽校验（422 内联）→网关 POST /api/jobs 真实建任务。
     数据链=server 网关代理（venv python 导入 CATALOG，16 件零漂移）；
     空态诚实：网关通道缺席（409）显示单行提示不摆设。
     信息设计参照：hermes dashboard CronPage 蓝图实例化 + zcode automationTemplateCatalog。 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  fetchGatewayBlueprints, instantiateGatewayBlueprint,
  type GatewayBlueprint, type GatewayBlueprintSlot,
} from '@/custom/ia2/api/runtime-caps'
import { useRunSurfaceText } from '@/custom/ia2/i18n-observatory'
import { useI18n } from 'vue-i18n'

const tx = useRunSurfaceText()
const i18nCtx = useI18n()
/** 画廊词条（本地小字典，漂移期模式——zh/en 跟随 locale） */
const L = computed(() => {
  const loc = String((i18nCtx as unknown as { locale?: { value?: string } })?.locale?.value ?? 'zh')
  return loc.startsWith('zh') ? {
    title: '自动化蓝图', hint: '16 件运行时模板 · 填槽即建定时任务',
    absent: '网关通道缺席（API_SERVER_KEY 未配置或网关未运行）——画廊不可用',
    loadFail: '蓝图目录加载失败', retry: '重试', slotFill: '配置槽位', create: '创建任务',
    creating: '创建中…', cancel: '取消', created: '已创建', createFail: '创建失败',
    required: '必填', optional: '选填', expand: '展开', collapse: '收起',
  } : {
    title: 'Automation Blueprints', hint: '16 runtime templates · fill slots to create a cron job',
    absent: 'Gateway channel absent (API_SERVER_KEY unset or gateway down) — gallery unavailable',
    loadFail: 'Failed to load blueprints', retry: 'Retry', slotFill: 'Configure slots', create: 'Create job',
    creating: 'Creating…', cancel: 'Cancel', created: 'Created', createFail: 'Create failed',
    required: 'required', optional: 'optional', expand: 'Expand', collapse: 'Collapse',
  }
})

const blueprints = ref<GatewayBlueprint[] | null>(null)
const absent = ref(false)
const error = ref('')
const expandedKey = ref('')
const slotValues = ref<Record<string, Record<string, string>>>({})
const creating = ref(false)
const createMsg = ref('')
const createErr = ref('')

async function load(): Promise<void> {
  error.value = ''
  absent.value = false
  const res = await fetchGatewayBlueprints()
  if ('error' in res) {
    // 409=通道缺席（诚实降级，status 为结构化信号；文案子串仅作旧链路兜底）；其余=加载错误，可手动重试
    absent.value = res.status === 409 || res.error.includes('缺席') || res.error.includes('HTTP 409')
    error.value = res.error
    return
  }
  blueprints.value = res.blueprints
}

onMounted(() => void load())

function toggle(bp: GatewayBlueprint): void {
  createMsg.value = ''
  createErr.value = ''
  if (expandedKey.value === bp.key) { expandedKey.value = ''; return }
  expandedKey.value = bp.key
  if (!slotValues.value[bp.key]) {
    const init: Record<string, string> = {}
    for (const s of bp.slots) {
      if (s.default !== null && s.default !== undefined && s.default !== '') init[s.name] = String(s.default)
    }
    slotValues.value = { ...slotValues.value, [bp.key]: init }
  }
}

function slotInput(s: GatewayBlueprintSlot, v: string): void {
  const cur = slotValues.value[expandedKey.value] ?? {}
  slotValues.value = { ...slotValues.value, [expandedKey.value]: { ...cur, [s.name]: v } }
}

function weekdays(s: GatewayBlueprintSlot): string[] { return s.options ?? [] }

function toggleWeekday(s: GatewayBlueprintSlot, day: string): void {
  const cur = slotValues.value[expandedKey.value] ?? {}
  const raw = (cur[s.name] ?? String(s.default ?? '')).split(',').map(x => x.trim()).filter(Boolean)
  const next = raw.includes(day) ? raw.filter(d => d !== day) : [...raw, day]
  slotValues.value = { ...slotValues.value, [expandedKey.value]: { ...cur, [s.name]: next.join(',') } }
}

function weekdayOn(s: GatewayBlueprintSlot, day: string): boolean {
  const cur = (slotValues.value[expandedKey.value] ?? {})[s.name] ?? String(s.default ?? '')
  return cur.split(',').map(x => x.trim()).includes(day)
}

async function submit(bp: GatewayBlueprint): Promise<void> {
  if (creating.value) return
  creating.value = true
  createErr.value = ''
  createMsg.value = ''
  try {
    const values = { ...(slotValues.value[bp.key] ?? {}) }
    for (const s of bp.slots) {
      if (!values[s.name] && (s.default !== null && s.default !== undefined && s.default !== '')) values[s.name] = String(s.default)
    }
    const res = await instantiateGatewayBlueprint(bp.key, values)
    if (res.ok) {
      createMsg.value = `${L.value.created} ✓`
      setTimeout(() => { createMsg.value = '' }, 4000)
    } else {
      createErr.value = res.error
    }
  } finally {
    creating.value = false
  }
}

/** 槽位输入控件类型（运行时 slot.type → 控件映射） */
function control(s: GatewayBlueprintSlot): 'time' | 'enum' | 'weekdays' | 'text' {
  if (s.type === 'weekdays' || (s.options && s.name.toLowerCase().includes('day'))) return 'weekdays'
  if (s.type === 'enum' && s.options?.length) return 'enum'
  if (s.type === 'time') return 'time'
  return 'text'
}

const expandedBp = computed(() => blueprints.value?.find(b => b.key === expandedKey.value) ?? null)
</script>

<template>
  <section v-if="absent" class="bpabsent" data-testid="blueprint-absent">{{ L.absent }}</section>
  <section v-else-if="error" class="bpabsent" data-testid="blueprint-error">{{ L.loadFail }}：{{ error }}
    <button type="button" class="bpabsent__retry" data-testid="blueprint-retry" @click="load()">{{ L.retry }}</button>
  </section>
  <section v-else-if="blueprints" class="bpgal" data-testid="blueprint-gallery">
    <header class="bpgal__hd">
      <h3>{{ L.title }}</h3>
      <span class="bpgal__hint">{{ L.hint }}</span>
    </header>
    <div class="bpgal__grid">
      <button
        v-for="bp in blueprints" :key="bp.key"
        type="button" class="bpgal__card"
        :class="{ 'is-open': expandedKey === bp.key }"
        :data-testid="`blueprint-${bp.key}`"
        @click="toggle(bp)"
      >
        <span class="bpgal__cat">{{ bp.category }}</span>
        <span class="bpgal__t">{{ bp.title }}</span>
        <span class="bpgal__d">{{ bp.description }}</span>
      </button>
    </div>
    <!-- 槽位表单（展开态，画廊底部单实例——同屏只开一张防滚动跳跃） -->
    <div v-if="expandedBp" class="bpslot" :data-testid="`blueprint-form-${expandedBp.key}`">
      <div class="bpslot__hd">
        <b>{{ expandedBp.title }}</b>
        <span class="bpslot__sched">{{ expandedBp.schedule_template }}</span>
      </div>
      <div class="bpslot__row" v-for="s in expandedBp.slots" :key="s.name">
        <label class="bpslot__label">
          {{ s.label }}
          <span class="bpslot__req" :class="{ 'is-opt': s.optional }">{{ s.optional ? L.optional : L.required }}</span>
        </label>
        <input
          v-if="control(s) === 'text' || control(s) === 'time'"
          class="bpslot__input" :type="control(s) === 'time' ? 'time' : 'text'"
          :value="(slotValues[expandedBp.key] ?? {})[s.name] ?? ''"
          :placeholder="s.help ?? ''"
          :data-testid="`blueprint-slot-${s.name}`"
          @input="slotInput(s, ($event.target as HTMLInputElement).value)"
        >
        <select
          v-else-if="control(s) === 'enum'"
          class="bpslot__input"
          :value="(slotValues[expandedBp.key] ?? {})[s.name] ?? ''"
          :data-testid="`blueprint-slot-${s.name}`"
          @change="slotInput(s, ($event.target as HTMLSelectElement).value)"
        >
          <option v-if="s.optional" value="">—</option>
          <option v-for="o in s.options ?? []" :key="o" :value="o">{{ o }}</option>
        </select>
        <div v-else class="bpslot__days">
          <button
            v-for="d in weekdays(s)" :key="d" type="button"
            class="bpslot__day" :class="{ 'is-on': weekdayOn(s, d) }"
            @click="toggleWeekday(s, d)"
          >{{ d }}</button>
        </div>
      </div>
      <div class="bpslot__actions">
        <button type="button" class="bpslot__btn is-pri" :disabled="creating" data-testid="blueprint-create" @click="submit(expandedBp)">
          {{ creating ? L.creating : L.create }}
        </button>
        <button type="button" class="bpslot__btn" @click="expandedKey = ''">{{ L.cancel }}</button>
        <span v-if="createMsg" class="bpslot__ok" data-testid="blueprint-created">{{ createMsg }}</span>
        <span v-if="createErr" class="bpslot__err" data-testid="blueprint-error">{{ L.createFail }}：{{ createErr }}</span>
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
.bpabsent { padding: 10px 14px; font-size: 12px; color: var(--text-muted); border: 1px dashed var(--border-color); border-radius: 8px; }
.bpabsent__retry { margin-left: 8px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-primary); padding: 1px 10px; font-size: 12px; cursor: pointer; font-family: inherit; }
.bpgal { border: 1px solid var(--border-color); border-radius: 10px; padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; }
.bpgal__hd { display: flex; align-items: baseline; gap: 10px; h3 { margin: 0; font-size: 13px; } }
.bpgal__hint { font-size: 11px; color: var(--text-muted); }
.bpgal__grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 8px; }
.bpgal__card {
  display: flex; flex-direction: column; gap: 3px; text-align: left; padding: 9px 11px;
  border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-primary);
  cursor: pointer; font-family: inherit;
  &:hover { border-color: var(--primary); }
  &.is-open { border-color: var(--primary); box-shadow: 0 0 0 1px var(--primary); }
}
.bpgal__cat { font-size: 10px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.03em; }
.bpgal__t { font-size: 12.5px; font-weight: 600; color: var(--text-primary); }
.bpgal__d { font-size: 11px; color: var(--text-secondary); line-height: 1.5; }
.bpslot { border-top: 1px solid var(--border-color); padding-top: 10px; display: flex; flex-direction: column; gap: 8px; }
.bpslot__hd { display: flex; align-items: baseline; gap: 10px; font-size: 13px; }
.bpslot__sched { font-size: 11px; color: var(--text-muted); font-family: ui-monospace, monospace; }
.bpslot__row { display: grid; grid-template-columns: 160px 1fr; gap: 10px; align-items: center; }
.bpslot__label { font-size: 12px; color: var(--text-secondary); }
.bpslot__req { font-size: 10px; color: var(--error, #dc2626); margin-left: 4px; &.is-opt { color: var(--text-muted); } }
.bpslot__input {
  height: 28px; padding: 0 8px; border: 1px solid var(--border-color); border-radius: 6px;
  background: var(--bg-secondary); color: var(--text-primary); font-size: 12px; font-family: inherit;
  &:focus { outline: none; border-color: var(--primary); }
}
.bpslot__days { display: flex; gap: 5px; flex-wrap: wrap; }
.bpslot__day {
  height: 24px; padding: 0 9px; border: 1px solid var(--border-color); border-radius: 5px;
  background: transparent; color: var(--text-muted); font-size: 11px; cursor: pointer;
  &.is-on { border-color: var(--primary); color: var(--primary); background: var(--bg-secondary); }
}
.bpslot__actions { display: flex; align-items: center; gap: 8px; }
.bpslot__btn {
  height: 28px; padding: 0 12px; border-radius: 6px; border: 1px solid var(--border-color);
  background: var(--bg-primary); color: var(--text-primary); font-size: 12px; cursor: pointer;
  &.is-pri { border-color: var(--primary); color: var(--primary); }
  &:disabled { opacity: 0.6; cursor: wait; }
}
.bpslot__ok { font-size: 12px; color: #059669; }
.bpslot__err { font-size: 11px; color: #dc2626; }
</style>
