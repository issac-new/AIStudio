<script setup lang="ts">
// IdeGitLog — 提交图谱（M4d，对标 zcode gitGraph 27 键的本地对应物）：
// git log 提交列表 + refs 徽标（分支/tag/head），简化泳道为单列徽标色点。
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMessage } from 'naive-ui'
import { ideGitApi, type GitLogCommit } from '../api/git'
import { formatRelativeTime, type TFunc } from '../utils/time'
import { useIdeStore } from '../store/ide'

const { t } = useI18n()
const message = useMessage()
const ide = useIdeStore()

const commits = ref<GitLogCommit[]>([])
const loading = ref(false)

async function load(): Promise<void> {
  const root = ide.workspace
  if (!root) return
  loading.value = true
  try {
    const res = await ideGitApi.log(root, 200)
    commits.value = res.commits
  } catch {
    message.error(t('ide.gitGraphLoadFailed'))
  } finally {
    loading.value = false
  }
}

function refClass(ref: string): string {
  if (ref.startsWith('tag:')) return 'is-tag'
  if (ref.includes('/')) return 'is-remote'
  return 'is-branch'
}

onMounted(load)
</script>

<template>
  <div class="ide-gitlog" data-testid="ide-gitlog">
    <div class="ide-gitlog__toolbar">
      <span class="ide-gitlog__title">{{ t('ide.gitGraphTitle') }}</span>
      <button type="button" class="ide-gitlog__btn" data-testid="ide-gitlog-refresh" @click="load">{{ t('ide.storage.rescan') }}</button>
    </div>
    <p v-if="loading" class="ide-gitlog__hint">{{ t('ide.memory.loading') }}</p>
    <p v-else-if="!commits.length" class="ide-gitlog__hint">{{ t('ide.gitGraphEmpty') }}</p>
    <ul v-else class="ide-gitlog__list" data-testid="ide-gitlog-list">
      <li v-for="c in commits" :key="c.hash" class="ide-gitlog__item" :data-testid="`ide-gitlog-${c.short}`">
        <span class="ide-gitlog__dot" :class="{ 'is-head': c.isHead }" />
        <span class="ide-gitlog__subject" :title="c.hash">{{ c.subject }}</span>
        <span v-for="ref in c.refs.slice(0, 3)" :key="ref" class="ide-gitlog__ref" :class="refClass(ref)">{{ ref.replace('refs/', '').replace('tag: ', '') }}</span>
        <span class="ide-gitlog__meta">{{ c.author }} · {{ formatRelativeTime(t as unknown as TFunc, c.timestamp) }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped lang="scss">
.ide-gitlog {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.ide-gitlog__toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
}

.ide-gitlog__title { flex: 1; font-size: 12px; color: var(--text-muted, #9aa0aa); }

.ide-gitlog__btn {
  height: 22px;
  padding: 0 10px;
  border: 1px solid var(--border-color, #26292f);
  border-radius: 5px;
  background: transparent;
  color: var(--text-primary, #e6e6e6);
  font-size: 11px;
  cursor: pointer;

  &:hover { border-color: var(--accent-primary, #4cc9f0); }
}

.ide-gitlog__hint { padding: 16px 12px; font-size: 12px; color: var(--text-muted, #9aa0aa); }

.ide-gitlog__list { flex: 1; min-height: 0; overflow-y: auto; margin: 0; padding: 0 10px 10px; list-style: none; }

.ide-gitlog__item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 6px;
  border-radius: 6px;
  margin-bottom: 2px;
  font-size: 12px;

  &:hover { background: var(--bg-tertiary, #242830); }
}

.ide-gitlog__dot {
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-muted, #9aa0aa);

  &.is-head { background: var(--accent-primary, #4cc9f0); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-primary, #4cc9f0) 25%, transparent); }
}

.ide-gitlog__subject {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-primary, #e6e6e6);
}

.ide-gitlog__ref {
  flex-shrink: 0;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 10px;
  max-width: 110px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  &.is-branch { background: rgba(76, 201, 240, 0.15); color: #4cc9f0; }
  &.is-remote { background: rgba(152, 195, 121, 0.15); color: #98c379; }
  &.is-tag { background: rgba(240, 164, 76, 0.15); color: #f0a44c; }
}

.ide-gitlog__meta { flex-shrink: 0; font-size: 10px; color: var(--text-muted, #9aa0aa); }
</style>
