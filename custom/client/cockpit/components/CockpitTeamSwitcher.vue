<script setup lang="ts">
// CockpitTeamSwitcher.vue —— 团队切换器 + 管理弹窗（2.13）
//
// Team = { profiles, boards } 的具名集合。切换团队 → cockpit 的任务/舰队/
// 收件箱全部按 team 过滤；"全部" 不过滤。管理弹窗内联（名称/颜色/profiles/
// boards，多选 chips）。
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'
import { useProfilesStore } from '@/stores/hermes/profiles'
import type { TeamRecord } from '@/custom/cockpit/adapters/teams-adapter'

const store = useCockpitStore()
const profilesStore = useProfilesStore()
const { t } = useI18n()

const open = ref(false)
const managing = ref(false)

const activeTeam = computed(() => store.activeTeam)
const teams = computed(() => store.teams)

function toggleDropdown() {
  open.value = !open.value
  if (open.value) managing.value = false
}
function pick(teamId: string | null) {
  store.setActiveTeam(teamId)
  open.value = false
}

// ── 管理弹窗 ──
interface EditState {
  id: string | null
  name: string
  description: string
  color: string
  profiles: string[]
  boards: string[]
}
const edit = reactive<EditState>({ id: null, name: '', description: '', color: '#3b82f6', profiles: [], boards: [] })
const saving = ref(false)
const errorText = ref('')

const allProfiles = computed(() => profilesStore.profiles.map(p => p.name))
const allBoards = computed(() => store.boards.map(b => b.slug))

function startCreate() {
  edit.id = null
  edit.name = ''
  edit.description = ''
  edit.color = '#3b82f6'
  edit.profiles = []
  edit.boards = []
  errorText.value = ''
  managing.value = true
}
function startEdit(team: TeamRecord) {
  edit.id = team.id
  edit.name = team.name
  edit.description = team.description || ''
  edit.color = team.color || '#3b82f6'
  edit.profiles = [...(team.profiles || [])]
  edit.boards = [...(team.boards || [])]
  errorText.value = ''
  managing.value = true
}
function toggleItem(list: 'profiles' | 'boards', value: string) {
  const arr = edit[list]
  const i = arr.indexOf(value)
  if (i >= 0) arr.splice(i, 1)
  else arr.push(value)
}
async function save() {
  if (!edit.name.trim()) {
    errorText.value = t('cockpit.teamNameRequired')
    return
  }
  saving.value = true
  errorText.value = ''
  try {
    await store.saveTeam({
      id: edit.id,
      name: edit.name.trim(),
      description: edit.description.trim(),
      color: edit.color,
      profiles: edit.profiles,
      boards: edit.boards,
    })
    managing.value = false
  } catch (err) {
    errorText.value = err instanceof Error ? err.message : String(err)
  } finally {
    saving.value = false
  }
}
async function removeActiveEdit() {
  if (!edit.id) return
  saving.value = true
  try {
    await store.deleteTeam(edit.id)
    managing.value = false
  } catch (err) {
    errorText.value = err instanceof Error ? err.message : String(err)
  } finally {
    saving.value = false
  }
}

const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#ef4444', '#6366f1']

watch(open, value => {
  if (value && !profilesStore.profiles.length) void profilesStore.fetchProfiles().catch(() => {})
})
</script>

<template>
  <div class="team-switcher" @mouseleave="open = false" @mouseover="open = open">
    <button type="button" class="team-switcher__btn" @click="toggleDropdown">
      <span v-if="activeTeam" class="team-switcher__swatch" :style="{ background: activeTeam.color }" />
      <span class="team-switcher__label">{{ activeTeam ? activeTeam.name : t('cockpit.teamAll') }}</span>
      <span class="team-switcher__caret">▾</span>
    </button>
    <div v-if="open" class="team-switcher__menu" @mouseleave="open = false">
      <template v-if="!managing">
        <button type="button" class="team-switcher__item" :class="{ 'is-on': !store.activeTeamId }" @click="pick(null)">
          {{ t('cockpit.teamAll') }}
        </button>
        <button
          v-for="team in teams" :key="team.id" type="button"
          class="team-switcher__item" :class="{ 'is-on': store.activeTeamId === team.id }"
          @click="pick(team.id)"
        >
          <span class="team-switcher__swatch" :style="{ background: team.color }" />
          <span class="team-switcher__name">{{ team.name }}</span>
          <span class="team-switcher__count">{{ team.profiles.length }}p/{{ team.boards.length }}b</span>
        </button>
        <div class="team-switcher__sep" />
        <button type="button" class="team-switcher__item is-manage" @click="startCreate">＋ {{ t('cockpit.teamNew') }}</button>
        <button
          v-for="team in teams" :key="'edit-' + team.id" type="button"
          class="team-switcher__item is-manage" @click="startEdit(team)"
        >✎ {{ t('cockpit.teamEdit') }} · {{ team.name }}</button>
      </template>
      <template v-else>
        <div class="team-switcher__editor">
          <div class="team-switcher__field">
            <label>{{ t('cockpit.teamName') }}</label>
            <input v-model="edit.name" type="text" maxlength="80" :placeholder="t('cockpit.teamNamePlaceholder')" />
          </div>
          <div class="team-switcher__field">
            <label>{{ t('cockpit.teamDescription') }}</label>
            <input v-model="edit.description" type="text" maxlength="500" />
          </div>
          <div class="team-switcher__field">
            <label>{{ t('cockpit.teamColor') }}</label>
            <div class="team-switcher__colors">
              <button
                v-for="c in COLORS" :key="c" type="button"
                class="team-switcher__color" :class="{ 'is-on': edit.color === c }" :style="{ background: c }"
                @click="edit.color = c"
              />
            </div>
          </div>
          <div class="team-switcher__field">
            <label>{{ t('cockpit.teamProfiles') }}</label>
            <div class="team-switcher__chips">
              <button
                v-for="p in allProfiles" :key="p" type="button"
                class="team-switcher__chip" :class="{ 'is-on': edit.profiles.includes(p) }"
                @click="toggleItem('profiles', p)"
              >{{ p }}</button>
              <span v-if="!allProfiles.length" class="team-switcher__hint">{{ t('cockpit.teamNoProfiles') }}</span>
            </div>
          </div>
          <div class="team-switcher__field">
            <label>{{ t('cockpit.teamBoards') }}</label>
            <div class="team-switcher__chips">
              <button
                v-for="b in allBoards" :key="b" type="button"
                class="team-switcher__chip" :class="{ 'is-on': edit.boards.includes(b) }"
                @click="toggleItem('boards', b)"
              >{{ b }}</button>
            </div>
          </div>
          <div v-if="errorText" class="team-switcher__error">{{ errorText }}</div>
          <div class="team-switcher__editor-actions">
            <button v-if="edit.id" type="button" class="team-switcher__btn-del" :disabled="saving" @click="removeActiveEdit">{{ t('cockpit.teamDelete') }}</button>
            <span class="team-switcher__spacer" />
            <button type="button" :disabled="saving" @click="managing = false">{{ t('cockpit.teamCancel') }}</button>
            <button type="button" class="team-switcher__btn-save" :disabled="saving" @click="save">{{ t('cockpit.teamSave') }}</button>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped lang="scss">
.team-switcher { position: relative; display: inline-flex; }
.team-switcher__btn {
  display: inline-flex; align-items: center; gap: 6px; font: inherit; font-size: 11px; font-weight: 600;
  color: var(--text-secondary); background: var(--bg-card); border: 1px solid var(--border-color);
  border-radius: 5px; padding: 3px 8px; cursor: pointer;
  &:hover { color: var(--text-primary); border-color: var(--text-muted); }
}
.team-switcher__swatch { width: 8px; height: 8px; border-radius: 2px; flex-shrink: 0; }
.team-switcher__caret { font-size: 9px; color: var(--text-muted); }
.team-switcher__menu {
  position: absolute; top: calc(100% + 4px); left: 0; z-index: 1002; min-width: 240px; max-width: 340px;
  max-height: 65vh; overflow-y: auto; background: var(--bg-card); border: 1px solid var(--border-color);
  border-radius: 6px; box-shadow: 0 8px 32px rgba(0,0,0,.18); padding: 4px;
}
.team-switcher__item {
  display: flex; align-items: center; gap: 6px; width: 100%; text-align: left; font: inherit; font-size: 12px;
  color: var(--text-primary); background: none; border: none; border-radius: 4px; padding: 6px 8px; cursor: pointer;
  &:hover { background: var(--bg-secondary); }
  &.is-on { background: var(--bg-secondary); font-weight: 700; }
  &.is-manage { color: var(--text-muted); font-size: 11px; }
}
.team-switcher__name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.team-switcher__count { font-size: 9px; color: var(--text-muted); font-family: ui-monospace, monospace; }
.team-switcher__sep { height: 1px; background: var(--border-color); margin: 4px 6px; }
.team-switcher__editor { display: flex; flex-direction: column; gap: 8px; padding: 6px; }
.team-switcher__field { display: flex; flex-direction: column; gap: 3px;
  label { font-size: 10px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: .04em; }
  input[type='text'] {
    font: inherit; font-size: 12px; padding: 4px 8px; border: 1px solid var(--border-color);
    border-radius: 4px; background: var(--bg-secondary); color: var(--text-primary);
  }
}
.team-switcher__colors { display: flex; gap: 5px; }
.team-switcher__color {
  width: 18px; height: 18px; border-radius: 4px; border: 2px solid transparent; cursor: pointer; padding: 0;
  &.is-on { border-color: var(--text-primary); }
}
.team-switcher__chips { display: flex; flex-wrap: wrap; gap: 4px; }
.team-switcher__chip {
  font: inherit; font-size: 10px; padding: 2px 7px; border-radius: 10px; cursor: pointer;
  border: 1px solid var(--border-color); background: var(--bg-secondary); color: var(--text-secondary);
  &.is-on { border-color: var(--accent-primary); color: var(--text-on-accent); background: var(--accent-primary); }
}
.team-switcher__hint { font-size: 10px; color: var(--text-muted); }
.team-switcher__error { font-size: 11px; color: var(--error); }
.team-switcher__editor-actions { display: flex; align-items: center; gap: 6px;
  button { font: inherit; font-size: 11px; padding: 3px 10px; border-radius: 4px; cursor: pointer; border: 1px solid var(--border-color); background: var(--bg-card); color: var(--text-primary); }
}
.team-switcher__spacer { flex: 1; }
.team-switcher__btn-save { background: var(--accent-primary); color: var(--text-on-accent); border-color: transparent; font-weight: 700; }
.team-switcher__btn-del { color: var(--error); border-color: var(--error); }
</style>
