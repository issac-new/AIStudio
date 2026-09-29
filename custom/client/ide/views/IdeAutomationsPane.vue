<script setup lang="ts">
// IdeAutomationsPane — IDE Automations 面板（A2，2026-09-29，Manus 2.0 Automations 吸收）。
// 规则列表（启停/删除）+ 新建表单（四类事件源：file/kanban/git/webhook）+ 测试触发 +
// 触发历史（reason/sessionId 可追溯）。REST：/api/ide/automations/*（patch 506 挂载）。
// 文案硬编码中文（overlay 侧栏面板既有风格，i18n 仅页签标题走 507）。
import { computed, onMounted, ref } from 'vue'
import { useMessage } from 'naive-ui'
import { useIdeStore } from '../store/ide'
import { authFetch } from '../utils/auth-fetch'

const ide = useIdeStore()
const message = useMessage()

interface SourceFilter {
  type: 'file' | 'kanban' | 'git' | 'webhook'
  pathPattern?: string
  board?: string
  toColumn?: string
  ref?: string
  source?: string
  eventType?: string
}
interface Rule {
  id: string
  name: string
  enabled: boolean
  workspacePath: string
  source: SourceFilter
  debounceMs: number
  agent: string
  promptTemplate: string
  createdAt: string
}
interface HistoryEntry {
  at: number
  ruleId: string
  ruleName: string
  eventCount: number
  truncated: boolean
  reason: string
  sessionId?: string
  commandId?: string
}

const rules = ref<Rule[]>([])
const history = ref<HistoryEntry[]>([])
const loading = ref(false)
const saving = ref(false)

// ── 新建表单 ──
const SOURCE_TYPES = ['file', 'kanban', 'git', 'webhook'] as const
const form = ref({
  name: '',
  workspacePath: '',
  sourceType: 'file' as (typeof SOURCE_TYPES)[number],
  pathPattern: '',
  board: '',
  toColumn: '',
  ref: '',
  webhookSource: '',
  eventType: '',
  debounceMs: 2000,
  promptTemplate: '',
})

const lastTriggerByRule = computed(() => {
  const map = new Map<string, HistoryEntry>()
  for (const h of [...history.value].reverse()) if (!map.has(h.ruleId)) map.set(h.ruleId, h)
  return map
})

async function load(): Promise<void> {
  loading.value = true
  try {
    const res = await authFetch('/api/ide/automations')
    if (!res.ok) {
      message.error(`加载失败 ${res.status}`)
      return
    }
    const body = (await res.json()) as { rules?: Rule[]; history?: HistoryEntry[] }
    rules.value = Array.isArray(body.rules) ? body.rules : []
    history.value = Array.isArray(body.history) ? body.history : []
  } catch (err) {
    message.error(err instanceof Error ? err.message : String(err))
  } finally {
    loading.value = false
  }
}

function buildSource(): SourceFilter {
  const f = form.value
  switch (f.sourceType) {
    case 'file': return { type: 'file', ...(f.pathPattern.trim() ? { pathPattern: f.pathPattern.trim() } : {}) }
    case 'kanban': return {
      type: 'kanban',
      ...(f.board.trim() ? { board: f.board.trim() } : {}),
      ...(f.toColumn.trim() ? { toColumn: f.toColumn.trim() } : {}),
    }
    case 'git': return { type: 'git', ...(f.ref.trim() ? { ref: f.ref.trim() } : {}) }
    case 'webhook': return {
      type: 'webhook',
      ...(f.webhookSource.trim() ? { source: f.webhookSource.trim() } : {}),
      ...(f.eventType.trim() ? { eventType: f.eventType.trim() } : {}),
    }
  }
}

async function createRule(): Promise<void> {
  const f = form.value
  if (!f.name.trim() || !f.promptTemplate.trim()) {
    message.warning('名称与任务模板必填')
    return
  }
  const ws = f.workspacePath.trim() || ide.workspace || ''
  if (!ws.startsWith('/')) {
    message.warning('workspace 须为绝对路径（未指定工作区时请手动填写）')
    return
  }
  saving.value = true
  try {
    const res = await authFetch('/api/ide/automations/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: f.name.trim(),
        workspacePath: ws,
        source: buildSource(),
        debounceMs: Number(f.debounceMs) || 2000,
        promptTemplate: f.promptTemplate.trim(),
      }),
    })
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; errors?: Record<string, string> }
    if (!res.ok || body.ok === false) {
      message.error(`创建失败：${body.errors ? Object.values(body.errors).join('；') : res.status}`)
      return
    }
    message.success('规则已创建')
    form.value.name = ''
    form.value.promptTemplate = ''
    await load()
  } catch (err) {
    message.error(err instanceof Error ? err.message : String(err))
  } finally {
    saving.value = false
  }
}

async function toggleRule(rule: Rule): Promise<void> {
  const res = await authFetch(`/api/ide/automations/rules/${encodeURIComponent(rule.id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: !rule.enabled }),
  })
  if (!res.ok) { message.error(`切换失败 ${res.status}`); return }
  await load()
}

async function deleteRule(rule: Rule): Promise<void> {
  const res = await authFetch(`/api/ide/automations/rules/${encodeURIComponent(rule.id)}`, { method: 'DELETE' })
  if (!res.ok) { message.error(`删除失败 ${res.status}`); return }
  message.success('已删除')
  await load()
}

/** 测试触发：按规则源类型构造样例事件 POST /events（file 规则演示注入；真实 file 走 watcher）。 */
async function testTrigger(rule: Rule): Promise<void> {
  const sample = rule.source.type === 'file'
    ? { type: 'file', workspacePath: rule.workspacePath, path: 'test/sample.ts' }
    : rule.source.type === 'kanban'
      ? { type: 'kanban', workspacePath: rule.workspacePath, board: rule.source.board ?? 'main', taskId: 'test-1', from: 'todo', to: rule.source.toColumn ?? 'doing' }
      : rule.source.type === 'git'
        ? { type: 'git', workspacePath: rule.workspacePath, ref: rule.source.ref ?? 'HEAD', commits: [{ sha: 'test0001', subject: 'test trigger' }] }
        : { type: 'webhook', workspacePath: rule.workspacePath, source: rule.source.source ?? 'test', eventType: rule.source.eventType ?? 'ping', detail: '手动测试' }
  const res = await authFetch('/api/ide/automations/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sample),
  })
  const body = (await res.json().catch(() => ({}))) as { ok?: boolean; matched?: number; scheduled?: number }
  if (!res.ok || body.ok === false) { message.error(`测试触发失败 ${res.status}`); return }
  message.info(body.scheduled ? `已入去抖窗口（命中 ${body.matched} 条规则）` : '无规则命中（检查 workspace 与过滤条件）')
  setTimeout(() => { void load() }, rule.debounceMs + 800)
}

function sourceLabel(rule: Rule): string {
  const s = rule.source
  switch (s.type) {
    case 'file': return `文件 ${s.pathPattern ?? '**'}`
    case 'kanban': return `看板 ${s.board ?? '*'} → ${s.toColumn ?? '*'}`
    case 'git': return `git ${s.ref ?? '*'}`
    case 'webhook': return `webhook ${s.source ?? '*'}/${s.eventType ?? '*'}`
  }
}

function formatTime(at: number): string {
  const d = new Date(at)
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

onMounted(() => { void load() })
</script>

<template>
  <div class="ide-auto" data-testid="ide-automations-pane">
    <div class="ide-auto__section">
      <div class="ide-auto__head">自动化规则（{{ rules.length }}）<span v-if="loading">…</span></div>
      <div v-if="!rules.length" class="ide-auto__empty">暂无规则。描述「看住什么、出现什么就做什么」——例如：看住 src/api，出现新文件就让代理补测试。</div>
      <div v-for="rule in rules" :key="rule.id" class="ide-auto__rule" :data-testid="`ide-automation-rule-${rule.id}`">
        <div class="ide-auto__rule-main">
          <span class="ide-auto__rule-dot" :class="{ 'is-on': rule.enabled }" />
          <span class="ide-auto__rule-name">{{ rule.name }}</span>
          <span class="ide-auto__rule-src">{{ sourceLabel(rule) }}</span>
        </div>
        <div class="ide-auto__rule-meta">
          {{ rule.debounceMs }}ms 去抖 · @{{ rule.agent }}
          <template v-if="lastTriggerByRule.get(rule.id)">
            · 最近 {{ formatTime(lastTriggerByRule.get(rule.id)!.at) }}（{{ lastTriggerByRule.get(rule.id)!.reason }}）
          </template>
        </div>
        <div class="ide-auto__rule-actions">
          <button type="button" class="ide-auto__btn" :data-testid="`ide-automation-test-${rule.id}`" @click="testTrigger(rule)">测试</button>
          <button type="button" class="ide-auto__btn" :data-testid="`ide-automation-toggle-${rule.id}`" @click="toggleRule(rule)">{{ rule.enabled ? '停用' : '启用' }}</button>
          <button type="button" class="ide-auto__btn is-danger" :data-testid="`ide-automation-delete-${rule.id}`" @click="deleteRule(rule)">删除</button>
        </div>
      </div>
    </div>

    <div class="ide-auto__section">
      <div class="ide-auto__head">新建规则</div>
      <div class="ide-auto__form">
        <input v-model="form.name" class="ide-auto__input" placeholder="规则名（如：新接口补测试）" data-testid="ide-automation-form-name" />
        <input v-model="form.workspacePath" class="ide-auto__input" :placeholder="`工作区绝对路径${ide.workspace ? '（默认当前工作区）' : ''}`" data-testid="ide-automation-form-ws" />
        <div class="ide-auto__row">
          <select v-model="form.sourceType" class="ide-auto__input" data-testid="ide-automation-form-type">
            <option v-for="t in SOURCE_TYPES" :key="t" :value="t">{{ t }}</option>
          </select>
          <input v-model.number="form.debounceMs" class="ide-auto__input is-narrow" type="number" min="200" max="60000" step="100" title="去抖窗口（毫秒）" />
        </div>
        <input v-if="form.sourceType === 'file'" v-model="form.pathPattern" class="ide-auto__input" placeholder="路径通配，如 src/api/**.ts（空=全部）" data-testid="ide-automation-form-pattern" />
        <template v-else-if="form.sourceType === 'kanban'">
          <div class="ide-auto__row">
            <input v-model="form.board" class="ide-auto__input" placeholder="board（空=任意）" />
            <input v-model="form.toColumn" class="ide-auto__input" placeholder="进入列（空=任意）" />
          </div>
        </template>
        <input v-else-if="form.sourceType === 'git'" v-model="form.ref" class="ide-auto__input" placeholder="ref，如 main（空=任意）" />
        <template v-else>
          <div class="ide-auto__row">
            <input v-model="form.webhookSource" class="ide-auto__input" placeholder="source（空=任意）" />
            <input v-model="form.eventType" class="ide-auto__input" placeholder="eventType（空=任意）" />
          </div>
        </template>
        <textarea v-model="form.promptTemplate" class="ide-auto__input is-area" placeholder="任务模板。占位符：{{paths}}（变更文件）、{{events}}（事件数据）、{{workspace}}" data-testid="ide-automation-form-template" />
        <button type="button" class="ide-auto__btn is-primary" :disabled="saving" data-testid="ide-automation-form-submit" @click="createRule">{{ saving ? '保存中…' : '创建规则' }}</button>
      </div>
    </div>

    <div class="ide-auto__section">
      <div class="ide-auto__head">触发历史（{{ history.length }}）</div>
      <div v-if="!history.length" class="ide-auto__empty">尚无触发。点规则行「测试」可走一遍完整链路（事件→去抖→派发→历史）。</div>
      <div v-for="(h, i) in history.slice(0, 20)" :key="`${h.at}-${i}`" class="ide-auto__hist" :data-testid="`ide-automation-hist-${i}`">
        <span class="ide-auto__hist-time">{{ formatTime(h.at) }}</span>
        <span class="ide-auto__hist-rule">{{ h.ruleName }}</span>
        <span class="ide-auto__hist-meta">{{ h.eventCount }} 事件 · {{ h.reason }}{{ h.sessionId ? ' · ' + h.sessionId.slice(0, 8) : '' }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.ide-auto { display: flex; flex-direction: column; gap: 14px; padding: 10px 12px; font-size: 12px; overflow-y: auto; height: 100%; }
.ide-auto__head { font-weight: 600; color: var(--text-color-2, #555); margin-bottom: 6px; }
.ide-auto__section { border-bottom: 1px solid var(--border-color, #eee); padding-bottom: 10px; }
.ide-auto__section:last-child { border-bottom: none; }
.ide-auto__empty { color: var(--text-color-3, #999); line-height: 1.6; }
.ide-auto__rule { padding: 6px 0; border: 1px solid var(--border-color, #eee); border-radius: 6px; padding: 8px; margin-bottom: 6px; }
.ide-auto__rule-main { display: flex; gap: 6px; align-items: center; }
.ide-auto__rule-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--text-color-4, #ccc); flex: 0 0 7px; }
.ide-auto__rule-dot.is-on { background: var(--primary-color, #18a058); }
.ide-auto__rule-name { font-weight: 600; }
.ide-auto__rule-src { color: var(--text-color-3, #999); font-size: 11px; }
.ide-auto__rule-meta { color: var(--text-color-3, #999); font-size: 11px; margin: 3px 0 5px 13px; }
.ide-auto__rule-actions { display: flex; gap: 6px; margin-left: 13px; }
.ide-auto__form { display: flex; flex-direction: column; gap: 6px; }
.ide-auto__row { display: flex; gap: 6px; }
.ide-auto__input {
  border: 1px solid var(--border-color, #e0e0e0); border-radius: 4px; padding: 4px 8px;
  font-size: 12px; background: transparent; color: inherit; min-width: 0; flex: 1;
}
.ide-auto__input.is-narrow { flex: 0 0 90px; }
.ide-auto__input.is-area { min-height: 64px; resize: vertical; font-family: inherit; }
.ide-auto__btn {
  border: 1px solid var(--border-color, #e0e0e0); background: transparent; border-radius: 4px;
  font-size: 11px; padding: 2px 10px; cursor: pointer; color: var(--text-color-2, #555);
}
.ide-auto__btn:hover { border-color: var(--primary-color, #18a058); color: var(--primary-color, #18a058); }
.ide-auto__btn.is-primary { border-color: var(--primary-color, #18a058); color: var(--primary-color, #18a058); font-weight: 600; }
.ide-auto__btn.is-danger:hover { border-color: var(--error-color, #d03050); color: var(--error-color, #d03050); }
.ide-auto__hist { display: flex; gap: 8px; padding: 2px 0; color: var(--text-color-3, #888); }
.ide-auto__hist-time { flex: 0 0 90px; }
.ide-auto__hist-rule { flex: 0 0 auto; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ide-auto__hist-meta { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
