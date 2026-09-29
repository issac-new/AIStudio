<script setup lang="ts">
// IdeMcpPane — 右侧面板「MCP」页签（M3，kimi /mcp 状态面板 + /mcp-config
// 对话式配置入口的移植）。只读状态投影：fetchMcpServers（/api/hermes/mcp，
// cockpit 健康轮询同源）；两个动作：对话式配置（注入引导提示词到当前会话）、
// 跳 /hermes/mcp 管理页。
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useMessage } from 'naive-ui'
import type { McpServerInfo } from '@/api/hermes/mcp'
import { fetchMcpServers } from '@/api/hermes/mcp'
import { listFiles } from '@/api/studio/files'
import { useChatStore } from '@/stores/hermes/chat'
import { useIdeStore } from '../store/ide'
import { buildMcpConfigPrompt } from '../utils/mcpConfigPrompt'
import { fetchHermesSkills } from '../utils/hermes-skills'
import { buildSkillsLedger, skillsSummary, type SkillEntry } from '../utils/skills-ledger'
import { SEARCH_TIERS, searchVerdict, type SearchTier } from '../../../server/websearch/web-search-policy'
import { harnessReport } from '../../../server/harnesshealth/harness-health'

const { t } = useI18n()
const router = useRouter()
const message = useMessage()
const ide = useIdeStore()
const chatStore = useChatStore()

// ── 搜索策略（v2 批 websearch）：四档（codex off/light/full/agent）+判定展示 ──
const SEARCH_TEXT: Record<SearchTier, string> = { off: '关', light: '摘录', full: '完整', agent: '自决' }
const searchTier = ref<SearchTier>((() => {
  const saved = localStorage.getItem('ide_websearch_tier')
  return (SEARCH_TIERS as readonly string[]).includes(saved ?? '') ? saved as SearchTier : 'agent'
})())
watch(searchTier, (v) => {
  localStorage.setItem('ide_websearch_tier', v)
  applySearchPolicy(v)
})
/** 写穿（遗留清单 L5）：策略声明注入当前会话——声明式（agent 遵循取决于模型；
 *  引擎 web_search 工具参数面开窗后升配置式，记档）。 */
function applySearchPolicy(tier: SearchTier): void {
  const v = searchVerdict(tier)
  const text = `[web-search-policy] tier=${tier} allowed=${v.allowed} consumption=${v.consumption} —— ${v.detail}。后续 web_search 按此策略执行。`
  void chatStore.sendMessage(text)
}

const activeTab = ref<'mcp' | 'skills'>('mcp')
const skillEntries = ref<SkillEntry[]>([])
const skillsError = ref('')
const skillsLoading = ref(false)

const servers = ref<McpServerInfo[]>([])
const totalTools = ref(0)
const loadError = ref('')
const loading = ref(false)

async function load(): Promise<void> {
  loading.value = true
  try {
    const res = await fetchMcpServers()
    servers.value = res.servers ?? []
    totalTools.value = res.total_tools ?? 0
    loadError.value = res.error ?? ''
  } catch (err) {
    servers.value = []
    totalTools.value = 0
    loadError.value = err instanceof Error ? err.message : String(err)
  } finally {
    loading.value = false
  }
}

// ── 体检三维补齐（遗留清单 L1：memory/rules/automations 真数据面）──
// memory=workspace 记忆文件数（listFiles 同 IdeMemoryPane 口径）；rules=根规则
// 文件存在数（AGENTS.md/CLAUDE.md/.cursorrules/.clinerules）；automations=
// 列自动化清单（GET /api/column-automation/，455 真域）。五维齐后启用
// harnessReport 五维评分（原两维诚实版退役）。
const healthCounts = ref<Record<'rules' | 'memory' | 'automations', number>>({ rules: 0, memory: 0, automations: 0 })
const healthBroken = ref<Record<'rules' | 'memory' | 'automations', number>>({ rules: 0, memory: 0, automations: 0 })

async function loadHealth(): Promise<void> {
  const ws = ide.workspace
  if (!ws) return
  // memory + rules（一次 listFiles 根目录 + memory/ 子目录）
  try {
    const root = await listFiles('', ws)
    const ruleNames = ['AGENTS.md', 'CLAUDE.md', '.cursorrules', '.clinerules']
    healthCounts.value.rules = ruleNames.filter(n => root.entries.some(e => e.name === n && !e.isDir)).length
    const memNames = ['AGENTS.md', 'CLAUDE.md', 'MEMORY.md']
    let mem = memNames.filter(n => root.entries.some(e => e.name === n && !e.isDir)).length
    if (root.entries.some(e => e.name === 'memory' && e.isDir)) {
      const sub = await listFiles('memory', ws)
      mem += sub.entries.filter(e => !e.isDir && e.name.endsWith('.md')).length
    }
    healthCounts.value.memory = mem
  } catch { /* 无工作区文件面：0 维=poor 提示 */ }
  // automations（列自动化清单）
  try {
    const res = await fetch('/api/column-automation/')
    if (res.ok) {
      const body = await res.json() as { automations?: unknown[] } | Array<unknown>
      const list = Array.isArray(body) ? body : body.automations
      healthCounts.value.automations = Array.isArray(list) ? list.length : 0
    }
  } catch { /* 端点不可达=0 */ }
}

const HEALTH_LABEL: Record<string, string> = { rules: '规则', memory: '记忆', skills: '技能', mcp: 'MCP', automations: '自动化' }
const HEALTH_HINT: Record<string, string> = {
  rules: '规则体系（AGENTS.md/.cursorrules 等存在性计数）',
  memory: '记忆资产（根记忆文件+memory/ 目录）',
  skills: '技能资产',
  mcp: 'MCP 资产',
  automations: '列自动化（/api/column-automation 清单）',
}
const healthReport = computed(() => harnessReport({
  counts: { rules: healthCounts.value.rules, memory: healthCounts.value.memory, skills: skillEntries.value.length, mcp: servers.value.length, automations: healthCounts.value.automations },
  broken: { rules: healthBroken.value.rules, memory: healthBroken.value.memory, skills: 0, mcp: 0, automations: healthBroken.value.automations },
}))

onMounted(() => {
  void load()
  void loadSkills()
  void loadHealth()
})

async function loadSkills(): Promise<void> {
  skillsLoading.value = true
  try {
    const res = await fetchHermesSkills()
    skillEntries.value = buildSkillsLedger(res.rows)
    skillsError.value = ''
  } catch (err) {
    skillEntries.value = []
    skillsError.value = err instanceof Error ? err.message : String(err)
  } finally {
    skillsLoading.value = false
  }
}

const skillsSummaryView = computed(() => skillsSummary(skillEntries.value))

const connectedCount = computed(() => servers.value.filter((s) => s.connected).length)
const summary = computed(() =>
  `${connectedCount.value}/${servers.value.length} ${t('ide.mcp.connectedShort')} · ${totalTools.value} ${t('ide.mcp.toolsShort')}`)

const canChat = computed(() => Boolean(chatStore.activeSessionId))

// kimi 范式：无专用写工具——注入引导提示词，配置对话交给 agent 的
// 文件工具 + 编辑审批门（见 utils/mcpConfigPrompt.ts 头注）
function startConfigChat(): void {
  if (!canChat.value) return
  void chatStore.sendMessage(buildMcpConfigPrompt({ agentId: ide.agentId }))
  ide.setChatFocus()
  message.success(t('ide.mcp.configChatSent'))
}

function openManage(): void {
  void router.push('/hermes/mcp')
}
</script>

<template>
  <div class="ide-mcp" data-testid="ide-mcp-pane">
    <!-- 工作台体检条（吸收第一批 B1 v1，qoder 五维体检的诚实两维版）：
         skills/mcp 两维有数据面（fetchHermesSkills/fetchMcpServers），评分+欠账
         优化提示；rules/memory/automations 三维数据面未接（源模块归档/待接），
         不虚标——全数据面接通后升五维 harnessReport（harnesshealth 域记档）。 -->
    <div class="ide-mcp__health" data-testid="ide-harness-health">
      <span class="ide-mcp__health-title">体检</span>
      <span
        v-for="d in healthReport.dimensions" :key="d.dimension"
        class="ide-mcp__health-dim" :data-level="d.score"
        :data-testid="`ide-health-${d.dimension}`"
        :title="(HEALTH_HINT[d.dimension] ?? '') + (healthReport.optimizationCards.some(c => c.dimension === d.dimension) ? '（优化卡：' + (healthReport.optimizationCards.find(c => c.dimension === d.dimension)?.suggestion ?? '') + '）' : '')"
      >{{ HEALTH_LABEL[d.dimension] ?? d.dimension }} {{ d.score === 'good' ? `✓ ${d.detail}` : d.score === 'fair' ? `△ ${d.detail}` : `✗ ${d.detail}` }}</span>
      <!-- 搜索策略（v2 批 websearch，codex 四档）：档位选择+判定展示；域白名单
           可编（逗号分隔）。策略经 agent 会话提示词生效（写穿链路记档）。 -->
      <span class="ide-mcp__search" data-testid="ide-websearch-policy">
        <span class="ide-mcp__health-title">搜索</span>
        <button
          v-for="tier in SEARCH_TIERS" :key="tier"
          type="button" class="ide-mcp__search-tier"
          :class="{ 'is-on': searchTier === tier }"
          :data-testid="`ide-websearch-${tier}`"
          :title="searchVerdict(tier).detail"
          @click="searchTier = tier"
        >{{ SEARCH_TEXT[tier] }}</button>
      </span>
    </div>
    <header class="ide-mcp__head">
      <span class="ide-mcp__title">{{ t('ide.mcp.title') }}</span>
      <span class="ide-mcp__tabs">
        <button
          type="button"
          class="ide-mcp__tab"
          :class="{ 'is-active': activeTab === 'mcp' }"
          data-testid="ide-mcp-tab-mcp"
          @click="activeTab = 'mcp'"
        >MCP</button>
        <button
          type="button"
          class="ide-mcp__tab"
          :class="{ 'is-active': activeTab === 'skills' }"
          data-testid="ide-mcp-tab-skills"
          @click="activeTab = 'skills'"
        >{{ t('ide.skills.tab') }}</button>
      </span>
      <button
        type="button"
        class="ide-mcp__btn"
        data-testid="ide-mcp-refresh"
        :disabled="loading"
        @click="load"
      >{{ t('ide.mcp.refresh') }}</button>
    </header>

    <template v-if="activeTab === 'mcp'">
    <p v-if="servers.length" class="ide-mcp__summary" data-testid="ide-mcp-summary">{{ summary }}</p>
    <p v-else-if="loadError" class="ide-mcp__error" data-testid="ide-mcp-load-error">{{ loadError }}</p>
    <p v-else class="ide-mcp__empty" data-testid="ide-mcp-empty">{{ t('ide.mcp.empty') }}</p>

    <ul v-if="servers.length" class="ide-mcp__list">
      <li
        v-for="server in servers"
        :key="server.name"
        class="ide-mcp__server"
        :data-testid="`ide-mcp-server-${server.name}`"
      >
        <div class="ide-mcp__server-row">
          <span class="ide-mcp__dot" :class="server.connected ? 'is-on' : 'is-off'" />
          <span class="ide-mcp__name" :title="server.name">{{ server.name }}</span>
          <span class="ide-mcp__transport">{{ server.transport }}</span>
          <span class="ide-mcp__tools">{{ server.tools }} {{ t('ide.mcp.toolsShort') }}</span>
        </div>
        <div v-if="server.error" class="ide-mcp__server-error" :title="server.error">
          {{ t('ide.mcp.errorRow') }}: {{ server.error }}
        </div>
      </li>
    </ul>
    </template>

    <div v-if="activeTab === 'skills'" class="ide-mcp__skills" data-testid="ide-skills-list">
      <p v-if="skillsSummaryView.skills" class="ide-mcp__summary" data-testid="ide-skills-summary">
        {{ t('ide.skills.summary', { n: skillsSummaryView.skills, e: skillsSummaryView.enabled }) }}
      </p>
      <p v-else-if="skillsError" class="ide-mcp__error" data-testid="ide-skills-error">{{ skillsError }}</p>
      <p v-else class="ide-mcp__empty" data-testid="ide-skills-empty">{{ t('ide.skills.empty') }}</p>
      <ul v-if="skillEntries.length" class="ide-mcp__list">
        <li
          v-for="skill in skillEntries"
          :key="skill.name"
          class="ide-mcp__server"
          :data-testid="`ide-skill-${skill.name}`"
        >
          <div class="ide-mcp__server-row">
            <span class="ide-mcp__dot" :class="skill.enabled ? 'is-on' : 'is-off'" />
            <span class="ide-mcp__name" :title="skill.name">{{ skill.name }}</span>
            <span class="ide-mcp__transport">{{ skill.source }}</span>
          </div>
          <div v-if="skill.description" class="ide-mcp__skill-desc" :title="skill.description">
            {{ skill.description }}
          </div>
        </li>
      </ul>
    </div>

    <footer v-if="activeTab === 'mcp'" class="ide-mcp__actions">
      <button
        type="button"
        class="ide-mcp__btn ide-mcp__btn--primary"
        data-testid="ide-mcp-config-chat"
        :disabled="!canChat"
        :title="canChat ? '' : t('ide.mcp.chatMissing')"
        @click="startConfigChat"
      >{{ t('ide.mcp.configChat') }}</button>
      <button type="button" class="ide-mcp__btn" data-testid="ide-mcp-manage" @click="openManage">
        {{ t('ide.mcp.manage') }}
      </button>
    </footer>
  </div>
</template>

<style scoped lang="scss">
.ide-mcp {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 10px 12px;
  gap: 8px;
  overflow-y: auto;
  font-size: 12px;
}

.ide-mcp__tabs {
  display: inline-flex;
  gap: 4px;
}

.ide-mcp__tab {
  border: 1px solid var(--border-color, #ddd);
  background: transparent;
  border-radius: 4px;
  padding: 1px 8px;
  font-size: 11px;
  cursor: pointer;
}

.ide-mcp__tab.is-active {
  background: var(--primary-color, #18a058);
  color: var(--text-on-accent);
  border-color: var(--primary-color, #18a058);
}

.ide-mcp__skill-desc {
  color: var(--text-color-3, #999);
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ide-mcp__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.ide-mcp__title {
  font-weight: 600;
  color: var(--text-primary, #e6e6e6);
}

.ide-mcp__summary {
  margin: 0;
  color: var(--text-muted, #9aa0aa);
  font-variant-numeric: tabular-nums;
}

.ide-mcp__empty,
.ide-mcp__error {
  margin: 0;
  line-height: 1.6;
}

.ide-mcp__error { color: var(--error-color, #d03050); }

.ide-mcp__list {
  flex: 1;
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ide-mcp__server {
  padding: 6px 8px;
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 6px;
}

.ide-mcp__server-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.ide-mcp__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;

  &.is-on { background: var(--success-color, var(--success-color, #18a058)); }
  &.is-off { background: var(--error-color, #d03050); }
}

.ide-mcp__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-primary, #e6e6e6);
}

.ide-mcp__transport,
.ide-mcp__tools {
  flex-shrink: 0;
  color: var(--text-muted, #9aa0aa);
  font-family: ui-monospace, Menlo, monospace;
  font-size: 11px;
}

.ide-mcp__server-error {
  margin-top: 4px;
  color: var(--error-color, #d03050);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ide-mcp__actions {
  display: flex;
  gap: 6px;
}

.ide-mcp__btn {
  height: 26px;
  padding: 0 10px;
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 5px;
  background: transparent;
  color: var(--text-primary, #e6e6e6);
  font-size: 12px;
  cursor: pointer;

  &:hover:not(:disabled) { border-color: var(--accent-primary, #4cc9f0); }
  &:disabled { opacity: 0.4; cursor: not-allowed; }

  &--primary {
    flex: 1;
    border-color: color-mix(in srgb, var(--accent-primary, #4cc9f0) 50%, transparent);
    color: var(--accent-primary, #4cc9f0);
  }
}
.ide-mcp__health { display: flex; align-items: center; gap: 10px; padding: 4px 10px; font-size: 11px; border-bottom: 1px solid var(--border-color, #e0e0e0); }
.ide-mcp__health-title { font-weight: 600; color: var(--text-color-3, #999); }
.ide-mcp__health-dim { color: var(--text-color-2, #555);
  &[data-level='good'] { color: var(--success-color, #18a058); }
  &[data-level='poor'] { color: var(--warning-color, #f0a020); } }
.ide-mcp__search { display: inline-flex; align-items: center; gap: 3px; margin-left: auto; }
.ide-mcp__search-tier { border: 1px solid var(--border-color, #e0e0e0); border-radius: 8px; background: transparent; font-size: 10px; padding: 0 6px; cursor: pointer; color: var(--text-color-3, #999);
  &.is-on { color: var(--primary-color, #18a058); border-color: var(--primary-color, #18a058); } }
</style>
