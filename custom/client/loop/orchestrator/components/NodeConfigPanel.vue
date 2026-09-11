<!-- overlay/custom/client/loop/orchestrator/components/NodeConfigPanel.vue -->
<!-- P4 T6 —— 选中节点的配置表单：id 只读、label 通用、type 特定 config。
     config 形状的事实源是服务端 spec-runtime.ts 各节点工厂的读取口径；
     converge 的 joinMode:'all' 不在表单里——序列化（canvasToSpec）时写死。
     组件薄壳：本地镜像编辑，watch 汇成整份 config emit('update')，
     通道脚手架联动由父层 updateNodeConfig 承担。 -->
<script setup lang="ts">
import { nextTick, ref, watch, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { CanvasNode } from '../adapters/editor'

const props = defineProps<{
  node: CanvasNode | null
  /** 当前入口（入口徽标 + "设为入口"动作） */
  entryNode: string | null
}>()

const emit = defineEmits<{
  (e: 'update', config: Record<string, unknown>): void
  (e: 'remove', nodeId: string): void
  (e: 'set-entry', nodeId: string): void
}>()

const { t } = useI18n()

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback

// ── 本地镜像（node 切换时重置；变更即汇成整份 config 上抛）──
const label = ref('')
const prompt = ref('')
const policy = ref<'all' | 'any' | 'majority' | 'specified'>('any')
const approversText = ref('')            // 逗号分隔 → approvals.approvers[]
const rejectTarget = ref('')             // 空 = 'fail'
const planText = ref('')
const todoText = ref('')                 // 每行一条 → todo[]
const onReject = ref('fail')
const collectChannel = ref('')
const winnerChannel = ref('')
const expect = ref(2)
const pick = ref<'human' | 'score'>('human')
const scorePath = ref('')
const variant = ref('')
const score = ref<number | null>(null)
const command = ref('')
const channel = ref('')
const setText = ref('{}')                // function.set / bo-n-variant.payload 的 JSON 面板
const payloadText = ref('null')

/** JSON 文本合法性（对象/任意 JSON 各自口径） */
const setParsed = computed<Record<string, unknown> | null>(() => {
  try {
    const v: unknown = JSON.parse(setText.value || '{}')
    return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null
  } catch {
    return null
  }
})
const payloadParsed = computed<unknown>(() => {
  try {
    return JSON.parse(payloadText.value || 'null')
  } catch {
    return undefined // undefined = 非法（与合法 null 区分）
  }
})

const POLICIES = ['all', 'any', 'majority', 'specified'] as const

function resetMirror(node: CanvasNode | null): void {
  const c = node?.config ?? {}
  label.value = str(c.label)
  prompt.value = str(c.prompt)
  const approvals = (c.approvals ?? {}) as { policy?: string; approvers?: string[]; onReject?: { goto?: string } | 'fail' }
  policy.value = (POLICIES as readonly string[]).includes(String(approvals.policy)) ? approvals.policy as typeof policy.value : 'any'
  approversText.value = Array.isArray(approvals.approvers) ? approvals.approvers.join(',') : ''
  rejectTarget.value = approvals.onReject !== undefined && approvals.onReject !== 'fail' ? str(approvals.onReject.goto) : str(c.rejectTarget)
  planText.value = str(c.planText)
  todoText.value = Array.isArray(c.todo) ? c.todo.filter((x): x is string => typeof x === 'string').join('\n') : ''
  onReject.value = c.onReject === undefined ? 'fail' : str(c.onReject)
  collectChannel.value = str(c.collectChannel)
  winnerChannel.value = str(c.winnerChannel)
  expect.value = num(c.expect, 2)
  pick.value = c.pick === 'score' ? 'score' : 'human'
  scorePath.value = str(c.scorePath)
  variant.value = str(c.variant)
  score.value = typeof c.score === 'number' ? c.score : null
  command.value = str(c.command)
  channel.value = str(c.channel)
  setText.value = c.set !== undefined ? JSON.stringify(c.set, null, 0) : '{}'
  payloadText.value = c.payload !== undefined ? JSON.stringify(c.payload, null, 0) : 'null'
}

// 镜像重置抑制标记（选中切换不是编辑，不该把文档标脏）
const suppressing = ref(false)
watch(() => props.node, async (n) => {
  suppressing.value = true
  resetMirror(n)
  await nextTick()
  suppressing.value = false
}, { immediate: true })

/** 汇成整份 config（空串/缺省值省略键，保持 spec 干净） */
function assemble(nodeType: string): Record<string, unknown> {
  const config: Record<string, unknown> = {}
  if (label.value.trim()) config.label = label.value.trim()
  const lines = (s: string): string[] => s.split('\n').map(x => x.trim()).filter(x => x.length > 0)
  switch (nodeType) {
    case 'function':
      if (setParsed.value) config.set = setParsed.value
      break
    case 'human': {
      if (prompt.value.trim()) config.prompt = prompt.value.trim()
      const approvers = lines(approversText.value)
      config.approvals = {
        policy: policy.value,
        ...(approvers.length > 0 ? { approvers } : {}),
        onReject: rejectTarget.value.trim() ? { goto: rejectTarget.value.trim() } : 'fail',
      }
      break
    }
    case 'plan':
      if (planText.value.trim()) config.planText = planText.value.trim()
      config.todo = lines(todoText.value)
      if (onReject.value.trim() && onReject.value.trim() !== 'fail') config.onReject = onReject.value.trim()
      break
    case 'bo-n-variant':
      if (collectChannel.value.trim()) config.collectChannel = collectChannel.value.trim()
      if (variant.value.trim()) config.variant = variant.value.trim()
      if (payloadParsed.value !== undefined) config.payload = payloadParsed.value
      if (score.value !== null) config.score = score.value
      break
    case 'converge':
      config.expect = expect.value
      if (collectChannel.value.trim()) config.collectChannel = collectChannel.value.trim()
      if (winnerChannel.value.trim()) config.winnerChannel = winnerChannel.value.trim()
      config.pick = pick.value
      if (scorePath.value.trim()) config.scorePath = scorePath.value.trim()
      break
    case 'gate':
      if (command.value.trim()) config.command = command.value.trim()
      break
    case 'agent':
      if (channel.value.trim()) config.channel = channel.value.trim()
      break
    default:
      break // fanout 无 config
  }
  return config
}

// 任一镜像变更 → 整份 config 上抛（父层 updateNodeConfig 重算通道脚手架）
watch(
  [label, prompt, policy, approversText, rejectTarget, planText, todoText, onReject,
    collectChannel, winnerChannel, expect, pick, scorePath, variant, score, command, channel,
    setText, payloadText],
  () => {
    if (!props.node || suppressing.value) return
    // JSON 文本非法时不emit（保留用户输入，标红提示）
    if (props.node.type === 'function' && setParsed.value === null) return
    if (props.node.type === 'bo-n-variant' && payloadParsed.value === undefined) return
    emit('update', assemble(props.node.type))
  },
)

const isEntry = computed(() => props.node !== null && props.node.id === props.entryNode)
const nodeName = (type: string): string => t(`ia2.orchestrate.editor.node.${type}.name`)
</script>

<template>
  <aside v-if="props.node" class="ncp" data-config-panel :data-node-id="props.node.id">
    <header class="ncp__head">
      <h4 class="ncp__title">{{ t('ia2.orchestrate.editor.config.title') }}</h4>
      <span v-if="isEntry" class="ncp__entry-badge">{{ t('ia2.orchestrate.editor.config.entryBadge') }}</span>
      <button
        v-else
        class="ncp__set-entry"
        data-set-entry
        @click="emit('set-entry', props.node.id)"
      >
        {{ t('ia2.orchestrate.editor.config.setEntry') }}
      </button>
    </header>

    <div class="ncp__id-row">
      <label class="ncp__field">
        {{ t('ia2.orchestrate.editor.config.id') }}
        <input :value="props.node.id" data-cfg-id readonly class="ncp__input is-readonly">
      </label>
      <label class="ncp__field">
        {{ t('ia2.orchestrate.editor.config.type') }}
        <input :value="nodeName(props.node.type)" readonly class="ncp__input is-readonly">
      </label>
    </div>

    <label class="ncp__field">
      {{ t('ia2.orchestrate.editor.config.label') }}
      <input v-model="label" data-cfg-label class="ncp__input">
    </label>

    <!-- function：set JSON 面板 -->
    <template v-if="props.node.type === 'function'">
      <label class="ncp__field">
        {{ t('ia2.orchestrate.editor.config.cfg.set') }}
        <textarea v-model="setText" data-cfg-set rows="4" class="ncp__input ncp__input--mono" :class="{ 'is-invalid': setParsed === null }" />
      </label>
      <span v-if="setParsed === null" class="ncp__err">{{ t('ia2.orchestrate.editor.config.cfg.setInvalid') }}</span>
    </template>

    <!-- human：审批三元组 -->
    <template v-else-if="props.node.type === 'human'">
      <label class="ncp__field">
        {{ t('ia2.orchestrate.editor.config.cfg.prompt') }}
        <textarea v-model="prompt" data-cfg-prompt rows="3" class="ncp__input" />
      </label>
      <label class="ncp__field">
        {{ t('ia2.orchestrate.editor.config.cfg.policyLabel') }}
        <select v-model="policy" data-cfg-policy class="ncp__input">
          <option v-for="p in POLICIES" :key="p" :value="p">
            {{ t(`ia2.orchestrate.editor.config.cfg.policy.${p}`) }}
          </option>
        </select>
      </label>
      <label class="ncp__field">
        {{ t('ia2.orchestrate.editor.config.cfg.approvers') }}
        <input v-model="approversText" data-cfg-approvers class="ncp__input">
      </label>
      <label class="ncp__field">
        {{ t('ia2.orchestrate.editor.config.cfg.rejectTarget') }}
        <input v-model="rejectTarget" data-cfg-reject-target class="ncp__input">
      </label>
    </template>

    <!-- plan：可编辑计划 + 三出口 -->
    <template v-else-if="props.node.type === 'plan'">
      <label class="ncp__field">
        {{ t('ia2.orchestrate.editor.config.cfg.planText') }}
        <textarea v-model="planText" data-cfg-plan-text rows="3" class="ncp__input" />
      </label>
      <label class="ncp__field">
        {{ t('ia2.orchestrate.editor.config.cfg.todo') }}
        <textarea v-model="todoText" data-cfg-todo rows="3" class="ncp__input" />
      </label>
      <label class="ncp__field">
        {{ t('ia2.orchestrate.editor.config.cfg.onReject') }}
        <input v-model="onReject" data-cfg-on-reject class="ncp__input">
      </label>
    </template>

    <!-- fanout：无 config，结构提示 -->
    <p v-else-if="props.node.type === 'fanout'" class="ncp__hint">
      {{ t('ia2.orchestrate.editor.config.cfg.fanoutHint') }}
    </p>

    <!-- bo-n-variant：候选追加 -->
    <template v-else-if="props.node.type === 'bo-n-variant'">
      <label class="ncp__field">
        {{ t('ia2.orchestrate.editor.config.cfg.variant') }}
        <input v-model="variant" data-cfg-variant class="ncp__input">
      </label>
      <label class="ncp__field">
        {{ t('ia2.orchestrate.editor.config.cfg.collectChannel') }}
        <input v-model="collectChannel" data-cfg-collect class="ncp__input" placeholder="boN.candidates">
      </label>
      <label class="ncp__field">
        {{ t('ia2.orchestrate.editor.config.cfg.payload') }}
        <textarea v-model="payloadText" data-cfg-payload rows="3" class="ncp__input ncp__input--mono" :class="{ 'is-invalid': payloadParsed === undefined }" />
      </label>
      <label class="ncp__field">
        {{ t('ia2.orchestrate.editor.config.cfg.score') }}
        <input v-model.number="score" data-cfg-score type="number" step="any" class="ncp__input">
      </label>
    </template>

    <!-- converge：屏障收集 + 中选 -->
    <template v-else-if="props.node.type === 'converge'">
      <label class="ncp__field">
        {{ t('ia2.orchestrate.editor.config.cfg.expect') }}
        <input v-model.number="expect" data-cfg-expect type="number" min="1" step="1" class="ncp__input">
      </label>
      <label class="ncp__field">
        {{ t('ia2.orchestrate.editor.config.cfg.collectChannel') }}
        <input v-model="collectChannel" data-cfg-collect class="ncp__input" placeholder="boN.candidates">
      </label>
      <label class="ncp__field">
        {{ t('ia2.orchestrate.editor.config.cfg.winnerChannel') }}
        <input v-model="winnerChannel" data-cfg-winner class="ncp__input" placeholder="boN.winner">
      </label>
      <label class="ncp__field">
        {{ t('ia2.orchestrate.editor.config.cfg.pickLabel') }}
        <select v-model="pick" data-cfg-pick class="ncp__input">
          <option value="human">{{ t('ia2.orchestrate.editor.config.cfg.pick.human') }}</option>
          <option value="score">{{ t('ia2.orchestrate.editor.config.cfg.pick.score') }}</option>
        </select>
      </label>
      <label class="ncp__field">
        {{ t('ia2.orchestrate.editor.config.cfg.scorePath') }}
        <input v-model="scorePath" data-cfg-score-path class="ncp__input" placeholder="score">
      </label>
    </template>

    <!-- gate：命令白名单提示 -->
    <template v-else-if="props.node.type === 'gate'">
      <label class="ncp__field">
        {{ t('ia2.orchestrate.editor.config.cfg.command') }}
        <input v-model="command" data-cfg-command class="ncp__input">
      </label>
      <p class="ncp__hint">{{ t('ia2.orchestrate.editor.config.cfg.gateHint') }}</p>
    </template>

    <!-- agent：占位 -->
    <template v-else-if="props.node.type === 'agent'">
      <label class="ncp__field">
        {{ t('ia2.orchestrate.editor.config.cfg.channel') }}
        <input v-model="channel" data-cfg-channel class="ncp__input" placeholder="agentRequest">
      </label>
    </template>

    <button class="ncp__remove" data-remove-node @click="emit('remove', props.node.id)">
      {{ t('ia2.orchestrate.editor.config.remove') }}
    </button>
  </aside>
  <aside v-else class="ncp ncp--empty" data-config-panel-empty>
    <p class="ncp__hint">{{ t('ia2.orchestrate.editor.config.noSelection') }}</p>
  </aside>
</template>

<style scoped>
.ncp {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-standard, 6px);
  background: var(--bg-card);
  font-size: 12px;
  overflow: auto;
}
.ncp__head { display: flex; align-items: center; gap: 8px; }
.ncp__title { margin: 0; font-size: 13px; font-weight: 600; color: var(--text-primary); }
.ncp__entry-badge {
  padding: 0 6px;
  border: 1px solid var(--accent-primary, var(--color-primary, #3b82f6));
  border-radius: var(--radius-pill, 999px);
  font-size: 10px;
  color: var(--accent-primary, var(--color-primary, #3b82f6));
}
.ncp__set-entry, .ncp__remove {
  border: 1px solid var(--border-color);
  border-radius: var(--radius-micro, 3px);
  background: transparent;
  color: inherit;
  font-size: 11px;
  font-family: inherit;
  cursor: pointer;
  padding: 2px 8px;
}
.ncp__set-entry { margin-left: auto; }
.ncp__remove {
  margin-top: 8px;
  align-self: flex-start;
  color: var(--error, var(--color-danger, #e11d48));
  border-color: var(--error, var(--color-danger, #e11d48));
}
.ncp__id-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.ncp__field {
  display: flex;
  flex-direction: column;
  gap: 3px;
  color: var(--text-secondary);
  font-size: 11px;
}
.ncp__input {
  padding: 4px 6px;
  border: 1px solid var(--border-color);
  border-radius: 3px;
  background: var(--color-bg-input, transparent);
  color: inherit;
  font-size: 12px;
  font-family: inherit;
  box-sizing: border-box;
  width: 100%;
}
.ncp__input--mono { font-family: var(--font-mono, ui-monospace, monospace); font-size: 11px; }
.ncp__input.is-readonly { opacity: 0.65; cursor: default; }
.ncp__input.is-invalid { border-color: var(--error, var(--color-danger, #e11d48)); }
.ncp__err { font-size: 11px; color: var(--error, var(--color-danger, #e11d48)); }
.ncp__hint {
  margin: 0;
  font-size: 11px;
  color: var(--text-muted, var(--color-text-secondary, #878c99));
  line-height: 1.5;
}
</style>
