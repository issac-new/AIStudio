<script setup lang="ts">
// IdeRemotePane — G6 远程工作区只读诊断：展示 Hermes FileProvider 当前 backend、
// 探针结果、SSH/Docker 配置就绪度（只回布尔，不回密钥）与远端目录浏览。
// 不写服务端配置、不做远端写操作；配置模板供用户手动粘贴到 config.yaml/.env。
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ideRemoteApi, type RemoteStatus, type RemoteEntry } from '../api/remote'
import { IDE_LOCAL_TEXT, ideLocaleOf } from '../i18n'

const { locale } = useI18n()
const tx = computed(() => IDE_LOCAL_TEXT[ideLocaleOf(locale)].remote)

const status = ref<RemoteStatus | null>(null)
const entries = ref<RemoteEntry[]>([])
const path = ref('')
const loading = ref(false)
const listLoading = ref(false)
const error = ref('')
const copied = ref(false)

const CONFIG_TEMPLATE = `# $HERMES_HOME/config.yaml
terminal:
  backend: ssh          # local | docker | ssh | singularity
  cwd: /srv/app         # 远端工作目录（绝对路径）
  # docker 另配：
  # docker_container_name: my-container
  # docker_image: my-image:latest

# $HERMES_HOME/.env（SSH 专用）
TERMINAL_SSH_HOST=your-host
TERMINAL_SSH_USER=your-user
TERMINAL_SSH_KEY=~/.ssh/id_rsa
TERMINAL_SSH_PORT=22
`

async function loadStatus(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    status.value = await ideRemoteApi.status()
    path.value = status.value.probe.path || status.value.cwd || ''
    await loadList()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

async function loadList(target?: string): Promise<void> {
  listLoading.value = true
  error.value = ''
  try {
    const res = await ideRemoteApi.list(target ?? path.value)
    if (!res.ok) {
      error.value = res.detail || `${tx.value.listFail}${res.code ? ` (${res.code})` : ''}`
      entries.value = []
      return
    }
    path.value = res.path
    entries.value = res.entries
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
    entries.value = []
  } finally {
    listLoading.value = false
  }
}

function openEntry(e: RemoteEntry): void {
  if (!e.isDir) return
  // provider 返回相对路径时拼到当前目录；绝对路径直接用
  const target = e.path.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(e.path) ? e.path : `${path.value.replace(/\/+$/, '')}/${e.name}`
  void loadList(target)
}

function parentPath(): string {
  const norm = path.value.replace(/\/+$/, '')
  if (!norm || norm === '/') return '/'
  if (/^[a-zA-Z]:$/.test(norm)) return norm
  const i = norm.lastIndexOf('/')
  if (i <= 0) return norm.startsWith('/') ? '/' : norm
  return norm.slice(0, i)
}

function up(): void {
  void loadList(parentPath())
}

async function copyTemplate(): Promise<void> {
  try {
    await navigator.clipboard.writeText(CONFIG_TEMPLATE)
    copied.value = true
    setTimeout(() => { copied.value = false }, 1500)
  } catch { /* 静默 */ }
}

onMounted(() => void loadStatus())
</script>

<template>
  <div class="ide-remote" data-testid="ide-remote-pane">
    <header class="ide-remote__head">
      <strong>{{ tx.title }}</strong>
      <span class="ide-remote__spacer" />
      <button type="button" class="ide-remote__btn" data-testid="ide-remote-refresh" :disabled="loading" @click="loadStatus">{{ tx.refresh }}</button>
    </header>

    <div class="ide-remote__body">
      <p v-if="loading" class="ide-remote__hint">…</p>
      <template v-else-if="status">
        <div class="ide-remote__row">
          <span class="ide-remote__chip" data-testid="ide-remote-backend">{{ tx.backend }}: {{ status.backend }}</span>
          <span
            class="ide-remote__chip"
            :class="status.probe.ok ? 'is-ok' : 'is-bad'"
            data-testid="ide-remote-probe"
          >{{ tx.probe }}: {{ status.probe.ok ? tx.probeOk : tx.probeFail }} · {{ status.probe.ms }}{{ tx.ms }}</span>
        </div>
        <p v-if="!status.probe.ok" class="ide-remote__error" data-testid="ide-remote-probe-error">
          {{ status.probe.code }}<template v-if="status.probe.detail"> · {{ status.probe.detail }}</template>
        </p>

        <section class="ide-remote__sec">
          <h4>{{ tx.ssh }}</h4>
          <ul class="ide-remote__facts">
            <li>{{ tx.host }}: {{ status.ssh.host ? tx.configured : tx.missing }}</li>
            <li>{{ tx.user }}: {{ status.ssh.user ? tx.configured : tx.missing }}</li>
            <li>{{ tx.key }}: {{ status.ssh.key ? tx.configured : tx.missing }}</li>
            <li>{{ tx.port }}: {{ status.ssh.port ?? '—' }}</li>
          </ul>
        </section>
        <section class="ide-remote__sec">
          <h4>{{ tx.docker }}</h4>
          <ul class="ide-remote__facts">
            <li>image: {{ status.docker.image ? tx.configured : tx.missing }}</li>
            <li>container: {{ status.docker.container ? tx.configured : tx.missing }}</li>
          </ul>
        </section>

        <p class="ide-remote__muted" data-testid="ide-remote-cwd">{{ tx.cwd }}: {{ status.cwd ?? '—' }}</p>
        <p v-if="status.backend === 'local'" class="ide-remote__muted">{{ tx.local }}</p>
        <p v-if="status.backend === 'local' && !status.cwd" class="ide-remote__hint">{{ tx.noWorkspace }}</p>

        <section class="ide-remote__sec">
          <div class="ide-remote__pathline">
            <button type="button" class="ide-remote__btn" data-testid="ide-remote-up" @click="up">{{ tx.up }}</button>
            <code class="ide-remote__path" data-testid="ide-remote-path">{{ path || '—' }}</code>
          </div>
          <p v-if="error" class="ide-remote__error" data-testid="ide-remote-list-error">{{ error }}</p>
          <p v-else-if="listLoading" class="ide-remote__hint">…</p>
          <p v-else-if="!entries.length" class="ide-remote__hint" data-testid="ide-remote-empty">{{ tx.emptyDir }}</p>
          <ul v-else class="ide-remote__entries" data-testid="ide-remote-entries">
            <li v-for="e in entries" :key="e.path">
              <button type="button" class="ide-remote__entry" :class="{ 'is-dir': e.isDir }" :disabled="!e.isDir" @click="openEntry(e)">
                <span class="ide-remote__icon">{{ e.isDir ? '▸' : '·' }}</span>
                <span class="ide-remote__name">{{ e.name }}</span>
                <span class="ide-remote__size">{{ e.isDir ? '' : e.size }}</span>
              </button>
            </li>
          </ul>
          <p class="ide-remote__muted">{{ tx.truncated }}</p>
        </section>

        <div class="ide-remote__row">
          <button type="button" class="ide-remote__btn" data-testid="ide-remote-template" @click="copyTemplate">{{ copied ? tx.templateCopied : tx.copyTemplate }}</button>
        </div>
        <p class="ide-remote__muted">{{ tx.readonly }}</p>
        <p class="ide-remote__muted">{{ tx.wsl }}</p>
      </template>
      <p v-else class="ide-remote__error" data-testid="ide-remote-error">{{ error }}</p>
    </div>
  </div>
</template>

<style scoped lang="scss">
.ide-remote { display: flex; flex-direction: column; min-height: 0; height: 100%; font-size: 12px; }
.ide-remote__head { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-bottom: 1px solid var(--border-color); }
.ide-remote__spacer { flex: 1; }
.ide-remote__body { flex: 1; min-height: 0; overflow: auto; padding: 8px 10px 16px; }
.ide-remote__row { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0; align-items: center; }
.ide-remote__chip { border: 1px solid var(--border-color); border-radius: 999px; padding: 1px 8px; font-size: 10.5px; color: var(--text-muted); }
.ide-remote__chip.is-ok { color: var(--success-color); border-color: var(--success-color); }
.ide-remote__chip.is-bad { color: var(--error-color); border-color: var(--error-color); }
.ide-remote__sec { border-top: 1px dashed var(--border-color); padding-top: 8px; margin-top: 8px; }
.ide-remote__sec h4 { margin: 0 0 4px; font-size: 12px; }
.ide-remote__facts { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; color: var(--text-secondary); }
.ide-remote__muted { color: var(--text-muted); margin: 4px 0 0; line-height: 1.5; }
.ide-remote__hint { color: var(--text-muted); padding: 6px 0; line-height: 1.5; }
.ide-remote__error { color: var(--error-color); line-height: 1.5; word-break: break-word; }
.ide-remote__btn { border: 1px solid var(--border-color); background: transparent; color: var(--text-primary); border-radius: 6px; padding: 3px 8px; font-size: 11px; cursor: pointer; }
.ide-remote__btn:hover:not(:disabled) { border-color: var(--primary-color); color: var(--primary-color); }
.ide-remote__pathline { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
.ide-remote__path { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10.5px; color: var(--text-muted); word-break: break-all; flex: 1; }
.ide-remote__entries { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 1px; max-height: 320px; overflow: auto; }
.ide-remote__entry { width: 100%; display: flex; align-items: center; gap: 6px; border: none; background: transparent; color: var(--text-primary); padding: 3px 4px; border-radius: 4px; cursor: pointer; text-align: left; font-size: 11.5px; }
.ide-remote__entry.is-dir:hover { background: var(--hover-color, rgba(0, 0, 0, .06)); }
.ide-remote__entry:disabled { cursor: default; color: var(--text-muted); }
.ide-remote__icon { width: 12px; color: var(--text-muted); }
.ide-remote__name { flex: 1; word-break: break-all; }
.ide-remote__size { color: var(--text-muted); font-size: 10px; }
</style>
