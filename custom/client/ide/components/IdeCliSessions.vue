<!-- overlay/custom/client/ide/components/IdeCliSessions.vue -->
<!-- zcode CLI 会话兼容展示（2026-10-19 用户需求批）：IDE 工作区落地面列出
     zcode CLI（终端）最近会话——与 IDE 内会话同屏可见，标「zcode CLI」源徽。
     行动作：「终端继续」= 在该会话的工作区目录开终端并运行 zcode（依赖用户
     PATH 中的 zcode 命令）；「复制 ID」供 CLI --resume 等场景。
     数据源 GET /api/ide/zcode-cli/sessions（只读 ~/.zcode/cli/db）；无库=空态。 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { fetchCliSessions, launchDevtool, type CliSession } from '../api/devtools'
import { showToast } from '../utils/toast'

const sessions = ref<CliSession[]>([])
const note = ref('')
const loadError = ref('')
const loading = ref(true)
const props = withDefaults(defineProps<{ boxed?: boolean }>(), { boxed: true })
const busyId = ref('')

async function load(): Promise<void> {
  loading.value = true
  loadError.value = ''
  try {
    const res = await fetchCliSessions(12)
    sessions.value = res.sessions
    note.value = res.note ?? ''
  } catch (e) {
    sessions.value = []
    loadError.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

async function resumeInTerminal(s: CliSession): Promise<void> {
  busyId.value = s.id
  try {
    await launchDevtool('terminal-zcode', s.directory || undefined)
  } catch (e) {
    showToast((e as Error).message, 'error')
  } finally {
    busyId.value = ''
  }
}

async function copyId(s: CliSession): Promise<void> {
  try {
    await navigator.clipboard.writeText(s.id)
    showToast('会话 ID 已复制', 'info')
  } catch {
    showToast('剪贴板不可用——请手动复制', 'error')
  }
}

function fmtRelative(ts: number): string {
  if (!ts) return ''
  const diff = Date.now() - ts
  const min = Math.floor(diff / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} 小时前`
  const day = Math.floor(hr / 24)
  return day < 30 ? `${day} 天前` : new Date(ts).toLocaleDateString('zh-CN')
}

/** 工作区短名（末两层），完整路径进 title。 */
function dirShort(path: string): string {
  const parts = path.split('/').filter(Boolean)
  return parts.slice(-2).join('/') || path
}

const hasAny = computed(() => sessions.value.length > 0)

onMounted(() => { void load() })
</script>

<template>
  <section class="ide-cli-sessions" :class="{ 'ide-cli-sessions--boxed': boxed }" data-testid="ide-cli-sessions">
    <div class="ide-cli-sessions__head">
      <h3 v-if="boxed" class="ide-cli-sessions__title">zcode CLI 会话</h3>
      <span v-if="boxed" class="ide-cli-sessions__badge" title="在终端 zcode CLI 里创建的会话，与 IDE 会话同库不同入口">zcode CLI</span>
      <button v-if="boxed" type="button" class="ide-cli-sessions__refresh" data-testid="ide-cli-sessions-refresh" @click="load">刷新</button>
    </div>

    <p v-if="loadError" class="ide-cli-sessions__hint ide-cli-sessions__hint--err">{{ loadError }}</p>
    <p v-else-if="loading" class="ide-cli-sessions__hint">正在读取 zcode CLI 会话……</p>
    <p v-else-if="!hasAny" class="ide-cli-sessions__hint">{{ note || '还没有 zcode CLI 会话——在终端运行 zcode 开始一次会话，之后会出现在这里。' }}</p>

    <ul v-else class="ide-cli-sessions__list">
      <li v-for="s in sessions" :key="s.id" class="ide-cli-sessions__row" :data-testid="`ide-cli-session-${s.id}`">
        <div class="ide-cli-sessions__main">
          <span class="ide-cli-sessions__name" :title="s.title">{{ s.title }}</span>
          <span class="ide-cli-sessions__meta">
            <span v-if="s.directory" :title="s.directory">{{ dirShort(s.directory) }}</span>
            <span> · {{ fmtRelative(s.timeUpdated) }}</span>
          </span>
        </div>
        <div class="ide-cli-sessions__acts">
          <button
            type="button"
            class="ide-cli-sessions__btn ide-cli-sessions__btn--primary"
            :data-testid="`ide-cli-resume-${s.id}`"
            :disabled="busyId === s.id"
            title="在该会话的工作区打开终端并运行 zcode"
            @click="resumeInTerminal(s)"
          >终端继续</button>
          <button
            type="button"
            class="ide-cli-sessions__btn"
            :data-testid="`ide-cli-copy-${s.id}`"
            :title="`复制会话 ID：${s.id}`"
            @click="copyId(s)"
          >复制 ID</button>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped lang="scss">
.ide-cli-sessions {
  width: 100%; text-align: left;
}
/* hero 落地场景的容器化包装（侧栏内嵌时无边框贴合作分组体） */
.ide-cli-sessions--boxed {
  max-width: 560px; margin: 18px auto 0;
  border: 1px solid var(--border-color); border-radius: 10px; padding: 12px 14px;
}
.ide-cli-sessions__head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.ide-cli-sessions__title { margin: 0; font-size: 13px; font-weight: 600; }
.ide-cli-sessions__badge {
  font-size: 10px; padding: 1px 6px; border-radius: 8px;
  color: var(--accent-info, #3b82f6); border: 1px solid var(--accent-info, #3b82f6);
}
.ide-cli-sessions__refresh {
  margin-left: auto; border: none; background: none; color: var(--text-muted);
  font-size: 11px; cursor: pointer; &:hover { color: var(--text-primary); }
}
.ide-cli-sessions__hint { margin: 4px 0; font-size: 12px; color: var(--text-muted); }
.ide-cli-sessions__hint--err { color: var(--error, #d33); }
.ide-cli-sessions__list { list-style: none; margin: 0; padding: 0; }
.ide-cli-sessions__row {
  display: flex; align-items: center; gap: 10px;
  padding: 7px 2px; border-bottom: 1px solid var(--border-color);
  &:last-child { border-bottom: none; }
}
.ide-cli-sessions__main { flex: 1; min-width: 0; }
.ide-cli-sessions__name {
  display: block; font-size: 12.5px; color: var(--text-primary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ide-cli-sessions__meta { font-size: 10.5px; color: var(--text-muted); }
.ide-cli-sessions__acts { display: flex; gap: 6px; flex-shrink: 0; }
.ide-cli-sessions__btn {
  border: 1px solid var(--border-color); border-radius: 6px; background: transparent;
  color: var(--text-secondary); font-size: 11px; padding: 3px 8px; cursor: pointer;
  &:hover:not(:disabled) { color: var(--text-primary); border-color: var(--text-muted); }
  &:disabled { opacity: .5; }
}
.ide-cli-sessions__btn--primary { color: var(--accent-info); border-color: var(--accent-info); }
</style>
