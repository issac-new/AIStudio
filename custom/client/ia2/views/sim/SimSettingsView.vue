<!-- overlay/custom/client/ia2/views/sim/SimSettingsView.vue -->
<!-- 推演设置页（B8 工单，设计正本 E28 四区）：姿态缺省/观察窗节奏/清偿门策略/
     审批升级超时。读写 simcenter 设置对；客户端提示值域但校验正身在服务端
     （400 原文如实呈现）；保存成功显示回传有效值。顶栏返回仿真中心。 -->
<script setup lang="ts">
import TabIntroBanner from '../../components/TabIntroBanner.vue'
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { fetchSimSettings, putSimSettings, SETTING_FIELDS, type SimSettings } from '../../api/sim-settings'

const router = useRouter()
const values = ref<Required<SimSettings> | null>(null)
const draft = ref<SimSettings>({})
const loadError = ref('')
const saveError = ref('')
const saved = ref(false)
const busy = ref(false)

const POSTURE_OPTIONS = ['strict', 'standard', 'demo'] as const
const POLICY_OPTIONS = ['block', 'warn'] as const

async function load(): Promise<void> {
  loadError.value = ''
  try {
    const res = await fetchSimSettings()
    values.value = res.values
    draft.value = { ...res.values }
  } catch (e) {
    loadError.value = (e as Error).message
  }
}

async function save(): Promise<void> {
  busy.value = true
  saveError.value = ''
  saved.value = false
  try {
    const res = await putSimSettings(draft.value)
    values.value = res.values
    draft.value = { ...res.values }
    saved.value = true
    setTimeout(() => { saved.value = false }, 1800)
  } catch (e) {
    saveError.value = (e as Error).message
  } finally {
    busy.value = false
  }
}

onMounted(() => { void load() })
</script>

<template>
  <div class="sst" data-testid="sst-page">
  <TabIntroBanner tab="sim-settings" />
    <header class="sst__head">
      <h2 class="sst__title">推演设置</h2>
      <button class="sst__back" type="button" data-testid="sst-back" @click="void router.push({ name: 'ia2.sim' })">返回仿真中心</button>
    </header>

    <p v-if="loadError" class="sst__error" data-testid="sst-error">{{ loadError }}</p>
    <p v-else-if="!values" class="sst__hint">读取中……</p>

    <template v-else>
      <section v-for="f in SETTING_FIELDS" :key="f.key" class="sst__row">
        <div class="sst__row-head">
          <span class="sst__label">{{ f.label }}</span>
          <span class="sst__current">当前有效值：{{ values[f.key] }}</span>
        </div>
        <p class="sst__hint">{{ f.hint }}</p>
        <select
          v-if="f.kind === 'posture'"
          v-model="draft[f.key]"
          class="sst__input"
          :data-testid="`sst-input-${f.key}`"
        >
          <option v-for="o in POSTURE_OPTIONS" :key="o" :value="o">{{ o }}</option>
        </select>
        <select
          v-else-if="f.kind === 'policy'"
          v-model="draft[f.key]"
          class="sst__input"
          :data-testid="`sst-input-${f.key}`"
        >
          <option v-for="o in POLICY_OPTIONS" :key="o" :value="o">{{ o }}</option>
        </select>
        <input
          v-else
          v-model.number="draft[f.key]"
          class="sst__input"
          type="number"
          :data-testid="`sst-input-${f.key}`"
        >
      </section>

      <div class="sst__actions">
        <button class="sst__save" type="button" data-testid="sst-save" :disabled="busy" @click="save">保存</button>
        <span v-if="saved" class="sst__saved" data-testid="sst-saved">已保存（回传有效值见各行）</span>
      </div>
      <p v-if="saveError" class="sst__error" data-testid="sst-save-error">{{ saveError }}</p>
    </template>
  </div>
</template>

<style scoped lang="scss">
.sst { display: flex; flex-direction: column; gap: 12px; padding: 16px; height: 100%; overflow: auto; }
.sst__head { display: flex; align-items: center; gap: 12px; }
.sst__title { margin: 0; font-size: 15px; }
.sst__back {
  border: 1px solid var(--border-color);
  background: transparent;
  color: inherit;
  border-radius: 4px;
  padding: 2px 10px;
  font-size: 12px;
  cursor: pointer;
}
.sst__row { border: 1px solid var(--border-color); border-radius: 6px; padding: 10px 12px; }
.sst__row-head { display: flex; justify-content: space-between; align-items: baseline; }
.sst__label { font-size: 13px; font-weight: 600; }
.sst__current { font-size: 11px; color: var(--text-muted); font-family: var(--font-mono); }
.sst__hint { margin: 4px 0 8px; font-size: 12px; color: var(--text-muted); }
.sst__input {
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 3px 8px;
  font-size: 12px;
  width: 200px;
  background: transparent;
  color: inherit;
}
.sst__actions { display: flex; gap: 10px; align-items: center; }
.sst__save {
  border: 1px solid var(--ia-fresh);
  color: var(--ia-fresh);
  background: transparent;
  border-radius: 4px;
  padding: 4px 16px;
  font-size: 12px;
  cursor: pointer;
  &:disabled { opacity: 0.4; }
}
.sst__saved { color: var(--ia-fresh); font-size: 12px; }
.sst__error { color: var(--ia-fail); font-size: 12px; margin: 0; word-break: break-all; }
</style>
