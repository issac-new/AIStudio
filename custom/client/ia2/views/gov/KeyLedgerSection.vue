<!-- overlay/custom/client/ia2/views/gov/KeyLedgerSection.vue -->
<!-- 密钥最小台账（C11，R13/Q3——设计正本 §二 S15）：清单+归属+最近轮换+备注，
     **不含密钥本体**（服务端字段守卫禁入）；轮换流程与扫描挂账下期（Q3）。
     读 orgloop /key-ledger；整表替换保存（PUT）。 -->
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { fetchKeyLedger, putKeyLedger, type KeyLedgerEntry } from '../../api/gov'

const entries = ref<KeyLedgerEntry[] | null>(null)
const loadError = ref('')
const saveError = ref('')
const saved = ref(false)
const busy = ref(false)

async function refresh(): Promise<void> {
  busy.value = true
  loadError.value = ''
  try {
    entries.value = (await fetchKeyLedger()).entries
  } catch (e) {
    loadError.value = (e as Error).message
  } finally {
    busy.value = false
  }
}

function addRow(): void {
  entries.value?.push({ name: '', owner: '', last_rotated: '', note: '' })
}

async function save(): Promise<void> {
  if (!entries.value) return
  busy.value = true
  saveError.value = ''
  saved.value = false
  try {
    entries.value = (await putKeyLedger(entries.value)).entries
    saved.value = true
    setTimeout(() => { saved.value = false }, 1600)
  } catch (e) {
    saveError.value = (e as Error).message
  } finally {
    busy.value = false
  }
}

onMounted(() => { void refresh() })
</script>

<template>
  <section class="kls" data-testid="kls-section">
    <div class="kls__bar">
      <h5 class="kls__h">密钥最小台账（{{ entries?.length ?? '—' }} 项）</h5>
      <button class="kls__btn" type="button" data-testid="kls-add" :disabled="busy" @click="addRow">加一行</button>
      <button class="kls__btn" type="button" data-testid="kls-save" :disabled="busy" @click="save">保存</button>
      <span v-if="saved" class="kls__saved" data-testid="kls-saved">已保存</span>
    </div>
    <p class="kls__note" data-testid="kls-note">只存清单、归属与最近轮换时间，**不含密钥本体**（服务端字段守卫禁入）；轮换流程与扫描属下期件（Q3 裁定）。</p>
    <p v-if="loadError" class="kls__error" data-testid="kls-error">{{ loadError }}</p>
    <p v-else-if="!entries" class="kls__hint">读取中……</p>
    <template v-else>
      <p v-if="entries.length === 0" class="kls__hint" data-testid="kls-empty">台账为空（如实呈现）。</p>
      <table v-else class="kls__table" data-testid="kls-table">
        <thead><tr><th>名称</th><th>归属</th><th>最近轮换</th><th>备注</th></tr></thead>
        <tbody>
          <tr v-for="(e, i) in entries" :key="i">
            <td><input v-model="e.name" class="kls__input" :data-testid="`kls-name-${i}`" placeholder="如 matrix-admin"></td>
            <td><input v-model="e.owner" class="kls__input" :data-testid="`kls-owner-${i}`" placeholder="归属人/系统"></td>
            <td><input v-model="e.last_rotated" class="kls__input kls__input--date" :data-testid="`kls-rotated-${i}`" placeholder="YYYY-MM-DD"></td>
            <td><input v-model="e.note" class="kls__input kls__input--note" :data-testid="`kls-note-${i}`"></td>
          </tr>
        </tbody>
      </table>
    </template>
    <p v-if="saveError" class="kls__error" data-testid="kls-save-error">{{ saveError }}</p>
  </section>
</template>

<style scoped lang="scss">
.kls { display: flex; flex-direction: column; gap: 8px; }
.kls__bar { display: flex; gap: 8px; align-items: center; }
.kls__h { margin: 0; font-size: 12px; font-weight: 600; }
.kls__btn {
  border: 1px solid var(--border-color, #e5e7eb);
  background: transparent;
  color: inherit;
  border-radius: 4px;
  font-size: 12px;
  padding: 2px 10px;
  cursor: pointer;
  &:disabled { opacity: 0.4; }
}
.kls__saved { color: #2e9e5b; font-size: 12px; }
.kls__note { margin: 0; font-size: 11px; color: var(--text-muted, #878c99); }
.kls__error { color: #d33; font-size: 12px; margin: 0; word-break: break-all; }
.kls__hint { color: var(--text-muted, #878c99); font-size: 12px; margin: 0; }
.kls__table { width: 100%; border-collapse: collapse; font-size: 12px; }
.kls__table th, .kls__table td { text-align: left; padding: 3px 6px; border-bottom: 1px solid var(--border-color, #e5e7eb); }
.kls__input {
  width: 100%;
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 4px;
  background: transparent;
  color: inherit;
  font-size: 12px;
  padding: 2px 6px;
  box-sizing: border-box;
  &--date { width: 130px; }
  &--note { min-width: 160px; }
}
</style>
