<script setup lang="ts">
// IdeWikiPane — 仓库 Wiki 面板（对标 zcode repoWiki + wikiReference 的本地对应物）：
//   数据源 = workspace 的 docs/wiki/ 目录（agent 生成的 wiki 页，markdown）。
//   页面列表 + 内容阅读 + 「引用当前页 / 引用整册」（目录摘要语义，对齐
//   wikiReference.referencePage/referenceWiki）+ 「生成 Wiki」prompt 复制
//   （生成引擎对应物 = 当前 codex 会话执行结构化 prompt，产物写回 docs/wiki/）。
// 云端 wiki 引擎不照搬（spec §三裁决），此为本地诚实对应物。
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMessage } from 'naive-ui'
import { listFiles, readFile } from '@/api/studio/files'
import MarkdownRenderer from '@/components/hermes/chat/MarkdownRenderer.vue'
import { useIdeStore } from '../store/ide'

const { t } = useI18n()
const message = useMessage()
const ide = useIdeStore()

interface WikiPage {
  path: string
  name: string
}

const WIKI_DIR = 'docs/wiki'
const pages = ref<WikiPage[]>([])
const loading = ref(false)
const loadError = ref<string | null>(null)
const selected = ref<WikiPage | null>(null)
const content = ref('')
const contentLoading = ref(false)

const hasWorkspace = computed(() => Boolean(ide.workspace))

async function loadPages(): Promise<void> {
  if (!hasWorkspace.value) return
  loading.value = true
  loadError.value = null
  try {
    // 目录树较浅（分组一层），两轮遍历足够 MVP；更深的层级随生成规范固定
    const root = await listFiles(WIKI_DIR, ide.workspace!)
    const collected: WikiPage[] = []
    const walk = async (dirPath: string): Promise<void> => {
      const res = await listFiles(dirPath, ide.workspace!)
      for (const entry of res.entries) {
        if (entry.type === 'directory') await walk(`${dirPath}/${entry.name}`)
        else if (entry.name.endsWith('.md')) {
          collected.push({ path: `${dirPath}/${entry.name}`, name: entry.name.replace(/\.md$/, '') })
        }
      }
    }
    for (const entry of root.entries) {
      if (entry.type === 'directory') await walk(`${WIKI_DIR}/${entry.name}`)
      else if (entry.name.endsWith('.md')) {
        collected.push({ path: `${WIKI_DIR}/${entry.name}`, name: entry.name.replace(/\.md$/, '') })
      }
    }
    pages.value = collected
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : String(err)
  } finally {
    loading.value = false
  }
}

async function openPage(page: WikiPage): Promise<void> {
  selected.value = page
  contentLoading.value = true
  content.value = ''
  try {
    const res = await readFile(page.path, ide.workspace!)
    content.value = res.content
  } catch (err) {
    message.error(t('ide.wiki.loadFailed', { message: err instanceof Error ? err.message : '' }))
  } finally {
    contentLoading.value = false
  }
}

async function copyText(text: string, okKey: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    message.success(t(okKey))
  } catch {
    message.error(t('ide.wiki.copyFailed'))
  }
}

function referencePage(): void {
  const page = selected.value
  if (!page) return
  void copyText(`[Wiki 引用：${page.name}]\n路径：${page.path}\n\n${content.value}`, 'ide.wiki.referenced')
}

function referenceWhole(): void {
  if (!pages.value.length) return
  // 整册引用 = 目录摘要（标题/路径），不灌全文（对齐 wikiReference.wholeWikiDescription）
  const catalog = pages.value.map(p => `- ${p.name}（${p.path}）`).join('\n')
  void copyText(`[Wiki 整册引用：目录摘要]\n${catalog}`, 'ide.wiki.referenced')
}

function copyGeneratePrompt(): void {
  const prompt = [
    `请为本仓库生成 Wiki 到 ${WIKI_DIR}/ 目录，规则：`,
    '1. 先浏览仓库结构（README、src/docs 目录、关键模块）；',
    '2. 生成首页 docs/wiki/index.md（项目简介 + 目录）；',
    '3. 每个主要模块/主题一页 markdown（标题、职责、关键文件路径、使用要点）；',
    '4. 全部写完后再更新 index.md 的目录链接。',
  ].join('\n')
  void copyText(prompt, 'ide.wiki.promptCopied')
}

onMounted(loadPages)
</script>

<template>
  <div class="ide-wiki" data-testid="ide-wiki-pane">
    <div class="ide-wiki__toolbar">
      <span class="ide-wiki__title">{{ t('ide.wiki.panelTitle') }}</span>
      <button type="button" class="ide-wiki__btn" :title="t('ide.wiki.referenceWiki')" @click="referenceWhole">{{ t('ide.wiki.referenceWiki') }}</button>
      <button type="button" class="ide-wiki__btn" :disabled="!selected" :title="t('ide.wiki.referencePage')" @click="referencePage">{{ t('ide.wiki.referencePage') }}</button>
      <button type="button" class="ide-wiki__btn ide-wiki__btn--primary" :title="t('ide.wiki.generate')" data-testid="ide-wiki-generate" @click="copyGeneratePrompt">{{ t('ide.wiki.generate') }}</button>
    </div>

    <p v-if="!hasWorkspace" class="ide-wiki__hint">{{ t('ide.wiki.needWorkspace') }}</p>
    <p v-else-if="loading" class="ide-wiki__hint">{{ t('ide.wiki.loading') }}</p>
    <p v-else-if="loadError" class="ide-wiki__hint">{{ t('ide.wiki.loadFailed', { message: loadError }) }}</p>
    <p v-else-if="!pages.length" class="ide-wiki__hint">{{ t('ide.wiki.empty') }}</p>

    <div v-else class="ide-wiki__body">
      <ul class="ide-wiki__list" data-testid="ide-wiki-list">
        <li
          v-for="p in pages"
          :key="p.path"
          class="ide-wiki__item"
          :class="{ 'is-active': selected?.path === p.path }"
          :data-testid="`ide-wiki-page-${p.name}`"
          @click="openPage(p)"
        >{{ p.name }}</li>
      </ul>
      <div class="ide-wiki__content">
        <p v-if="contentLoading" class="ide-wiki__hint">{{ t('ide.wiki.loading') }}</p>
        <MarkdownRenderer v-else-if="content" :content="content" />
        <p v-else class="ide-wiki__hint">{{ t('ide.wiki.noSelection') }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.ide-wiki {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.ide-wiki__toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border-color, #26292f);
}

.ide-wiki__title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--text-muted, #9aa0aa);
}

.ide-wiki__btn {
  flex-shrink: 0;
  border: 1px solid var(--border-color, #26292f);
  border-radius: 5px;
  background: transparent;
  color: var(--text-primary, #e6e6e6);
  font-size: 11px;
  padding: 3px 8px;
  cursor: pointer;

  &:hover:not(:disabled) { border-color: var(--accent-primary, #4cc9f0); }
  &:disabled { opacity: 0.4; cursor: not-allowed; }

  &--primary {
    border-color: color-mix(in srgb, var(--accent-primary, #4cc9f0) 50%, transparent);
    color: var(--accent-primary, #4cc9f0);
  }
}

.ide-wiki__hint {
  padding: 16px 12px;
  font-size: 12px;
  color: var(--text-muted, #9aa0aa);
}

.ide-wiki__body {
  flex: 1;
  min-height: 0;
  display: flex;
}

.ide-wiki__list {
  width: 40%;
  list-style: none;
  margin: 0;
  padding: 4px;
  overflow-y: auto;
  border-right: 1px solid var(--border-color, #26292f);
}

.ide-wiki__item {
  padding: 5px 8px;
  border-radius: 5px;
  font-size: 12px;
  color: var(--text-primary, #e6e6e6);
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  &:hover { background: var(--bg-tertiary, #242830); }
  &.is-active {
    background: color-mix(in srgb, var(--accent-primary, #4cc9f0) 12%, transparent);
    color: var(--accent-primary, #4cc9f0);
  }
}

.ide-wiki__content {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: 8px 10px;
  font-size: 12px;
}
</style>
