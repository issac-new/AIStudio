<script setup lang="ts">
// IdeWikiPane — 仓库 Wiki 面板（对标 zcode repoWiki + wikiReference 的本地对应物）：
//   数据源 = workspace 的 docs/wiki/ 目录（agent 生成的 wiki 页，markdown）。
//   页面列表 + 内容阅读 + 「引用当前页 / 引用整册」（目录摘要语义，对齐
//   wikiReference.referencePage/referenceWiki）+ 「生成 Wiki」prompt 复制
//   （生成引擎对应物 = 当前 codex 会话执行结构化 prompt，产物写回 docs/wiki/）。
// 云端 wiki 引擎不照搬（spec §三裁决），此为本地诚实对应物。
//
// v2（2026-10-10 深化轮，调研落地）：
//   - meta 边车（.wiki-meta.json）+ git HEAD 对比 → 陈旧度状态行与「更新 Wiki」
//   - 生成配置（语言/图表/页数上限）popover，settings-layers user 层持久化
//   - 列表过滤 + 分组（顶层页/模块页）+ front matter order 排序
//   - 装载页面时同步 ide.wikiPages 缓存（IdeMentionPicker @wiki 源匹配预览）
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMessage } from 'naive-ui'
import { listFiles, readFile } from '@/api/studio/files'
import MarkdownRenderer from '@/components/hermes/chat/MarkdownRenderer.vue'
import { useIdeStore } from '../store/ide'
import { useChatStore } from '@/stores/hermes/chat'
import { ideGitApi } from '../api/git'
import {
  buildWikiPipelinePrompt,
  parseWikiMeta,
  parseWikiFrontMatter,
  WIKI_META_PATH,
  type WikiFrontMatter,
  type WikiMeta,
} from '../utils/wikiPipeline'

const { t, locale } = useI18n()
const message = useMessage()
const ide = useIdeStore()
const chatStore = useChatStore()

// 新键走本地字典（漂移期通道先例：IdeSidePane CTXARCHIVE）；既有键仍走上游 locales。
const LOC_DICT = {
  zh: {
    stale: 'Wiki 落后于代码（生成基线之后 HEAD 已前进），建议更新',
    dirty: '工作区含未提交变更',
    upToDate: 'Wiki 与生成基线一致',
    refresh: '更新 Wiki',
    cfg: '生成配置',
    cfgLang: '撰写语言',
    cfgDiagrams: 'Mermaid 图',
    cfgMaxPages: '页数上限',
    filter: '过滤页面…',
    groupTop: '顶层页',
    groupModules: '模块页',
    pageMeta: '生成于 {at} · 基线 {commit}',
  },
  en: {
    stale: 'Wiki is behind HEAD (code moved past the baseline) — update suggested',
    dirty: 'Workspace has uncommitted changes',
    upToDate: 'Wiki is up to date with its baseline',
    refresh: 'Update wiki',
    cfg: 'Generation config',
    cfgLang: 'Language',
    cfgDiagrams: 'Mermaid diagrams',
    cfgMaxPages: 'Max pages',
    filter: 'Filter pages…',
    groupTop: 'Top-level',
    groupModules: 'Modules',
    pageMeta: 'Generated {at} · baseline {commit}',
  },
} as const
type WikiLocalKey = keyof typeof LOC_DICT.zh
const loc = computed<'zh' | 'en'>(() => (String(locale.value ?? 'zh').startsWith('zh') ? 'zh' : 'en'))
function wt(key: WikiLocalKey): string {
  return LOC_DICT[loc.value][key]
}

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
const fmMap = ref<Record<string, WikiFrontMatter>>({})
const pageFm = ref<WikiFrontMatter>({})
const filterText = ref('')
const cfgOpen = ref(false)
const meta = ref<WikiMeta | null>(null)
const gitHead = ref<string | null>(null)
const gitDirty = ref<boolean | null>(null)

const hasWorkspace = computed(() => Boolean(ide.workspace))

async function loadPages(): Promise<void> {
  if (!hasWorkspace.value) return
  loading.value = true
  loadError.value = null
  try {
    // 目录树较浅（分组一层为主）；深度上限防符号链接环把遍历挂死。
    // entries 的目录字段是 isDir（FileEntry 契约，api/studio/workspace-files.ts）——
    // 曾误用 entry.type === 'directory'（恒 undefined），子目录页静默丢失。
    const MAX_DEPTH = 4
    const root = await listFiles(WIKI_DIR, ide.workspace!)
    const collected: WikiPage[] = []
    const walk = async (dirPath: string, depth: number): Promise<void> => {
      const res = await listFiles(dirPath, ide.workspace!)
      for (const entry of res.entries) {
        if (entry.isDir && depth < MAX_DEPTH) await walk(`${dirPath}/${entry.name}`, depth + 1)
        else if (!entry.isDir && entry.name.endsWith('.md')) {
          collected.push({ path: `${dirPath}/${entry.name}`, name: entry.name.replace(/\.md$/, '') })
        }
      }
    }
    for (const entry of root.entries) {
      if (entry.isDir) await walk(`${WIKI_DIR}/${entry.name}`, 1)
      else if (entry.name.endsWith('.md')) {
        collected.push({ path: `${WIKI_DIR}/${entry.name}`, name: entry.name.replace(/\.md$/, '') })
      }
    }
    pages.value = collected
    // @wiki 消费闭环：同步页面缓存给 IdeMentionPicker 匹配预览
    ide.setWikiPages(collected)
    // front matter 批量取（页数典型 5-12；上限防失控，读失败单页降级为无序）
    const settled = await Promise.allSettled(
      collected.slice(0, 30).map(async (p) => ({ p, fm: parseWikiFrontMatter((await readFile(p.path, ide.workspace!)).content) })),
    )
    const next: Record<string, WikiFrontMatter> = {}
    for (const s of settled) if (s.status === 'fulfilled') next[s.value.p.path] = s.value.fm
    fmMap.value = next
  } catch (err) {
    // docs/wiki 不存在（新工作区常态）是空态而非错误：files API 以 404 表达 ENOENT
    const notFound = err instanceof Error && /404|ENOENT|not found/i.test(err.message)
    if (notFound) {
      pages.value = []
      loadError.value = null
    } else {
      loadError.value = err instanceof Error ? err.message : String(err)
    }
  } finally {
    loading.value = false
  }
  void loadMeta()
  void loadGitInfo()
}

/** meta 边车读取（404/坏 JSON → null，静默降级回旧式增量判据） */
async function loadMeta(): Promise<void> {
  if (!hasWorkspace.value) { meta.value = null; return }
  try {
    // 5s 超时兜底：后端抖动窗口里 fetch 可挂到浏览器默认超时（实测拖住 runPipeline
    // 的 await 链）——meta 只是增量判据，超时按"无边车"降级（旧式增量）。
    const res = await Promise.race([
      readFile(WIKI_META_PATH, ide.workspace!),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('meta-read-timeout')), 5000)),
    ])
    meta.value = parseWikiMeta(res.content)
  } catch {
    meta.value = null
  }
}

/** git 基线信息（非 git 仓库/接口失败 → null，状态行整体隐藏） */
async function loadGitInfo(): Promise<void> {
  const root = ide.workspace
  if (!root) { gitHead.value = null; gitDirty.value = null; return }
  try {
    const [{ commits }, st] = await Promise.all([ideGitApi.log(root, 1), ideGitApi.status(root)])
    gitHead.value = commits[0]?.hash ?? null
    gitDirty.value = (st.changes?.length ?? 0) > 0
  } catch {
    gitHead.value = null
    gitDirty.value = null
  }
}

const hasBaseline = computed(() => Boolean(meta.value?.commitId && gitHead.value))
const isStale = computed(() =>
  hasBaseline.value && meta.value!.commitId !== gitHead.value)
const showDirty = computed(() =>
  hasBaseline.value && gitDirty.value === true)

async function openPage(page: WikiPage): Promise<void> {
  selected.value = page
  contentLoading.value = true
  content.value = ''
  pageFm.value = fmMap.value[page.path] ?? {}
  try {
    const res = await readFile(page.path, ide.workspace!)
    content.value = res.content
    pageFm.value = parseWikiFrontMatter(content.value)
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

// R5 Repo Wiki 管线（Qoder 语义）：多子代理分派 + 增量更新 + 引用注入，
// 直接注入当前会话执行（不再需要手贴——复制通道保留为兜底）。
// v2：发送前重读 meta（拿最新基线），带上生成配置。
async function runPipeline(): Promise<void> {
  if (!hasWorkspace.value) return
  await loadMeta()
  void chatStore.sendMessage(buildWikiPipelinePrompt({
    existingPages: pages.value.map((p) => p.path),
    meta: meta.value,
    config: ide.genConfig,
  }))
  ide.setChatFocus()
}

// 列表视图：过滤 → 分组（index 置顶、顶层页、modules/ 组）→ 组内 order/字母排序
interface WikiViewPage extends WikiPage { fm: WikiFrontMatter }
const filtered = computed<WikiViewPage[]>(() => {
  const q = filterText.value.trim().toLowerCase()
  return pages.value
    .filter((p) => !q || p.name.toLowerCase().includes(q) || p.path.toLowerCase().includes(q))
    .map((p) => ({ ...p, fm: fmMap.value[p.path] ?? {} }))
})
const topPages = computed<WikiViewPage[]>(() =>
  filtered.value
    .filter((p) => !p.path.startsWith(`${WIKI_DIR}/modules/`))
    .sort((a, b) => {
      if (a.name === 'index') return -1
      if (b.name === 'index') return 1
      return (a.fm.order ?? 999) - (b.fm.order ?? 999) || a.name.localeCompare(b.name)
    }))
const modulePages = computed<WikiViewPage[]>(() =>
  filtered.value
    .filter((p) => p.path.startsWith(`${WIKI_DIR}/modules/`))
    .sort((a, b) => (a.fm.order ?? 999) - (b.fm.order ?? 999) || a.name.localeCompare(b.name)))

function setLang(lang: 'zh' | 'en'): void { ide.setWikiGenConfig({ language: lang }) }
function setDiagrams(on: boolean): void { ide.setWikiGenConfig({ diagrams: on }) }
function setMaxPages(n: number): void { ide.setWikiGenConfig({ maxPages: Math.min(12, Math.max(4, n)) }) }

onMounted(loadPages)
// 工作区切换即重载：否则 Wiki 面板继续读旧目录
watch(() => ide.workspace, () => void loadPages())
</script>

<template>
  <div class="ide-wiki" data-testid="ide-wiki-pane">
    <div class="ide-wiki__toolbar">
      <span class="ide-wiki__title">{{ t('ide.wiki.panelTitle') }}</span>
      <button type="button" class="ide-wiki__btn" :disabled="!pages.length" :title="t('ide.wiki.referenceWiki')" @click="referenceWhole">{{ t('ide.wiki.referenceWiki') }}</button>
      <button type="button" class="ide-wiki__btn" :disabled="!selected" :title="t('ide.wiki.referencePage')" @click="referencePage">{{ t('ide.wiki.referencePage') }}</button>
      <button type="button" class="ide-wiki__btn" :disabled="!hasWorkspace" :title="t('ide.wiki.pipeline')" data-testid="ide-wiki-pipeline" @click="runPipeline">{{ t('ide.wiki.pipeline') }}</button>
      <button type="button" class="ide-wiki__btn ide-wiki__btn--primary" :title="t('ide.wiki.generate')" data-testid="ide-wiki-generate" @click="copyGeneratePrompt">{{ t('ide.wiki.generate') }}</button>
      <button type="button" class="ide-wiki__btn ide-wiki__btn--cfg" :title="wt('cfg')" data-testid="ide-wiki-cfg-toggle" @click="cfgOpen = !cfgOpen">⚙</button>
    </div>

    <div v-if="cfgOpen" class="ide-wiki__cfg" data-testid="ide-wiki-cfg">
      <label class="ide-wiki__cfg-row">{{ wt('cfgLang') }}
        <button type="button" class="ide-wiki__btn" :class="{ 'is-on': ide.genConfig.language === 'zh' }" data-testid="ide-wiki-cfg-lang-zh" @click="setLang('zh')">中文</button>
        <button type="button" class="ide-wiki__btn" :class="{ 'is-on': ide.genConfig.language === 'en' }" data-testid="ide-wiki-cfg-lang-en" @click="setLang('en')">EN</button>
      </label>
      <label class="ide-wiki__cfg-row">{{ wt('cfgDiagrams') }}
        <button type="button" class="ide-wiki__btn" :class="{ 'is-on': ide.genConfig.diagrams }" data-testid="ide-wiki-cfg-diagrams" @click="setDiagrams(!ide.genConfig.diagrams)">{{ ide.genConfig.diagrams ? 'ON' : 'OFF' }}</button>
      </label>
      <label class="ide-wiki__cfg-row">{{ wt('cfgMaxPages') }}
        <input
          class="ide-wiki__cfg-num"
          type="number" min="4" max="12"
          :value="ide.genConfig.maxPages"
          data-testid="ide-wiki-cfg-maxpages"
          @change="setMaxPages(Number(($event.target as HTMLInputElement).value))"
        >
      </label>
    </div>

    <div v-if="hasBaseline" class="ide-wiki__status" data-testid="ide-wiki-status">
      <span v-if="isStale" class="ide-wiki__badge ide-wiki__badge--stale" data-testid="ide-wiki-stale-badge">{{ wt('stale') }}</span>
      <span v-if="showDirty" class="ide-wiki__badge" data-testid="ide-wiki-dirty-badge">{{ wt('dirty') }}</span>
      <span v-if="!isStale && !showDirty" class="ide-wiki__badge ide-wiki__badge--ok">{{ wt('upToDate') }}</span>
      <button v-if="isStale || showDirty" type="button" class="ide-wiki__btn ide-wiki__refresh" data-testid="ide-wiki-refresh" @click="runPipeline">{{ wt('refresh') }}</button>
    </div>

    <p v-if="!hasWorkspace" class="ide-wiki__hint">{{ t('ide.wiki.needWorkspace') }}</p>
    <p v-else-if="loading" class="ide-wiki__hint">{{ t('ide.wiki.loading') }}</p>
    <p v-else-if="loadError" class="ide-wiki__hint">{{ t('ide.wiki.loadFailed', { message: loadError }) }}</p>
    <p v-else-if="!pages.length" class="ide-wiki__hint">{{ t('ide.wiki.empty') }}</p>

    <div v-else class="ide-wiki__body">
      <div class="ide-wiki__listwrap">
        <input v-model="filterText" class="ide-wiki__filter" :placeholder="wt('filter')" data-testid="ide-wiki-filter">
        <ul class="ide-wiki__list" data-testid="ide-wiki-list">
          <template v-if="topPages.length">
            <li class="ide-wiki__group" data-testid="ide-wiki-group-top">{{ wt('groupTop') }}</li>
            <li
              v-for="p in topPages"
              :key="p.path"
              class="ide-wiki__item"
              :class="{ 'is-active': selected?.path === p.path }"
              :data-testid="`ide-wiki-page-${p.name}`"
              @click="openPage(p)"
            >{{ p.fm.title || p.name }}</li>
          </template>
          <template v-if="modulePages.length">
            <li class="ide-wiki__group" data-testid="ide-wiki-group-modules">{{ wt('groupModules') }}</li>
            <li
              v-for="p in modulePages"
              :key="p.path"
              class="ide-wiki__item"
              :class="{ 'is-active': selected?.path === p.path }"
              :data-testid="`ide-wiki-page-${p.name}`"
              @click="openPage(p)"
            >{{ p.fm.title || p.name }}</li>
          </template>
          <li v-if="!topPages.length && !modulePages.length" class="ide-wiki__group">∅</li>
        </ul>
      </div>
      <div class="ide-wiki__content">
        <p v-if="contentLoading" class="ide-wiki__hint">{{ t('ide.wiki.loading') }}</p>
        <template v-else-if="content">
          <p v-if="pageFm.generatedAt || pageFm.commit" class="ide-wiki__pagemeta" data-testid="ide-wiki-pagemeta">
            {{ wt('pageMeta').replace('{at}', pageFm.generatedAt ?? '?').replace('{commit}', pageFm.commit ?? '?') }}
          </p>
          <MarkdownRenderer :content="content" />
        </template>
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
  border-bottom: 1px solid var(--border-color, #e0e0e0);
  flex-wrap: wrap; /* 窄面板下按钮换行而非挤出视口（⚙ 不可达实测） */
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
  border: 1px solid var(--border-color, #e0e0e0);
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
  &.is-on { border-color: var(--accent-primary, #4cc9f0); color: var(--accent-primary, #4cc9f0); }
}

.ide-wiki__cfg {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--border-color, #e0e0e0);
  font-size: 11px;
}
.ide-wiki__cfg-row { display: flex; align-items: center; gap: 6px; color: var(--text-muted, #9aa0aa); }
.ide-wiki__cfg-num {
  width: 52px; border: 1px solid var(--border-color, #e0e0e0); border-radius: 4px;
  background: transparent; color: inherit; padding: 2px 6px; font-size: 11px;
}

.ide-wiki__status {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-bottom: 1px solid var(--border-color, #e0e0e0);
  font-size: 11px;
  flex-wrap: wrap;
}
.ide-wiki__badge { color: var(--text-muted, #9aa0aa); }
.ide-wiki__badge--stale { color: #e2a03f; }
.ide-wiki__badge--ok { color: #4cc9f0; }
.ide-wiki__refresh { padding: 2px 6px; font-size: 10px; }

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

.ide-wiki__listwrap {
  width: 40%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--border-color, #e0e0e0);
}
.ide-wiki__filter {
  margin: 4px 4px 2px;
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 5px;
  background: transparent;
  color: inherit;
  font-size: 11px;
  padding: 3px 8px;
}

.ide-wiki__list {
  flex: 1;
  list-style: none;
  margin: 0;
  padding: 4px;
  overflow-y: auto;
}

.ide-wiki__group {
  padding: 6px 8px 2px;
  font-size: 10px;
  color: var(--text-muted, #9aa0aa);
  text-transform: uppercase;
  letter-spacing: 0.04em;
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

  &:hover { background: var(--bg-tertiary, #ebebeb); }
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
.ide-wiki__pagemeta {
  font-size: 10px;
  color: var(--text-muted, #9aa0aa);
  margin: 0 0 6px;
}
</style>
