<!-- overlay/custom/client/ia2/views/agents/ProfileEnvPanel.vue -->
<!-- N01 profile 环境变量编辑面板：表格键/值（敏感值掩码展示＋「我确认修改敏感值」
     确认位）/整表保存 PUT /api/userenv/profiles/<name>/env；成功 toast 带备份文件名，
     重启提示不自动重启（spec D1）。敏感判定/编辑态/载荷构造的纯函数在
     ia2/utils/userenv.ts（视图与测试同源）。 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { authFetch } from '../../../ide/utils/auth-fetch'
import { showToast } from '../../../ide/utils/toast'
import {
  buildPutEntries, editStateOf, needsSensitiveConfirm,
  type EnvEntryDto, type EnvRow, type ProfileEnvDto, type PutEnvResultDto,
} from '../../utils/userenv'

const props = defineProps<{ profile: string }>()

/** 与服务端 ENV_KEY_RE 同源的键名形态（前端预检，最终裁决在服务端 422） */
const ENV_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/

const rows = ref<EnvRow[]>([])
const loading = ref(true)
const error = ref('')
const note = ref('')
const saving = ref(false)
const confirmSensitive = ref(false)
const missing = ref(false)

const confirmNeeded = computed(() => needsSensitiveConfirm(rows.value))

function rowsFromEntries(entries: readonly EnvEntryDto[]): EnvRow[] {
  return entries.map((e) => ({
    key: e.key,
    value: e.valueMasked,
    sensitive: e.sensitive,
    edited: false,
    draft: '',
  }))
}

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const res = await authFetch(`/api/userenv/profiles/${encodeURIComponent(props.profile)}/env`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const body = await res.json() as ProfileEnvDto
    rows.value = rowsFromEntries(body.entries)
    missing.value = body.missing === true
    confirmSensitive.value = false
  } catch (e) {
    error.value = String(e)
  } finally {
    loading.value = false
  }
}
onMounted(() => { void load() })

function startEdit(r: EnvRow): void { r.edited = true }
function cancelEdit(r: EnvRow): void { r.edited = false; r.draft = '' }
function addRow(): void {
  rows.value.push({ key: '', value: '', sensitive: false, edited: false, draft: '' })
}

async function save(): Promise<void> {
  if (saving.value) return
  const entries = buildPutEntries(rows.value)
  const bad = entries.find((e) => !ENV_KEY_RE.test(e.key))
  if (bad) {
    note.value = `键名非法（须字母/下划线开头）：${bad.key || '(空)'}`
    return
  }
  saving.value = true
  note.value = ''
  try {
    const res = await authFetch(`/api/userenv/profiles/${encodeURIComponent(props.profile)}/env`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entries,
        confirmSensitive: confirmNeeded.value && confirmSensitive.value,
      }),
    })
    const body = await res.json() as PutEnvResultDto
    if (!res.ok || !body.ok) {
      // 409 敏感未确认：回显键名清单，提示勾选确认位
      note.value = body.problems?.length
        ? `${body.error ?? '保存失败'}：${body.problems.join('、')}`
        : `保存失败：${body.error ?? `HTTP ${res.status}`}`
      return
    }
    rows.value = rowsFromEntries(body.entries)
    missing.value = false
    confirmSensitive.value = false
    if (body.written) {
      showToast(body.backup ? `已保存（备份 ${body.backup}）；重启该档案网关后生效` : '已保存；重启该档案网关后生效', 'info')
      note.value = body.backup ? `已保存，备份 ${body.backup}` : '已保存'
    } else {
      note.value = '无变更（同键同值跳写）'
    }
  } catch (e) {
    note.value = `保存失败：${String(e)}`
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="uep" :data-testid="`uep-${profile}`">
    <div class="uep__head">
      <span class="uep__title">环境变量（{{ profile }}/.env）</span>
      <button type="button" class="uep__btn" :data-testid="`uep-refresh-${profile}`" @click="load">刷新</button>
      <button type="button" class="uep__btn" :data-testid="`uep-add-${profile}`" @click="addRow">添加一行</button>
      <button type="button" class="uep__btn uep__btn--primary" :data-testid="`uep-save-${profile}`" :disabled="saving" @click="save">保存</button>
    </div>
    <p v-if="error" class="uep__error" :data-testid="`uep-error-${profile}`">{{ error }}</p>
    <p v-else-if="loading" class="uep__hint">载入中…</p>
    <p v-else-if="missing" class="uep__hint">该档案尚无 .env 文件，首次保存将创建（写入后需重启网关生效）。</p>
    <table v-else class="uep__table" :data-testid="`uep-table-${profile}`">
      <thead><tr><th>键</th><th>值</th><th>敏感</th><th /></tr></thead>
      <tbody>
        <tr v-for="(r, i) in rows" :key="i" :data-testid="`uep-row-${i}`">
          <td><input v-model="r.key" class="uep__input uep__key" :data-testid="`uep-key-${i}`" placeholder="KEY"></td>
          <td>
            <!-- 非敏感：明文就地编辑 -->
            <input v-if="editStateOf(r) === 'plain'" v-model="r.value" class="uep__input" :data-testid="`uep-val-${i}`">
            <!-- 敏感未动：掩码展示＋修改入口（掩码串回传=服务端保持现值） -->
            <template v-else-if="editStateOf(r) === 'sensitive-intact'">
              <span class="uep__mask" :data-testid="`uep-mask-${i}`">{{ r.value }}</span>
              <button type="button" class="uep__btn" :data-testid="`uep-edit-${i}`" @click="startEdit(r)">修改</button>
            </template>
            <!-- 敏感编辑中：草稿输入（保存须确认位） -->
            <template v-else>
              <input v-model="r.draft" class="uep__input" :data-testid="`uep-draft-${i}`" placeholder="新值（保存需勾选确认）">
              <button type="button" class="uep__btn" :data-testid="`uep-canceledit-${i}`" @click="cancelEdit(r)">取消</button>
            </template>
          </td>
          <td class="uep__sens" :class="{ 'uep__sens--yes': r.sensitive }">{{ r.sensitive ? '是' : '否' }}</td>
          <td><button type="button" class="uep__btn uep__btn--danger" :data-testid="`uep-del-${i}`" @click="rows.splice(i, 1)">删除</button></td>
        </tr>
      </tbody>
    </table>
    <label v-if="confirmNeeded" class="uep__confirm" :data-testid="`uep-confirmbox-${profile}`">
      <input v-model="confirmSensitive" type="checkbox" :data-testid="`uep-confirm-${profile}`">
      我确认修改敏感值
    </label>
    <p v-if="note" class="uep__note" :data-testid="`uep-note-${profile}`">{{ note }}</p>
  </div>
</template>

<style scoped lang="scss">
.uep { display: flex; flex-direction: column; gap: 8px; border: 1px dashed var(--border-color); border-radius: var(--radius-standard, 8px); padding: 10px 12px; }
.uep__head { display: flex; align-items: center; gap: 8px; }
.uep__title { font-size: 12px; font-weight: 600; white-space: nowrap; }
.uep__btn { border: 1px solid var(--border-color); background: transparent; border-radius: calc(var(--radius-standard, 8px) - 3px); font-size: 11px; padding: 2px 8px; cursor: pointer; margin-left: 4px;
  &:disabled { opacity: 0.5; cursor: wait; } }
.uep__btn--primary { color: var(--ia-fresh, #17663a); border-color: var(--ia-fresh, #17663a); }
.uep__btn--danger { color: var(--ia-fail, #b3261e); }
.uep__hint { font-size: 11.5px; color: var(--text-muted); margin: 0; }
.uep__error { color: var(--ia-fail, #b3261e); font-size: 12px; margin: 0; }
.uep__note { font-size: 11px; color: var(--text-muted); margin: 0; }
.uep__table { width: 100%; border-collapse: collapse; font-size: 12px; th, td { border: 1px solid var(--border-color); padding: 4px 8px; text-align: left; vertical-align: middle; } }
.uep__input { width: 100%; min-width: 180px; border: 1px solid var(--border-color); border-radius: calc(var(--radius-standard, 8px) - 3px); padding: 3px 8px; font-size: 12px; background: transparent; color: inherit; }
.uep__key { font-weight: 600; min-width: 140px; }
.uep__mask { font-family: monospace; color: var(--text-muted); margin-right: 6px; }
.uep__sens { color: var(--text-muted); white-space: nowrap; }
.uep__sens--yes { color: var(--ia-stale, #7a5a06); font-weight: 600; }
.uep__confirm { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--ia-stale, #7a5a06); }
</style>
