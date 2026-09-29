<script setup lang="ts">
// IdeKnowledgeBar — 知识闭环条（消除外部依赖 D2：semantica 已实装于
// ~/.hermes/config.yaml mcp_servers.semantica，KG 持久化 env 就绪）。
// ① /learn 沉淀入口（learndistill 归宿判定：反馈文本→rules/skills/memory 三归宿
//    提示——distillTarget 纯函数，启发式 projectScoped/procedural 判定）；
// ② 知识贡献判定（knowledge shouldContribute：通用性达线才入库）；
// ③ semantica 状态（fetchMcpServers 里的 semantica 条目=工具面在线）。
// agent 侧检索/回写走会话内 MCP 工具（extract_entities/query_graph 等 15 只）。
import { computed, onMounted, ref } from 'vue'
import { useChatStore } from '@/stores/hermes/chat'
import { distillTarget } from '../../../server/learndistill/learn-distill'
import { shouldContribute } from '../../../server/knowledge/knowledge-loop'
import { fetchMcpServers } from '@/api/hermes/mcp'

const chat = useChatStore()
const open = ref(false)
const feedbackText = ref('')
const semanticaOnline = ref<boolean | null>(null)

onMounted(async () => {
  try {
    const res = await fetchMcpServers()
    const s = (res.servers ?? []).find((x) => /semantica/i.test(x.name ?? ''))
    semanticaOnline.value = Boolean(s)
  } catch {
    semanticaOnline.value = null
  }
})

/** 归宿判定启发式：项目范围/流程化从文本特征推。 */
const distill = computed(() => {
  const text = feedbackText.value.trim()
  if (!text) return null
  return distillTarget({
    text,
    projectScoped: /这个项目|本项目|这个仓库|this project|repo/i.test(text),
    procedural: /每次|流程|步骤|先.*再|always|每次都/i.test(text),
  })
})

function sendLearn(): void {
  const text = feedbackText.value.trim()
  if (!text) return
  void chat.sendMessage(`/learn ${text}`)
  feedbackText.value = ''
  open.value = false
}

function sendKnowledgeContribute(): void {
  const text = feedbackText.value.trim()
  if (!text) return
  // 贡献判定（通用性由文本特征粗估：含普适动词/无专有名词=高）：达线才回写。
  const reusability = /[通用|总是|应该|最佳|原则|规范]/.test(text) && !/[A-Z][a-z]+项目|本期|这次/.test(text) ? 0.8 : 0.4
  const verdict = shouldContribute(text, reusability)
  if (!verdict.contribute) {
    window.alert(`未入库：${verdict.reason}`)
    return
  }
  void chat.sendMessage(`请用 semantica 知识工具把以下知识入库（add_entity/add_relationship + update_node 摘要）：${text}`)
  feedbackText.value = ''
  open.value = false
}
</script>

<template>
  <div class="ide-know" data-testid="ide-knowledge-bar">
    <button type="button" class="ide-know__btn" title="知识闭环（/learn 沉淀+知识库贡献）" data-testid="ide-know-open" @click="open = !open">
      ⛁ <span class="ide-know__dot" :data-state="semanticaOnline === null ? 'unknown' : semanticaOnline ? 'on' : 'off'" :title="semanticaOnline ? 'semantica MCP 在线（15 知识工具）' : 'semantica 未上線（hermes mcp install semantica）'" />
    </button>
    <div v-if="open" class="ide-know__panel" data-testid="ide-know-panel">
      <div class="ide-know__head">知识沉淀（/learn 三归宿）</div>
      <textarea v-model="feedbackText" class="ide-know__input" rows="3" placeholder="例：这个项目发布前必须跑全量测试 / 每次评审都先看风险清单" data-testid="ide-know-input" />
      <p v-if="distill" class="ide-know__verdict" data-testid="ide-know-verdict">归宿：{{ distill.target }} —— {{ distill.reason }}</p>
      <div class="ide-know__actions">
        <button type="button" class="ide-know__act" data-testid="ide-know-learn" :disabled="!feedbackText.trim()" @click="sendLearn">/learn 沉淀</button>
        <button type="button" class="ide-know__act" data-testid="ide-know-contribute" :disabled="!feedbackText.trim()" @click="sendKnowledgeContribute">入知识库（通用性判定）</button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.ide-know { position: relative; display: inline-block; }
.ide-know__btn { border: none; background: transparent; cursor: pointer; font-size: 13px; padding: 0 4px; color: var(--text-color-3, #999); display: inline-flex; align-items: center; gap: 3px; &:hover { color: var(--text-color-1, #333); } }
.ide-know__dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block;
  &[data-state='on'] { background: var(--success-color, #18a058); }
  &[data-state='off'] { background: var(--error-color, #d03050); }
  &[data-state='unknown'] { background: var(--text-color-3, #bbb); } }
.ide-know__panel { position: absolute; bottom: calc(100% + 6px); right: 0; z-index: 95; background: var(--card-color, #fff); border: 1px solid var(--border-color, #e0e0e0); border-radius: 6px; padding: 8px 10px; min-width: 300px; max-width: 400px; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12); font-size: 11px; }
.ide-know__head { font-weight: 600; margin-bottom: 4px; }
.ide-know__input { width: 100%; border: 1px solid var(--border-color, #e0e0e0); border-radius: 4px; font-size: 11px; padding: 4px 6px; resize: vertical; background: var(--bg-primary, #fff); color: var(--text-color-1, #333); box-sizing: border-box; }
.ide-know__verdict { color: var(--info-color, #2080f0); margin: 4px 0; }
.ide-know__actions { display: flex; gap: 6px; }
.ide-know__act { flex: 1; border: 1px solid var(--primary-color, #18a058); color: var(--primary-color, #18a058); background: transparent; border-radius: 4px; font-size: 11px; padding: 2px 0; cursor: pointer; &:disabled { opacity: 0.5; cursor: default; } }
</style>
