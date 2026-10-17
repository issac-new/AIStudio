<!-- overlay/custom/client/kanban/components/SkillgovSection.vue -->
<!-- 技能治理面板（最小可用轮）：生成器（探测+一次生成）/角色映射（查看+保存）/
     教训库（清单+尾部预览）。自取数 Section（CapacitySection 同款），
     数据面=/api/skillgov/*；全部 fail-soft，缺配置如实显示不在位。 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { authFetch } from '@/custom/ide/utils/auth-fetch'

interface RoleMapping { suffix: string; sources: Array<{ profile: string; skill: string }>; note?: string }
interface LessonEntry { profile: string; skill: string; lines: number; tail: string[] }

const tab = ref<'gen' | 'roles' | 'lessons'>('gen')
const gen = ref<{ available: boolean; path: string; usage: string | null } | null>(null)
const genBusy = ref(false)
const genMsg = ref('')
const genForm = ref({ profile: 'standard', name: '', projectDir: '' })
const mappings = ref<RoleMapping[]>([])
const mappingsText = ref('')
const rolesMsg = ref('')
const lessons = ref<LessonEntry[] | null>(null)

const tabs = computed(() => [
  { id: 'gen' as const, label: '技能生成器' },
  { id: 'roles' as const, label: '角色映射' },
  { id: 'lessons' as const, label: '教训库' },
])

async function refreshGen(): Promise<void> {
  try {
    const res = await authFetch('/api/skillgov/generator/status')
    const data = (await res.json()) as { ok?: boolean; generator?: typeof gen.value }
    gen.value = data.generator ?? null
  } catch { gen.value = { available: false, path: '—', usage: null } }
}

async function runGenerator(): Promise<void> {
  const f = genForm.value
  if (!f.name || !f.projectDir) { genMsg.value = 'name 与 projectDir 必填'; return }
  genBusy.value = true; genMsg.value = ''
  try {
    const res = await authFetch('/api/skillgov/generator/run', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(f),
    })
    const data = (await res.json()) as { ok?: boolean; targetDir?: string; detail?: string; output?: string }
    genMsg.value = data.ok
      ? `生成完成 → ${data.targetDir}${data.output ? `\n${data.output.slice(-600)}` : ''}`
      : `失败：${data.detail ?? '未知'}`
  } catch (err) {
    genMsg.value = `请求失败：${err instanceof Error ? err.message : String(err)}`
  } finally { genBusy.value = false }
}

async function refreshRoles(): Promise<void> {
  try {
    const res = await authFetch('/api/skillgov/role-mappings')
    const data = (await res.json()) as { mappings?: RoleMapping[] }
    mappings.value = data.mappings ?? []
    mappingsText.value = JSON.stringify(mappings.value, null, 2)
  } catch { mappings.value = []; mappingsText.value = '[]' }
}

async function saveRoles(): Promise<void> {
  try {
    const parsed = JSON.parse(mappingsText.value) as RoleMapping[]
    const res = await authFetch('/api/skillgov/role-mappings', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mappings: parsed }),
    })
    const data = (await res.json()) as { ok?: boolean; detail?: string }
    rolesMsg.value = data.ok ? '已保存（下一轮推演启动时安装管线按后缀补装）' : `保存失败：${data.detail ?? ''}`
    await refreshRoles()
  } catch (err) { rolesMsg.value = `JSON 解析失败：${err instanceof Error ? err.message : String(err)}` }
}

async function refreshLessons(): Promise<void> {
  try {
    const res = await authFetch('/api/skillgov/lessons')
    const data = (await res.json()) as { lessons?: LessonEntry[] }
    lessons.value = data.lessons ?? []
  } catch { lessons.value = [] }
}

onMounted(() => { void refreshGen(); void refreshRoles(); void refreshLessons() })
</script>

<template>
  <section class="skillgov" data-testid="skillgov-section">
    <header class="skillgov-head">
      <h3>技能治理</h3>
      <nav class="skillgov-tabs">
        <button v-for="t in tabs" :key="t.id" type="button" class="skillgov-tab" :class="{ 'is-active': tab === t.id }" @click="tab = t.id">{{ t.label }}</button>
      </nav>
    </header>

    <div v-if="tab === 'gen'" class="skillgov-body" data-testid="skillgov-generator">
      <p class="muted">为本机项目生成 swarm-yuan 研发技能（56 门禁全套骨架）。</p>
      <p>{{ gen?.available ? `生成器在位：${gen.path}` : `生成器不在位（${gen?.path ?? '…'}）——安装 swarm-yuan 或设 SKILLGEN_PATH` }}</p>
      <div class="skillgov-form">
        <select v-model="genForm.profile" :disabled="!gen?.available">
          <option value="lite">lite（轻量）</option>
          <option value="standard">standard（默认）</option>
          <option value="compliance">compliance（强合规）</option>
        </select>
        <input v-model="genForm.name" placeholder="技能名（如 myapp-dev）" :disabled="!gen?.available">
        <input v-model="genForm.projectDir" placeholder="项目绝对路径（如 /Users/me/lab/myapp）" :disabled="!gen?.available">
        <button type="button" :disabled="!gen?.available || genBusy" @click="runGenerator">{{ genBusy ? '生成中…' : '生成' }}</button>
      </div>
      <pre v-if="genMsg" class="skillgov-out">{{ genMsg }}</pre>
    </div>

    <div v-else-if="tab === 'roles'" class="skillgov-body" data-testid="skillgov-roles">
      <p class="muted">档案名后缀 → 技能来源映射（JSON）。当前 {{ mappings.length }} 条。</p>
      <textarea v-model="mappingsText" rows="8" class="skillgov-json" spellcheck="false" />
      <div class="skillgov-actions">
        <button type="button" @click="saveRoles">保存</button>
      </div>
      <p v-if="rolesMsg" class="skillgov-out">{{ rolesMsg }}</p>
    </div>

    <div v-else class="skillgov-body" data-testid="skillgov-lessons">
      <p class="muted">各档案技能的教训库（lessons.md）清单，共 {{ lessons?.length ?? 0 }} 份。</p>
      <ul v-if="lessons && lessons.length" class="skillgov-lessons">
        <li v-for="(l, i) in lessons" :key="i" class="skillgov-lesson">
          <b>@{{ l.profile }}</b> / {{ l.skill }}（{{ l.lines }} 行）
          <ul class="skillgov-tail">
            <li v-for="(tline, j) in l.tail" :key="j">{{ tline }}</li>
          </ul>
        </li>
      </ul>
      <p v-else class="muted">尚无档案写入教训（轮间积累脚本或技能自成长写入后出现在此）。</p>
    </div>
  </section>
</template>

<style scoped>
.skillgov { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 14px; background: var(--bg-secondary); }
.skillgov-head { display: flex; align-items: center; gap: 12px; }
.skillgov-head h3 { margin: 0; font-size: 14px; }
.skillgov-tabs { display: flex; gap: 4px; }
.skillgov-tab { border: 1px solid #cbd5e1; background: #16233a; border-radius: 4px; padding: 2px 10px; font-size: 12px; cursor: pointer; }
.skillgov-tab.is-active { background: #1d4ed8; color: #fff; border-color: #1d4ed8; }
.skillgov-body { margin-top: 10px; font-size: 13px; }
.skillgov-form { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }
.skillgov-form input, .skillgov-form select { border: 1px solid #cbd5e1; border-radius: 4px; padding: 4px 8px; font-size: 12px; min-width: 180px; }
.skillgov-form button { border: 1px solid #1d4ed8; background: #1d4ed8; color: #fff; border-radius: 4px; padding: 4px 14px; font-size: 12px; cursor: pointer; }
.skillgov-json { width: 100%; font-family: ui-monospace, monospace; font-size: 12px; border: 1px solid #cbd5e1; border-radius: 4px; padding: 6px; }
.skillgov-actions { margin-top: 6px; }
.skillgov-actions button { border: 1px solid #15803d; background: #15803d; color: #fff; border-radius: 4px; padding: 4px 14px; font-size: 12px; cursor: pointer; }
.skillgov-out { white-space: pre-wrap; background: #16233a; border-radius: 4px; padding: 6px; font-size: 12px; max-height: 180px; overflow: auto; }
.skillgov-lessons { list-style: none; padding: 0; margin: 8px 0 0; }
.skillgov-lesson { border-top: 1px dashed #e2e8f0; padding: 6px 0; }
.skillgov-tail { margin: 4px 0 0 16px; padding: 0; color: #64748b; font-size: 12px; list-style: disc; }
.muted { color: #64748b; }
</style>
