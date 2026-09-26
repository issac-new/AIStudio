<script setup lang="ts">
// IdeMentionPicker — @提及六源自动补全面板（复刻 zcode @六源系统+cc 文件/行区间
// 引用+dsh '@' 触发管线；UI 复刻 S2）。数据面=mention-resolution（六源前缀词表+
// resolveMentions 解析）。形态：@ 弹出六源菜单→选源→目标输入→生成 @kind:target
// chip 暂存→发送时拼入消息（与派单裸 @ 语法同源）。
import { computed, ref } from 'vue'
import { useChatStore } from '@/stores/hermes/chat'
import { resolveMentions, type MentionKind } from '../utils/mention-resolution'

const chatStore = useChatStore()
const open = ref(false)
const kind = ref<MentionKind>('file')
const target = ref('')
const staged = ref<Array<{ raw: string; kind: MentionKind }>>([])
const draft = ref('')

const SOURCES: Array<{ kind: MentionKind; label: string; hint: string }> = [
  { kind: 'file', label: '文件', hint: 'src/a.ts 或 src/a.ts:10-20 行区间' },
  { kind: 'session', label: '会话', hint: '会话 id 引用' },
  { kind: 'skill', label: '技能', hint: '技能名（skills=commands 合并口径）' },
  { kind: 'plugin', label: '插件', hint: '插件名' },
  { kind: 'subagent', label: '子代理', hint: '子代理 id' },
  { kind: 'whiteboard', label: '画板', hint: '画板区域引用' },
]

function stage(): void {
  const raw = `@${kind.value}:${target.value.trim()}`
  if (!target.value.trim()) return
  staged.value = [...staged.value, { raw, kind: kind.value }]
  target.value = ''
  open.value = false
}

function unstage(index: number): void {
  staged.value = staged.value.filter((_, i) => i !== index)
}

/** 发送：引用 chips 前缀 + 草稿正文（一次投递）。 */
function send(): void {
  const prefix = staged.value.map((s) => s.raw).join(' ')
  const text = prefix ? `${prefix} ${draft.value}`.trim() : draft.value.trim()
  if (!text) return
  const refs = resolveMentions(text)
  void chatStore.sendMessage?.(text)
  staged.value = []
  draft.value = ''
}

const preview = computed(() => resolveMentions([...staged.value.map((s) => s.raw), draft.value].join(' ')))
</script>

<template>
  <div class="ide-mention" data-testid="ide-mention-picker">
    <div class="ide-mention__row">
      <button type="button" class="ide-mention__at" data-testid="ide-mention-open" :title="'@ 六源引用（file/session/skill/plugin/subagent/whiteboard）'" @click="open = !open">@</button>
      <input
        v-model="draft"
        class="ide-mention__input"
        data-testid="ide-mention-draft"
        placeholder="消息正文（引用 chips 会随消息发出）"
        @keydown.enter.prevent="send"
      />
      <button type="button" class="ide-mention__send" data-testid="ide-mention-send" :disabled="!draft.trim() && !staged.length" @click="send">发送</button>
    </div>
    <div v-if="staged.length" class="ide-mention__chips" data-testid="ide-mention-chips">
      <span v-for="(s, i) in staged" :key="i" class="ide-mention__chip">
        {{ s.raw }}
        <button type="button" class="ide-mention__x" :data-testid="`ide-mention-unstage-${i}`" @click="unstage(i)">✕</button>
      </span>
    </div>
    <div v-if="open" class="ide-mention__menu" data-testid="ide-mention-menu">
      <button
        v-for="s in SOURCES"
        :key="s.kind"
        type="button"
        class="ide-mention__src"
        :class="{ 'is-active': kind === s.kind }"
        :data-testid="`ide-mention-src-${s.kind}`"
        :title="s.hint"
        @click="kind = s.kind"
      >{{ s.label }}<small>@{{ s.kind }}</small></button>
      <div class="ide-mention__form">
        <input v-model="target" class="ide-mention__target" :placeholder="SOURCES.find((x) => x.kind === kind)?.hint" :data-testid="'ide-mention-target'" @keydown.enter.prevent="stage" />
        <button type="button" class="ide-mention__stage" data-testid="ide-mention-stage" @click="stage">加入引用</button>
      </div>
    </div>
    <div v-if="preview.length" class="ide-mention__preview" data-testid="ide-mention-preview">
      {{ preview.length }} 条引用 · 六源 {{ preview.filter((r) => r.resolved).length }} 可解析
    </div>
  </div>
</template>

<style scoped lang="scss">
.ide-mention { margin: 4px 12px; font-size: 12px; position: relative; }
.ide-mention__row { display: flex; gap: 6px; align-items: center; }
.ide-mention__at {
  border: 1px solid var(--border-color, #e0e0e0); background: transparent; border-radius: 4px;
  width: 26px; height: 26px; cursor: pointer; font-weight: 600;
}
.ide-mention__input {
  flex: 1; border: 1px solid var(--border-color, #e0e0e0); border-radius: 5px; padding: 5px 10px;
  background: var(--card-color, #fff); color: inherit;
}
.ide-mention__send {
  border: none; background: var(--primary-color, #18a058); color: #fff; border-radius: 5px;
  padding: 5px 14px; cursor: pointer;
}
.ide-mention__send:disabled { opacity: 0.45; cursor: default; }
.ide-mention__chips { display: flex; gap: 4px; flex-wrap: wrap; margin: 4px 0; }
.ide-mention__chip {
  background: var(--hover-color, rgba(0, 0, 0, 0.06)); border-radius: 10px; padding: 1px 8px;
  display: inline-flex; gap: 4px; align-items: center;
}
.ide-mention__x { border: none; background: transparent; cursor: pointer; color: var(--text-color-3, #999); font-size: 10px; }
.ide-mention__menu {
  position: absolute; left: 30px; bottom: calc(100% + 4px); z-index: 50; width: 320px;
  background: var(--card-color, #fff); border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 8px; box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15); padding: 8px;
}
.ide-mention__src {
  border: none; background: transparent; border-radius: 5px; cursor: pointer;
  padding: 4px 10px; margin-right: 2px; font-size: 12px;
}
.ide-mention__src.is-active { background: var(--hover-color, rgba(0, 0, 0, 0.08)); color: var(--primary-color, #18a058); }
.ide-mention__src small { color: var(--text-color-3, #999); margin-left: 4px; }
.ide-mention__form { display: flex; gap: 6px; margin-top: 8px; }
.ide-mention__target {
  flex: 1; border: 1px solid var(--border-color, #e0e0e0); border-radius: 5px; padding: 4px 8px;
  background: var(--card-color, #fff); color: inherit;
}
.ide-mention__stage {
  border: 1px solid var(--primary-color, #18a058); background: transparent; color: var(--primary-color, #18a058);
  border-radius: 5px; padding: 4px 10px; cursor: pointer;
}
.ide-mention__preview { color: var(--text-color-3, #999); font-size: 11px; margin-top: 2px; }
</style>
