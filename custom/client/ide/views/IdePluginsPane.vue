<script setup lang="ts">
// IdePluginsPane — G7 插件目录：聚合 Hermes 技能 / MCP 服务 / zcode 插件（只读）。
// 技能可启停、MCP 可重载/测试（全部走既有 API）；zcode 插件只列不装（需宿主通道）。
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { request } from '@/api/client'
import { fetchSkills, toggleSkill, type SkillInfo } from '@/api/hermes/skills'
import { fetchMcpServers, mcpReload, mcpServerTest, type McpServerInfo } from '@/api/hermes/mcp'
import { IDE_LOCAL_TEXT, ideLocaleOf } from '../i18n'

const { locale } = useI18n()
const tx = computed(() => IDE_LOCAL_TEXT[ideLocaleOf(locale)].plugins)

interface ZcodePlugin { name: string; version: string | null; root: string; path: string }
type Tab = 'all' | 'skills' | 'mcp' | 'zcode'

const tab = ref<Tab>('all')
const query = ref('')
const loading = ref(false)
const error = ref('')
const skills = ref<Array<SkillInfo & { category: string }>>([])
const mcp = ref<McpServerInfo[]>([])
const zcode = ref<ZcodePlugin[]>([])
const busy = ref<Record<string, string>>({})
const mcpResult = ref<Record<string, string>>({})

const q = computed(() => query.value.trim().toLowerCase())
function hit(...parts: Array<string | undefined>): boolean {
  if (!q.value) return true
  return parts.some((p) => String(p ?? '').toLowerCase().includes(q.value))
}
const skillsView = computed(() => skills.value.filter((s) => hit(s.name, s.description, s.category)))
const mcpView = computed(() => mcp.value.filter((s) => hit(s.name, s.transport, String(s.tools))))
const zcodeView = computed(() => zcode.value.filter((s) => hit(s.name, s.version ?? '')))

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const [skillData, mcpData] = await Promise.all([
      fetchSkills(),
      fetchMcpServers().catch(() => ({ servers: [], total_tools: 0, ok: false })),
    ])
    skills.value = (skillData.categories ?? []).flatMap((c) =>
      (c.skills ?? []).map((s) => ({ ...s, category: c.name })))
    mcp.value = mcpData.servers ?? []
    try {
      const z = await request<{ plugins?: ZcodePlugin[] }>('/api/ide/plugins/zcode')
      zcode.value = z.plugins ?? []
    } catch { zcode.value = [] }
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

async function toggle(s: SkillInfo): Promise<void> {
  busy.value[s.name] = 'toggle'
  try {
    await toggleSkill(s.name, !(s.enabled ?? true))
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    delete busy.value[s.name]
  }
}

async function act(s: McpServerInfo, kind: 'reload' | 'test'): Promise<void> {
  busy.value[s.name] = kind
  try {
    if (kind === 'reload') {
      const res = await mcpReload(s.name)
      mcpResult.value[s.name] = res.ok ? tx.value.ok : (res.error || tx.value.fail)
    } else {
      const res = await mcpServerTest(s.name)
      mcpResult.value[s.name] = res.ok ? `${tx.value.ok} · ${(res.tools ?? []).length} ${tx.value.tools}` : (res.error || tx.value.fail)
    }
  } catch (e) {
    mcpResult.value[s.name] = e instanceof Error ? e.message : String(e)
  } finally {
    delete busy.value[s.name]
  }
}

onMounted(() => void load())
</script>

<template>
  <div class="ide-plugins" data-testid="ide-plugins-pane">
    <header class="ide-plugins__head">
      <strong>{{ tx.title }}</strong>
      <span class="ide-plugins__spacer" />
      <button type="button" class="ide-plugins__btn" data-testid="ide-plugins-refresh" :disabled="loading" @click="load">{{ tx.refresh }}</button>
    </header>

    <div class="ide-plugins__tools">
      <input v-model="query" class="ide-plugins__search" type="search" :placeholder="tx.search" data-testid="ide-plugins-search">
      <div class="ide-plugins__tabs" role="tablist">
        <button v-for="k in (['all','skills','mcp','zcode'] as Tab[])" :key="k" type="button" class="ide-plugins__tab" :class="{ 'is-active': tab === k }" :data-testid="`ide-plugins-tab-${k}`" @click="tab = k">
          {{ k === 'all' ? tx.all : tx[k] }}
          <small>{{ k === 'all' ? skillsView.length + mcpView.length + zcodeView.length : k === 'skills' ? skillsView.length : k === 'mcp' ? mcpView.length : zcodeView.length }}</small>
        </button>
      </div>
    </div>

    <div class="ide-plugins__body">
      <p v-if="loading" class="ide-plugins__hint">…</p>
      <p v-else-if="error" class="ide-plugins__error" data-testid="ide-plugins-error">{{ error }}</p>
      <template v-else>
        <section v-if="tab === 'all' || tab === 'skills'" class="ide-plugins__sec" data-testid="ide-plugins-skills">
          <h4>{{ tx.skills }} <small>{{ skillsView.length }}</small></h4>
          <ul class="ide-plugins__list">
            <li v-for="s in skillsView" :key="s.name" class="ide-plugins__row">
              <div class="ide-plugins__meta">
                <span class="ide-plugins__name">{{ s.name }}</span>
                <span class="ide-plugins__tag">{{ s.category }}</span>
                <span class="ide-plugins__tag" :class="{ 'is-on': s.enabled !== false }">{{ s.enabled !== false ? tx.enabled : tx.disabled }}</span>
              </div>
              <p v-if="s.description" class="ide-plugins__desc">{{ s.description }}</p>
              <button type="button" class="ide-plugins__btn" :disabled="Boolean(busy[s.name])" :data-testid="`ide-plugins-skill-toggle-${s.name}`" @click="toggle(s)">
                {{ s.enabled !== false ? tx.disable : tx.enable }}
              </button>
            </li>
          </ul>
          <p v-if="!skillsView.length" class="ide-plugins__hint">{{ tx.empty }}</p>
        </section>

        <section v-if="tab === 'all' || tab === 'mcp'" class="ide-plugins__sec" data-testid="ide-plugins-mcp">
          <h4>{{ tx.mcp }} <small>{{ mcpView.length }}</small></h4>
          <ul class="ide-plugins__list">
            <li v-for="s in mcpView" :key="s.name" class="ide-plugins__row">
              <div class="ide-plugins__meta">
                <span class="ide-plugins__name">{{ s.name }}</span>
                <span class="ide-plugins__tag">{{ s.transport }}</span>
                <span class="ide-plugins__tag" :class="{ 'is-on': s.connected }">{{ s.connected ? tx.ok : tx.fail }}</span>
                <span class="ide-plugins__tag">{{ s.tools }} {{ tx.tools }}</span>
              </div>
              <p v-if="s.error" class="ide-plugins__desc is-bad">{{ s.error }}</p>
              <div class="ide-plugins__actions">
                <button type="button" class="ide-plugins__btn" :disabled="Boolean(busy[s.name])" @click="act(s, 'reload')">{{ tx.reload }}</button>
                <button type="button" class="ide-plugins__btn" :disabled="Boolean(busy[s.name])" @click="act(s, 'test')">{{ busy[s.name] === 'test' ? tx.testing : tx.test }}</button>
                <span v-if="mcpResult[s.name]" class="ide-plugins__result">{{ mcpResult[s.name] }}</span>
              </div>
            </li>
          </ul>
          <p v-if="!mcpView.length" class="ide-plugins__hint">{{ tx.empty }}</p>
        </section>

        <section v-if="tab === 'all' || tab === 'zcode'" class="ide-plugins__sec" data-testid="ide-plugins-zcode">
          <h4>{{ tx.zcode }} <small>{{ zcodeView.length }}</small></h4>
          <ul class="ide-plugins__list">
            <li v-for="p in zcodeView" :key="p.path" class="ide-plugins__row">
              <div class="ide-plugins__meta">
                <span class="ide-plugins__name">{{ p.name }}</span>
                <span class="ide-plugins__tag">{{ p.version ?? '—' }}</span>
              </div>
              <p class="ide-plugins__desc ide-plugins__mono">{{ p.path }}</p>
            </li>
          </ul>
          <p v-if="!zcodeView.length" class="ide-plugins__hint">{{ tx.empty }}</p>
          <p class="ide-plugins__hint">{{ tx.readonly }}</p>
        </section>
      </template>
    </div>
  </div>
</template>

<style scoped lang="scss">
.ide-plugins { display: flex; flex-direction: column; min-height: 0; height: 100%; font-size: 12px; }
.ide-plugins__head { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-bottom: 1px solid var(--border-color); }
.ide-plugins__spacer { flex: 1; }
.ide-plugins__tools { padding: 6px 10px; display: flex; flex-direction: column; gap: 6px; border-bottom: 1px dashed var(--border-color); }
.ide-plugins__search { width: 100%; background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 4px 8px; font-size: 12px; }
.ide-plugins__tabs { display: flex; gap: 4px; flex-wrap: wrap; }
.ide-plugins__tab { border: 1px solid var(--border-color); background: transparent; color: var(--text-muted); border-radius: 999px; padding: 1px 8px; font-size: 10.5px; cursor: pointer; }
.ide-plugins__tab.is-active { color: var(--primary-color); border-color: var(--primary-color); }
.ide-plugins__tab small { margin-left: 4px; color: var(--text-muted); }
.ide-plugins__body { flex: 1; min-height: 0; overflow: auto; padding: 8px 10px 16px; }
.ide-plugins__sec { border-bottom: 1px dashed var(--border-color); padding: 6px 0 8px; }
.ide-plugins__sec h4 { margin: 0 0 6px; font-size: 12px; }
.ide-plugins__sec h4 small { color: var(--text-muted); font-weight: 400; margin-left: 6px; }
.ide-plugins__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.ide-plugins__row { display: flex; flex-direction: column; gap: 4px; border: 1px solid var(--border-color); border-radius: 8px; padding: 6px 8px; }
.ide-plugins__meta { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.ide-plugins__name { color: var(--text-primary); font-weight: 600; font-size: 12px; }
.ide-plugins__tag { color: var(--text-muted); border: 1px solid var(--border-color); border-radius: 4px; padding: 0 5px; font-size: 10px; }
.ide-plugins__tag.is-on { color: var(--success-color); border-color: var(--success-color); }
.ide-plugins__desc { margin: 0; color: var(--text-muted); line-height: 1.5; font-size: 11px; }
.ide-plugins__desc.is-bad { color: var(--error-color); }
.ide-plugins__mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; word-break: break-all; }
.ide-plugins__actions { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.ide-plugins__btn { align-self: flex-start; border: 1px solid var(--border-color); background: transparent; color: var(--text-primary); border-radius: 6px; padding: 2px 8px; font-size: 11px; cursor: pointer; }
.ide-plugins__btn:hover:not(:disabled) { border-color: var(--primary-color); color: var(--primary-color); }
.ide-plugins__hint { color: var(--text-muted); padding: 4px 0; line-height: 1.5; }
.ide-plugins__error { color: var(--error-color); line-height: 1.5; }
.ide-plugins__result { color: var(--text-muted); font-size: 10.5px; }
</style>
