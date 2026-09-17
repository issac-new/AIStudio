<!-- overlay/custom/client/matrix-teams/components/AgentTeamEditor.vue -->
<!-- 编辑本账号 agent teams：增删行、profiles 多选（本机 profiles）、默认 profile 单选。 -->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useProfilesStore } from '@/stores/hermes/profiles'
import { slugify, type AgentTeam } from '../protocol'

const props = defineProps<{ initial: AgentTeam[] }>()
const emit = defineEmits<{ (e: 'save', teams: AgentTeam[]): void }>()
const { t } = useI18n()
const profilesStore = useProfilesStore()
const localProfiles = computed(() => profilesStore.profiles.map(p => p.name))

const rows = ref<Array<{ slug: string; name: string; profiles: string[]; defaultProfile: string }>>(
  props.initial.map(tm => ({ ...tm, defaultProfile: tm.defaultProfile ?? tm.profiles[0] ?? '' })),
)

function addRow(): void {
  if (rows.value.length >= 20) return // spec §10 限幅
  rows.value.push({ slug: slugify(`team-${rows.value.length + 1}`), name: '', profiles: [], defaultProfile: '' })
}
function removeRow(i: number): void { rows.value.splice(i, 1) }
function syncSlug(i: number): void { rows.value[i].slug = slugify(rows.value[i].name || `team-${i + 1}`) }
function toggleProfile(i: number, p: string): void {
  const row = rows.value[i]
  const at = row.profiles.indexOf(p)
  if (at >= 0) {
    row.profiles.splice(at, 1)
    if (row.defaultProfile === p) row.defaultProfile = row.profiles[0] ?? ''
  } else if (row.profiles.length < 20) {
    row.profiles.push(p)
    if (!row.defaultProfile) row.defaultProfile = p
  }
}
function submit(): void {
  // slug 去重：同名多行 slugify 后撞车，后者加序号后缀（dev/dev-2/dev-3…），
  // 否则写回 Matrix state 后同名团队的 agentTeamGlobalId 无法区分（spec §4.2 全局 id 唯一性）。
  const used = new Set<string>()
  emit('save', rows.value
    .filter(r => r.name.trim() !== '' && r.profiles.length > 0)
    .map(r => {
      const base = slugify(r.name)
      let slug = base
      if (used.has(slug)) {
        let n = 2
        while (used.has(`${base}-${n}`)) n++
        slug = `${base}-${n}`
      }
      used.add(slug)
      return { slug, name: r.name.trim(), profiles: r.profiles, defaultProfile: r.defaultProfile || r.profiles[0] }
    }))
}
</script>

<template>
  <div class="ate" data-testid="teams-editor">
    <div v-for="(row, i) in rows" :key="i" class="ate__row" :data-testid="`teams-editor-row-${i}`">
      <input class="ate__name" :data-testid="`teams-editor-name-${i}`" v-model="row.name"
        :placeholder="t('teams.agentTeams.name')" @change="syncSlug(i)" />
      <span class="ate__slug">{{ row.slug }}</span>
      <div class="ate__profiles">
        <button v-for="p in localProfiles" :key="p" type="button"
          class="ate__profile" :class="{ 'ate__profile--on': row.profiles.includes(p) }"
          :data-testid="`teams-editor-profile-${i}-${p}`" @click="toggleProfile(i, p)">{{ p }}</button>
      </div>
      <select class="ate__default" v-model="row.defaultProfile" :data-testid="`teams-editor-default-${i}`"
        :aria-label="t('teams.agentTeams.defaultProfile')">
        <option value="">{{ t('teams.agentTeams.defaultProfile') }}</option>
        <option v-for="p in row.profiles" :key="p" :value="p">{{ p }}</option>
      </select>
      <button type="button" class="ate__remove" :data-testid="`teams-editor-remove-${i}`"
        @click="removeRow(i)">✕</button>
    </div>
    <div class="ate__actions">
      <button type="button" data-testid="teams-editor-add" @click="addRow">{{ t('teams.agentTeams.add') }}</button>
      <button type="button" class="ate__save" data-testid="teams-editor-save" @click="submit">
        {{ t('teams.agentTeams.save') }}</button>
    </div>
  </div>
</template>

<style scoped>
.ate { display: flex; flex-direction: column; gap: 8px; }
.ate__row { display: grid; grid-template-columns: 120px 90px 1fr 110px 24px; gap: 6px; align-items: center; }
.ate__name, .ate__default { border: 1px solid var(--border-color); border-radius: var(--radius-standard); padding: 3px 6px; font-family: inherit; background: var(--bg-primary); color: var(--text-primary); }
.ate__slug { font-size: 11px; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; }
.ate__profiles { display: flex; flex-wrap: wrap; gap: 4px; }
.ate__profile { border: 1px solid var(--border-color); background: transparent; color: var(--text-primary); border-radius: 999px; padding: 1px 8px; font-size: 11px; cursor: pointer; font-family: inherit; }
.ate__profile--on { border-color: var(--color-primary, #3b82f6); background: var(--color-primary, #3b82f6); color: var(--bg-primary); }
.ate__actions { display: flex; gap: 8px; }
.ate__remove { border: none; background: none; color: var(--color-danger, #e11d48); cursor: pointer; }
.ate__save { border: 1px solid var(--color-primary, #3b82f6); background: var(--color-primary, #3b82f6); color: var(--bg-primary); border-radius: var(--radius-standard); padding: 3px 12px; cursor: pointer; }
</style>
